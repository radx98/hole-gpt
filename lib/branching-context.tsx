"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { BranchingState, Message, Node, Session } from "@/lib/types";
import {
  appendMessageToNode,
  buildBranchPath,
  createEmptyState,
  createSessionRecord,
  ensureSessionAvailable,
  getActiveSession,
  id,
  loadState,
  persistState,
  updateHighlightStates,
} from "@/lib/state";
import { STORAGE_DEBOUNCE_MS } from "@/lib/constants";

type BranchingAction =
  | { type: "HYDRATE"; payload: BranchingState }
  | { type: "UPDATE"; updater: (state: BranchingState) => BranchingState };

type ProviderState = {
  data: BranchingState;
  hydrated: boolean;
};

type SelectionInput = {
  text: string;
  startOffset: number;
  endOffset: number;
};

type CreateChildNodeInput = {
  parentNodeId: string;
  parentMessageId: string;
  selection: SelectionInput;
  initialMessage?: Message;
};

type BranchingContextValue = {
  state: BranchingState;
  ready: boolean;
  createSession: () => void;
  deleteSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  setActiveBranch: (branch: string[]) => void;
  setCurrentNodeId: (nodeId: string) => void;
  focusNode: (nodeId: string) => void;
  appendMessage: (nodeId: string, message: Message) => void;
  createChildNode: (input: CreateChildNodeInput) => string | null;
  setNodeHeader: (nodeId: string, header: string | null) => void;
};

const BranchingContext = createContext<BranchingContextValue | undefined>(
  undefined,
);

const reducer = (state: ProviderState, action: BranchingAction): ProviderState => {
  switch (action.type) {
    case "HYDRATE":
      return {
        data: action.payload,
        hydrated: true,
      };
    case "UPDATE":
      return {
        ...state,
        data: action.updater(state.data),
      };
    default:
      return state;
  }
};

const initialState: ProviderState = {
  data: createEmptyState(),
  hydrated: false,
};

const updateSession = (
  session: Session,
  updater: (current: Session) => Session,
): Session => {
  const next = updater(session);
  return { ...next, updatedAt: Date.now() };
};

const buildBranchForParent = (
  session: Session,
  currentBranch: string[],
  parentNodeId: string,
) => {
  const existingIndex = currentBranch.indexOf(parentNodeId);
  if (existingIndex >= 0) {
    return currentBranch.slice(0, existingIndex + 1);
  }
  return buildBranchPath(session, parentNodeId);
};

