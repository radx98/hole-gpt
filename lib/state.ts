import { BranchingState, Highlight, HistoryLine, Node, Session } from "./types";

const STORAGE_KEY = "branching_chat_state";

export const createEmptyState = (): BranchingState => ({
  version: 1,
  activeSessionId: null,
  activeBranchNodeIds: [],
  currentNodeId: null,
  sessions: {},
});

export const id = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random()}`;

export const createSession = (): BranchingState => {
  const state = createEmptyState();
  const sessionId = id();
  const rootNodeId = id();
  const rootNode: Node = {
    id: rootNodeId,
    depth: 0,
    header: null,
    parent: null,
    messages: [],
  };
  const session: Session = {
    id: sessionId,
    title: null,
    rootNodeId,
    nodes: { [rootNodeId]: rootNode },
  };

  return {
    ...state,
    activeSessionId: sessionId,
    activeBranchNodeIds: [rootNodeId],
    currentNodeId: rootNodeId,
    sessions: { [sessionId]: session },
  };
};

export const loadState = (): BranchingState => {
  if (typeof window === "undefined") return createEmptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return createEmptyState();
    return parsed as BranchingState;
  } catch (err) {
    console.warn("Failed to load state, starting fresh", err);
    return createEmptyState();
  }
};

export const ensureSessionAvailable = (state: BranchingState): BranchingState => {
  if (state.activeSessionId && state.sessions[state.activeSessionId]) {
    return state;
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

export const buildHistory = (state: BranchingState, branchIds: string[]): HistoryLine[] => {
  const session = state.activeSessionId ? state.sessions[state.activeSessionId] : null;
  if (!session) return [];
  const acc: HistoryLine[] = [];

  branchIds.forEach((nodeId, idx) => {
    const node = session.nodes[nodeId];
    if (!node) return;
    if (idx > 0 && node.parent) {
      acc.push({ role: "user", text: branchNote(node.parent.selection.text) });
    }
    node.messages.forEach((m) => acc.push({ role: m.role, text: m.text }));
  });

  return acc;
};

export const highlightIsActive = (highlight: Highlight, branch: string[], parentId: string) => {
  const nextIndex = branch.indexOf(parentId) + 1;
  return branch[nextIndex] === highlight.childNodeId;
};
