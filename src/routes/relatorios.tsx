import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { BarChart3, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/relatorios")({
  beforeLoad: requireAuth,
  component: RelatoriosPage,
});

type Row = {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  prioridade: string;
  categoria: string | null;
  tecnico_responsavel: string | null;
  created_at: string;
  resolvido_at: string | null;
  clientes: { nome: string } | null;
};

function RelatoriosPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    supabase
      .from("chamados")
      .select("id,numero,titulo,status,prioridade,categoria,tecnico_responsavel,created_at,resolvido_at,clientes(nome)")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data as unknown as Row[]) ?? []);
      });
  }, [days]);

  const stats = useMemo(() => {
    const total = rows.length;
    const porStatus: Record<string, number> = {};
    const porPrioridade: Record<string, number> = {};
    const porCategoria: Record<string, number> = {};
    const porTecnico: Record<string, number> = {};
    let tempoTotal = 0;
    let resolvidos = 0;

    for (const r of rows) {
      porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
      porPrioridade[r.prioridade] = (porPrioridade[r.prioridade] ?? 0) + 1;
      const cat = r.categoria ?? "Sem categoria";
      porCategoria[cat] = (porCategoria[cat] ?? 0) + 1;
      const tec = r.tecnico_responsavel ?? "Não atribuído";
      porTecnico[tec] = (porTecnico[tec] ?? 0) + 1;
      if (r.resolvido_at) {
        tempoTotal += new Date(r.resolvido_at).getTime() - new Date(r.created_at).getTime();
        resolvidos++;
      }
    }
    const tempoMedioH = resolvidos > 0 ? tempoTotal / resolvidos / 3_600_000 : 0;
    return { total, porStatus, porPrioridade, porCategoria, porTecnico, tempoMedioH, resolvidos };
  }, [rows]);

  const exportCsv = () => {
    const header = ["ID", "Cliente", "Titulo", "Status", "Prioridade", "Categoria", "Tecnico", "Aberto em", "Resolvido em"];
    const lines = rows.map((r) =>
      [
        `TK-${String(r.numero).padStart(4, "0")}`,
        r.clientes?.nome ?? "",
        r.titulo,
        r.status,
        r.prioridade,
        r.categoria ?? "",
        r.tecnico_responsavel ?? "",
        r.created_at,
        r.resolvido_at ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chamados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title="Relatórios">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-card border border-border px-3 py-2 text-sm font-mono"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Último ano</option>
          </select>
        </div>
        <button
          onClick={exportCsv}
          className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 hover:opacity-90"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KPI label="Total de Chamados" value={stats.total} />
        <KPI label="Resolvidos" value={stats.resolvidos} />
        <KPI label="Tempo Médio (h)" value={stats.tempoMedioH.toFixed(1)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Breakdown title="Por Status" data={stats.porStatus} total={stats.total} />
        <Breakdown title="Por Prioridade" data={stats.porPrioridade} total={stats.total} />
        <Breakdown title="Por Categoria" data={stats.porCategoria} total={stats.total} />
        <Breakdown title="Por Técnico" data={stats.porTecnico} total={stats.total} />
      </div>
    </AppShell>
  );
}

function KPI({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-border bg-card p-5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-2">{label}</div>
      <div className="font-display text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function Breakdown({ title, data, total }: { title: string; data: Record<string, number>; total: number }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="border border-border bg-card p-5">
      <h3 className="font-display text-sm font-bold tracking-tight mb-4 uppercase">{title}</h3>
      {entries.length === 0 && <div className="text-xs text-muted-foreground font-mono">Sem dados.</div>}
      <div className="space-y-3">
        {entries.map(([k, v]) => {
          const pct = total > 0 ? (v / total) * 100 : 0;
          return (
            <div key={k}>
              <div className="flex justify-between text-xs mb-1 font-mono">
                <span className="uppercase">{k.replace("_", " ")}</span>
                <span className="text-muted-foreground">
                  {v} <span className="opacity-60">({pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="h-1.5 bg-border w-full">
                <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}