import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Returns the list of users that can be assigned to a chamado
 * (admin or operador). Available to any authenticated user so the
 * dropdown works for visualizadores reading the ticket as well.
 */
export const listAssignableOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "operador"]);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (ids.length === 0) return [] as { id: string; email: string; role: string }[];
    const { data: users, error: uErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (uErr) throw new Error(uErr.message);
    const roleByUser = new Map<string, string>();
    (roles ?? []).forEach((r) => roleByUser.set(r.user_id, r.role));
    return users.users
      .filter((u) => ids.includes(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        role: roleByUser.get(u.id) ?? "",
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  });