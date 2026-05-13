import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AdminRole = "admin" | "operador" | "visualizador";

export async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: apenas administradores.");
}

export async function listAdminUsers() {
  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw new Error(error.message);

  const ids = users.users.map((u) => u.id);
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const map = new Map<string, string>();
  (roles ?? []).forEach((r) => map.set(r.user_id, r.role));

  return users.users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    role: (map.get(u.id) as AdminRole | undefined) ?? null,
  }));
}

export async function createAdminUser(data: { email: string; password: string; role: AdminRole }) {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  if (!created.user) throw new Error("Falha ao criar usuário");

  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: created.user.id, role: data.role });
  if (roleError) throw new Error(roleError.message);

  return { id: created.user.id };
}

export async function setAdminUserRole(data: { userId: string; role: AdminRole }) {
  await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
  const { error } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: data.userId, role: data.role });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteAdminUser(userId: string) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function resetAdminUserPassword(data: { userId: string; password: string }) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
    password: data.password,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listAssignableOperatorUsers() {
  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "operador"]);
  if (error) throw new Error(error.message);

  const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
  if (ids.length === 0) return [] as { id: string; email: string; role: string }[];

  const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (usersError) throw new Error(usersError.message);

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
}