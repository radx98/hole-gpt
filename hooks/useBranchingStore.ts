"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BranchingState,
  Message,
  Node,
  SelectionDraft,
  Session,
} from "@/lib/types";
import {
  buildHistory,
  createEmptyState,
  ensureSessionAvailable,
  highlightIsActive,
  id,
  loadState,
  persistState,
} from "@/lib/state";
import { STORAGE_DEBOUNCE_MS } from "@/lib/constants";

const API_PATH = "/api/chat";

type LoadingMap = Record<string, boolean>;
type DraftMap = Record<string, string>;

const recalcHighlightStates = (
  session: Session,
  branch: string[],
): Session => {
  let changed = false;
  const nextNodes: Record<string, Node> = { ...session.nodes };
  Object.values(session.nodes).forEach((node) => {
    let nodeChanged = false;
    const nextMessages = node.messages.map((message) => {
      if (!message.highlights?.length) return message;
      let msgChanged = false;
      const nextHighlights = message.highlights.map((highlight) => {
        const isActive = highlightIsActive(highlight, branch, node.id);
        if (highlight.active === isActive) return highlight;
        msgChanged = true;
        return { ...highlight, active: isActive };
      });
      if (!msgChanged) return message;
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

const findPathToNode = (session: Session, targetId: string): string[] => {
  const path: string[] = [];
  let cursor: string | null = targetId;
  while (cursor) {
    path.push(cursor);
    const node = session.nodes[cursor];
    cursor = node?.parent?.parentNodeId ?? null;
  }
  return path.reverse();
};

const buildLinearMessage = (text: string): Message => ({
  id: id(),
  role: "user",
  text,
  createdAt: Date.now(),
});

export const useBranchingStore = () => {
  const [state, setState] = useState<BranchingState>(createEmptyState());
  const [ready, setReady] = useState(false);
  const [linearDrafts, setLinearDrafts] = useState<DraftMap>({});
  const [contextDraft, setContextDraft] = useState("");
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(
    null,
  );
  const [loading, setLoading] = useState<LoadingMap>({});
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = ensureSessionAvailable(loadState());
    setState(stored);
    setReady(true);
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

  const session = useMemo(() => {
    if (!state.activeSessionId) return null;
    return state.sessions[state.activeSessionId] ?? null;
  }, [state]);

  const activeNodes = useMemo(() => {
    if (!session) return [];
    return state.activeBranchNodeIds
      .map((nodeId) => session.nodes[nodeId])
      .filter((node): node is Node => Boolean(node));
  }, [session, state.activeBranchNodeIds]);

  const isNodeLoading = useCallback(
    (nodeId: string) => Boolean(loading[nodeId]),
    [loading],
  );

  const updateBranch = useCallback(
    (branch: string[]) => {
      if (!session || branch.length === 0) return;
      setState((prev) => {
        const currentSession = prev.activeSessionId
          ? prev.sessions[prev.activeSessionId]
          : null;
        if (!currentSession) return prev;
        const updatedSession = recalcHighlightStates(currentSession, branch);
        return {
          ...prev,
          sessions: {
            ...prev.sessions,
            [currentSession.id]: updatedSession,
          },
          activeBranchNodeIds: branch,
          currentNodeId: branch[branch.length - 1],
        };
      });
    },
    [session],
  );

  const setNodeFocus = useCallback(
    (nodeId: string) => {
      if (!session) return;
      const branchIndex = state.activeBranchNodeIds.indexOf(nodeId);
      if (branchIndex === -1) {
        const branch = findPathToNode(session, nodeId);
        updateBranch(branch);
      } else {
        const branch = state.activeBranchNodeIds.slice(0, branchIndex + 1);
        updateBranch(branch);
      }
    },
    [session, state.activeBranchNodeIds, updateBranch],
  );

  const setLinearDraft = useCallback((nodeId: string, value: string) => {
    setLinearDrafts((prev) => ({ ...prev, [nodeId]: value }));
  }, []);

  const markLoading = useCallback((nodeId: string, value: boolean) => {
    setLoading((prev) => ({ ...prev, [nodeId]: value }));
  }, []);

  const sendPrompt = useCallback(
    async (nodeId: string) => {
      if (!session) return;
      const draft = (linearDrafts[nodeId] ?? "").trim();
      if (!draft) return;

      let nextState: BranchingState | null = null;
      setState((prev) => {
        const currentSession = prev.activeSessionId
          ? prev.sessions[prev.activeSessionId]
          : null;
        if (!currentSession) return prev;
        const node = currentSession.nodes[nodeId];
        if (!node) return prev;
        const userMessage = buildLinearMessage(draft);
        const updatedNode: Node = {
          ...node,
          messages: [...node.messages, userMessage],
        };
        const updatedSession: Session = {
          ...currentSession,
          nodes: {
            ...currentSession.nodes,
            [nodeId]: updatedNode,
          },
        };
        const branch =
          prev.activeBranchNodeIds.length > 0
            ? prev.activeBranchNodeIds
            : [nodeId];
        const updatedBranch =
          branch[branch.length - 1] === nodeId
            ? branch
            : findPathToNode(currentSession, nodeId);
        const finalSession = recalcHighlightStates(updatedSession, updatedBranch);
        nextState = {
          ...prev,
          sessions: {
            ...prev.sessions,
            [finalSession.id]: finalSession,
          },
          activeBranchNodeIds: updatedBranch,
          currentNodeId: nodeId,
        };
        return nextState;
      });

      setLinearDraft(nodeId, "");
      markLoading(nodeId, true);
      if (!nextState) {
        markLoading(nodeId, false);
        return;
      }

      try {
        const history = buildHistory(
          nextState ?? state,
          (nextState ?? state).activeBranchNodeIds,
        );
        const response = await fetch(API_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history, prompt: draft }),
        });
        const json = await response.json();
        const assistantMessage: Message = {
          id: id(),
          role: "assistant",
          text: json?.message ?? "No response",
          createdAt: Date.now(),
        };
        const headerCandidate =
          typeof json?.header === "string" ? json.header.trim() : "";

        setState((prev) => {
          const currentSession = prev.activeSessionId
            ? prev.sessions[prev.activeSessionId]
            : null;
          if (!currentSession) return prev;
          const node = currentSession.nodes[nodeId];
          if (!node) return prev;
          const nextHeader =
            node.header && node.header.length > 0
              ? node.header
              : headerCandidate || null;
          const updatedNode: Node = {
            ...node,
            header: nextHeader,
            messages: [...node.messages, assistantMessage],
          };
          const updatedSession: Session = {
            ...currentSession,
            nodes: {
              ...currentSession.nodes,
              [nodeId]: updatedNode,
            },
            title:
              updatedNode.depth === 0 && nextHeader
                ? nextHeader
                : currentSession.title,
          };
          return {
            ...prev,
            sessions: {
              ...prev.sessions,
              [updatedSession.id]: updatedSession,
            },
          };
        });
      } catch (err) {
        console.error("Failed to fetch assistant response", err);
        setState((prev) => {
          const currentSession = prev.activeSessionId
            ? prev.sessions[prev.activeSessionId]
            : null;
          if (!currentSession) return prev;
          const node = currentSession.nodes[nodeId];
          if (!node) return prev;
          const fallbackMessage: Message = {
            id: id(),
            role: "assistant",
            text: "Something went wrong. Please try again.",
            createdAt: Date.now(),
          };
          const updatedNode: Node = {
            ...node,
            messages: [...node.messages, fallbackMessage],
          };
          return {
            ...prev,
            sessions: {
              ...prev.sessions,
              [currentSession.id]: {
                ...currentSession,
                nodes: {
                  ...currentSession.nodes,
                  [nodeId]: updatedNode,
                },
              },
            },
          };
        });
      } finally {
        markLoading(nodeId, false);
      }
    },
    [
      linearDrafts,
      markLoading,
      session,
      setLinearDraft,
      state,
    ],
  );

  const sendContextPrompt = useCallback(async () => {
    if (!session || !selectionDraft) return;
    const prompt = contextDraft.trim();
    if (!prompt) return;
    const parentNode = session.nodes[selectionDraft.nodeId];
    if (!parentNode) return;
    const newNodeId = id();
    const childMessage: Message = {
      id: id(),
      role: "user",
      text: prompt,
      createdAt: Date.now(),
    };

    let branchToSend: string[] = [];
    let sendingState: BranchingState | null = null;

    setState((prev) => {
      const currentSession = prev.activeSessionId
        ? prev.sessions[prev.activeSessionId]
        : null;
      if (!currentSession) return prev;
      const parent = currentSession.nodes[selectionDraft.nodeId];
      if (!parent) return prev;
      const parentMessageIndex = parent.messages.findIndex(
        (m) => m.id === selectionDraft.messageId,
      );
      if (parentMessageIndex === -1) return prev;
      const parentMessage = parent.messages[parentMessageIndex];
      const nextHighlight = {
        childNodeId: newNodeId,
        text: selectionDraft.text,
        start: selectionDraft.start,
        end: selectionDraft.end,
        active: true,
      };
      const updatedParentMessage: Message = {
        ...parentMessage,
        highlights: [...(parentMessage.highlights ?? []), nextHighlight],
      };
      const updatedParent: Node = {
        ...parent,
        messages: parent.messages.map((msg, idx) =>
          idx === parentMessageIndex ? updatedParentMessage : msg,
        ),
      };

      const newNode: Node = {
        id: newNodeId,
        depth: parent.depth + 1,
        header: null,
        parent: {
          parentNodeId: parent.id,
          parentMessageId: parentMessage.id,
          selection: {
            text: selectionDraft.text,
            startOffset: selectionDraft.start,
            endOffset: selectionDraft.end,
          },
        },
        messages: [childMessage],
      };

      const updatedNodes = {
        ...currentSession.nodes,
        [parent.id]: updatedParent,
        [newNodeId]: newNode,
      };

      const parentIndex =
        prev.activeBranchNodeIds.indexOf(selectionDraft.nodeId);
      const branchPrefix =
        parentIndex >= 0
          ? prev.activeBranchNodeIds.slice(0, parentIndex + 1)
          : findPathToNode(currentSession, selectionDraft.nodeId);
      branchToSend = [...branchPrefix, newNodeId];
      const updatedSession: Session = {
        ...currentSession,
        nodes: updatedNodes,
      };
      const finalSession = recalcHighlightStates(updatedSession, branchToSend);
      sendingState = {
        ...prev,
        sessions: {
          ...prev.sessions,
          [finalSession.id]: finalSession,
        },
        activeBranchNodeIds: branchToSend,
        currentNodeId: newNodeId,
      };
      return sendingState;
      });

    setSelectionDraft(null);
    setContextDraft("");
    markLoading(newNodeId, true);
    if (!sendingState || branchToSend.length === 0) {
      markLoading(newNodeId, false);
      return;
    }

    try {
      const history = buildHistory(
        sendingState ?? state,
        branchToSend.length ? branchToSend : state.activeBranchNodeIds,
      );
      const response = await fetch(API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, prompt }),
      });
      const json = await response.json();
      const assistantMessage: Message = {
        id: id(),
        role: "assistant",
        text: json?.message ?? "No response",
        createdAt: Date.now(),
      };
      const headerCandidate =
        typeof json?.header === "string" ? json.header.trim() : "";

      setState((prev) => {
        const currentSession = prev.activeSessionId
          ? prev.sessions[prev.activeSessionId]
          : null;
        if (!currentSession) return prev;
        const node = currentSession.nodes[newNodeId];
        if (!node) return prev;
        const nextHeader =
          node.header && node.header.length > 0
            ? node.header
            : headerCandidate || null;
        const updatedNode: Node = {
          ...node,
          header: nextHeader,
          messages: [...node.messages, assistantMessage],
        };
        const updatedSession: Session = {
          ...currentSession,
          nodes: {
            ...currentSession.nodes,
            [newNodeId]: updatedNode,
          },
        };
        return {
          ...prev,
          sessions: {
            ...prev.sessions,
            [updatedSession.id]: updatedSession,
          },
        };
      });
    } catch (err) {
      console.error("Context prompt failed", err);
      setState((prev) => {
        const currentSession = prev.activeSessionId
          ? prev.sessions[prev.activeSessionId]
          : null;
        if (!currentSession) return prev;
        const node = currentSession.nodes[newNodeId];
        if (!node) return prev;
        const fallbackMessage: Message = {
          id: id(),
          role: "assistant",
          text: "Something went wrong. Please try again.",
          createdAt: Date.now(),
        };
        const updatedNode: Node = {
          ...node,
          messages: [...node.messages, fallbackMessage],
        };
        return {
          ...prev,
          sessions: {
            ...prev.sessions,
            [currentSession.id]: {
              ...currentSession,
              nodes: {
                ...currentSession.nodes,
                [newNodeId]: updatedNode,
              },
            },
          },
        };
      });
    } finally {
      markLoading(newNodeId, false);
    }
  }, [
    contextDraft,
    markLoading,
    selectionDraft,
    session,
    state,
  ]);

  const createSession = useCallback(() => {
    const sessionId = id();
    const rootNodeId = id();
    const rootNode: Node = {
      id: rootNodeId,
      depth: 0,
      header: null,
      parent: null,
      messages: [],
    };
    const newSession: Session = {
      id: sessionId,
      title: null,
      rootNodeId,
      nodes: {
        [rootNodeId]: rootNode,
      },
    };
    setState((prev) => ({
      ...prev,
      sessions: {
        ...prev.sessions,
        [sessionId]: newSession,
      },
      activeSessionId: sessionId,
      activeBranchNodeIds: [rootNodeId],
      currentNodeId: rootNodeId,
    }));
  }, []);

  const switchSession = useCallback(
    (sessionId: string) => {
      const target = state.sessions[sessionId];
      if (!target) return;
      setState((prev) => {
        const nextSession = prev.sessions[sessionId];
        if (!nextSession) return prev;
        const branch = [nextSession.rootNodeId];
        const updatedSession = recalcHighlightStates(nextSession, branch);
        return {
          ...prev,
          sessions: {
            ...prev.sessions,
            [sessionId]: updatedSession,
          },
          activeSessionId: sessionId,
          activeBranchNodeIds: branch,
          currentNodeId: nextSession.rootNodeId,
        };
      });
      setSelectionDraft(null);
      setContextDraft("");
    },
    [state.sessions],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      setState((prev) => {
        const nextSessions = { ...prev.sessions };
        delete nextSessions[sessionId];
        let nextActiveId = prev.activeSessionId;
        if (sessionId === prev.activeSessionId) {
          const ids = Object.keys(nextSessions);
          nextActiveId = ids[0] ?? null;
        }
        if (!nextActiveId) {
          return ensureSessionAvailable(createEmptyState());
        }
        const nextSession = nextSessions[nextActiveId];
        const branch = [nextSession.rootNodeId];
        const updatedSession = recalcHighlightStates(nextSession, branch);
        nextSessions[nextActiveId] = updatedSession;
        return {
          ...prev,
          sessions: nextSessions,
          activeSessionId: nextActiveId,
          activeBranchNodeIds: branch,
          currentNodeId: nextSession.rootNodeId,
        };
      });
    },
    [],
  );

  return {
    ready,
    state,
    session,
    activeNodes,
    selectionDraft,
    setSelectionDraft,
    contextDraft,
    setContextDraft,
    linearDrafts,
    setLinearDraft,
    sendPrompt,
    sendContextPrompt,
    createSession,
    switchSession,
    deleteSession,
    isNodeLoading,
    setNodeFocus,
    isReady: ready,
  };
};
