import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { useAuth } from "@/lib/auth";
import { Plus, Search, Trash2, Pencil, Paperclip, MessageSquare, Clock, Download, X, UserCheck, AlertTriangle, ChevronLeft, ChevronRight, Hand, UserMinus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { listAssignableOperators } from "@/lib/operators.functions";
import { authHeaders } from "@/lib/server-call";

export const Route = createFileRoute("/chamados")({
  beforeLoad: requireAuth,
  component: ChamadosPage,
});

type Status = "aberto" | "em_andamento" | "resolvido" | "fechado";
type Prioridade = "baixa" | "media" | "alta" | "urgente";
type TipoProblema = "ROMPIMENTO" | "ATENUACAO" | "OUTROS";

type Chamado = {
  id: string;
  numero: number;
  codigo: string | null;
  cliente_id: string | null;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  tipo_problema: string | null;
  status: Status;
  prioridade: Prioridade;
  tecnico_responsavel: string | null;
  responsavel_id: string | null;
  resolvido_at: string | null;
  created_at: string;
  iniciado_at: string | null;
  finalizado_at: string | null;
  clientes: { nome: string } | null;
};

type Cliente = { id: string; nome: string };
type Operator = { id: string; email: string; name: string | null; role: string };
type Historico = { id: string; tipo: string; descricao: string; autor: string | null; created_at: string; status_anterior: string | null; status_novo: string | null };
type Anexo = { id: string; nome_arquivo: string; storage_path: string; mime_type: string | null; tamanho: number | null; created_at: string };

const empty: Partial<Chamado> = { status: "aberto", prioridade: "media" };

const TIPOS_PROBLEMA: { value: TipoProblema; label: string }[] = [
  { value: "ROMPIMENTO", label: "Rompimento" },
  { value: "ATENUACAO", label: "Atenuação" },
  { value: "OUTROS", label: "Outros" },
];

const ticketLabel = (c: Pick<Chamado, "codigo" | "numero">) =>
  c.codigo ?? `#TK-${String(c.numero).padStart(4, "0")}`;

const statusBadge = (s: Status) => ({
  aberto: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  em_andamento: "border-primary/30 bg-primary/10 text-primary",
  resolvido: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  fechado: "border-white/10 bg-white/5 text-muted-foreground",
})[s];

const prioridadeColor = (p: Prioridade) => ({
  urgente: "text-red-400",
  alta: "text-orange-400",
  media: "text-yellow-400",
  baixa: "text-muted-foreground",
})[p];

const SLA_HORAS: Record<Prioridade, number> = { urgente: 4, alta: 8, media: 24, baixa: 72 };

// Converte ISO -> valor para <input type="datetime-local"> (timezone local)
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function localInputToIso(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}
function formatDuracao(ini: string | null, fim: string | null): string {
  if (!ini || !fim) return "—";
  const ms = new Date(fim).getTime() - new Date(ini).getTime();
  if (ms < 0) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function slaInfo(c: Pick<Chamado, "status" | "prioridade" | "created_at" | "resolvido_at">) {
  const limite = SLA_HORAS[c.prioridade];
  const fim = c.resolvido_at ? new Date(c.resolvido_at).getTime() : Date.now();
  const horas = (fim - new Date(c.created_at).getTime()) / 3_600_000;
  const ativo = c.status !== "resolvido" && c.status !== "fechado";
  const estourado = ativo && horas > limite;
  const restante = limite - horas;
  return { estourado, ativo, restante, limite };
}

const PAGE_SIZE = 20;

function ChamadosPage() {
  const { user, canWrite, isAdmin } = useAuth();
  const [items, setItems] = useState<Chamado[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>("todos");
  const [responsavelFilter, setResponsavelFilter] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Chamado>>(empty);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [detail, setDetail] = useState<Chamado | null>(null);

  // debounce de busca
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // resetar paginação quando filtros mudam
  useEffect(() => { setPage(0); }, [searchDebounced, statusFilter, prioridadeFilter, responsavelFilter]);

  const load = async () => {
    let q = supabase
      .from("chamados")
      .select("*, clientes(nome)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (statusFilter !== "todos") q = q.eq("status", statusFilter as never);
    if (prioridadeFilter !== "todos") q = q.eq("prioridade", prioridadeFilter as never);
    if (responsavelFilter === "meus" && user?.id) q = q.eq("responsavel_id", user.id);
    else if (responsavelFilter === "nao_atribuidos") q = q.is("responsavel_id", null);
    else if (responsavelFilter !== "todos" && responsavelFilter !== "meus") q = q.eq("responsavel_id", responsavelFilter);
    if (searchDebounced.trim()) {
      const s = searchDebounced.trim().replace(/[%,]/g, "");
      const asNum = Number(s);
      if (Number.isInteger(asNum) && asNum > 0) {
        q = q.or(`titulo.ilike.%${s}%,numero.eq.${asNum}`);
      } else {
        q = q.ilike("titulo", `%${s}%`);
      }
    }
    const from = page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);
    const { data, error, count } = await q;
    if (error) toast.error(error.message);
    setItems((data as unknown as Chamado[]) ?? []);
    setTotal(count ?? 0);
    const { data: cl } = await supabase.from("clientes").select("id, nome").order("nome");
    setClientes((cl as Cliente[]) ?? []);
    try {
      const ops = await listAssignableOperators({ headers: await authHeaders() });
      setOperators(ops as Operator[]);
    } catch {
      // visualizador sem operadores: ignora
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, searchDebounced, statusFilter, prioridadeFilter, responsavelFilter, user?.id]);

  const opEmailById = useMemo(() => {
    const m = new Map<string, string>();
    operators.forEach((o) => m.set(o.id, o.email));
    return m;
  }, [operators]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return toast.error("Você não tem permissão para alterar chamados.");
    if (!form.titulo) return toast.error("Título obrigatório");
    const payload: Record<string, unknown> = { ...form };
    delete payload.clientes;
    delete payload.id;
    delete payload.numero;
    if (payload.responsavel_id === "") payload.responsavel_id = null;
    // mantém tecnico_responsavel sincronizado com o e-mail do responsável escolhido
    if (payload.responsavel_id) {
      const email = opEmailById.get(payload.responsavel_id as string);
      if (email) payload.tecnico_responsavel = email;
    }
    if (payload.status === "resolvido" && !payload.resolvido_at) {
      payload.resolvido_at = new Date().toISOString();
    }
    if (payload.status !== "resolvido" && payload.status !== "fechado") {
      payload.resolvido_at = null;
    }
    // Auto: ao iniciar atendimento, registra iniciado_at; ao resolver, finalizado_at
    if (payload.status === "em_andamento" && !payload.iniciado_at) {
      payload.iniciado_at = new Date().toISOString();
    }
    if (payload.status === "resolvido" && !payload.finalizado_at) {
      payload.finalizado_at = new Date().toISOString();
    }
    // Quem finaliza vira o responsável (entra nas estatísticas por técnico)
    if ((payload.status === "resolvido" || payload.status === "fechado") && user?.id) {
      payload.responsavel_id = user.id;
      payload.tecnico_responsavel = user.email ?? opEmailById.get(user.id) ?? null;
    }
    let chamadoId = form.id as string | undefined;
    if (chamadoId) {
      const { error } = await supabase.from("chamados").update(payload as never).eq("id", chamadoId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("chamados").insert(payload as never).select("id").single();
      if (error) return toast.error(error.message);
      chamadoId = (data as { id: string }).id;
    }
    // Upload de anexos pendentes
    if (chamadoId && pendingFiles.length > 0) {
      const autorEmail = user?.email ?? "operador";
      for (const file of pendingFiles) {
        try {
          const path = `${chamadoId}/${Date.now()}-${file.name}`;
          const { error: upErr } = await supabase.storage.from("chamado-anexos").upload(path, file);
          if (upErr) throw upErr;
          await supabase.from("chamado_anexos").insert({
            chamado_id: chamadoId, nome_arquivo: file.name, storage_path: path,
            mime_type: file.type, tamanho: file.size,
          } as never);
          await supabase.from("chamado_historico").insert({
            chamado_id: chamadoId, tipo: "anexo", descricao: `Anexo enviado: ${file.name}`, autor: autorEmail,
          } as never);
        } catch (err) {
          toast.error(`Falha ao enviar ${file.name}: ${err instanceof Error ? err.message : "erro"}`);
        }
      }
    }
    toast.success(form.id ? "Chamado atualizado" : "Chamado aberto");
    setOpen(false);
    setForm(empty);
    setPendingFiles([]);
    load();
  };

  const remove = async (id: string) => {
    if (!isAdmin) return toast.error("Apenas administradores podem excluir.");
    if (!confirm("Excluir este chamado?")) return;
    const { error } = await supabase.from("chamados").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Chamado removido");
    load();
  };

  const pegarParaMim = async (c: Chamado) => {
    if (!canWrite || !user) return toast.error("Sem permissão.");
    const { error } = await supabase.from("chamados")
      .update({ responsavel_id: user.id, tecnico_responsavel: user.email } as never)
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Chamado atribuído a você");
    load();
  };
  const liberar = async (c: Chamado) => {
    if (!canWrite || !user) return toast.error("Sem permissão.");
    if (!isAdmin && c.responsavel_id !== user.id) return toast.error("Apenas o responsável ou um admin pode liberar.");
    const { error } = await supabase.from("chamados")
      .update({ responsavel_id: null, tecnico_responsavel: null } as never)
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Chamado liberado");
    load();
  };
  const reabrir = async (c: Chamado) => {
    if (!isAdmin) return toast.error("Apenas administradores podem reabrir.");
    if (!confirm(`Reabrir o chamado ${ticketLabel(c)}?`)) return;
    const { error } = await supabase.from("chamados")
      .update({ status: "em_andamento", resolvido_at: null, finalizado_at: null } as never)
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Chamado reaberto");
    load();
  };

  const filtered = items.filter((c) => {
    // Refino client-side por nome do cliente (server-side já filtrou o resto)
    if (!searchDebounced.trim()) return true;
    const s = searchDebounced.toLowerCase();
    return (
      c.titulo.toLowerCase().includes(s) ||
      (c.clientes?.nome ?? "").toLowerCase().includes(s) ||
      String(c.numero).includes(searchDebounced)
    );
  });

  return (
    <AppShell title="Chamados">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="flex items-center gap-2 border border-border bg-card px-3 py-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, cliente ou ID…"
              className="flex-1 bg-transparent text-sm focus:outline-none font-mono min-w-0" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-card border border-border px-2 md:px-3 py-2 text-xs md:text-sm font-mono">
            <option value="todos">Todos os status</option>
            <option value="aberto">Aberto</option>
            <option value="em_andamento">Em andamento</option>
            <option value="resolvido">Resolvido</option>
            <option value="fechado">Fechado</option>
          </select>
          <select value={prioridadeFilter} onChange={(e) => setPrioridadeFilter(e.target.value)}
            className="bg-card border border-border px-2 md:px-3 py-2 text-xs md:text-sm font-mono">
            <option value="todos">Todas prioridades</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
          <select value={responsavelFilter} onChange={(e) => setResponsavelFilter(e.target.value)}
            className="bg-card border border-border px-2 md:px-3 py-2 text-xs md:text-sm font-mono">
            <option value="todos">Todos responsáveis</option>
            <option value="meus">Meus chamados</option>
            <option value="nao_atribuidos">Não atribuídos</option>
            {operators.map((o) => <option key={o.id} value={o.id}>{o.email}</option>)}
          </select>
        </div>
        {canWrite && (
          <button onClick={() => { setForm(empty); setOpen(true); }}
            className="bg-primary text-primary-foreground px-3 md:px-4 py-2 text-xs md:text-sm font-semibold uppercase tracking-wider flex items-center gap-2 hover:opacity-90 shrink-0">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo Chamado</span><span className="sm:hidden">Novo</span>
          </button>
        )}
      </div>

      <div className="hidden md:block border border-border bg-card overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="p-4 font-medium font-mono">ID</th>
              <th className="p-4 font-medium font-mono">CLIENTE</th>
              <th className="p-4 font-medium font-mono">TÍTULO</th>
              <th className="p-4 font-medium font-mono">RESPONSÁVEL</th>
              <th className="p-4 font-medium font-mono">PRIORIDADE</th>
              <th className="p-4 font-medium font-mono">SLA</th>
              <th className="p-4 font-medium font-mono">STATUS</th>
              <th className="p-4 font-medium font-mono text-right">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground font-mono">Nenhum chamado encontrado.</td></tr>
            )}
            {filtered.map((c) => {
              const sla = slaInfo(c);
              const finalizado = c.status === "resolvido" || c.status === "fechado";
              const meu = !!c.responsavel_id && c.responsavel_id === user?.id;
              return (
              <tr key={c.id} className={`hover:bg-secondary/30 cursor-pointer ${sla.estourado ? "bg-red-500/5" : ""}`} onClick={() => setDetail(c)}>
                <td className="p-4 font-mono text-muted-foreground">{ticketLabel(c)}</td>
                <td className="p-4 font-medium">{c.clientes?.nome ?? "—"}</td>
                <td className="p-4">{c.titulo}</td>
                <td className="p-4 font-mono text-xs">
                  {c.responsavel_id
                    ? <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3 text-primary" />{opEmailById.get(c.responsavel_id) ?? c.tecnico_responsavel ?? "—"}</span>
                    : <span className="text-muted-foreground">não atribuído</span>}
                </td>
                <td className={`p-4 font-mono uppercase ${prioridadeColor(c.prioridade)}`}>{c.prioridade}</td>
                <td className="p-4 font-mono text-[10px]">
                  {!sla.ativo ? <span className="text-muted-foreground">—</span> :
                    sla.estourado ? (
                      <span className="inline-flex items-center gap-1 text-red-400">
                        <AlertTriangle className="h-3 w-3" /> ESTOURADO ({Math.abs(sla.restante).toFixed(0)}h)
                      </span>
                    ) : (
                      <span className={sla.restante < sla.limite * 0.25 ? "text-amber-400" : "text-emerald-400"}>
                        {sla.restante.toFixed(0)}h restantes
                      </span>
                    )}
                </td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 border font-mono uppercase ${statusBadge(c.status)}`}>
                    {c.status.replace("_", " ")}
                  </span>
                </td>
                <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex gap-1">
                    {canWrite && !finalizado && !c.responsavel_id && (
                      <button title="Pegar pra mim" onClick={() => pegarParaMim(c)}
                        className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-primary"><Hand className="h-3.5 w-3.5" /></button>
                    )}
                    {canWrite && !finalizado && c.responsavel_id && (isAdmin || meu) && (
                      <button title="Liberar" onClick={() => liberar(c)}
                        className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-amber-400"><UserMinus className="h-3.5 w-3.5" /></button>
                    )}
                    {isAdmin && finalizado && (
                      <button title="Reabrir" onClick={() => reabrir(c)}
                        className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-emerald-400"><RotateCcw className="h-3.5 w-3.5" /></button>
                    )}
                    {canWrite && (
                      <button onClick={() => { setForm(c); setOpen(true); }}
                        className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                    )}
                    {isAdmin && (
                      <button onClick={() => remove(c.id)}
                        className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: lista em cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 && (
          <div className="border border-border bg-card p-6 text-center text-muted-foreground font-mono text-xs">Nenhum chamado encontrado.</div>
        )}
        {filtered.map((c) => {
          const sla = slaInfo(c);
          const finalizado = c.status === "resolvido" || c.status === "fechado";
          const meu = !!c.responsavel_id && c.responsavel_id === user?.id;
          return (
            <div key={c.id} onClick={() => setDetail(c)}
              className={`border border-border bg-card p-3 active:bg-secondary/40 ${sla.estourado ? "bg-red-500/5" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    <span>{ticketLabel(c)}</span>
                    <span className={`px-1.5 py-px border uppercase ${statusBadge(c.status)}`}>{c.status.replace("_", " ")}</span>
                    <span className={`uppercase ${prioridadeColor(c.prioridade)}`}>● {c.prioridade}</span>
                  </div>
                  <div className="text-sm font-medium mt-1 truncate">{c.titulo}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{c.clientes?.nome ?? "—"}</div>
                  <div className="text-[10px] font-mono mt-1">
                    {c.responsavel_id
                      ? <span className="text-primary">{(opEmailById.get(c.responsavel_id) ?? c.tecnico_responsavel ?? "—").split("@")[0]}</span>
                      : <span className="text-muted-foreground">não atribuído</span>}
                    {sla.ativo && <span className={`ml-2 ${sla.estourado ? "text-red-400" : sla.restante < sla.limite * 0.25 ? "text-amber-400" : "text-emerald-400"}`}>
                      · {sla.estourado ? `ESTOURADO ${Math.abs(sla.restante).toFixed(0)}h` : `${sla.restante.toFixed(0)}h`}
                    </span>}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-1 mt-2 pt-2 border-t border-border" onClick={(e) => e.stopPropagation()}>
                {canWrite && !finalizado && !c.responsavel_id && (
                  <button title="Pegar pra mim" onClick={() => pegarParaMim(c)} className="p-1.5 border border-border hover:bg-secondary text-muted-foreground hover:text-primary"><Hand className="h-3.5 w-3.5" /></button>
                )}
                {canWrite && !finalizado && c.responsavel_id && (isAdmin || meu) && (
                  <button title="Liberar" onClick={() => liberar(c)} className="p-1.5 border border-border hover:bg-secondary text-muted-foreground hover:text-amber-400"><UserMinus className="h-3.5 w-3.5" /></button>
                )}
                {isAdmin && finalizado && (
                  <button title="Reabrir" onClick={() => reabrir(c)} className="p-1.5 border border-border hover:bg-secondary text-muted-foreground hover:text-emerald-400"><RotateCcw className="h-3.5 w-3.5" /></button>
                )}
                {canWrite && (
                  <button onClick={() => { setForm(c); setOpen(true); }} className="p-1.5 border border-border hover:bg-secondary text-muted-foreground hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                )}
                {isAdmin && (
                  <button onClick={() => remove(c.id)} className="p-1.5 border border-border hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-4 text-xs font-mono text-muted-foreground">
        <div>
          {total > 0 ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total}` : "0 resultados"}
        </div>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-3 py-1 border border-border bg-card disabled:opacity-30 hover:bg-secondary inline-flex items-center gap-1">
            <ChevronLeft className="h-3 w-3" /> Anterior
          </button>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border border-border bg-card disabled:opacity-30 hover:bg-secondary inline-flex items-center gap-1">
            Próxima <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={save} className="bg-card border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex justify-between items-center">
              <h2 className="font-display text-lg font-bold">{form.id ? "Editar Chamado" : "Novo Chamado"}</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Lbl>Título *</Lbl>
                <input required value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <Lbl>Cliente</Lbl>
                <select value={form.cliente_id ?? ""} onChange={(e) => setForm({ ...form, cliente_id: e.target.value || null })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary">
                  <option value="">— Sem cliente —</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Categoria</Lbl>
                <input value={form.categoria ?? ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  placeholder="Ex: Conexão, Financeiro, Instalação"
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono" />
              </div>
              <div>
                <Lbl>Tipo de problema</Lbl>
                <select
                  value={form.tipo_problema ?? ""}
                  onChange={(e) => setForm({ ...form, tipo_problema: e.target.value || null })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                >
                  <option value="">— Selecionar —</option>
                  {TIPOS_PROBLEMA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Lbl>Prioridade</Lbl>
                <select value={form.prioridade ?? "media"} onChange={(e) => setForm({ ...form, prioridade: e.target.value as Prioridade })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary">
                  <option value="baixa">Baixa</option><option value="media">Média</option>
                  <option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <Lbl>Status</Lbl>
                <select value={form.status ?? "aberto"} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary">
                  <option value="aberto">Aberto</option><option value="em_andamento">Em andamento</option>
                  <option value="resolvido">Resolvido</option><option value="fechado">Fechado</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <Lbl>Responsável (operador)</Lbl>
                <select
                  value={form.responsavel_id ?? ""}
                  onChange={(e) => setForm({ ...form, responsavel_id: e.target.value || null })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                >
                  <option value="">— Não atribuído —</option>
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>{o.email} ({o.role})</option>
                  ))}
                </select>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  Apenas administradores e operadores aparecem na lista.
                </p>
              </div>
              <div className="md:col-span-2">
                <Lbl>Descrição</Lbl>
                <textarea value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={4}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <Lbl>Horário inicial</Lbl>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(form.iniciado_at as string | null | undefined)}
                  onChange={(e) => setForm({ ...form, iniciado_at: localInputToIso(e.target.value) })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <Lbl>Horário final</Lbl>
                <input
                  type="datetime-local"
                  value={isoToLocalInput(form.finalizado_at as string | null | undefined)}
                  onChange={(e) => setForm({ ...form, finalizado_at: localInputToIso(e.target.value) })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>
              <div className="md:col-span-2">
                <Lbl>Anexos</Lbl>
                <label className="mt-1 block border border-dashed border-border bg-background hover:bg-secondary/30 cursor-pointer p-4 text-center text-xs text-muted-foreground font-mono">
                  <Paperclip className="h-4 w-4 inline mr-2" />
                  Clique para selecionar arquivos
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) setPendingFiles((prev) => [...prev, ...files]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {pendingFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {pendingFiles.map((f, i) => (
                      <li key={i} className="flex items-center justify-between text-xs font-mono bg-background border border-border px-2 py-1">
                        <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                        <button type="button" onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-destructive ml-2">
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-2">
              <button type="button" onClick={() => { setOpen(false); setPendingFiles([]); }} className="px-4 py-2 text-sm font-mono text-muted-foreground hover:text-foreground">Cancelar</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {detail && <DetailDrawer chamado={detail} operators={operators} canWrite={canWrite} onClose={() => { setDetail(null); load(); }} autor={user?.email ?? "operador"} />}
    </AppShell>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{children}</label>;
}

function DetailDrawer({ chamado, onClose, autor, operators, canWrite }: { chamado: Chamado; onClose: () => void; autor: string; operators: Operator[]; canWrite: boolean }) {
  const { user } = useAuth();
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [comentario, setComentario] = useState("");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<Status>(chamado.status);
  const [prioridade, setPrioridade] = useState<Prioridade>(chamado.prioridade);
  const [responsavelId, setResponsavelId] = useState<string>(chamado.responsavel_id ?? "");
  const [savingQuick, setSavingQuick] = useState(false);

  useEffect(() => {
    setStatus(chamado.status);
    setPrioridade(chamado.prioridade);
    setResponsavelId(chamado.responsavel_id ?? "");
  }, [chamado.id, chamado.status, chamado.prioridade, chamado.responsavel_id]);

  const dirty = status !== chamado.status || prioridade !== chamado.prioridade || (responsavelId || null) !== (chamado.responsavel_id || null);

  const saveQuick = async () => {
    if (!canWrite) return toast.error("Sem permissão.");
    setSavingQuick(true);
    const finalizando = status === "resolvido" || status === "fechado";
    // Quem finaliza vira o responsável automaticamente
    const effectiveRespId = finalizando && user?.id ? user.id : (responsavelId || null);
    const opEmail = operators.find((o) => o.id === effectiveRespId)?.email ?? null;
    const effectiveTecnico = finalizando
      ? (opEmail ?? user?.email ?? null)
      : (responsavelId ? opEmail : null);
    const payload: Record<string, unknown> = {
      status, prioridade,
      responsavel_id: effectiveRespId,
      tecnico_responsavel: effectiveTecnico,
    };
    if (status === "resolvido" && !chamado.resolvido_at) payload.resolvido_at = new Date().toISOString();
    if (status !== "resolvido" && status !== "fechado") payload.resolvido_at = null;
    if (status === "em_andamento" && !chamado.iniciado_at) payload.iniciado_at = new Date().toISOString();
    if (status === "resolvido" && !chamado.finalizado_at) payload.finalizado_at = new Date().toISOString();
    const { error } = await supabase.from("chamados").update(payload as never).eq("id", chamado.id);
    setSavingQuick(false);
    if (error) return toast.error(error.message);
    toast.success("Chamado atualizado");
    Object.assign(chamado, payload);
    if (finalizando && effectiveRespId) setResponsavelId(effectiveRespId);
    load();
  };

  const load = async () => {
    const [h, a] = await Promise.all([
      supabase.from("chamado_historico").select("*").eq("chamado_id", chamado.id).order("created_at", { ascending: false }),
      supabase.from("chamado_anexos").select("*").eq("chamado_id", chamado.id).order("created_at", { ascending: false }),
    ]);
    setHistorico((h.data as Historico[]) ?? []);
    setAnexos((a.data as Anexo[]) ?? []);
  };
  useEffect(() => { load(); }, [chamado.id]);

  const addComentario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comentario.trim()) return;
    const { error } = await supabase.from("chamado_historico").insert({
      chamado_id: chamado.id, tipo: "relato", descricao: comentario.trim(), autor,
    } as never);
    if (error) return toast.error(error.message);
    setComentario(""); load();
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${chamado.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("chamado-anexos").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("chamado_anexos").insert({
        chamado_id: chamado.id, nome_arquivo: file.name, storage_path: path,
        mime_type: file.type, tamanho: file.size,
      } as never);
      if (error) throw error;
      await supabase.from("chamado_historico").insert({
        chamado_id: chamado.id, tipo: "anexo", descricao: `Anexo enviado: ${file.name}`, autor,
      } as never);
      toast.success("Anexo enviado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally { setUploading(false); }
  };

  const downloadAnexo = async (a: Anexo) => {
    const { data, error } = await supabase.storage.from("chamado-anexos").createSignedUrl(a.storage_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const removeAnexo = async (a: Anexo) => {
    if (!confirm("Excluir anexo?")) return;
    await supabase.storage.from("chamado-anexos").remove([a.storage_path]);
    await supabase.from("chamado_anexos").delete().eq("id", a.id);
    toast.success("Anexo removido"); load();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div className="bg-card border-l border-border w-full max-w-2xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-border flex justify-between items-start sticky top-0 bg-card z-10">
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">{ticketLabel(chamado)}</div>
            <h2 className="font-display text-xl font-bold mt-1">{chamado.titulo}</h2>
            <div className="flex gap-2 mt-2">
              <span className={`px-2 py-0.5 border text-[10px] font-mono uppercase ${statusBadge(chamado.status)}`}>{chamado.status.replace("_", " ")}</span>
              <span className={`text-[10px] font-mono uppercase ${prioridadeColor(chamado.prioridade)}`}>● {chamado.prioridade}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          {canWrite && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-border bg-background p-3">
              <div>
                <Lbl>Status</Lbl>
                <select value={status} onChange={(e) => setStatus(e.target.value as Status)}
                  className="mt-1 w-full bg-card border border-border px-2 py-1.5 text-xs font-mono">
                  <option value="aberto">Aberto</option><option value="em_andamento">Em andamento</option>
                  <option value="resolvido">Resolvido</option><option value="fechado">Fechado</option>
                </select>
              </div>
              <div>
                <Lbl>Prioridade</Lbl>
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}
                  className="mt-1 w-full bg-card border border-border px-2 py-1.5 text-xs font-mono">
                  <option value="baixa">Baixa</option><option value="media">Média</option>
                  <option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <Lbl>Responsável</Lbl>
                <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}
                  className="mt-1 w-full bg-card border border-border px-2 py-1.5 text-xs font-mono">
                  <option value="">— Não atribuído —</option>
                  {operators.map((o) => <option key={o.id} value={o.id}>{o.email}</option>)}
                </select>
              </div>
              {dirty && (
                <div className="md:col-span-3 flex justify-end">
                  <button disabled={savingQuick} onClick={saveQuick}
                    className="bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold uppercase tracking-wider disabled:opacity-50">
                    {savingQuick ? "Salvando…" : "Aplicar alterações"}
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="grid grid-cols-2 gap-4 text-xs font-mono">
            <Info label="Cliente" value={chamado.clientes?.nome ?? "—"} />
            <Info label="Categoria" value={chamado.categoria ?? "—"} />
            <Info label="Tipo de problema" value={chamado.tipo_problema ?? "—"} />
            <Info label="Responsável" value={chamado.tecnico_responsavel ?? (chamado.responsavel_id ? "atribuído" : "não atribuído")} />
            <Info label="Aberto em" value={new Date(chamado.created_at).toLocaleString("pt-BR")} />
            <Info label="Horário inicial" value={chamado.iniciado_at ? new Date(chamado.iniciado_at).toLocaleString("pt-BR") : "—"} />
            <Info label="Horário final" value={chamado.finalizado_at ? new Date(chamado.finalizado_at).toLocaleString("pt-BR") : "—"} />
            <Info label="Duração do atendimento" value={formatDuracao(chamado.iniciado_at, chamado.finalizado_at)} />
            {chamado.finalizado_at && (
              <Info
                label="Finalizado por"
                value={(() => {
                  const op = chamado.responsavel_id ? operators.find((o) => o.id === chamado.responsavel_id) : undefined;
                  return op?.name || op?.email || chamado.tecnico_responsavel || "—";
                })()}
              />
            )}
          </section>

          {chamado.descricao && (
            <section>
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Descrição</h3>
              <p className="text-sm whitespace-pre-wrap">{chamado.descricao}</p>
            </section>
          )}

          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <Paperclip className="h-3 w-3" /> Anexos ({anexos.length})
            </h3>
            <label className="block border border-dashed border-border bg-background hover:bg-secondary/30 cursor-pointer p-4 text-center text-xs text-muted-foreground font-mono mb-3">
              {uploading ? "Enviando…" : "Clique para enviar arquivo"}
              <input type="file" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </label>
            <div className="space-y-2">
              {anexos.map((a) => (
                <div key={a.id} className="flex items-center justify-between border border-border bg-background px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{a.nome_arquivo}</span>
                    {a.tamanho && <span className="text-muted-foreground font-mono shrink-0">({(a.tamanho / 1024).toFixed(0)}KB)</span>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => downloadAnexo(a)} className="p-1 hover:bg-secondary text-muted-foreground hover:text-primary"><Download className="h-3 w-3" /></button>
                    <button onClick={() => removeAnexo(a)} className="p-1 hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <MessageSquare className="h-3 w-3" /> Relatos / Andamento & Histórico
            </h3>
            <form onSubmit={addComentario} className="mb-4 space-y-2">
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3}
                placeholder="Adicionar relato sobre o andamento do chamado…"
                className="w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              <div className="flex justify-end">
                <button type="submit" className="bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold uppercase">Adicionar relato</button>
              </div>
            </form>
            <div className="space-y-3">
              {historico.length === 0 && <div className="text-xs text-muted-foreground font-mono">Sem registros.</div>}
              {historico.map((h) => {
                const tone =
                  h.tipo === "criacao" ? "border-primary/60" :
                  h.tipo === "mudanca_status" ? "border-amber-500/60" :
                  h.tipo === "mudanca_prioridade" ? "border-orange-500/60" :
                  h.tipo === "mudanca_responsavel" ? "border-violet-500/60" :
                  h.tipo === "anexo" ? "border-cyan-500/60" :
                  h.tipo === "relato" ? "border-emerald-500/60" :
                  "border-border";
                return (
                  <div key={h.id} className={`border-l-2 pl-3 pb-2 ${tone}`}>
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground flex-wrap">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                      <span className="px-1.5 py-px border border-border bg-background">{h.tipo.replace("_", " ")}</span>
                      <span>· {h.autor ?? "sistema"}</span>
                    </div>
                    <div className="text-sm mt-1">{h.descricao}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}
