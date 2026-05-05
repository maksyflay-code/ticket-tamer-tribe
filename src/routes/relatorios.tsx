import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { BarChart3, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  cliente_id: string | null;
  created_at: string;
  resolvido_at: string | null;
  clientes: { nome: string } | null;
};

type ClienteOpt = { id: string; nome: string };

const SLA_HORAS: Record<string, number> = { urgente: 4, alta: 8, media: 24, baixa: 72 };

function RelatoriosPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState("todos");
  const [prioridadeFilter, setPrioridadeFilter] = useState("todos");
  const [clienteFilter, setClienteFilter] = useState("todos");

  useEffect(() => {
    supabase.from("clientes").select("id, nome").order("nome").then(({ data }) => {
      setClientes((data as ClienteOpt[]) ?? []);
    });
  }, []);

  useEffect(() => {
    const fromIso = new Date(dateFrom + "T00:00:00").toISOString();
    const toIso = new Date(dateTo + "T23:59:59").toISOString();
    let q = supabase
      .from("chamados")
      .select("id,numero,titulo,status,prioridade,categoria,tecnico_responsavel,cliente_id,created_at,resolvido_at,clientes(nome)")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false });
    if (statusFilter !== "todos") q = q.eq("status", statusFilter as never);
    if (prioridadeFilter !== "todos") q = q.eq("prioridade", prioridadeFilter as never);
    if (clienteFilter !== "todos") q = q.eq("cliente_id", clienteFilter);
    q.then(({ data, error }) => {
      if (error) toast.error(error.message);
      setRows((data as unknown as Row[]) ?? []);
    });
  }, [dateFrom, dateTo, statusFilter, prioridadeFilter, clienteFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const porStatus: Record<string, number> = {};
    const porPrioridade: Record<string, number> = {};
    const porCategoria: Record<string, number> = {};
    const porTecnico: Record<string, number> = {};
    let tempoTotal = 0, resolvidos = 0, slaOk = 0, slaTotal = 0;
    for (const r of rows) {
      porStatus[r.status] = (porStatus[r.status] ?? 0) + 1;
      porPrioridade[r.prioridade] = (porPrioridade[r.prioridade] ?? 0) + 1;
      porCategoria[r.categoria ?? "Sem categoria"] = (porCategoria[r.categoria ?? "Sem categoria"] ?? 0) + 1;
      porTecnico[r.tecnico_responsavel ?? "Não atribuído"] = (porTecnico[r.tecnico_responsavel ?? "Não atribuído"] ?? 0) + 1;
      if (r.resolvido_at) {
        const horas = (new Date(r.resolvido_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000;
        tempoTotal += horas; resolvidos++;
        slaTotal++;
        if (horas <= (SLA_HORAS[r.prioridade] ?? 24)) slaOk++;
      }
    }
    return {
      total, porStatus, porPrioridade, porCategoria, porTecnico,
      tempoMedioH: resolvidos > 0 ? tempoTotal / resolvidos : 0,
      resolvidos,
      slaPct: slaTotal > 0 ? (slaOk / slaTotal) * 100 : 0,
    };
  }, [rows]);

  const exportCsv = () => {
    const header = ["ID", "Cliente", "Titulo", "Status", "Prioridade", "Categoria", "Tecnico", "Aberto em", "Resolvido em"];
    const lines = rows.map((r) => [
      `TK-${String(r.numero).padStart(4, "0")}`, r.clientes?.nome ?? "", r.titulo,
      r.status, r.prioridade, r.categoria ?? "", r.tecnico_responsavel ?? "",
      r.created_at, r.resolvido_at ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chamados-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text("IVI Telecom — Relatório de Chamados", 14, 15);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Período: ${dateFrom} a ${dateTo}  ·  Status: ${statusFilter}  ·  Prioridade: ${prioridadeFilter}`, 14, 21);
    doc.text(`Total: ${stats.total}  ·  Resolvidos: ${stats.resolvidos}  ·  Tempo médio: ${stats.tempoMedioH.toFixed(1)}h  ·  SLA: ${stats.slaPct.toFixed(0)}%`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [["ID", "Cliente", "Título", "Status", "Prioridade", "Categoria", "Técnico", "Aberto em"]],
      body: rows.map((r) => [
        `TK-${String(r.numero).padStart(4, "0")}`, r.clientes?.nome ?? "—", r.titulo,
        r.status, r.prioridade, r.categoria ?? "—", r.tecnico_responsavel ?? "—",
        new Date(r.created_at).toLocaleString("pt-BR"),
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [30, 30, 40] },
    });
    doc.save(`chamados-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <AppShell title="Relatórios">
      <div className="border border-border bg-card p-4 mb-6 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">De</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Até</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Cliente</label>
          <select value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)}
            className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono">
            <option value="todos">Todos</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono">
            <option value="todos">Todos</option><option value="aberto">Aberto</option>
            <option value="em_andamento">Em andamento</option><option value="resolvido">Resolvido</option>
            <option value="fechado">Fechado</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Prioridade</label>
          <select value={prioridadeFilter} onChange={(e) => setPrioridadeFilter(e.target.value)}
            className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono">
            <option value="todos">Todas</option><option value="baixa">Baixa</option>
            <option value="media">Média</option><option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={exportCsv} className="flex-1 bg-secondary border border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-secondary/70">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button onClick={exportPdf} className="flex-1 bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90">
            <FileText className="h-3 w-3" /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KPI label="Total" value={stats.total} />
        <KPI label="Resolvidos" value={stats.resolvidos} />
        <KPI label="Tempo Médio" value={`${stats.tempoMedioH.toFixed(1)}h`} />
        <KPI label="SLA Atingido" value={`${stats.slaPct.toFixed(0)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Breakdown title="Por Status" data={stats.porStatus} total={stats.total} />
        <Breakdown title="Por Prioridade" data={stats.porPrioridade} total={stats.total} />
        <Breakdown title="Por Categoria" data={stats.porCategoria} total={stats.total} />
        <Breakdown title="Por Técnico" data={stats.porTecnico} total={stats.total} />
      </div>

      <div className="border border-border bg-card overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-sm font-bold uppercase tracking-tight">Detalhamento ({rows.length})</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="p-3 font-mono">ID</th><th className="p-3 font-mono">CLIENTE</th>
              <th className="p-3 font-mono">TÍTULO</th><th className="p-3 font-mono">STATUS</th>
              <th className="p-3 font-mono">PRIORIDADE</th><th className="p-3 font-mono">ABERTO EM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="p-3 font-mono text-muted-foreground">#TK-{String(r.numero).padStart(4, "0")}</td>
                <td className="p-3">{r.clientes?.nome ?? "—"}</td>
                <td className="p-3">{r.titulo}</td>
                <td className="p-3 font-mono uppercase">{r.status.replace("_", " ")}</td>
                <td className="p-3 font-mono uppercase">{r.prioridade}</td>
                <td className="p-3 font-mono text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground font-mono">Sem dados no período.</td></tr>}
          </tbody>
        </table>
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
                <span className="text-muted-foreground">{v} <span className="opacity-60">({pct.toFixed(0)}%)</span></span>
              </div>
              <div className="h-1.5 bg-border w-full"><div className="bg-primary h-full" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
