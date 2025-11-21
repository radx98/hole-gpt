"use client";

import {
  ArrowDown,
  ChevronsUpDown,
  Plus,
  SendHorizontal,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useBranchingContext } from "@/lib/branching-context";
import { APP_NAME } from "@/lib/constants";
import {
  HistoryLine,
  Message,
  Node as SessionNode,
  Session,
} from "@/lib/types";
import { buildHistory, id } from "@/lib/state";

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
    appendMessage,
    setNodeHeader,
  } = useBranchingContext();
  const session =
    ready && state.activeSessionId
      ? state.sessions[state.activeSessionId] ?? null
      : null;
  const currentNodeId =
    session && state.currentNodeId ? state.currentNodeId : session?.rootNodeId;
  const currentNode = currentNodeId ? session?.nodes[currentNodeId] ?? null : null;
  const branchNodes = useMemo(() => {
    if (!session) return [];
    return state.activeBranchNodeIds
      .map((nodeId) => session.nodes[nodeId])
      .filter((node): node is SessionNode => Boolean(node));
  }, [session, state.activeBranchNodeIds]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    Boolean(currentNode) && inputValue.trim().length > 0 && !isSending;

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

  const columnContent =
    ready && session && currentNode ? (
      <RootColumn
        node={currentNode}
        isSending={isSending}
        messages={currentNode.messages}
        onSubmit={handleSubmit}
        inputValue={inputValue}
        setInputValue={setInputValue}
        canSubmit={canSubmit}
        errorMessage={errorMessage}
      />
    ) : (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading session…
      </div>
    );

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900">
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
      <div className="flex flex-1 overflow-hidden pt-16">
        <div className="flex flex-1 justify-start overflow-hidden border-t border-zinc-200 bg-white px-4 py-6 sm:px-12">
          {columnContent}
        </div>
      </div>
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

interface RootColumnProps {
  node: SessionNode;
  messages: Message[];
  isSending: boolean;
  inputValue: string;
  canSubmit: boolean;
  errorMessage: string | null;
  setInputValue: (value: string) => void;
  onSubmit: () => void;
}

function RootColumn({
  node,
  messages,
  isSending,
  inputValue,
  canSubmit,
  errorMessage,
  setInputValue,
  onSubmit,
}: RootColumnProps) {
  const showEmptyState = node.depth === 0 && messages.length === 0;
  const header = node.header;
  return (
    <section className="relative flex h-full w-full max-w-3xl flex-col border-x border-zinc-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="sticky top-0 border-b border-zinc-200 bg-white px-6 py-6">
            {header ? (
              <h3 className="text-2xl font-semibold leading-tight text-zinc-900">
                {header}
              </h3>
            ) : (
              <div className="h-7 w-64 rounded-md bg-zinc-100" />
            )}
          </div>
          <div className="flex-1 px-6 pb-40 pt-6">
            {showEmptyState ? (
              <EmptyState />
            ) : (
              <MessageList messages={messages} />
            )}
          </div>
        </div>
      </div>
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

function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-md bg-zinc-100 px-4 py-3 text-sm text-zinc-900">
          <Markdown content={message.text} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full text-base text-zinc-900">
      <Markdown content={message.text} />
    </div>
  );
}

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
