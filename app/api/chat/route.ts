import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const prompt: string = body?.prompt ?? "";

  const header =
    prompt?.trim().slice(0, 48).replace(/\s+/g, " ").trim() ||
    "New rabbithole";
  const message =
    "This is a stubbed response. Replace /api/chat with a real LLM call.\n\n" +
    (prompt || "Ask me anything to start.");

  return NextResponse.json({ header, message });
}
