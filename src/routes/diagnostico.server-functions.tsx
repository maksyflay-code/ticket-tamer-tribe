import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Code2, Layers3, Loader2, RefreshCw, ServerCrash } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { requireAdmin } from "@/lib/guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getServerFunctionFailureStats,
  listServerFunctionFailureLogs,
  markServerFunctionFailureResolved,
} from "@/lib/server-function-failures.functions";
import type { ServerFunctionFailure, ServerFunctionFailureSummary } from "@/lib/server-function-failures.types";
import { authHeaders } from "@/lib/server-call";

export const Route = createFileRoute("/diagnostico/server-functions")({
  beforeLoad: requireAdmin,
  component: ServerFunctionsDiagnosticsPage,
});

const PAGE_SIZE = 25;

function ServerFunctionsDiagnosticsPage() {
  const [items, setItems] = useState<ServerFunctionFailure[]>([]);
  const [summary, setSummary] = useState<ServerFunctionFailureSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(true);

  const load = useCallback(
    async (nextPage = 0) => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const [logs, stats] = await Promise.all([
          listServerFunctionFailureLogs({ data: { page: nextPage, pageSize: PAGE_SIZE, onlyOpen }, headers }),
          getServerFunctionFailureStats({ headers }),
        ]);
        setItems(logs.items);
        setTotal(logs.total);
        setPage(logs.page);
        setSummary(stats);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao carregar diagnóstico");
      } finally {
        setLoading(false);
      }
    },
    [onlyOpen],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const currentBuild = useMemo(() => {
    const first = summary?.byBuild[0];
    return first ? `${first.build_id ?? "sem build"} · v${first.app_version ?? "sem versão"}` : "sem registros";
  }, [summary]);

  const resolve = async (id: string) => {
    try {
      await markServerFunctionFailureResolved({ data: { id }, headers: await authHeaders() });
      toast.success("Falha marcada como resolvida");
      load(page);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao resolver registro");
    }
  };

  return (
    <AppShell title="Diagnóstico de Server Functions">
      <div className="space-y-6">
        <section className="border border-border bg-card p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-destructive">
                <ServerCrash className="h-5 w-5" />
                <p className="text-xs font-mono uppercase tracking-widest">Alerta de runtime</p>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold">Invalid server function ID</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Captura automática de falhas em chamadas internas, vinculada à rota, navegador e build ativo do deploy.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setOnlyOpen((v) => !v)}>
                {onlyOpen ? "Abertas" : "Todas"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Abertas" value={summary?.open ?? 0} />
          <MetricCard icon={<Clock className="h-4 w-4" />} label="Últimas 24h" value={summary?.last24h ?? 0} />
          <MetricCard icon={<Code2 className="h-4 w-4" />} label="Invalid ID" value={summary?.invalidId ?? 0} />
          <MetricCard icon={<Layers3 className="h-4 w-4" />} label="Build atual" value={currentBuild} compact />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold">Ocorrências</h3>
                <span className="text-xs font-mono text-muted-foreground">{total} registros</span>
              </div>
            </div>
            <div className="divide-y divide-border">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma falha registrada.</div>
              ) : (
                items.map((item) => <FailureRow key={item.id} item={item} onResolve={() => resolve(item.id)} />)
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => load(page - 1)}>
                Anterior
              </Button>
              <span className="text-xs font-mono text-muted-foreground">Página {page + 1}</span>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total || loading} onClick={() => load(page + 1)}>
                Próxima
              </Button>
            </div>
          </Card>

          <Card className="self-start p-4">
            <h3 className="font-display text-lg font-bold">Correlação por build</h3>
            <div className="mt-4 space-y-3">
              {(summary?.byBuild ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem builds com falhas.</p>
              ) : (
                summary?.byBuild.map((row) => (
                  <div key={`${row.build_id ?? "sem"}-${row.app_version ?? "sem"}`} className="border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-mono text-xs">{row.build_id ?? "sem build"}</span>
                      <span className="rounded-sm bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">{row.count}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>v{row.app_version ?? "—"}</span>
                      <span>{formatDate(row.latest_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function MetricCard({ icon, label, value, compact = false }: { icon: ReactNode; label: string; value: ReactNode; compact?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-mono uppercase tracking-widest">{label}</span>
      </div>
      <div className={`mt-3 font-display font-bold ${compact ? "truncate text-sm" : "text-3xl"}`}>{value}</div>
    </Card>
  );
}

function FailureRow({ item, onResolve }: { item: ServerFunctionFailure; onResolve: () => void }) {
  const meta = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata as Record<string, unknown> : {};
  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {item.resolved_at ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
            <span className="font-semibold">{item.message}</span>
            <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
            <span className="font-mono">Função: {item.function_name ?? String(meta.serverFnId ?? "—")}</span>
            <span className="font-mono">Rota: {item.route ?? "—"}</span>
            <span className="font-mono">Build: {item.build_id ?? "—"}</span>
            <span className="font-mono">Versão: {item.app_version ?? "—"}</span>
          </div>
          {meta.url ? <div className="truncate text-xs font-mono text-muted-foreground">URL: {String(meta.url)}</div> : null}
          {meta.stack ? <pre className="max-h-24 overflow-auto whitespace-pre-wrap border border-border bg-background p-2 text-xs text-muted-foreground">{String(meta.stack)}</pre> : null}
        </div>
        {!item.resolved_at && (
          <Button variant="outline" size="sm" onClick={onResolve}>
            Resolver
          </Button>
        )}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}
