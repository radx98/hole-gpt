import { NextResponse } from "next/server";

type HistoryLine = {
  role: "user" | "assistant";
  text: string;
};

type ChatRequest = {
  history: HistoryLine[];
  prompt: string;
};

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "node_response",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["header", "message"],
      properties: {
        header: {
          type: "string",
          description:
            "A short, title-like summary for the new column. Keep it under 60 characters.",
        },
        message: {
          type: "string",
          description:
            "The assistant's markdown reply for this turn. Preserve formatting.",
        },
      },
    },
  },
} as const;

const sanitizeHistory = (candidate: unknown): HistoryLine[] => {
  if (!Array.isArray(candidate)) return [];
  return candidate
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const role = (entry as HistoryLine).role;
      if (role !== "user" && role !== "assistant") {
        return null;
      }
      const text =
        typeof (entry as HistoryLine).text === "string"
          ? (entry as HistoryLine).text
          : "";
      return { role, text };
    })
    .filter((entry): entry is HistoryLine => Boolean(entry));
};

const parseRequest = async (req: Request): Promise<ChatRequest> => {
  const body = await req.json().catch(() => null);
  const prompt =
    body && typeof body.prompt === "string" ? body.prompt : "";
  const history = sanitizeHistory(body?.history);
  return { history, prompt };
};

const SYSTEM_MESSAGE =
  "You power a non-linear chat interface. Respond with pure JSON that matches the provided schema. " +
  "You receive a conversation history array with role/text pairs plus the latest prompt. " +
  "Return a short descriptive `header` for the node and a markdown-formatted `message`. " +
  "Do not include any extra commentary or keys.";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LLM API key is not configured." },
      { status: 500 },
    );
  }

  const { history, prompt } = await parseRequest(req);

  try {
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        response_format: RESPONSE_FORMAT,
        messages: [
          { role: "system", content: SYSTEM_MESSAGE },
          {
            role: "user",
            content: JSON.stringify({
              history,
              prompt,
            }),
          },
        ],
      }),
    });

    if (!completion.ok) {
      const error = await completion.text();
      console.error("LLM request failed", completion.status, error);
      return NextResponse.json(
        { error: "Failed to fetch completion." },
        { status: 502 },
      );
    }

    const data = await completion.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      console.error("LLM response missing content", data);
      return NextResponse.json(
        { error: "Invalid completion payload." },
        { status: 502 },
      );
    }

    let parsed: { header?: unknown; message?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      console.error("Failed to parse LLM content", error, content);
      return NextResponse.json(
        { error: "Malformed model response." },
        { status: 502 },
      );
    }

    if (typeof parsed.header !== "string" || typeof parsed.message !== "string") {
      return NextResponse.json(
        { error: "Response missing header or message." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      header: parsed.header.trim(),
      message: parsed.message,
    });
  } catch (error) {
    console.error("Unexpected LLM error", error);
    return NextResponse.json(
      { error: "Unexpected error while calling the model." },
      { status: 500 },
    );
  }
}
