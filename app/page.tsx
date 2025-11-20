"use client";

import { ArrowDown, SendHorizontal } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MessageRole = "user" | "assistant";

interface Message {
  id: string;
  role: MessageRole;
  text: string;
}

interface MockResponse {
  header: string;
  message: string;
}

const APP_NAME = "HOLE GPT";

const mockResponses = [
  "Let's open this rabbithole together.",
  "Here's a first angle to examine.",
  "Here's a quick thought so we can keep digging.",
  "Let me ground the idea before we branch."
];

function genId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockChatCompletion(prompt: string): Promise<MockResponse> {
  const trimmed = prompt.trim();
  const fallback = mockResponses[Math.floor(Math.random() * mockResponses.length)];
  await wait(650);
  return {
    header: "Unlabeled Rabbithole",
    message: trimmed
      ? `You asked about **${trimmed}**. ${fallback}`
      : fallback
  };
}

export default function Home() {
  const [header, setHeader] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const canSubmit = inputValue.trim().length > 0 && !isSending;

  const handleSubmit = async () => {
    const text = inputValue.trim();
    if (!text || isSending) return;

    const userMessage: Message = {
      id: genId("user"),
      role: "user",
      text
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setHasStarted(true);
    setIsSending(true);

    try {
      const response = await mockChatCompletion(text);
      const assistantMessage: Message = {
        id: genId("assistant"),
        role: "assistant",
        text: response.message
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setHeader((current) => current ?? response.header);
    } catch {
      const assistantMessage: Message = {
        id: genId("assistant"),
        role: "assistant",
        text: "Something went wrong while talking to the model. Try again in a second."
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900">
      <TopBar />
      <div className="flex flex-1 overflow-hidden border-t border-zinc-200 bg-white">
        <div className="flex flex-1 justify-start overflow-hidden px-4 py-6 sm:px-12">
          <RootColumn
            hasStarted={hasStarted}
            header={header}
            isSending={isSending}
            messages={messages}
            onSubmit={handleSubmit}
            inputValue={inputValue}
            setInputValue={setInputValue}
            canSubmit={canSubmit}
          />
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 text-sm font-semibold uppercase tracking-[0.4em] text-zinc-600">
      <span>{APP_NAME}</span>
      <span className="text-xs tracking-[0.5em] text-zinc-400">PHASE 2</span>
    </header>
  );
}

interface RootColumnProps {
  header: string | null;
  messages: Message[];
  isSending: boolean;
  hasStarted: boolean;
  inputValue: string;
  canSubmit: boolean;
  setInputValue: (value: string) => void;
  onSubmit: () => void;
}

function RootColumn({
  header,
  messages,
  hasStarted,
  isSending,
  inputValue,
  canSubmit,
  setInputValue,
  onSubmit
}: RootColumnProps) {
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
            {hasStarted ? (
              <MessageList messages={messages} />
            ) : (
              <EmptyState />
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
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="markdown"
      linkTarget="_blank"
    >
      {content}
    </ReactMarkdown>
  );
}

interface LinearInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  isSending: boolean;
}

function LinearInput({
  value,
  onChange,
  onSubmit,
  disabled,
  isSending
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
          {isSending ? "Sending" : "Send"}
          <SendHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
