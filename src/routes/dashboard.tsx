import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { toast } from "sonner";
import { ArrowUpRight, Clock, CheckCircle2, AlertTriangle, Users, Target, UserPlus, Trophy, Medal, Award, TrendingUp, Zap, Activity, RotateCcw, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { listAssignableOperators } from "@/lib/operators.functions";
import { authHeaders } from "@/lib/server-call";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  XAxis, YAxis, CartesianGrid, AreaChart, Area, LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: requireAuth,
  component: DashboardRoute,
});

function DashboardRoute() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));
  return (
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>
  );
}

type Period = "7d" | "30d" | "90d" | "year";
const PERIOD_LABEL: Record<Period, string> = { "7d": "7d", "30d": "30d", "90d": "90d", year: "Este ano" };
function periodStart(p: Period): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === "year") { d.setMonth(0, 1); return d; }
  const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
  d.setDate(d.getDate() - (days - 1));
  return d;
}

type Stats = {
  abertos: number;
  aguardandoCliente: number;
  resolvidosHoje: number;
  totalClientes: number;
  novosClientes30d: number;
  slaPct: number;
  tempoMedioH: number;
  chamadosMes: number;
  reaberturas: number;
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
    aguardando_cliente: "border-slate-400/30 bg-slate-400/10 text-slate-300",
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
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("30d");
  const [page, setPage] = useState(0);
  const [operators, setOperators] = useState<Array<{ email: string; name: string | null }>>([]);
  const queryClient = useQueryClient();

  const fetchAll = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = periodStart(period);
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const startSpark = new Date(); startSpark.setHours(0,0,0,0); startSpark.setDate(startSpark.getDate() - 6);

    const [a, e, r, c, novos, resolvidosPer, rec, abertosPri, todosStatus, todosPri, periodoSerie, resolvidosMes, reabertHist, sparkData] = await Promise.all([
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "aberto"),
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "aguardando_cliente"),
      supabase.from("chamados").select("id", { count: "exact", head: true }).eq("status", "resolvido").gte("resolvido_at", today.toISOString()),
      supabase.from("clientes").select("id", { count: "exact", head: true }),
      supabase.from("clientes").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString()),
      supabase.from("chamados").select("created_at,resolvido_at,prioridade").not("resolvido_at", "is", null).gte("resolvido_at", start.toISOString()),
      supabase
        .from("chamados")
        .select("id, numero, codigo, titulo, status, prioridade, created_at, clientes(nome)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("chamados").select("prioridade").in("status", ["aberto", "aguardando_cliente"]),
      supabase.from("chamados").select("status"),
      supabase.from("chamados").select("prioridade"),
      supabase.from("chamados").select("created_at,resolvido_at").gte("created_at", start.toISOString()),
      supabase.from("chamados").select("tecnico_responsavel,resolvido_at").not("resolvido_at", "is", null).gte("resolvido_at", startMonth.toISOString()),
      supabase.from("chamado_historico").select("chamado_id,status_anterior,status_novo,created_at,tipo").eq("tipo","mudanca_status").gte("created_at", start.toISOString()),
      supabase.from("chamados").select("created_at,resolvido_at").gte("created_at", startSpark.toISOString()),
    ]);

    const { getSlaMap } = await import("@/lib/sla");
    const slaMap = await getSlaMap();
    const SLA: Record<string, number> = {
      urgente: slaMap.urgente.horas_resolucao,
      alta: slaMap.alta.horas_resolucao,
      media: slaMap.media.horas_resolucao,
      baixa: slaMap.baixa.horas_resolucao,
    };
    const list = (resolvidosPer.data ?? []) as { created_at: string; resolvido_at: string; prioridade: string }[];
    let okSla = 0, totalH = 0;
    list.forEach((x) => {
      const h = (new Date(x.resolvido_at).getTime() - new Date(x.created_at).getTime()) / 3_600_000;
      totalH += h;
      if (h <= (SLA[x.prioridade] ?? 24)) okSla++;
    });

    // Reaberturas: distinct chamado_id where transição saiu de resolvido/fechado
    const reabertSet = new Set<string>();
    ((reabertHist.data ?? []) as { chamado_id: string; status_anterior: string | null; status_novo: string | null }[])
      .forEach((h) => {
        if ((h.status_anterior === "resolvido" || h.status_anterior === "fechado") &&
            h.status_novo && h.status_novo !== "resolvido" && h.status_novo !== "fechado") {
          reabertSet.add(h.chamado_id);
        }
      });

    const stats: Stats = {
      abertos: a.count ?? 0,
      aguardandoCliente: e.count ?? 0,
      resolvidosHoje: r.count ?? 0,
      totalClientes: c.count ?? 0,
      novosClientes30d: novos.count ?? 0,
      slaPct: list.length > 0 ? (okSla / list.length) * 100 : 0,
      tempoMedioH: list.length > 0 ? totalH / list.length : 0,
      chamadosMes: ((periodoSerie.data ?? []) as unknown[]).length,
      reaberturas: reabertSet.size,
      porPrioridade: ((abertosPri.data ?? []) as { prioridade: string }[]).reduce((acc, x) => {
        acc[x.prioridade] = (acc[x.prioridade] ?? 0) + 1; return acc;
      }, {} as Record<string, number>),
    };

    const statusColors: Record<string, string> = {
      aberto: "#f59e0b", aguardando_cliente: "#94a3b8", resolvido: "#10b981", fechado: "#6b7280",
    };
    const prioridadeColors: Record<string, string> = {
      urgente: "#ef4444", alta: "#f97316", media: "#eab308", baixa: "#9ca3af",
    };
    const sCount = ((todosStatus.data ?? []) as { status: string }[]).reduce<Record<string, number>>((acc, x) => {
      acc[x.status] = (acc[x.status] ?? 0) + 1; return acc;
    }, {});
    const statusDist = Object.entries(sCount).map(([k, v]) => ({ name: k.replace("_", " "), value: v, color: statusColors[k] ?? "#888" }));
    const pCount = ((todosPri.data ?? []) as { prioridade: string }[]).reduce<Record<string, number>>((acc, x) => {
      acc[x.prioridade] = (acc[x.prioridade] ?? 0) + 1; return acc;
    }, {});
    const prioridadeDist = Object.entries(pCount).map(([k, v]) => ({ name: k, value: v, color: prioridadeColors[k] ?? "#888" }));

    // Série diária no período
    const dayMs = 86_400_000;
    const totalDays = Math.max(1, Math.round((today.getTime() - start.getTime()) / dayMs) + 1);
    const fmtDay = (d: Date) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
    const dailySerie: { dia: string; abertos: number; resolvidos: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      dailySerie.push({ dia: fmtDay(d), abertos: 0, resolvidos: 0 });
    }
    ((periodoSerie.data ?? []) as { created_at: string; resolvido_at: string | null }[]).forEach((x) => {
      const dc = new Date(x.created_at); dc.setHours(0,0,0,0);
      const idx = Math.round((dc.getTime() - start.getTime()) / dayMs);
      if (dailySerie[idx]) dailySerie[idx].abertos++;
      if (x.resolvido_at) {
        const dr = new Date(x.resolvido_at); dr.setHours(0,0,0,0);
        const ir = Math.round((dr.getTime() - start.getTime()) / dayMs);
        if (dailySerie[ir]) dailySerie[ir].resolvidos++;
      }
    });

    // Sparkline últimos 7 dias
    const sparkNew = Array(7).fill(0) as number[];
    const sparkResolved = Array(7).fill(0) as number[];
    ((sparkData.data ?? []) as { created_at: string; resolvido_at: string | null }[]).forEach((x) => {
      const dc = new Date(x.created_at); dc.setHours(0,0,0,0);
      const i = Math.round((dc.getTime() - startSpark.getTime()) / dayMs);
      if (i >= 0 && i < 7) sparkNew[i]++;
      if (x.resolvido_at) {
        const dr = new Date(x.resolvido_at); dr.setHours(0,0,0,0);
        const ir = Math.round((dr.getTime() - startSpark.getTime()) / dayMs);
        if (ir >= 0 && ir < 7) sparkResolved[ir]++;
      }
    });

    // Heatmap 7x4 (últimas 4 semanas, dia 0=Dom...6=Sab) — usa periodoSerie quando period >=30d, senão sparkData
    const heatStart = new Date(); heatStart.setHours(0,0,0,0); heatStart.setDate(heatStart.getDate() - 27);
    const heatSource = period === "7d"
      ? await supabase.from("chamados").select("created_at").gte("created_at", heatStart.toISOString())
      : { data: ((periodoSerie.data ?? []) as { created_at: string }[]).filter(x => new Date(x.created_at) >= heatStart) };
    const heat: number[][] = Array.from({ length: 4 }, () => Array(7).fill(0));
    ((heatSource.data ?? []) as { created_at: string }[]).forEach((x) => {
      const d = new Date(x.created_at); d.setHours(0,0,0,0);
      const idx = Math.round((d.getTime() - heatStart.getTime()) / dayMs);
      if (idx < 0 || idx > 27) return;
      const week = Math.floor(idx / 7);
      const day = idx % 7;
      if (heat[week] && heat[week][day] !== undefined) heat[week][day]++;
    });

    // Ranking
    const rk = ((resolvidosMes.data ?? []) as { tecnico_responsavel: string | null }[]).reduce<Record<string, number>>((acc, x) => {
      const k = x.tecnico_responsavel || "Sem responsável";
      acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {});
    const ranking = Object.entries(rk).sort((a,b)=>b[1]-a[1]).slice(0, 6).map(([tecnico, resolvidos]) => ({ tecnico, resolvidos }));

    return {
      stats,
      recentes: (rec.data as unknown as Chamado[]) ?? [],
      statusDist,
      prioridadeDist,
      dailySerie,
      ranking,
      sparkNew,
      sparkResolved,
      heat,
    };
  };

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", period],
    queryFn: fetchAll,
  });

  const stats: Stats = data?.stats ?? { abertos: 0, aguardandoCliente: 0, resolvidosHoje: 0, totalClientes: 0, novosClientes30d: 0, slaPct: 0, tempoMedioH: 0, chamadosMes: 0, reaberturas: 0, porPrioridade: {} };
  const recentes = data?.recentes ?? [];
  const statusDist = data?.statusDist ?? [];
  const prioridadeDist = data?.prioridadeDist ?? [];
  const dailySerie = data?.dailySerie ?? [];
  const ranking = data?.ranking ?? [];
  const sparkNew = data?.sparkNew ?? [0,0,0,0,0,0,0];
  const sparkResolved = data?.sparkResolved ?? [0,0,0,0,0,0,0];
  const heat = data?.heat ?? [[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0]];

  useEffect(() => { setPage(0); }, [period, recentes.length]);

  // Mapa email -> nome dos operadores para mostrar nas notificações
  const operatorsRef = useRef<Array<{ email: string; name: string | null }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const ops = await listAssignableOperators({ headers: await authHeaders() });
        operatorsRef.current = ops as unknown as Array<{ email: string; name: string | null }>;
        setOperators(ops as unknown as Array<{ email: string; name: string | null }>);
      } catch { /* visualizador: ignora */ }
    })();
  }, []);

  const rankingDisplay = useMemo(() => {
    return ranking.map((r) => {
      const op = operators.find((o) => o.email === r.tecnico);
      const name = op?.name?.trim();
      if (name) return { ...r, tecnico: name };
      return { ...r, tecnico: r.tecnico.includes("@") ? r.tecnico.split("@")[0] : r.tecnico };
    });
  }, [ranking, operators]);
  const nameOf = (email?: string | null) => {
    if (!email) return "sistema";
    const op = operatorsRef.current.find((o) => o.email === email);
    return op?.name?.trim() || email;
  };

  // Realtime: notifica e atualiza dashboard ao receber novos chamados/relatos/finalizações
  useEffect(() => {
    const codeOf = (r: { codigo?: string | null; numero?: number | null } | null | undefined) =>
      r?.codigo ?? (r?.numero != null ? `#TK-${String(r.numero).padStart(4, "0")}` : "");
    const openChamado = (id: string) => {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("chamados:open-id", id);
        sessionStorage.removeItem("chamados:initial-status");
      }
      navigate({ to: "/chamados" });
    };
    const actionFor = (id: string) => ({ label: "Abrir", onClick: () => openChamado(id) });
    const ACTION_LABEL: Record<string, string> = {
      relato: "Relato adicionado",
      mudanca_status: "Status atualizado",
      mudanca_prioridade: "Prioridade atualizada",
      mudanca_responsavel: "Responsável atualizado",
      anexo: "Anexo enviado",
      criacao: "Chamado criado",
    };
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chamados" },
        (payload) => {
          const n = payload.new as { id: string; codigo?: string | null; numero?: number | null; titulo?: string };
          toast.info(`Novo chamado ${codeOf(n)}`, {
            description: n.titulo ?? undefined,
            action: actionFor(n.id),
          });
          invalidate();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chamados" },
        () => { invalidate(); },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chamados" },
        () => { invalidate(); },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chamado_historico" },
        async (payload) => {
          const h = payload.new as { chamado_id: string; tipo?: string; descricao?: string; autor?: string | null };
          const { data: c } = await supabase
            .from("chamados").select("codigo, numero, titulo").eq("id", h.chamado_id).maybeSingle();
          const code = codeOf(c as { codigo?: string | null; numero?: number | null } | null);
          const head = `${ACTION_LABEL[h.tipo ?? ""] ?? "Atualização"} • ${code}`;
          const desc = `por ${nameOf(h.autor)}${h.descricao ? ` — ${h.descricao}` : ""}`;
          const opts = { description: desc, action: actionFor(h.chamado_id) };
          const isFinal = h.tipo === "mudanca_status" && /resolvido|fechado/i.test(h.descricao ?? "");
          if (isFinal) toast.success(head, opts);
          else if (h.tipo === "relato") toast.info(head, opts);
          else toast.message(head, opts);
          invalidate();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [navigate, queryClient]);

  const cards = [
    { label: "Chamados Abertos", value: stats.abertos, icon: AlertTriangle, accent: "from-amber-500/20 via-amber-500/5", bar: "from-amber-500 to-orange-500", icColor: "text-amber-400", w: "65%", to: "/chamados", status: "aberto" as const },
    { label: "Aguardando Cliente", value: stats.aguardandoCliente, icon: Clock, accent: "from-slate-400/20 via-slate-400/5", bar: "from-slate-300 to-slate-500", icColor: "text-slate-300", w: "45%", to: "/chamados", status: "aguardando_cliente" as const },
    { label: "Resolvidos Hoje", value: stats.resolvidosHoje, icon: CheckCircle2, accent: "from-emerald-500/20 via-emerald-500/5", bar: "from-emerald-400 to-teal-500", icColor: "text-emerald-400", w: "80%", to: "/chamados", status: "resolvido" as const },
    { label: "Total de Clientes", value: stats.totalClientes, icon: Users, accent: "from-blue-500/20 via-blue-500/5", bar: "from-blue-400 to-indigo-500", icColor: "text-blue-400", w: "72%", to: "/clientes", status: null },
    { label: "SLA (30d)", value: `${stats.slaPct.toFixed(0)}%`, icon: Target, accent: "from-violet-500/20 via-violet-500/5", bar: "from-violet-400 to-fuchsia-500", icColor: "text-violet-400", w: `${stats.slaPct.toFixed(0)}%`, to: "/chamados", status: null },
    { label: "Tempo Médio", value: `${stats.tempoMedioH.toFixed(1)}h`, icon: Clock, accent: "from-cyan-500/20 via-cyan-500/5", bar: "from-cyan-400 to-sky-500", icColor: "text-cyan-400", w: "55%", to: "/chamados", status: null },
    { label: "Novos Clientes (30d)", value: stats.novosClientes30d, icon: UserPlus, accent: "from-pink-500/20 via-pink-500/5", bar: "from-pink-400 to-rose-500", icColor: "text-pink-400", w: "60%", to: "/clientes", status: null },
    { label: "Chamados no mês", value: stats.chamadosMes, icon: Activity, accent: "from-teal-500/20 via-teal-500/5", bar: "from-teal-400 to-emerald-500", icColor: "text-teal-400", w: "70%", to: "/chamados", status: null },
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
              className={`group relative overflow-hidden border border-border bg-card p-3 md:p-5 block hover:border-primary/60 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5`}>
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.accent} to-transparent opacity-60 group-hover:opacity-100 transition-opacity`} />
              <div className="relative">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono leading-tight">
                    {c.label}
                  </span>
                  <Icon className={`h-4 w-4 ${c.icColor}`} />
                </div>
                <div className="font-display text-2xl md:text-3xl font-bold tracking-tight tabular-nums">{c.value}</div>
                <div className="mt-4 h-1 bg-border/50 w-full overflow-hidden rounded-full">
                  <div className={`h-full bg-gradient-to-r ${c.bar} transition-all`} style={{ width: c.w }} />
                </div>
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
          <DonutChart data={statusDist} />
        </ChartCard>
        <ChartCard title="Distribuição por prioridade">
          <DonutChart data={prioridadeDist} />
        </ChartCard>
        <ChartCard title="Volume diário no mês" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailySerie} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAbertos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradResolvidos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={legendStyle} />
              <Area type="monotone" dataKey="abertos" stroke="#f59e0b" strokeWidth={2} fill="url(#gradAbertos)" />
              <Area type="monotone" dataKey="resolvidos" stroke="#10b981" strokeWidth={2} fill="url(#gradResolvidos)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Ranking de técnicos (mês)">
          <RankingList ranking={rankingDisplay} />
        </ChartCard>
        <ChartCard title="Destaques do mês">
          <HighlightsPanel
            totalResolvidos={rankingDisplay.reduce((s, r) => s + r.resolvidos, 0)}
            topTecnico={rankingDisplay[0]}
            slaPct={stats.slaPct}
            tempoMedioH={stats.tempoMedioH}
            tecnicosAtivos={rankingDisplay.length}
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
    <div className={`group relative overflow-hidden border border-border bg-card p-3 md:p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-60" />
      <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full bg-primary/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative">
        <h3 className="font-display text-sm font-bold tracking-tight mb-3 flex items-center gap-2">
          <span className="inline-block w-1 h-3 bg-primary/70" />
          {title}
        </h3>
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="h-[240px] flex items-center justify-center text-muted-foreground font-mono text-xs">
        Sem dados.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-[180px] h-[200px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v} (${((v/total)*100).toFixed(0)}%)`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="font-display text-3xl font-bold tabular-nums">{total}</div>
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">total</div>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-1.5">
        {data.map((d) => {
          const pct = (d.value / total) * 100;
          return (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="font-mono uppercase truncate flex-1">{d.name}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{d.value}</span>
              <span className="font-mono tabular-nums text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
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