import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { useAuth } from "@/lib/auth";
import { Plus, Search, Trash2, Pencil, Paperclip, MessageSquare, Clock, Download, X, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { listAssignableOperators } from "@/server/operators.functions";

export const Route = createFileRoute("/chamados")({
  beforeLoad: requireAuth,
  component: ChamadosPage,
});

type Status = "aberto" | "em_andamento" | "resolvido" | "fechado";
type Prioridade = "baixa" | "media" | "alta" | "urgente";

type Chamado = {
  id: string;
  numero: number;
  cliente_id: string | null;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  status: Status;
  prioridade: Prioridade;
  tecnico_responsavel: string | null;
  responsavel_id: string | null;
  resolvido_at: string | null;
  created_at: string;
  clientes: { nome: string } | null;
};

type Cliente = { id: string; nome: string };
type Operator = { id: string; email: string; role: string };
type Historico = { id: string; tipo: string; descricao: string; autor: string | null; created_at: string; status_anterior: string | null; status_novo: string | null };
type Anexo = { id: string; nome_arquivo: string; storage_path: string; mime_type: string | null; tamanho: number | null; created_at: string };

const empty: Partial<Chamado> = { status: "aberto", prioridade: "media" };

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

function ChamadosPage() {
  const { user, canWrite, isAdmin } = useAuth();
  const [items, setItems] = useState<Chamado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>("todos");
  const [responsavelFilter, setResponsavelFilter] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Chamado>>(empty);
  const [detail, setDetail] = useState<Chamado | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("chamados")
      .select("*, clientes(nome)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as unknown as Chamado[]) ?? []);
    const { data: cl } = await supabase.from("clientes").select("id, nome").order("nome");
    setClientes((cl as Cliente[]) ?? []);
    try {
      const ops = await listAssignableOperators();
      setOperators(ops);
    } catch {
      // visualizador sem operadores: ignora
    }
  };
  useEffect(() => { load(); }, []);

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
    const { error } = form.id
      ? await supabase.from("chamados").update(payload as never).eq("id", form.id)
      : await supabase.from("chamados").insert(payload as never);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Chamado atualizado" : "Chamado aberto");
    setOpen(false);
    setForm(empty);
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

  const filtered = items.filter((c) => {
    const s = search.toLowerCase();
    const matchSearch = c.titulo.toLowerCase().includes(s) ||
      (c.clientes?.nome ?? "").toLowerCase().includes(s) ||
      String(c.numero).includes(search);
    const matchStatus = statusFilter === "todos" || c.status === statusFilter;
    const matchPri = prioridadeFilter === "todos" || c.prioridade === prioridadeFilter;
    const matchResp =
      responsavelFilter === "todos" ? true :
      responsavelFilter === "meus" ? c.responsavel_id === user?.id :
      responsavelFilter === "nao_atribuidos" ? !c.responsavel_id :
      c.responsavel_id === responsavelFilter;
    return matchSearch && matchStatus && matchPri && matchResp;
  });

  return (
    <AppShell title="Chamados">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="flex items-center gap-2 border border-border bg-card px-3 py-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, cliente ou ID…"
              className="flex-1 bg-transparent text-sm focus:outline-none font-mono" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-card border border-border px-3 py-2 text-sm font-mono">
            <option value="todos">Todos os status</option>
            <option value="aberto">Aberto</option>
            <option value="em_andamento">Em andamento</option>
            <option value="resolvido">Resolvido</option>
            <option value="fechado">Fechado</option>
          </select>
          <select value={prioridadeFilter} onChange={(e) => setPrioridadeFilter(e.target.value)}
            className="bg-card border border-border px-3 py-2 text-sm font-mono">
            <option value="todos">Todas prioridades</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
          <select value={responsavelFilter} onChange={(e) => setResponsavelFilter(e.target.value)}
            className="bg-card border border-border px-3 py-2 text-sm font-mono">
            <option value="todos">Todos responsáveis</option>
            <option value="meus">Meus chamados</option>
            <option value="nao_atribuidos">Não atribuídos</option>
            {operators.map((o) => <option key={o.id} value={o.id}>{o.email}</option>)}
          </select>
        </div>
        {canWrite && (
          <button onClick={() => { setForm(empty); setOpen(true); }}
            className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 hover:opacity-90">
            <Plus className="h-4 w-4" /> Novo Chamado
          </button>
        )}
      </div>

      <div className="border border-border bg-card overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="p-4 font-medium font-mono">ID</th>
              <th className="p-4 font-medium font-mono">CLIENTE</th>
              <th className="p-4 font-medium font-mono">TÍTULO</th>
              <th className="p-4 font-medium font-mono">RESPONSÁVEL</th>
              <th className="p-4 font-medium font-mono">PRIORIDADE</th>
              <th className="p-4 font-medium font-mono">STATUS</th>
              <th className="p-4 font-medium font-mono text-right">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground font-mono">Nenhum chamado encontrado.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-secondary/30 cursor-pointer" onClick={() => setDetail(c)}>
                <td className="p-4 font-mono text-muted-foreground">#TK-{String(c.numero).padStart(4, "0")}</td>
                <td className="p-4 font-medium">{c.clientes?.nome ?? "—"}</td>
                <td className="p-4">{c.titulo}</td>
                <td className="p-4 font-mono text-xs">
                  {c.responsavel_id
                    ? <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3 text-primary" />{opEmailById.get(c.responsavel_id) ?? c.tecnico_responsavel ?? "—"}</span>
                    : <span className="text-muted-foreground">não atribuído</span>}
                </td>
                <td className={`p-4 font-mono uppercase ${prioridadeColor(c.prioridade)}`}>{c.prioridade}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 border font-mono uppercase ${statusBadge(c.status)}`}>
                    {c.status.replace("_", " ")}
                  </span>
                </td>
                <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex gap-1">
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
            ))}
          </tbody>
        </table>
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
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-mono text-muted-foreground hover:text-foreground">Cancelar</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {detail && <DetailDrawer chamado={detail} onClose={() => { setDetail(null); load(); }} autor={user?.email ?? "operador"} />}
    </AppShell>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{children}</label>;
}

function DetailDrawer({ chamado, onClose, autor }: { chamado: Chamado; onClose: () => void; autor: string }) {
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [comentario, setComentario] = useState("");
  const [uploading, setUploading] = useState(false);

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
      chamado_id: chamado.id, tipo: "comentario", descricao: comentario.trim(), autor,
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
            <div className="text-[10px] font-mono text-muted-foreground uppercase">#TK-{String(chamado.numero).padStart(4, "0")}</div>
            <h2 className="font-display text-xl font-bold mt-1">{chamado.titulo}</h2>
            <div className="flex gap-2 mt-2">
              <span className={`px-2 py-0.5 border text-[10px] font-mono uppercase ${statusBadge(chamado.status)}`}>{chamado.status.replace("_", " ")}</span>
              <span className={`text-[10px] font-mono uppercase ${prioridadeColor(chamado.prioridade)}`}>● {chamado.prioridade}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <section className="grid grid-cols-2 gap-4 text-xs font-mono">
            <Info label="Cliente" value={chamado.clientes?.nome ?? "—"} />
            <Info label="Categoria" value={chamado.categoria ?? "—"} />
            <Info label="Responsável" value={chamado.tecnico_responsavel ?? (chamado.responsavel_id ? "atribuído" : "não atribuído")} />
            <Info label="Aberto em" value={new Date(chamado.created_at).toLocaleString("pt-BR")} />
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
              <MessageSquare className="h-3 w-3" /> Histórico & Comentários
            </h3>
            <form onSubmit={addComentario} className="mb-4 flex gap-2">
              <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Adicionar comentário…"
                className="flex-1 bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              <button type="submit" className="bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold uppercase">Enviar</button>
            </form>
            <div className="space-y-3">
              {historico.length === 0 && <div className="text-xs text-muted-foreground font-mono">Sem registros.</div>}
              {historico.map((h) => (
                <div key={h.id} className="border-l-2 border-primary/30 pl-3 pb-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(h.created_at).toLocaleString("pt-BR")} · {h.tipo} · {h.autor ?? "sistema"}
                  </div>
                  <div className="text-sm mt-1">{h.descricao}</div>
                </div>
              ))}
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
