import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { requireAuth } from "@/lib/guard";
import {
  Sparkles,
  Bug,
  Wrench,
  FileText,
  RefreshCw,
  GitCommit,
  AlertCircle,
  Zap,
  Palette,
  Search,
} from "lucide-react";

type CommitItem = {
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

const REPO = "maksyflay-code/ticket-tamer-tribe";

async function fetchChangelogFromGitHub(): Promise<{ items: CommitItem[]; error?: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?per_page=100`,
      { headers: { Accept: "application/vnd.github+json" } },
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
    const cleaned = items.map((it) => ({
      ...it,
      author: "Equipe de desenvolvimento",
      avatar: null,
      title: humanizeTitle(it.title),
      body: sanitizeBody(it.body),
    }));
    const important = filterImportant(cleaned);
    const deduped = dedupeByTitle(important);
    return { items: deduped };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

function humanizeTitle(raw: string): string {
  let t = raw.replace(/^(feat|fix|refactor|perf|docs|style|chore)(\([^)]*\))?:\s*/i, "");
  t = t.replace(/\s*\(#\d+\)\s*$/, "").trim();
  if (!t) return raw;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function sanitizeBody(raw: string): string {
  if (!raw) return raw;
  return raw
    .split("\n")
    .filter((line) => {
      const l = line.trim().toLowerCase();
      if (!l) return true;
      if (l.startsWith("co-authored-by:")) return false;
      if (l.startsWith("signed-off-by:")) return false;
      if (l.includes("lovable")) return false;
      if (l.includes("@users.noreply")) return false;
      return true;
    })
    .join("\n")
    .trim();
}

const NOISE_PATTERNS: RegExp[] = [
  /^merge\b/i,
  /^wip\b/i,
  /^initial commit/i,
  /^update readme/i,
  /^bump\b/i,
  /^chore(\(|:)/i,
  /^docs(\(|:)/i,
  /^style(\(|:)/i,
  /^test(\(|:)/i,
  /^ci(\(|:)/i,
  /^build(\(|:)/i,
  /^revert\b/i,
  /^format\b/i,
  /^lint\b/i,
  /^typo\b/i,
  /^\.{1,}$/,
  /^[a-f0-9]{6,}$/i,
];

function isImportant(title: string): boolean {
  const raw = title.trim();
  if (!raw || raw.length < 6) return false;
  if (NOISE_PATTERNS.some((re) => re.test(raw))) return false;
  const k = classify(raw);
  return k === "feat" || k === "fix" || k === "perf" || k === "refactor";
}

function filterImportant(items: CommitItem[]): CommitItem[] {
  return items.filter((it) => isImportant(it.title));
}

function dedupeByTitle(items: CommitItem[]): CommitItem[] {
  const seen = new Set<string>();
  const out: CommitItem[] = [];
  for (const it of items) {
    const key = it.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function parseBullets(body: string): string[] {
  if (!body) return [];
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets: string[] = [];
  for (const l of lines) {
    const m = l.match(/^[-*•·–]\s*(.+)$/);
    if (m) bullets.push(m[1].trim());
    else if (/^\d+[.)]\s+/.test(l)) bullets.push(l.replace(/^\d+[.)]\s+/, "").trim());
  }
  return bullets;
}

function summarizeBody(body: string): string {
  if (!body) return "";
  const cleaned = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[-*•·–]/.test(l) && !/^\d+[.)]/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function CommitDetails({ kind: _kind, body, title: _title }: { kind: Kind; body: string; title: string }) {
  const bullets = parseBullets(body);
  const summary = summarizeBody(body);
  const hasContent = bullets.length > 0 || summary;
  if (!hasContent) return null;

  return (
    <div className="mt-2 space-y-2">
      {summary && (
        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
      )}
      {bullets.length > 0 && (
        <ul className="space-y-1 pl-1">
          {bullets.map((b, i) => (
            <li key={i} className="text-xs text-foreground/80 leading-relaxed flex gap-2">
              <span className="text-primary mt-1.5 h-1 w-1 rounded-full bg-primary shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const Route = createFileRoute("/updates")({
  beforeLoad: requireAuth,
  component: UpdatesRoute,
});

function UpdatesRoute() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <UpdatesPage />
    </QueryClientProvider>
  );
}

type Kind = "feat" | "fix" | "refactor" | "docs" | "style" | "chore" | "perf" | "other";

const kindMeta: Record<Kind, { label: string; icon: typeof Sparkles; cls: string }> = {
  feat: { label: "Nova funcionalidade", icon: Sparkles, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  fix: { label: "Correção", icon: Bug, cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  refactor: { label: "Refatoração", icon: Wrench, cls: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  perf: { label: "Performance", icon: Zap, cls: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  docs: { label: "Documentação", icon: FileText, cls: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  style: { label: "Estilo", icon: Palette, cls: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
  chore: { label: "Manutenção", icon: Wrench, cls: "text-muted-foreground bg-muted/40 border-border" },
  other: { label: "Atualização", icon: GitCommit, cls: "text-muted-foreground bg-muted/40 border-border" },
};

function classify(title: string): Kind {
  const t = title.toLowerCase().trim();
  const m = t.match(/^(feat|fix|refactor|perf|docs|style|chore)(\(|:|\s)/);
  if (m) return m[1] as Kind;
  if (/\b(fix|bug|corrig|ajust|resolv)/.test(t)) return "fix";
  if (/\b(add|cria|novo|nova|implement|adic)/.test(t)) return "feat";
  if (/\b(refactor|refator)/.test(t)) return "refactor";
  if (/\b(perf|otimiz|performance)/.test(t)) return "perf";
  if (/\b(doc|readme)/.test(t)) return "docs";
  if (/\b(style|estilo|css|ui|design)/.test(t)) return "style";
  if (/\b(chore|deps|update|atualiz)/.test(t)) return "chore";
  return "other";
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

function formatDay(key: string) {
  const d = new Date(key + "T00:00:00");
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Hoje";
  if (same(d, yest)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function UpdatesPage() {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["changelog"],
    queryFn: () => fetchChangelogFromGitHub(),
    staleTime: 5 * 60 * 1000,
  });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Kind | "all">("all");

  const items = data?.items ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) {
      const k = classify(it.title);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((it) => {
      const k = classify(it.title);
      if (filter !== "all" && k !== filter) return false;
      if (!term) return true;
      return (
        it.title.toLowerCase().includes(term) ||
        it.body.toLowerCase().includes(term) ||
        it.author.toLowerCase().includes(term) ||
        it.shortSha.includes(term)
      );
    });
  }, [items, q, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommitItem[]>();
    for (const it of filtered) {
      const k = dayKey(it.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const filterKeys: Array<Kind | "all"> = ["all", "feat", "fix", "perf", "refactor"];

  return (
    <AppShell title="Updates & Fixes">
      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div className="border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-display font-bold tracking-tight">Histórico de atualizações</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Todas as modificações e implementações aplicadas ao sistema
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 border border-border bg-secondary px-3 py-2 text-xs font-mono uppercase hover:bg-secondary/70 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="border border-border bg-card p-4 space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, autor, sha…"
              className="w-full bg-background border border-border pl-9 pr-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filterKeys.map((k) => {
              const active = filter === k;
              const label = k === "all" ? "Tudo" : kindMeta[k as Kind].label;
              const Icon = k === "all" ? GitCommit : kindMeta[k as Kind].icon;
              const n = counts[k] ?? 0;
              return (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`inline-flex items-center gap-2 border px-3 py-1.5 text-xs font-mono uppercase transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  <span className="opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="border border-border bg-card p-12 text-center text-sm font-mono text-muted-foreground">
            Carregando histórico do GitHub…
          </div>
        ) : error || data?.error ? (
          <div className="border border-destructive/40 bg-destructive/10 p-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-destructive">Não foi possível carregar do GitHub</div>
              <div className="text-muted-foreground mt-1 font-mono text-xs break-all">
                {data?.error ?? (error instanceof Error ? error.message : "Erro")}
              </div>
            </div>
          </div>
        ) : grouped.length === 0 ? (
          <div className="border border-border bg-card p-12 text-center text-sm font-mono text-muted-foreground">
            Nenhuma atualização encontrada.
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(([day, list]) => (
              <section key={day}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xs font-mono uppercase text-primary tracking-widest">{formatDay(day)}</h3>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-mono text-muted-foreground">{list.length} commit{list.length > 1 ? "s" : ""}</span>
                </div>
                <ul className="space-y-2">
                  {list.map((it) => {
                    const k = classify(it.title);
                    const meta = kindMeta[k];
                    const Icon = meta.icon;
                    const time = new Date(it.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <li
                        key={it.sha}
                        className="group border border-border bg-card p-4 hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`inline-flex items-center justify-center h-8 w-8 border shrink-0 ${meta.cls}`}
                            title={meta.label}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-snug break-words">
                              {it.title}
                            </p>
                            <CommitDetails kind={k} body={it.body} title={it.title} />
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] font-mono text-muted-foreground">
                              <span className={`uppercase tracking-wider ${meta.cls.split(" ")[0]}`}>{meta.label}</span>
                              <span>·</span>
                              <span className="flex items-center gap-1.5">
                                {it.avatar && (
                                  <img src={it.avatar} alt={it.author} className="h-4 w-4 rounded-full" />
                                )}
                                {it.author}
                              </span>
                              <span>·</span>
                              <span>{time}</span>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}