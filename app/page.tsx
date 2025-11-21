"use client";

import {
  ArrowDown,
  ChevronsUpDown,
  Plus,
  SendHorizontal,
  Trash2,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useBranchingContext } from "@/lib/branching-context";
import { APP_NAME } from "@/lib/constants";
import {
  Highlight,
  HistoryLine,
  Message,
  Node as SessionNode,
  SelectionDraft,
  Session,
} from "@/lib/types";
import { branchNote, buildBranchPath, buildHistory, id } from "@/lib/state";
import { buildNodeSlugMap, slugify } from "@/lib/slug";

type ChatResponse = {
  header: string;
  message: string;
};

async function requestChatCompletion(payload: {
  history: HistoryLine[];
  prompt: string;
}): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Ignore – handled below.
    }
  }

  if (!response.ok) {
    const message =
      (data &&
        typeof data === "object" &&
        typeof (data as { error?: string }).error === "string" &&
        (data as { error?: string }).error) ||
      "LLM request failed.";
    throw new Error(message);
  }

  if (
    !data ||
    typeof data !== "object" ||
    typeof (data as ChatResponse).header !== "string" ||
    typeof (data as ChatResponse).message !== "string"
  ) {
    throw new Error("Malformed response from the model.");
  }

  return data as ChatResponse;
}

