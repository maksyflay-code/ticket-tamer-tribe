import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { ArrowUpRight, Clock, CheckCircle2, AlertTriangle, Users, Target, UserPlus, Trophy, Medal, Award, TrendingUp, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  XAxis, YAxis, CartesianGrid, AreaChart, Area, defs as _defs,
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
  codigo: string | null;
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
  const [dailySerie, setDailySerie] = useState<{ dia: string; abertos: number; resolvidos: number }[]>([]);
  const [ranking, setRanking] = useState<{ tecnico: string; resolvidos: number }[]>([]);

  const load = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since30 = new Date(); since30.setDate(since30.getDate() - 30);
    // início do mês corrente para gráficos
    const startMonth = new Date();
    startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const [a, e, r, c, novos, resolvidos30, rec, abertosPri, todosStatus, todosPri, mensal, resolvidosMes] = await Promise.all([
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "aberto"),
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "em_andamento"),
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "resolvido").gte("resolvido_at", today.toISOString()),
      supabase.from("clientes").select("id", { count: "exact", head: true }),
      supabase.from("clientes").select("id", { count: "exact", head: true }).gte("created_at", since30.toISOString()),
      supabase.from("chamados").select("created_at,resolvido_at,prioridade").not("resolvido_at", "is", null).gte("resolvido_at", since30.toISOString()),
      supabase
        .from("chamados")
        .select("id, numero, codigo, titulo, status, prioridade, created_at, clientes(nome)")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("chamados").select("prioridade").in("status", ["aberto", "em_andamento"]),
      supabase.from("chamados").select("status"),
      supabase.from("chamados").select("prioridade"),
      supabase.from("chamados").select("created_at,resolvido_at").gte("created_at", startMonth.toISOString()),
      supabase.from("chamados").select("tecnico_responsavel,resolvido_at").not("resolvido_at", "is", null).gte("resolvido_at", startMonth.toISOString()),
    ]);
    const { getSlaMap } = await import("@/lib/sla");
    const slaMap = await getSlaMap();
    const SLA: Record<string, number> = {
      urgente: slaMap.urgente.horas_resolucao,
      alta: slaMap.alta.horas_resolucao,
      media: slaMap.media.horas_resolucao,
      baixa: slaMap.baixa.horas_resolucao,
    };
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
    { label: "Chamados Abertos", value: stats.abertos, icon: AlertTriangle, color: "bg-amber-500", w: "65%", to: "/chamados", status: "aberto" as const },
    { label: "Em Andamento", value: stats.emAndamento, icon: Clock, color: "bg-primary", w: "45%", to: "/chamados", status: "em_andamento" as const },
    { label: "Resolvidos Hoje", value: stats.resolvidosHoje, icon: CheckCircle2, color: "bg-emerald-500", w: "80%", to: "/chamados", status: "resolvido" as const },
    { label: "Total de Clientes", value: stats.totalClientes, icon: Users, color: "bg-blue-500", w: "72%", to: "/clientes", status: null },
    { label: "SLA (30d)", value: `${stats.slaPct.toFixed(0)}%`, icon: Target, color: "bg-violet-500", w: `${stats.slaPct.toFixed(0)}%`, to: "/chamados", status: null },
    { label: "Tempo Médio", value: `${stats.tempoMedioH.toFixed(1)}h`, icon: Clock, color: "bg-cyan-500", w: "55%", to: "/chamados", status: null },
    { label: "Novos Clientes (30d)", value: stats.novosClientes30d, icon: UserPlus, color: "bg-pink-500", w: "60%", to: "/clientes", status: null },
  ];

  return (
    <AppShell title="Painel de Controle">
      <section className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-8">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label}
              to={c.to}
              onClick={() => {
                if (typeof window !== "undefined") {
                  if (c.status) sessionStorage.setItem("chamados:initial-status", c.status);
                  else sessionStorage.removeItem("chamados:initial-status");
                }
              }}
              className="border border-border bg-card p-3 md:p-5 block hover:border-primary/60 hover:bg-secondary/30 transition-colors">
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
            </Link>
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
          <RankingList ranking={ranking} />
        </ChartCard>
        <ChartCard title="Destaques do mês">
          <HighlightsPanel
            totalResolvidos={ranking.reduce((s, r) => s + r.resolvidos, 0)}
            topTecnico={ranking[0]}
            slaPct={stats.slaPct}
            tempoMedioH={stats.tempoMedioH}
            tecnicosAtivos={ranking.length}
          />
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
                  <td className="p-4 text-muted-foreground font-mono">{c.codigo ?? `#TK-${String(c.numero).padStart(4, "0")}`}</td>
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

function RankingList({ ranking }: { ranking: { tecnico: string; resolvidos: number }[] }) {
  if (ranking.length === 0) {
    return (
      <div className="h-[260px] flex items-center justify-center text-muted-foreground font-mono text-xs">
        Nenhum chamado resolvido no mês.
      </div>
    );
  }
  const max = Math.max(...ranking.map((r) => r.resolvidos));
  const medal = (i: number) => {
    if (i === 0) return { Icon: Trophy, cls: "text-yellow-400", bg: "from-yellow-500/30 to-yellow-500/0", bar: "bg-gradient-to-r from-yellow-500 to-amber-400" };
    if (i === 1) return { Icon: Medal, cls: "text-zinc-300", bg: "from-zinc-400/25 to-zinc-400/0", bar: "bg-gradient-to-r from-zinc-300 to-zinc-400" };
    if (i === 2) return { Icon: Award, cls: "text-orange-400", bg: "from-orange-500/25 to-orange-500/0", bar: "bg-gradient-to-r from-orange-500 to-amber-600" };
    return { Icon: null, cls: "text-muted-foreground", bg: "from-primary/15 to-primary/0", bar: "bg-gradient-to-r from-primary to-primary/60" };
  };
  return (
    <div className="space-y-2.5">
      {ranking.map((r, i) => {
        const m = medal(i);
        const pct = max > 0 ? (r.resolvidos / max) * 100 : 0;
        return (
          <div key={r.tecnico} className={`relative border border-border bg-gradient-to-r ${m.bg} p-2.5 overflow-hidden`}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-7 h-7 border border-border bg-background font-mono text-xs font-bold shrink-0">
                {m.Icon ? <m.Icon className={`h-3.5 w-3.5 ${m.cls}`} /> : <span className="text-muted-foreground">{i + 1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.tecnico}</div>
                <div className="mt-1.5 h-1 bg-border w-full overflow-hidden">
                  <div className={`h-full ${m.bar} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-xl font-bold tracking-tight">{r.resolvidos}</div>
                <div className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">resolvidos</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HighlightsPanel({
  totalResolvidos, topTecnico, slaPct, tempoMedioH, tecnicosAtivos,
}: {
  totalResolvidos: number;
  topTecnico?: { tecnico: string; resolvidos: number };
  slaPct: number;
  tempoMedioH: number;
  tecnicosAtivos: number;
}) {
  const slaColor = slaPct >= 90 ? "text-emerald-400" : slaPct >= 70 ? "text-amber-400" : "text-red-400";
  const items = [
    {
      Icon: TrendingUp,
      label: "Resolvidos no mês",
      value: totalResolvidos,
      hint: `${tecnicosAtivos} técnico${tecnicosAtivos === 1 ? "" : "s"} ativo${tecnicosAtivos === 1 ? "" : "s"}`,
      color: "text-emerald-400",
      bg: "from-emerald-500/15",
    },
    {
      Icon: Trophy,
      label: "Destaque do mês",
      value: topTecnico?.tecnico ?? "—",
      hint: topTecnico ? `${topTecnico.resolvidos} resolvidos` : "sem dados",
      color: "text-yellow-400",
      bg: "from-yellow-500/15",
      small: true,
    },
    {
      Icon: Target,
      label: "SLA cumprido (30d)",
      value: `${slaPct.toFixed(0)}%`,
      hint: slaPct >= 90 ? "excelente" : slaPct >= 70 ? "atenção" : "crítico",
      color: slaColor,
      bg: "from-violet-500/15",
    },
    {
      Icon: Zap,
      label: "Tempo médio (30d)",
      value: `${tempoMedioH.toFixed(1)}h`,
      hint: "do registro à resolução",
      color: "text-cyan-400",
      bg: "from-cyan-500/15",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-2.5">
      {items.map((it) => {
        const Icon = it.Icon;
        return (
          <div key={it.label} className={`relative border border-border bg-gradient-to-r ${it.bg} to-transparent p-3 flex items-center gap-3`}>
            <div className="w-9 h-9 border border-border bg-background flex items-center justify-center shrink-0">
              <Icon className={`h-4 w-4 ${it.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-widest font-mono text-muted-foreground">{it.label}</div>
              <div className={`font-display font-bold tracking-tight truncate ${it.small ? "text-base" : "text-2xl"}`}>{it.value}</div>
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{it.hint}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}