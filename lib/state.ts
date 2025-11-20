import {
  BranchingState,
  Highlight,
  HistoryLine,
  Message,
  Node,
  Session,
} from "./types";

export const STORAGE_KEY = "branching_chat_state";
export const STATE_VERSION = 1;

export const createEmptyState = (): BranchingState => ({
  version: STATE_VERSION,
  activeSessionId: null,
  activeBranchNodeIds: [],
  currentNodeId: null,
  sessions: {},
});

export const id = (prefix = "id") =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const createRootNode = (): Node => ({
  id: id("node"),
  depth: 0,
  header: null,
  parent: null,
  messages: [],
  children: [],
});

export const createSessionRecord = (): Session => {
  const now = Date.now();
  const rootNode = createRootNode();
  return {
    id: id("session"),
    title: null,
    rootNodeId: rootNode.id,
    nodes: {
      [rootNode.id]: rootNode,
    },
    createdAt: now,
    updatedAt: now,
  };
};

export const createSession = (): BranchingState => {
  const session = createSessionRecord();
  return {
    ...createEmptyState(),
    activeSessionId: session.id,
    activeBranchNodeIds: [session.rootNodeId],
    currentNodeId: session.rootNodeId,
    sessions: {
      [session.id]: session,
    },
  };
};

export const loadState = (): BranchingState => {
  if (typeof window === "undefined") return createEmptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createEmptyState();
    if (typeof parsed.version !== "number") return createEmptyState();
    return parsed as BranchingState;
  } catch (err) {
    console.warn("Failed to load state, starting fresh", err);
    return createEmptyState();
  }
};

export const ensureSessionAvailable = (
  state: BranchingState,
): BranchingState => {
  if (state.activeSessionId && state.sessions[state.activeSessionId]) {
    const session = state.sessions[state.activeSessionId];
    const nextBranch =
      state.activeBranchNodeIds.length > 0
        ? state.activeBranchNodeIds
        : [session.rootNodeId];
    const nextCurrent = state.currentNodeId ?? nextBranch[nextBranch.length - 1];
    return {
      ...state,
      activeBranchNodeIds: nextBranch,
      currentNodeId: nextCurrent,
    };
  }

  const sessionIds = Object.keys(state.sessions);
  if (sessionIds.length > 0) {
    const session = state.sessions[sessionIds[0]];
    return {
      ...state,
      activeSessionId: session.id,
      activeBranchNodeIds: [session.rootNodeId],
      currentNodeId: session.rootNodeId,
    };
  }

  return createSession();
};

export const persistState = (state: BranchingState) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Failed to persist state", err);
  }
};

export const branchNote = (selectionText: string) =>
  `[Branch created from previous text: "${selectionText.slice(0, 140)}"]`;

export const buildHistory = (
  state: BranchingState,
  branchIds: string[],
): HistoryLine[] => {
  const session = state.activeSessionId
    ? state.sessions[state.activeSessionId]
    : null;
  if (!session) return [];
  const acc: HistoryLine[] = [];

  branchIds.forEach((nodeId, idx) => {
    const node = session.nodes[nodeId];
    if (!node) return;
    if (idx > 0 && node.parent) {
      acc.push({ role: "user", text: branchNote(node.parent.selection.text) });
    }
    node.messages.forEach((message) =>
      acc.push({ role: message.role, text: message.text }),
    );
  });

  return acc;
};

export const highlightIsActive = (
  highlight: Highlight,
  branch: string[],
  parentId: string,
) => {
  const nextIndex = branch.indexOf(parentId) + 1;
  return branch[nextIndex] === highlight.childNodeId;
};

export const updateHighlightStates = (
  session: Session,
  branch: string[],
): Session => {
  let changed = false;
  const nextNodes: Record<string, Node> = { ...session.nodes };

  Object.values(session.nodes).forEach((node) => {
    let nodeChanged = false;
    const nextMessages = node.messages.map((message) => {
      if (!message.highlights?.length) return message;
      let messageChanged = false;
      const nextHighlights = message.highlights.map((highlight) => {
        const isActive = highlightIsActive(highlight, branch, node.id);
        if (highlight.isActive === isActive) return highlight;
        messageChanged = true;
        return { ...highlight, isActive };
      });
      if (!messageChanged) return message;
      nodeChanged = true;
      return { ...message, highlights: nextHighlights };
    });

    if (nodeChanged) {
      changed = true;
      nextNodes[node.id] = { ...node, messages: nextMessages };
    }
  });

  return changed ? { ...session, nodes: nextNodes } : session;
};

export const buildBranchPath = (session: Session, targetId: string): string[] => {
  const path: string[] = [];
  let cursor: string | null = targetId;

  while (cursor) {
    path.push(cursor);
    const node = session.nodes[cursor];
    cursor = node?.parent?.parentNodeId ?? null;
  }

  return path.reverse();
};

export const getActiveSession = (state: BranchingState): Session | null => {
  if (!state.activeSessionId) return null;
  return state.sessions[state.activeSessionId] ?? null;
};

export const appendMessageToNode = (
  session: Session,
  nodeId: string,
  message: Message,
): Session => {
  const node = session.nodes[nodeId];
  if (!node) return session;
  const nextNode = {
    ...node,
    messages: [...node.messages, message],
  };
  return touchSession({
    ...session,
    nodes: {
      ...session.nodes,
      [nodeId]: nextNode,
    },
  });
};

export const touchSession = (session: Session): Session => ({
  ...session,
  updatedAt: Date.now(),
});
