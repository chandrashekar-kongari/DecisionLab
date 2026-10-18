import { asRows, isMissingRelation, supabaseMcpUrl, withMcpClient } from "@/lib/data/mcp-client";
import { mapSupabaseRows, type SupabaseDemoSlice } from "@/lib/data/supabase-source";

const TABLES = [
  ["demo_customers", "customers"],
  ["customer_activity", "activity"],
  ["support_tickets", "tickets"],
  ["usage_daily", "usage"],
  ["historical_experiments", "experiments"],
] as const;

export async function loadSupabaseMcp(
  token: string,
  projectRef: string,
): Promise<SupabaseDemoSlice> {
  return withMcpClient(supabaseMcpUrl(projectRef), token, async (call) => {
    const rows = {
      customers: [] as unknown[],
      activity: [] as unknown[],
      tickets: [] as unknown[],
      usage: [] as unknown[],
      experiments: [] as unknown[],
    };
    for (const [table, key] of TABLES) {
      rows[key] = await readTable(call, projectRef, table);
    }
    return mapSupabaseRows(rows);
  });
}

async function readTable(
  call: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  projectRef: string,
  table: string,
): Promise<unknown[]> {
  try {
    const payload = await call("execute_sql", {
      project_id: projectRef,
      query: `select * from public.${table} limit 2000`,
    });
    return asRows(payload);
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}
