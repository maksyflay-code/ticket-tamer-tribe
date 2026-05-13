import { createServerFn } from "@tanstack/react-start";
import { exec } from "node:child_process";

function isValidHost(h: string) {
  return /^[a-zA-Z0-9._-]{1,253}$/.test(h);
}

export const pingHost = createServerFn({ method: "POST" })
  .inputValidator((input: { host: string; count?: number }) => {
    if (!input?.host || !isValidHost(input.host)) throw new Error("Host inválido");
    const count = Math.min(Math.max(Number(input.count ?? 4), 1), 10);
    return { host: input.host, count };
  })
  .handler(async ({ data }) => {
    const { host, count } = data;
    // Linux ping: -c count, -W timeout(s), -n no DNS
    const cmd = `ping -c ${count} -W 2 -n ${host}`;
    return await new Promise<{ ok: boolean; output: string }>((resolve) => {
      exec(cmd, { timeout: 15000, maxBuffer: 1024 * 64 }, (err, stdout, stderr) => {
        const output = (stdout || "") + (stderr || "");
        resolve({ ok: !err, output: output || (err?.message ?? "sem saída") });
      });
    });
  });