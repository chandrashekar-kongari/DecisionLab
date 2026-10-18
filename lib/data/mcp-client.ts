import { createMCPClient, type CallToolResult } from "@ai-sdk/mcp";
import { publicError } from "@/lib/data/connections";

const STRIPE_MCP_URL = "https://mcp.stripe.com";

export async function withMcpClient<T>(
  url: string,
  token: string,
  run: (call: McpCall) => Promise<T>,
): Promise<T> {
  const client = await createMCPClient({
    clientName: "decision-lab",
    transport: {
      type: "http",
      url,
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  try {
    return await run((name, args) => callTool(client, name, args));
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function stripeMcpUrl(): string {
  return STRIPE_MCP_URL;
}

export function supabaseMcpUrl(projectRef: string): string {
  const params = new URLSearchParams({
    project_ref: projectRef,
    read_only: "true",
    features: "database",
    skip_elicitations: "execute_sql",
  });
  return `https://mcp.supabase.com/mcp?${params.toString()}`;
}

type McpCall = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

async function callTool(
  client: Awaited<ReturnType<typeof createMCPClient>>,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    const result = await client.callTool({ name, arguments: args });
    return readToolResult(result);
  } catch (error) {
    throw new Error(publicError(error));
  }
}

function readToolResult(result: CallToolResult): unknown {
  const record = result as {
    isError?: boolean;
    structuredContent?: unknown;
    toolResult?: unknown;
    content?: { type: string; text?: string }[];
  };
  const text = (record.content ?? [])
    .flatMap((part) => (part.type === "text" && part.text ? [part.text] : []))
    .join("\n");
  if (record.isError) {
    throw new Error(text || "MCP tool failed.");
  }
  if (
    record.structuredContent !== undefined &&
    record.structuredContent !== null
  ) {
    return record.structuredContent;
  }
  if (record.toolResult !== undefined) return record.toolResult;
  if (!text.trim()) return null;
  return parseToolText(text);
}

export function parseToolText(text: string): unknown {
  const untrusted = text.match(
    /<untrusted-data-[^>]*>\s*([\s\S]*?)\s*<\/untrusted-data-[^>]*>/,
  );
  const body = (untrusted?.[1] ?? text).trim();
  const parsed = parseJsonBlock(body);
  if (parsed !== undefined) return parsed;
  return body;
}

function parseJsonBlock(body: string): unknown | undefined {
  try {
    return JSON.parse(body);
  } catch {
    // The tool often wraps a JSON payload in a short explanation.
  }
  const arrayStart = body.indexOf("[");
  const arrayEnd = body.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(body.slice(arrayStart, arrayEnd + 1));
    } catch {
      // Fall through to an object payload.
    }
  }
  const objectStart = body.indexOf("{");
  const objectEnd = body.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(body.slice(objectStart, objectEnd + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record.rows)) return record.rows;
  if (Array.isArray(record.result)) return record.result;
  if (Array.isArray(record.data)) return record.data;
  return [];
}

export function isMissingRelation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not exist|42P01|undefined_table|schema cache/i.test(message);
}
