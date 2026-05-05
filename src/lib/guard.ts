import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function requireAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw redirect({ to: "/login" });
}

export async function requireAdmin() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw redirect({ to: "/login" });
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.session.user.id)
    .eq("role", "admin");
  if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
}