import { createServerFn } from "@tanstack/react-start";

function isValidHost(h: string) {
  return /^[a-zA-Z0-9._-]{1,253}$/.test(h);
}

async function tracerouteViaBun(host: string, maxHops: number): Promise<{ ok: boolean; output: string } | null> {
  const B = (globalThis as { Bun?: { spawn: (opts: unknown) => unknown } }).Bun;
  if (!B || typeof B.spawn !== "function") return null;
  try {
    const proc = B.spawn({
      cmd: ["traceroute", "-n", "-w", "2", "-q", "1", "-m", String(maxHops), host],
      stdout: "pipe",
      stderr: "pipe",
    }) as {
      stdout: ReadableStream<Uint8Array>;
      stderr: ReadableStream<Uint8Array>;
      exited: Promise<number>;
    };
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const output = (stdout || "") + (stderr ? `\n${stderr}` : "");
    return { ok: exitCode === 0, output: output.trim() || "(sem saída)" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, output: `Falha ao executar traceroute: ${msg}` };
  }
}

export const tracerouteHost = createServerFn({ method: "POST" })
  .inputValidator((input: { host: string; maxHops?: number }) => {
    if (!input?.host || !isValidHost(input.host)) throw new Error("Host inválido");
    const maxHops = Math.min(Math.max(Number(input.maxHops ?? 20), 1), 30);
    return { host: input.host, maxHops };
  })
  .handler(async ({ data }) => {
    const { host, maxHops } = data;
    try {
      // 1) child_process.exec (Node tradicional)
      try {
        const cp = await import("node:child_process");
        if (typeof cp.exec === "function") {
          const out = await new Promise<{ ok: boolean; output: string }>((resolve) => {
            cp.exec(
              `traceroute -n -w 2 -q 1 -m ${maxHops} ${host}`,
              { timeout: 60000, maxBuffer: 131072 },
              (err: Error | null, stdout: string, stderr: string) => {
                resolve({
                  ok: !err,
                  output: (stdout || "") + (stderr || "") || (err?.message ?? "(sem saída)"),
                });
              },
            );
          });
          return out;
        }
      } catch {
        // segue pro Bun.spawn
      }

      // 2) Bun.spawn
      const r = await tracerouteViaBun(host, maxHops);
      if (r) return r;

      return {
        ok: false,
        output:
          `Traceroute não disponível neste runtime.\n` +
          `Acesse o app pelo seu servidor (VPS) com o utilitário "traceroute" instalado para usar este recurso.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, output: `Falha ao executar traceroute em ${host}.\nMotivo: ${msg}` };
    }
  });