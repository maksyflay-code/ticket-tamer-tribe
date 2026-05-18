import { reportServerFunctionFailure } from "./server-function-failures.functions";
import { authHeaders } from "./server-call";

type FailureSource = "fetch" | "error" | "unhandledrejection" | "manual";

type FailureDetails = {
  message: string;
  source: FailureSource;
  functionName?: string | null;
  serverFnId?: string | null;
  status?: number | null;
  url?: string | null;
  stack?: string | null;
  raw?: unknown;
};

const SERVER_FN_BASE = "/_serverFn/";
const TARGET_ERROR = /invalid server function id/i;
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;
let installed = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function safeString(value: unknown, max = 2000) {
  if (typeof value === "string") return value.slice(0, max);
  if (value instanceof Error) return value.message.slice(0, max);
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

function getServerFnId(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    const idx = parsed.pathname.indexOf(SERVER_FN_BASE);
    if (idx === -1) return null;
    return parsed.pathname.slice(idx + SERVER_FN_BASE.length).split("/")[0] || null;
  } catch {
    return null;
  }
}

function getFunctionNameFromId(id?: string | null) {
  if (!id) return null;
  const parts = id.split("--");
  const name = parts[parts.length - 1];
  return name && name !== id ? name : null;
}

function shouldCapture(details: FailureDetails) {
  if (TARGET_ERROR.test(details.message)) return true;
  if (details.url?.includes(SERVER_FN_BASE) && details.status && details.status >= 500) return true;
  return false;
}

async function report(details: FailureDetails) {
  if (!isBrowser() || !shouldCapture(details)) return;
  const serverFnId = details.serverFnId ?? getServerFnId(details.url);
  const functionName = details.functionName ?? getFunctionNameFromId(serverFnId);
  const key = `${details.message}:${serverFnId ?? "sem-id"}:${location.pathname}`;
  const last = recent.get(key) ?? 0;
  if (Date.now() - last < DEDUPE_MS) return;
  recent.set(key, Date.now());

  try {
    await reportServerFunctionFailure({
      data: {
        message: details.message,
        function_name: functionName,
        route: location.pathname,
        deploy_url: location.origin,
        app_version: __APP_VERSION__,
        build_id: __BUILD_ID__,
        build_time: __BUILD_TIME__,
        user_agent: navigator.userAgent,
        client_timestamp: new Date().toISOString(),
        metadata: {
          source: details.source,
          status: details.status ?? null,
          url: details.url ?? null,
          serverFnId,
          stack: details.stack ?? null,
          raw: details.raw ? safeString(details.raw, 1000) : null,
        },
      },
      headers: await authHeaders(),
    });
  } catch (error) {
    console.warn("[server-function-monitor] falha ao registrar diagnóstico", error);
  }
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return safeString(error);
}

export function reportInvalidServerFunctionFailure(error: unknown, context: Partial<FailureDetails> = {}) {
  const message = context.message ?? messageFromError(error);
  return report({
    message,
    source: context.source ?? "manual",
    stack: error instanceof Error ? error.stack ?? null : null,
    raw: error,
    ...context,
  });
}

export function installServerFunctionFailureMonitor() {
  if (!isBrowser() || installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const isServerFn = requestUrl.includes(SERVER_FN_BASE);
    try {
      const response = await originalFetch(input, init);
      if (isServerFn && response.status >= 500) {
        const text = await response.clone().text().catch(() => "");
        if (TARGET_ERROR.test(text) || response.status >= 500) {
          void report({
            message: TARGET_ERROR.test(text) ? "Invalid server function ID" : `Server function HTTP ${response.status}`,
            source: "fetch",
            status: response.status,
            url: requestUrl,
            serverFnId: getServerFnId(requestUrl),
            raw: text.slice(0, 1000),
          });
        }
      }
      return response;
    } catch (error) {
      if (isServerFn) {
        void report({
          message: messageFromError(error),
          source: "fetch",
          status: null,
          url: requestUrl,
          serverFnId: getServerFnId(requestUrl),
          stack: error instanceof Error ? error.stack ?? null : null,
          raw: error,
        });
      }
      throw error;
    }
  };

  window.addEventListener("error", (event) => {
    void report({
      message: messageFromError(event.error ?? event.message),
      source: "error",
      stack: event.error instanceof Error ? event.error.stack ?? null : null,
      raw: event.message,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    void report({
      message: messageFromError(event.reason),
      source: "unhandledrejection",
      stack: event.reason instanceof Error ? event.reason.stack ?? null : null,
      raw: event.reason,
    });
  });
}
