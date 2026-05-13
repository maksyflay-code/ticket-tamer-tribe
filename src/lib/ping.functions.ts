import { createServerFn } from "@tanstack/react-start";
import { connect } from "node:net";

function isValidHost(h: string) {
  return /^[a-zA-Z0-9._-]{1,253}$/.test(h);
}

const DEFAULT_PORTS = [80, 443, 22, 8080, 23];

function probeOnce(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const sock = connect({ host, port });
    const done = (err: Error | null, ms?: number) => {
      sock.removeAllListeners();
      try { sock.destroy(); } catch { /* noop */ }
      if (err) reject(err); else resolve(ms!);
    };
    const t = setTimeout(() => done(new Error("timeout")), timeoutMs);
    sock.once("connect", () => { clearTimeout(t); done(null, performance.now() - start); });
    sock.once("error", (e) => { clearTimeout(t); done(e); });
  });
}

async function icmpPingViaBun(host: string, count: number): Promise<{ ok: boolean; output: string } | null> {
  // Só funciona no runtime Bun (VPS). Worker não tem Bun.spawn.
  const B = (globalThis as { Bun?: { spawn: (opts: unknown) => unknown } }).Bun;
  if (!B || typeof B.spawn !== "function") return null;
  try {
    const proc = B.spawn({
      cmd: ["ping", "-c", String(count), "-W", "2", "-n", host],
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
    return { ok: false, output: `Falha ao executar ping: ${msg}` };
  }
}

export const pingHost = createServerFn({ method: "POST" })
  .inputValidator((input: { host: string; count?: number; port?: number }) => {
    if (!input?.host || !isValidHost(input.host)) throw new Error("Host inválido");
    const count = Math.min(Math.max(Number(input.count ?? 4), 1), 10);
    const port = input.port ? Math.min(Math.max(Number(input.port), 1), 65535) : undefined;
    return { host: input.host, count, port };
  })
  .handler(async ({ data }) => {
    const { host, count, port } = data;
    try {
      // 1) Tenta ICMP real via Bun (caso do VPS)
      if (!port) {
        const icmp = await icmpPingViaBun(host, count);
        if (icmp) return icmp;
      }

      // 2) Fallback: probe TCP em portas comuns
      const ports = port ? [port] : DEFAULT_PORTS;
      const lines: string[] = [];
      let openPort: number | null = null;
      let okCount = 0;
      const times: number[] = [];

      if (!port) {
        const probes = ports.map(async (p) => {
          try { const ms = await probeOnce(host, p, 2000); return { p, ms }; }
          catch { return null; }
        });
        const results = await Promise.all(probes);
        const winner = results.find((r) => r) ?? null;
        if (winner) {
          openPort = winner.p;
          okCount = 1;
          times.push(winner.ms);
          lines.push(`Resposta de ${host}:${winner.p} — tempo=${winner.ms.toFixed(1)} ms`);
        } else {
          lines.push(`Nenhuma porta comum (${ports.join(", ")}) respondeu em ${host}`);
        }
      } else {
        openPort = port;
      }

      const remaining = openPort ? count - (port ? 0 : 1) : 0;
      for (let i = 0; i < remaining; i++) {
        try {
          const ms = await probeOnce(host, openPort!, 2000);
          okCount++;
          times.push(ms);
          lines.push(`Resposta de ${host}:${openPort} — tempo=${ms.toFixed(1)} ms`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          lines.push(`Falha de ${host}:${openPort} — ${msg}`);
        }
      }

      const total = openPort ? count : 1;
      const loss = total > 0 ? Math.round(((total - okCount) / total) * 100) : 100;
      const min = times.length ? Math.min(...times).toFixed(1) : "—";
      const max = times.length ? Math.max(...times).toFixed(1) : "—";
      const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : "—";

      const header = openPort
        ? `PING TCP ${host}:${openPort} (${count} tentativas)\n`
        : `PING TCP ${host} — sem resposta\n`;
      const footer = `\n--- estatísticas ---\n${total} pacotes enviados, ${okCount} recebidos, ${loss}% perda\nrtt min/avg/max = ${min}/${avg}/${max} ms`;

      return { ok: okCount > 0, output: header + lines.join("\n") + footer };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        output:
          `Falha ao executar o probe TCP em ${host}.\n` +
          `Motivo: ${msg}\n\n` +
          `Observação: o preview do Lovable roda em runtime serverless e não tem acesso a IPs privados/LAN. ` +
          `Acesse o app pelo seu servidor (VPS na mesma rede do equipamento) para o ping funcionar.`,
      };
    }
  });