export const BranchingProvider = ({ children }: { children: ReactNode }) => {
  const [store, dispatch] = useReducer(reducer, initialState);
  const state = store.data;
  const ready = store.hydrated;
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = ensureSessionAvailable(loadState());
    dispatch({ type: "HYDRATE", payload: stored });
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistState(state);
    }, STORAGE_DEBOUNCE_MS);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [state, ready]);

  const createSession = useCallback(() => {
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const session = createSessionRecord();
        return {
          ...previous,
          sessions: {
            ...previous.sessions,
            [session.id]: session,
          },
          activeSessionId: session.id,
          activeBranchNodeIds: [session.rootNodeId],
          currentNodeId: session.rootNodeId,
        };
      },
    });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const nextSessions = { ...previous.sessions };
        delete nextSessions[sessionId];
        const remainingIds = Object.keys(nextSessions);
        if (remainingIds.length === 0) {
          return ensureSessionAvailable(createEmptyState());
        }
        const nextActiveId =
          sessionId === previous.activeSessionId
            ? remainingIds[0]
            : previous.activeSessionId;
        const nextSession =
          (nextActiveId && nextSessions[nextActiveId]) ??
          nextSessions[remainingIds[0]];
        return {
          ...previous,
          sessions: nextSessions,
          activeSessionId: nextSession.id,
          activeBranchNodeIds: [nextSession.rootNodeId],
          currentNodeId: nextSession.rootNodeId,
        };
      },
    });
  }, []);

  const setActiveSession = useCallback((sessionId: string) => {
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const nextSession = previous.sessions[sessionId];
        if (!nextSession) return previous;
        return {
          ...previous,
          activeSessionId: sessionId,
          activeBranchNodeIds: [nextSession.rootNodeId],
          currentNodeId: nextSession.rootNodeId,
        };
      },
    });
  }, []);

  const setActiveBranch = useCallback((branch: string[]) => {
    if (!branch.length) return;
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const session = getActiveSession(previous);
        if (!session) return previous;
        const updatedSession = updateSession(session, (current) =>
          updateHighlightStates(current, branch),
        );
        return {
          ...previous,
          sessions: {
            ...previous.sessions,
            [session.id]: updatedSession,
          },
          activeBranchNodeIds: branch,
          currentNodeId: branch[branch.length - 1],
        };
      },
    });
  }, []);

  const setCurrentNodeId = useCallback((nodeId: string) => {
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const session = getActiveSession(previous);
        if (!session) return previous;
        if (!session.nodes[nodeId]) return previous;
        if (!previous.activeBranchNodeIds.includes(nodeId)) return previous;
        if (previous.currentNodeId === nodeId) return previous;
        return {
          ...previous,
          currentNodeId: nodeId,
        };
      },
    });
  }, []);

  const focusNode = useCallback((nodeId: string) => {
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const session = getActiveSession(previous);
        if (!session) return previous;
        const branch = buildBranchPath(session, nodeId);
        if (!branch.length) return previous;
        const updatedSession = updateSession(session, (current) =>
          updateHighlightStates(current, branch),
        );
        return {
          ...previous,
          sessions: {
            ...previous.sessions,
            [session.id]: updatedSession,
          },
          activeBranchNodeIds: branch,
          currentNodeId: nodeId,
        };
      },
    });
  }, []);

  const appendMessage = useCallback((nodeId: string, message: Message) => {
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const session = getActiveSession(previous);
        if (!session) return previous;
        const updatedSession = appendMessageToNode(session, nodeId, message);
        return {
          ...previous,
          sessions: {
            ...previous.sessions,
            [session.id]: updatedSession,
          },
        };
      },
    });
  }, []);

  const createChildNode = useCallback(
    (input: CreateChildNodeInput): string | null => {
      let newNodeId: string | null = null;
      dispatch({
        type: "UPDATE",
        updater: (previous) => {
          const session = previous.activeSessionId
            ? previous.sessions[previous.activeSessionId]
            : null;
          if (!session) return previous;
          const parent = session.nodes[input.parentNodeId];
          if (!parent) return previous;
          const parentMessageIndex = parent.messages.findIndex(
            (message) => message.id === input.parentMessageId,
          );
          if (parentMessageIndex === -1) return previous;
          const parentMessage = parent.messages[parentMessageIndex];
          const childId = id("node");
          newNodeId = childId;
          const highlight = {
            highlightId: id("highlight"),
            childNodeId: childId,
            text: input.selection.text,
            startOffset: input.selection.startOffset,
            endOffset: input.selection.endOffset,
            isActive: true,
          };
          const updatedParentMessage: Message = {
            ...parentMessage,
            highlights: [...(parentMessage.highlights ?? []), highlight],
          };
          const updatedParent: Node = {
            ...parent,
            children: [...new Set([...(parent.children ?? []), childId])],
            messages: parent.messages.map((message, idx) =>
              idx === parentMessageIndex ? updatedParentMessage : message,
            ),
          };
          const newNode: Node = {
            id: childId,
            depth: parent.depth + 1,
            header: null,
            parent: {
              parentNodeId: parent.id,
              parentMessageId: parentMessage.id,
              selection: input.selection,
            },
            messages: input.initialMessage ? [input.initialMessage] : [],
            children: [],
          };
          const baseBranch = buildBranchForParent(
            session,
            previous.activeBranchNodeIds,
            parent.id,
          );
          const nextBranch = [...baseBranch, childId];
          const updatedSession = updateSession(session, (current) => ({
            ...updateHighlightStates(current, nextBranch),
            nodes: {
              ...current.nodes,
              [parent.id]: updatedParent,
              [childId]: newNode,
            },
          }));
          return {
            ...previous,
            sessions: {
              ...previous.sessions,
              [session.id]: updatedSession,
            },
            activeBranchNodeIds: nextBranch,
            currentNodeId: childId,
          };
        },
      });
      return newNodeId;
    },
    [],
  );

  const setNodeHeader = useCallback((nodeId: string, header: string | null) => {
    dispatch({
      type: "UPDATE",
      updater: (previous) => {
        const session = getActiveSession(previous);
        if (!session) return previous;
        const node = session.nodes[nodeId];
        if (!node) return previous;
        const normalized = header?.trim() ?? null;
        if (
          node.header === normalized &&
          (node.depth !== 0 || session.title === normalized)
        ) {
          return previous;
        }
        const updatedNode: Node = {
          ...node,
          header: normalized,
        };
        const updatedSession = {
          ...session,
          title: node.depth === 0 ? normalized : session.title,
          nodes: {
            ...session.nodes,
            [nodeId]: updatedNode,
          },
        };
        return {
          ...previous,
          sessions: {
            ...previous.sessions,
            [session.id]: updatedSession,
          },
        };
      },
    });
  }, []);

  const value = useMemo(
    () => ({
      state,
      ready,
      createSession,
      deleteSession,
      setActiveSession,
      setActiveBranch,
      setCurrentNodeId,
      focusNode,
      appendMessage,
      createChildNode,
      setNodeHeader,
    }),
    [
      appendMessage,
      createChildNode,
      createSession,
      deleteSession,
      focusNode,
      setCurrentNodeId,
      setNodeHeader,
      ready,
      setActiveBranch,
      setActiveSession,
      state,
    ],
  );

  return (
    <BranchingContext.Provider value={value}>
      {children}
    </BranchingContext.Provider>
  );
};

export const useBranchingContext = () => {
  const context = useContext(BranchingContext);
  if (!context) {
    throw new Error("useBranchingContext must be used within BranchingProvider");
  }
  return context;
};
