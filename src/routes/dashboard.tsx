import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { ArrowUpRight, Clock, CheckCircle2, AlertTriangle, Users, Target, UserPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  component: DashboardPage,
});

type Stats = {
  abertos: number;
  emAndamento: number;
  resolvidosHoje: number;
  totalClientes: number;
  novosClientes30d: number;
  slaPct: number;
  tempoMedioH: number;
  porPrioridade: Record<string, number>;
};

type Chamado = {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  prioridade: string;
  created_at: string;
  clientes: { nome: string } | null;
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    aberto: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    em_andamento: "border-primary/30 bg-primary/10 text-primary",
    resolvido: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    fechado: "border-white/10 bg-white/5 text-muted-foreground",
  };
  return map[s] ?? "";
};
const prioridadeColor = (p: string) => {
  const m: Record<string, string> = {
    urgente: "text-red-400",
    alta: "text-orange-400",
    media: "text-yellow-400",
    baixa: "text-muted-foreground",
  };
  return m[p] ?? "";
};

function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ abertos: 0, emAndamento: 0, resolvidosHoje: 0, totalClientes: 0, novosClientes30d: 0, slaPct: 0, tempoMedioH: 0, porPrioridade: {} });
  const [recentes, setRecentes] = useState<Chamado[]>([]);
  const [statusDist, setStatusDist] = useState<{ name: string; value: number; color: string }[]>([]);
  const [prioridadeDist, setPrioridadeDist] = useState<{ name: string; value: number; color: string }[]>([]);
  const [categoriaDist, setCategoriaDist] = useState<{ name: string; value: number }[]>([]);
  const [dailySerie, setDailySerie] = useState<{ dia: string; abertos: number; resolvidos: number }[]>([]);
  const [ranking, setRanking] = useState<{ tecnico: string; resolvidos: number }[]>([]);

  const load = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since30 = new Date(); since30.setDate(since30.getDate() - 30);
    // início do mês corrente para gráficos
    const startMonth = new Date();
    startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const [a, e, r, c, novos, resolvidos30, rec, abertosPri, todosStatus, todosPri, todasCat, mensal, resolvidosMes] = await Promise.all([
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "aberto"),
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "em_andamento"),
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "resolvido").gte("resolvido_at", today.toISOString()),
      supabase.from("clientes").select("id", { count: "exact", head: true }),
      supabase.from("clientes").select("id", { count: "exact", head: true }).gte("created_at", since30.toISOString()),
      supabase.from("chamados").select("created_at,resolvido_at,prioridade").not("resolvido_at", "is", null).gte("resolvido_at", since30.toISOString()),
      supabase
        .from("chamados")
        .select("id, numero, titulo, status, prioridade, created_at, clientes(nome)")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("chamados").select("prioridade").in("status", ["aberto", "em_andamento"]),
      supabase.from("chamados").select("status"),
      supabase.from("chamados").select("prioridade"),
      supabase.from("chamados").select("categoria"),
      supabase.from("chamados").select("created_at,resolvido_at").gte("created_at", startMonth.toISOString()),
      supabase.from("chamados").select("tecnico_responsavel,resolvido_at").not("resolvido_at", "is", null).gte("resolvido_at", startMonth.toISOString()),
    ]);
    const SLA: Record<string, number> = { urgente: 4, alta: 8, media: 24, baixa: 72 };
    const list = (resolvidos30.data ?? []) as { created_at: string; resolvido_at: string; prioridade: string }[];
    let okSla = 0, totalH = 0;
    list.forEach((x) => {
      const h = (new Date(x.resolvido_at).getTime() - new Date(x.created_at).getTime()) / 3_600_000;
      totalH += h;
      if (h <= (SLA[x.prioridade] ?? 24)) okSla++;
    });
    setStats({
      abertos: a.count ?? 0,
      emAndamento: e.count ?? 0,
      resolvidosHoje: r.count ?? 0,
      totalClientes: c.count ?? 0,
      novosClientes30d: novos.count ?? 0,
      slaPct: list.length > 0 ? (okSla / list.length) * 100 : 0,
      tempoMedioH: list.length > 0 ? totalH / list.length : 0,
      porPrioridade: ((abertosPri.data ?? []) as { prioridade: string }[]).reduce((acc, x) => {
        acc[x.prioridade] = (acc[x.prioridade] ?? 0) + 1; return acc;
      }, {} as Record<string, number>),
    });
    setRecentes((rec.data as unknown as Chamado[]) ?? []);

    // distribuições
    const statusColors: Record<string, string> = {
      aberto: "#f59e0b", em_andamento: "#3b82f6", resolvido: "#10b981", fechado: "#6b7280",
    };
    const prioridadeColors: Record<string, string> = {
      urgente: "#ef4444", alta: "#f97316", media: "#eab308", baixa: "#9ca3af",
    };
    const sCount = ((todosStatus.data ?? []) as { status: string }[]).reduce<Record<string, number>>((acc, x) => {
      acc[x.status] = (acc[x.status] ?? 0) + 1; return acc;
    }, {});
    setStatusDist(Object.entries(sCount).map(([k, v]) => ({ name: k.replace("_", " "), value: v, color: statusColors[k] ?? "#888" })));
    const pCount = ((todosPri.data ?? []) as { prioridade: string }[]).reduce<Record<string, number>>((acc, x) => {
      acc[x.prioridade] = (acc[x.prioridade] ?? 0) + 1; return acc;
    }, {});
    setPrioridadeDist(Object.entries(pCount).map(([k, v]) => ({ name: k, value: v, color: prioridadeColors[k] ?? "#888" })));
    const cCount = ((todasCat.data ?? []) as { categoria: string | null }[]).reduce<Record<string, number>>((acc, x) => {
      const k = x.categoria?.trim() || "Sem categoria";
      acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {});
    setCategoriaDist(Object.entries(cCount).sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([name, value]) => ({ name, value })));

    // série diária do mês
    const dias = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 0).getDate();
    const serie: { dia: string; abertos: number; resolvidos: number }[] = [];
    for (let d = 1; d <= dias; d++) serie.push({ dia: String(d).padStart(2, "0"), abertos: 0, resolvidos: 0 });
    ((mensal.data ?? []) as { created_at: string; resolvido_at: string | null }[]).forEach((x) => {
      const d = new Date(x.created_at).getDate();
      if (serie[d - 1]) serie[d - 1].abertos++;
      if (x.resolvido_at) {
        const dr = new Date(x.resolvido_at);
        if (dr >= startMonth) {
          const di = dr.getDate();
          if (serie[di - 1]) serie[di - 1].resolvidos++;
        }
      }
    });
    setDailySerie(serie);

    // ranking de técnicos no mês
    const rk = ((resolvidosMes.data ?? []) as { tecnico_responsavel: string | null }[]).reduce<Record<string, number>>((acc, x) => {
      const k = x.tecnico_responsavel || "Sem responsável";
      acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {});
    setRanking(Object.entries(rk).sort((a,b)=>b[1]-a[1]).slice(0, 6).map(([tecnico, resolvidos]) => ({
      tecnico: tecnico.includes("@") ? tecnico.split("@")[0] : tecnico,
      resolvidos,
    })));
  };

  useEffect(() => {
    load();
  }, []);

  const cards = [
    { label: "Chamados Abertos", value: stats.abertos, icon: AlertTriangle, color: "bg-amber-500", w: "65%" },
    { label: "Em Andamento", value: stats.emAndamento, icon: Clock, color: "bg-primary", w: "45%" },
    { label: "Resolvidos Hoje", value: stats.resolvidosHoje, icon: CheckCircle2, color: "bg-emerald-500", w: "80%" },
    { label: "Total de Clientes", value: stats.totalClientes, icon: Users, color: "bg-blue-500", w: "72%" },
    { label: "SLA (30d)", value: `${stats.slaPct.toFixed(0)}%`, icon: Target, color: "bg-violet-500", w: `${stats.slaPct.toFixed(0)}%` },
    { label: "Tempo Médio", value: `${stats.tempoMedioH.toFixed(1)}h`, icon: Clock, color: "bg-cyan-500", w: "55%" },
    { label: "Novos Clientes (30d)", value: stats.novosClientes30d, icon: UserPlus, color: "bg-pink-500", w: "60%" },
  ];

  return (
    <AppShell title="Painel de Controle">
      <section className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-8">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="border border-border bg-card p-3 md:p-5">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono leading-tight">
                  {c.label}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="font-display text-2xl md:text-3xl font-bold tracking-tight">{c.value}</div>
              <div className="mt-4 h-1 bg-border w-full">
                <div className={`${c.color} h-full`} style={{ width: c.w }} />
              </div>
            </div>
          );
        })}
      </section>

      <section className="mb-8">
        <h2 className="font-display text-lg font-bold tracking-tight mb-4">Chamados Ativos por Prioridade</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {(["urgente","alta","media","baixa"] as const).map((p) => (
            <div key={p} className="border border-border bg-card p-3 md:p-5">
              <div className={`text-[10px] uppercase tracking-widest font-mono mb-2 ${prioridadeColor(p)}`}>● {p}</div>
              <div className="font-display text-2xl md:text-3xl font-bold">{stats.porPrioridade[p] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <ChartCard title="Distribuição por status">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" label={(e: { value?: number }) => e.value ?? ""}>
                {statusDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={legendStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Distribuição por prioridade">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={prioridadeDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="80%" label={(e: { value?: number }) => e.value ?? ""}>
                {prioridadeDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={legendStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Volume diário no mês">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dailySerie} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Line type="monotone" dataKey="abertos" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolvidos" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Ranking de técnicos (mês)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ranking} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <YAxis type="category" dataKey="tecnico" tick={{ fontSize: 10, fill: "#a1a1aa" }} width={110} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="resolvidos" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Chamados por categoria" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoriaDist} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#a1a1aa" }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section>
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display text-lg font-bold tracking-tight">Chamados Recentes</h2>
          <Link to="/chamados" className="text-xs font-mono text-primary hover:underline flex items-center gap-1">
            Ver todos <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
              <tr>
                <th className="p-4 font-medium font-mono">ID</th>
                <th className="p-4 font-medium font-mono">CLIENTE</th>
                <th className="p-4 font-medium font-mono">ASSUNTO</th>
                <th className="p-4 font-medium font-mono">PRIORIDADE</th>
                <th className="p-4 font-medium font-mono text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentes.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground font-mono">
                    Nenhum chamado registrado ainda.
                  </td>
                </tr>
              )}
              {recentes.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="p-4 text-muted-foreground font-mono">#TK-{String(c.numero).padStart(4, "0")}</td>
                  <td className="p-4 font-medium">{c.clientes?.nome ?? "—"}</td>
                  <td className="p-4">{c.titulo}</td>
                  <td className={`p-4 font-mono uppercase ${prioridadeColor(c.prioridade)}`}>{c.prioridade}</td>
                  <td className="p-4 text-right">
                    <span className={`px-2 py-0.5 border font-mono uppercase ${statusBadge(c.status)}`}>
                      {c.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  fontSize: 11,
  fontFamily: "monospace",
} as const;
const legendStyle = { fontSize: 11, fontFamily: "monospace" } as const;

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-border bg-card p-3 md:p-5 ${className}`}>
      <h3 className="font-display text-sm font-bold tracking-tight mb-3">{title}</h3>
      <div className="w-full">{children}</div>
    </div>
  );
}