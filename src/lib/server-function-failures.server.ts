import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ServerFunctionFailurePayload } from "./server-function-failures.types";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { assertAdmin } from "./admin-users.server";

export async function recordServerFunctionFailure(userId: string, data: ServerFunctionFailurePayload) {
  const metadata = typeof data.metadata === "object" && data.metadata !== null ? data.metadata : {};
  const row: TablesInsert<"server_function_failures"> = {
    user_id: userId,
    message: data.message,
    function_name: data.function_name ?? null,
    route: data.route ?? null,
    deploy_url: data.deploy_url ?? null,
    app_version: data.app_version ?? null,
    build_id: data.build_id ?? null,
    build_time: data.build_time ?? null,
    user_agent: data.user_agent ?? null,
    client_timestamp: data.client_timestamp ?? null,
    metadata: metadata as Json,
  };

  const { error } = await supabaseAdmin.from("server_function_failures").insert(row);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listServerFunctionFailures(userId: string, opts: { page: number; pageSize: number; onlyOpen: boolean }) {
  await assertAdmin(userId);
  const from = opts.page * opts.pageSize;
  const to = from + opts.pageSize - 1;
  let query = supabaseAdmin
    .from("server_function_failures")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.onlyOpen) query = query.is("resolved_at", null);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { items: data ?? [], total: count ?? 0, page: opts.page, pageSize: opts.pageSize };
}

export async function getServerFunctionFailureSummary(userId: string) {
  await assertAdmin(userId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("server_function_failures")
    .select("id, message, build_id, app_version, created_at, resolved_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const buildMap = new Map<string, { build_id: string | null; app_version: string | null; count: number; latest_at: string }>();
  for (const row of rows) {
    const key = `${row.build_id ?? "sem-build"}:${row.app_version ?? "sem-versao"}`;
    const current = buildMap.get(key);
    if (!current) {
      buildMap.set(key, { build_id: row.build_id, app_version: row.app_version, count: 1, latest_at: row.created_at });
    } else {
      current.count += 1;
      if (row.created_at > current.latest_at) current.latest_at = row.created_at;
    }
  }

  return {
    total: rows.length,
    open: rows.filter((r) => !r.resolved_at).length,
    last24h: rows.filter((r) => r.created_at >= since).length,
    invalidId: rows.filter((r) => /invalid server function id/i.test(r.message)).length,
    byBuild: Array.from(buildMap.values()).sort((a, b) => b.latest_at.localeCompare(a.latest_at)).slice(0, 8),
  };
}

export async function resolveServerFunctionFailure(userId: string, id: string) {
  await assertAdmin(userId);
  const { error } = await supabaseAdmin
    .from("server_function_failures")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
