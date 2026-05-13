import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listAssignableOperatorUsers } from "./admin-users.server";

/**
 * Returns the list of users that can be assigned to a chamado
 * (admin or operador). Available to any authenticated user so the
 * dropdown works for visualizadores reading the ticket as well.
 */
export const listAssignableOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listAssignableOperatorUsers());