export default function Home() {
  const {
    state,
    ready,
    createSession,
    deleteSession,
    setActiveSession,
    setActiveBranch,
    setCurrentNodeId,
    appendMessage,
    createChildNode,
    focusNode,
    setNodeHeader,
  } = useBranchingContext();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameValue = pathname ?? "/";
  const routeKey = pathnameValue;
  const [handledRouteKey, setHandledRouteKey] = useState<string | null>(null);
  const session =
    ready && state.activeSessionId
      ? state.sessions[state.activeSessionId] ?? null
      : null;
  const activeBranchNodeIds = state.activeBranchNodeIds;
  const currentNodeId =
    session && state.currentNodeId
      ? state.currentNodeId
      : session?.rootNodeId ?? null;
  const currentNode = currentNodeId ? session?.nodes[currentNodeId] ?? null : null;
  const branchNodes = useMemo(() => {
    if (!session) return [];
    return activeBranchNodeIds
      .map((nodeId) => session.nodes[nodeId])
      .filter((node): node is SessionNode => Boolean(node));
  }, [session, activeBranchNodeIds]);
  const branchSignature = useMemo(
    () => branchNodes.map((node) => node.id).join("|"),
    [branchNodes],
  );
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(
    null,
  );
  const [contextValue, setContextValue] = useState("");
  const [isContextSending, setIsContextSending] = useState(false);
  const contextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasMessageSelectionRef = useRef(false);
  const columnsContainerRef = useRef<HTMLDivElement | null>(null);
  const columnScrollAreasRef = useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const registerScrollContainer = useCallback(
    (nodeId: string, element: HTMLDivElement | null) => {
      columnScrollAreasRef.current[nodeId] = element;
    },
    [],
  );
  const hasPerformedInitialScrollRef = useRef(false);
  const clearContextSelection = useCallback(
    (options?: { removeDomSelection?: boolean }) => {
      setSelectionDraft(null);
      setContextValue("");
      const shouldRemove = options?.removeDomSelection ?? false;
      hasMessageSelectionRef.current = false;
      if (shouldRemove && typeof window !== "undefined") {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
      }
    },
    [],
  );
  const findMessageElement = useCallback((node: Node | null) => {
    let current: Node | null =
      node instanceof HTMLElement ? node : node?.parentElement ?? null;
    while (current) {
      if (
        current instanceof HTMLElement &&
        current.dataset &&
        current.dataset.messageId
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }, []);

  const canSubmit =
    Boolean(currentNode) && inputValue.trim().length > 0 && !isSending;

  useEffect(() => {
    const handleSelectionChange = () => {
      if (document.activeElement === contextInputRef.current) {
        return;
      }
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (!selection || selection.rangeCount === 0) {
        clearContextSelection();
        return;
      }
      const range = selection.getRangeAt(0);
      if (
        selection.isCollapsed ||
        !range ||
        !range.toString().trim().length
      ) {
        clearContextSelection();
        return;
      }
      const startMessage = findMessageElement(range.startContainer);
      const endMessage = findMessageElement(range.endContainer);
      if (!startMessage || !endMessage || startMessage !== endMessage) {
        clearContextSelection();
        return;
      }
      const nodeId = startMessage.dataset.nodeId;
      const messageId = startMessage.dataset.messageId;
      if (!nodeId || !messageId) {
        clearContextSelection();
        return;
      }
      const activeNode = session?.nodes[nodeId] ?? null;
      const activeMessage =
        activeNode?.messages.find((message) => message.id === messageId) ?? null;
      if (!activeMessage) {
        clearContextSelection();
        return;
      }
      const cloned = range.cloneRange();
      cloned.selectNodeContents(startMessage);
      cloned.setEnd(range.startContainer, range.startOffset);
      const rawStartOffset = cloned.toString().length;
      const text = range.toString();
      const rawEndOffset = rawStartOffset + text.length;
      const canonicalStartOffset = normalizeDomOffset(
        rawStartOffset,
        activeMessage.highlights,
      );
      const canonicalEndOffset = normalizeDomOffset(
        rawEndOffset,
        activeMessage.highlights,
      );
      if (
        hasSelectionIntersection(
          canonicalStartOffset,
          canonicalEndOffset,
          activeMessage.highlights,
        )
      ) {
        clearContextSelection();
        return;
      }
      const rect = range.getBoundingClientRect();
      hasMessageSelectionRef.current = true;
      setSelectionDraft({
        nodeId,
        messageId,
        text,
        startOffset: canonicalStartOffset,
        endOffset: canonicalEndOffset,
        rect,
      });
      setContextValue("");
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [clearContextSelection, findMessageElement, session]);

  useEffect(() => {
    clearContextSelection({ removeDomSelection: true });
  }, [state.activeSessionId, state.currentNodeId, clearContextSelection]);

  useEffect(() => {
    if (!ready) return;
    const [rootSlug, endSlug] = pathnameValue.split("/").filter(Boolean);
    const allSessions = Object.values(state.sessions);
    if (!allSessions.length) return;
    const routeHandled = handledRouteKey === routeKey;

    let targetSession: Session | null = null;
    let slugMap: Record<string, string> | null = null;

    if (rootSlug) {
      for (const candidate of allSessions) {
        const candidateMap = buildNodeSlugMap(Object.values(candidate.nodes));
        if (candidateMap[candidate.rootNodeId] === rootSlug) {
          targetSession = candidate;
          slugMap = candidateMap;
          break;
        }
      }
    }

    if (!targetSession && state.activeSessionId) {
      const fallback = state.sessions[state.activeSessionId] ?? null;
      if (fallback) {
        targetSession = fallback;
        slugMap = buildNodeSlugMap(Object.values(fallback.nodes));
      }
    }

    if (!targetSession) {
      if (!routeHandled) {
        setHandledRouteKey(routeKey);
      }
      return;
    }

    if (!slugMap) {
      slugMap = buildNodeSlugMap(Object.values(targetSession.nodes));
    }

    const targetNodeId =
      endSlug && slugMap
        ? Object.keys(slugMap).find((nodeId) => slugMap![nodeId] === endSlug) ??
          null
        : null;
    const targetNode =
      (targetNodeId && targetSession.nodes[targetNodeId]) ||
      targetSession.nodes[targetSession.rootNodeId];

    if (!routeHandled) {
      const nextBranch = buildBranchPath(targetSession, targetNode.id);
      const branchMatches =
        nextBranch.length === state.activeBranchNodeIds.length &&
        nextBranch.every(
          (id, index) => state.activeBranchNodeIds[index] === id,
        );

      if (state.activeSessionId !== targetSession.id) {
        setActiveSession(targetSession.id);
        return;
      }

      if (!branchMatches) {
        setActiveBranch(nextBranch);
        return;
      }

      if (state.currentNodeId !== targetNode.id) {
        setCurrentNodeId(targetNode.id);
        return;
      }

      setHandledRouteKey(routeKey);
      return;
    }

    const activeSession =
      state.activeSessionId ? state.sessions[state.activeSessionId] : null;
    if (!activeSession) return;
    const branchIds =
      state.activeBranchNodeIds.length > 0
        ? state.activeBranchNodeIds
        : [activeSession.rootNodeId];
    const endNodeId = branchIds[branchIds.length - 1];
    const slugMapActive = buildNodeSlugMap(Object.values(activeSession.nodes));
    const rootSlugValue =
      slugMapActive[activeSession.rootNodeId] ??
      slugify(activeSession.nodes[activeSession.rootNodeId]?.header ?? null);
    const endNode = activeSession.nodes[endNodeId];
    const endSlugValue =
      endNode && endNode.id !== activeSession.rootNodeId
        ? slugMapActive[endNode.id] ?? slugify(endNode.header ?? null)
        : null;
    const targetPath = endSlugValue
      ? `/${rootSlugValue}/${endSlugValue}`
      : `/${rootSlugValue}`;
    if (targetPath !== routeKey) {
      router.replace(targetPath, { scroll: false });
    }
  }, [
    handledRouteKey,
    pathnameValue,
    ready,
    routeKey,
    router,
    setActiveBranch,
    setActiveSession,
    setCurrentNodeId,
    state.activeBranchNodeIds,
    state.activeSessionId,
    state.currentNodeId,
    state.sessions,
  ]);

  const handleSubmit = async () => {
    if (!currentNode || !session) return;
    const text = inputValue.trim();
    if (!text || isSending) return;
    if (!state.activeBranchNodeIds.length) return;

    const history = buildHistory(state, state.activeBranchNodeIds);
    const nodeId = currentNode.id;
    const userMessage: Message = {
      id: id("user"),
      role: "user",
      text,
      createdAt: Date.now(),
    };

    setErrorMessage(null);
    setInputValue("");
    setIsSending(true);
    appendMessage(nodeId, userMessage);

    const shouldSetHeader = !currentNode.header;

    try {
      const response = await requestChatCompletion({
        history,
        prompt: text,
      });
      const assistantMessage: Message = {
        id: id("assistant"),
        role: "assistant",
        text: response.message,
        createdAt: Date.now(),
      };
      appendMessage(nodeId, assistantMessage);
      if (shouldSetHeader && response.header) {
        setNodeHeader(nodeId, response.header);
      }
    } catch (error) {
      const friendlyMessage =
        error instanceof Error
          ? error.message
          : "The model request failed. Please try again.";
      setErrorMessage(friendlyMessage);
      const assistantMessage: Message = {
        id: id("assistant"),
        role: "assistant",
        text: `I couldn't fetch a response. ${friendlyMessage}`,
        createdAt: Date.now(),
      };
      appendMessage(nodeId, assistantMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleContextSubmit = async () => {
    if (!selectionDraft || !session) return;
    const prompt = contextValue.trim();
    if (!prompt || isContextSending) return;
    const parentId = selectionDraft.nodeId;
    const parentMessageId = selectionDraft.messageId;
    const selection = {
      text: selectionDraft.text,
      startOffset: selectionDraft.startOffset,
      endOffset: selectionDraft.endOffset,
    };
    const userMessage: Message = {
      id: id("user"),
      role: "user",
      text: prompt,
      createdAt: Date.now(),
    };
    const branchIndex = state.activeBranchNodeIds.indexOf(parentId);
    const branchPrefix =
      branchIndex >= 0
        ? state.activeBranchNodeIds.slice(0, branchIndex + 1)
        : buildBranchPath(session, parentId);
    clearContextSelection();
    setIsContextSending(true);

    const newNodeId = createChildNode({
      parentNodeId: parentId,
      parentMessageId,
      selection,
      initialMessage: userMessage,
    });

    const historyBase = buildHistory(state, branchPrefix);
    const historyWithBranch =
      selection.text.trim().length > 0
        ? [...historyBase, { role: "user", text: branchNote(selection.text) }]
        : historyBase;

    setErrorMessage(null);

    try {
      const response = await requestChatCompletion({
        history: historyWithBranch,
        prompt,
      });
      const assistantMessage: Message = {
        id: id("assistant"),
        role: "assistant",
        text: response.message,
        createdAt: Date.now(),
      };
      appendMessage(newNodeId, assistantMessage);
      if (response.header) {
        setNodeHeader(newNodeId, response.header);
      }
    } catch (error) {
      const friendlyMessage =
        error instanceof Error
          ? error.message
          : "The model request failed. Please try again.";
      setErrorMessage(friendlyMessage);
      const fallbackMessage: Message = {
        id: id("assistant"),
        role: "assistant",
        text: `I couldn't fetch a response. ${friendlyMessage}`,
        createdAt: Date.now(),
      };
      appendMessage(newNodeId, fallbackMessage);
    } finally {
      setIsContextSending(false);
    }
  };

  const handleHighlightActivate = useCallback(
    (highlight: Highlight) => {
      focusNode(highlight.childNodeId);
      clearContextSelection();
    },
    [clearContextSelection, focusNode],
  );

  const handleColumnFocus = useCallback(
    (nodeId: string) => {
      if (!session) return;
      if (!activeBranchNodeIds.includes(nodeId)) return;
      if (currentNodeId === nodeId) return;
      setCurrentNodeId(nodeId);
    },
    [session, activeBranchNodeIds, setCurrentNodeId, currentNodeId],
  );

  useLayoutEffect(() => {
    if (!ready || !branchNodes.length) return;
    if (typeof document === "undefined") return;
    const scrollBehavior: ScrollBehavior = hasPerformedInitialScrollRef.current
      ? "smooth"
      : "auto";
    const container = columnsContainerRef.current;
    if (container) {
      container.scrollTo({
        left: container.scrollWidth,
        behavior: scrollBehavior,
      });
    }
    branchNodes.forEach((node, index) => {
      const scroller = columnScrollAreasRef.current[node.id];
      if (!scroller) return;
      if (index === branchNodes.length - 1) {
        scroller.scrollTo({
          top: scroller.scrollHeight,
          behavior: scrollBehavior,
        });
        return;
      }
      const nextNode = branchNodes[index + 1];
      const parentLink = nextNode.parent;
      if (!parentLink || parentLink.parentNodeId !== node.id) return;
      const messageElement = document.querySelector<HTMLElement>(
        `[data-node-id="${node.id}"][data-message-id="${parentLink.parentMessageId}"]`,
      );
      if (!messageElement) return;
      const rect = measureSelectionRect(
        messageElement,
        parentLink.selection.startOffset,
        parentLink.selection.endOffset,
      );
      if (!rect) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const offsetWithin =
        rect.top - scrollerRect.top + scroller.scrollTop;
      const targetTop =
        offsetWithin - scroller.clientHeight / 2 + rect.height / 2;
      scroller.scrollTo({
        top: Math.max(targetTop, 0),
        behavior: scrollBehavior,
      });
    });
    if (!hasPerformedInitialScrollRef.current) {
      hasPerformedInitialScrollRef.current = true;
    }
  }, [branchNodes, branchSignature, ready]);

  const columnContent =
    ready && session && branchNodes.length > 0 ? (
      <div className="flex h-full min-h-0">
        {branchNodes.map((node, index) => {
          const isCurrentColumn = node.id === currentNodeId;
          return (
            <Fragment key={node.id}>
              <ColumnView
                node={node}
                messages={node.messages}
                isCurrent={isCurrentColumn}
                isSending={isCurrentColumn ? isSending : false}
                inputValue={inputValue}
                setInputValue={setInputValue}
                canSubmit={isCurrentColumn ? canSubmit : false}
                errorMessage={isCurrentColumn ? errorMessage : null}
                onSubmit={handleSubmit}
                onHighlightClick={handleHighlightActivate}
                onFocusColumn={() => handleColumnFocus(node.id)}
                registerScrollContainer={registerScrollContainer}
              />
              {index < branchNodes.length - 1 ? (
                <div className="h-full w-px flex-shrink-0 bg-zinc-200" aria-hidden />
              ) : null}
            </Fragment>
          );
        })}
      </div>
    ) : (
      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
        Loading session…
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-zinc-900">
      <TopBar
        session={session}
        branchNodes={branchNodes}
        sessions={state.sessions}
        activeSessionId={state.activeSessionId}
        onSelectSession={(sessionId) => {
          setActiveSession(sessionId);
        }}
        onDeleteSession={(sessionId) => {
          deleteSession(sessionId);
        }}
        onCreateSession={() => {
          createSession();
        }}
      />
      <div className="flex flex-1 min-h-0 overflow-y-hidden pt-16">
        <div className="flex h-full min-h-0 w-full flex-col border-t border-zinc-200 bg-white">
          <div
            className="flex h-full min-h-0 w-full overflow-x-auto"
            ref={columnsContainerRef}
          >
            {columnContent}
          </div>
        </div>
      </div>
      <ContextInputOverlay
        selection={selectionDraft}
        value={contextValue}
        onChange={setContextValue}
        onSubmit={handleContextSubmit}
        disabled={isContextSending || !contextValue.trim().length}
        inputRef={contextInputRef}
        onCancel={clearContextSelection}
      />
    </div>
  );
}

type TopBarProps = {
  session: Session | null;
  branchNodes: SessionNode[];
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateSession: () => void;
};

function TopBar({
  session,
  branchNodes,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onCreateSession,
}: TopBarProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const listener = (event: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
    };
  }, [open]);

  const sessionTitle = session?.title?.trim() || "Untitled Session";
  const pathSegments = branchNodes.slice(1).map((node) =>
    node.header?.trim().length ? node.header.trim() : "Untitled Column",
  );

  return (
    <header className="fixed inset-x-0 top-0 z-20 border-b border-zinc-200 bg-white">
      <div className="flex h-16 items-center gap-3 px-6">
        <span className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
          {APP_NAME}
        </span>
        <PathDivider />
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-zinc-900 hover:border-zinc-200 hover:bg-zinc-50"
            onClick={() => setOpen((prev) => !prev)}
          >
            <span>{sessionTitle}</span>
            <ChevronsUpDown className="h-4 w-4 text-zinc-400" aria-hidden />
          </button>
          {open ? (
            <SessionDropdown
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={(sessionId) => {
                onSelectSession(sessionId);
                setOpen(false);
              }}
              onDelete={(sessionId) => {
                onDeleteSession(sessionId);
              }}
              onCreate={() => {
                onCreateSession();
                setOpen(false);
              }}
            />
          ) : null}
        </div>
        {pathSegments.map((label, index) => (
          <Fragment key={`${label}-${index}`}>
            <PathDivider />
            <span className="text-sm font-medium text-zinc-500">{label}</span>
          </Fragment>
        ))}
      </div>
    </header>
  );
}

function PathDivider() {
  return <span className="text-sm text-zinc-300">/</span>;
}

type SessionDropdownProps = {
  sessions: Record<string, Session>;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onCreate: () => void;
};

function SessionDropdown({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  onCreate,
}: SessionDropdownProps) {
  const sessionList = useMemo(
    () =>
      Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  return (
    <div className="absolute left-0 top-full mt-3 w-72 rounded-xl border border-zinc-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
          Sessions
        </span>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New
        </button>
      </div>
      <ul className="max-h-80 overflow-y-auto py-2">
        {sessionList.map((item) => {
          const isActive = item.id === activeSessionId;
          return (
            <li key={item.id} className="px-2">
              <div
                className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                  isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <button
                  type="button"
                  className="flex-1 text-left text-sm text-zinc-800"
                  onClick={() => onSelect(item.id)}
                >
                  {item.title?.trim() || "Untitled Session"}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                  aria-label="Delete session"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
        {sessionList.length === 0 ? (
          <li className="px-4 py-2 text-sm text-zinc-500">No sessions yet.</li>
        ) : null}
      </ul>
    </div>
  );
}

interface ColumnViewProps {
  node: SessionNode;
  messages: Message[];
  isCurrent: boolean;
  isSending: boolean;
  inputValue: string;
  canSubmit: boolean;
  errorMessage: string | null;
  setInputValue: (value: string) => void;
  onSubmit: () => void;
  onHighlightClick: (highlight: Highlight) => void;
  onFocusColumn: () => void;
  registerScrollContainer: (nodeId: string, element: HTMLDivElement | null) => void;
}

function ColumnView({
  node,
  messages,
  isCurrent,
  isSending,
  inputValue,
  canSubmit,
  errorMessage,
  setInputValue,
  onSubmit,
  onHighlightClick,
  onFocusColumn,
  registerScrollContainer,
}: ColumnViewProps) {
  const showEmptyState = node.depth === 0 && messages.length === 0;
  const header = node.header;
  const scrollContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      registerScrollContainer(node.id, element);
    },
    [node.id, registerScrollContainer],
  );
  return (
    <section
      className="relative flex h-full min-h-0 w-full max-w-xl flex-shrink-0 flex-col bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition-opacity"
      style={{ zIndex: node.depth, opacity: isCurrent ? 1 : 0.85 }}
      onClick={onFocusColumn}
    >
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="flex h-full flex-col overflow-y-auto"
          ref={scrollContainerRef}
        >
          <div className="flex-1 px-6 pb-40 pt-6">
            <div className="mb-8">
              {header ? (
                <h3 className="text-2xl font-semibold leading-tight text-zinc-900">
                  {header}
                </h3>
              ) : (
                <div className="h-7 w-64 rounded-md bg-zinc-100" />
              )}
            </div>
            {showEmptyState ? (
              <EmptyState />
            ) : (
              <MessageList
                nodeId={node.id}
                messages={messages}
                onHighlightClick={onHighlightClick}
              />
            )}
          </div>
        </div>
      </div>
      {isCurrent ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-8">
          <LinearInput
            value={inputValue}
            onChange={(value) => setInputValue(value)}
            onSubmit={onSubmit}
            disabled={!canSubmit}
            isSending={isSending}
            errorMessage={errorMessage}
          />
        </div>
      ) : null}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-500">
      <p className="text-lg font-medium tracking-tight">
        A new rabbithole entrance is right here
      </p>
      <ArrowDown className="h-8 w-8 text-zinc-400" aria-hidden />
    </div>
  );
}

function MessageList({
  nodeId,
  messages,
  onHighlightClick,
}: {
  nodeId: string;
  messages: Message[];
  onHighlightClick: (highlight: Highlight) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          nodeId={nodeId}
          message={message}
          onHighlightClick={onHighlightClick}
        />
      ))}
    </div>
  );
}

type MessageBubbleProps = {
  nodeId: string;
  message: Message;
  onHighlightClick: (highlight: Highlight) => void;
};

function MessageBubble({
  nodeId,
  message,
  onHighlightClick,
}: MessageBubbleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!message.highlights?.length) return;
    const sorted = [...message.highlights].sort(
      (a, b) => b.startOffset - a.startOffset,
    );
    const cleanupTargets: {
      link: HTMLAnchorElement;
      handler: (event: MouseEvent) => void;
      originalText: string;
    }[] = [];

    sorted.forEach((highlight) => {
      const start = resolveTextNodePosition(container, highlight.startOffset);
      const end = resolveTextNodePosition(container, highlight.endOffset);
      if (!start || !end) {
        return;
      }
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const originalText = range.toString();
      const displayText =
        highlight.text && highlight.text.length > 0
          ? highlight.text
          : originalText;
      const link = document.createElement("a");
      link.href = "#";
      link.dataset.highlightId = highlight.highlightId;
      link.dataset.childNodeId = highlight.childNodeId;
      link.className = highlight.isActive
        ? "branch-link branch-link-active"
        : "branch-link";
      link.textContent = displayText;
      const handler = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onHighlightClick(highlight);
      };
      link.addEventListener("click", handler);
      range.deleteContents();
      range.insertNode(link);
      cleanupTargets.push({ link, handler, originalText });
    });

    return () => {
      cleanupTargets.forEach(({ link, handler, originalText }) => {
        link.removeEventListener("click", handler);
        if (link.isConnected) {
          const textNode = document.createTextNode(originalText);
          link.replaceWith(textNode);
        }
      });
    };
  }, [message.highlights, message.text, onHighlightClick]);
  const isUser = message.role === "user";
  const wrapperClasses = isUser
    ? "max-w-[80%] rounded-md bg-zinc-100 px-4 py-3 text-sm text-zinc-900"
    : "w-full text-base text-zinc-900";

  return (
    <div className={`flex ${isUser ? "justify-end" : ""}`}>
      <div
        ref={containerRef}
        data-node-id={nodeId}
        data-message-id={message.id}
        className={`relative ${wrapperClasses}`}
      >
        <Markdown content={message.text} />
      </div>
    </div>
  );
}

