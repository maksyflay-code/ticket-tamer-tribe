import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REPO = "maksyflay-code/ticket-tamer-tribe";

export type CommitItem = {
  sha: string;
  shortSha: string;
  message: string;
  title: string;
  body: string;
  author: string;
  avatar: string | null;
  date: string;
  url: string;
};

export const listChangelog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ items: CommitItem[]; error?: string }> => {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "ivi-erp-changelog",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/commits?per_page=100`,
        { headers },
      );
      if (!res.ok) {
        const text = await res.text();
        return { items: [], error: `GitHub ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { name: string; date: string } };
        author: { login: string; avatar_url: string } | null;
      }>;
      const items: CommitItem[] = data.map((c) => {
        const msg = c.commit.message ?? "";
        const [title, ...rest] = msg.split("\n");
        return {
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: msg,
          title: title.trim(),
          body: rest.join("\n").trim(),
          author: c.author?.login ?? c.commit.author?.name ?? "—",
          avatar: c.author?.avatar_url ?? null,
          date: c.commit.author?.date ?? new Date().toISOString(),
          url: c.html_url,
        };
      });
      return { items };
    } catch (e) {
      return {
        items: [],
        error: e instanceof Error ? e.message : "Erro desconhecido",
      };
    }
  });