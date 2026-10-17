import { connection } from "next/server";
import { loadConversation, saveConversation } from "@/lib/experiments/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  return Response.json({ messages: await loadConversation(id) });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { messages?: unknown[] } | null;
  if (!body || !Array.isArray(body.messages)) {
    return Response.json({ message: "Messages are required." }, { status: 400 });
  }
  await saveConversation(id, body.messages);
  return Response.json({ ok: true });
}
