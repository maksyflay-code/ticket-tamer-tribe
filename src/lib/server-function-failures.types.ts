import type { Json, Tables } from "@/integrations/supabase/types";

export type ServerFunctionFailure = Tables<"server_function_failures">;

export type ServerFunctionFailurePayload = {
  message: string;
  function_name?: string | null;
  route?: string | null;
  deploy_url?: string | null;
  app_version?: string | null;
  build_id?: string | null;
  build_time?: string | null;
  user_agent?: string | null;
  client_timestamp?: string | null;
  metadata?: Json;
};

export type ServerFunctionFailureSummary = {
  total: number;
  open: number;
  last24h: number;
  invalidId: number;
  byBuild: Array<{ build_id: string | null; app_version: string | null; count: number; latest_at: string }>;
};
