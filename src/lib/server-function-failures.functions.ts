import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getServerFunctionFailureSummary,
  listServerFunctionFailures,
  recordServerFunctionFailure,
  resolveServerFunctionFailure,
} from "./server-function-failures.server";
import type { ServerFunctionFailurePayload } from "./server-function-failures.types";

const JsonRecord = z.record(z.unknown()).default({});

const FailurePayloadSchema = z.object({
  message: z.string().min(1).max(2000),
  function_name: z.string().max(300).nullable().optional(),
  route: z.string().max(500).nullable().optional(),
  deploy_url: z.string().max(500).nullable().optional(),
  app_version: z.string().max(100).nullable().optional(),
  build_id: z.string().max(200).nullable().optional(),
  build_time: z.string().max(100).nullable().optional(),
  user_agent: z.string().max(500).nullable().optional(),
  client_timestamp: z.string().datetime().nullable().optional(),
  metadata: JsonRecord.optional(),
});

export const reportServerFunctionFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FailurePayloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    return recordServerFunctionFailure(context.userId, data as ServerFunctionFailurePayload);
  });

export const listServerFunctionFailureLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        page: z.number().int().min(0).max(500).default(0),
        pageSize: z.number().int().min(1).max(100).default(25),
        onlyOpen: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    return listServerFunctionFailures(context.userId, data);
  });

export const getServerFunctionFailureStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return getServerFunctionFailureSummary(context.userId);
  });

export const markServerFunctionFailureResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    return resolveServerFunctionFailure(context.userId, data.id);
  });