const hasSelectionIntersection = (
  startOffset: number,
  endOffset: number,
  highlights?: Highlight[],
) => {
  if (!highlights?.length) return false;
  return highlights.some(
    (highlight) =>
      startOffset < highlight.endOffset && endOffset > highlight.startOffset,
  );
};

const normalizeDomOffset = (
  domOffset: number,
  highlights?: Highlight[],
): number => {
  if (!highlights?.length) return domOffset;
  const ordered = [...highlights].sort(
    (a, b) => a.startOffset - b.startOffset,
  );
  let delta = 0;
  for (const highlight of ordered) {
    const originalLength = highlight.endOffset - highlight.startOffset;
    const displayLength =
      highlight.text && highlight.text.length > 0
        ? highlight.text.length
        : originalLength;
    const domStart = highlight.startOffset + delta;
    const domEnd = domStart + displayLength;
    if (domOffset < domStart) {
      return domOffset - delta;
    }
    if (domOffset < domEnd) {
      const relative = domOffset - domStart;
      return highlight.startOffset + Math.min(relative, originalLength);
    }
    delta += displayLength - originalLength;
  }
  return domOffset - delta;
};

const resolveTextNodePosition = (
  container: HTMLElement,
  targetOffset: number,
): { node: Text; offset: number } | null => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let traversed = 0;
  let current: Node | null = walker.nextNode();
  let lastText: Text | null = null;
  while (current) {
    const textNode = current as Text;
    const text = textNode.textContent ?? "";
    const next = traversed + text.length;
    if (targetOffset <= next) {
      return {
        node: textNode,
        offset: targetOffset - traversed,
      };
    }
    traversed = next;
    lastText = textNode;
    current = walker.nextNode();
  }
  if (lastText && targetOffset === traversed) {
    return { node: lastText, offset: lastText.textContent?.length ?? 0 };
  }
  return null;
};

const measureSelectionRect = (
  container: HTMLElement,
  startOffset: number,
  endOffset: number,
): DOMRect | null => {
  const start = resolveTextNodePosition(container, startOffset);
  const end = resolveTextNodePosition(container, endOffset);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range.getBoundingClientRect();
};

function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface LinearInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  isSending: boolean;
  errorMessage?: string | null;
}

function LinearInput({
  value,
  onChange,
  onSubmit,
  disabled,
  isSending,
  errorMessage,
}: LinearInputProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled) {
      onSubmit();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) {
        onSubmit();
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pointer-events-auto rounded-lg border border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_15px_35px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <div className="flex items-end gap-3">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything"
          rows={1}
          className="h-12 w-full resize-none border-0 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={disabled}
        >
          {isSending ? "Thinking..." : "Send"}
          <SendHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {errorMessage ? (
        <p className="mt-2 text-sm text-red-500">{errorMessage}</p>
      ) : null}
    </form>
  );
}

type ContextInputOverlayProps = {
  selection: SelectionDraft | null;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  onCancel: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
};

function ContextInputOverlay({
  selection,
  value,
  onChange,
  onSubmit,
  disabled,
  onCancel,
  inputRef,
}: ContextInputOverlayProps) {
  // Don't auto-focus to preserve the text selection
  // useEffect(() => {
  //   if (selection && inputRef.current) {
  //     inputRef.current.focus();
  //   }
  // }, [selection, inputRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    if (!selection) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selection, onCancel]);

  if (!selection) return null;
  const rect = selection.rect;
  const style = {
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top}px`,
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled) {
      onSubmit();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) {
        onSubmit();
      }
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pointer-events-none fixed z-30"
      style={{
        ...style,
        transform: "translate(-50%, calc(-100% - 12px))",
      }}
    >
      <div className="pointer-events-auto flex min-w-[240px] max-w-sm items-end gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-xl">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Ask about this"
          className="w-full resize-none border-0 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          className="flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={disabled}
        >
          Send
          <SendHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </form>
  );
}
