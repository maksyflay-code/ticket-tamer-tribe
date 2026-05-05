import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { requireAuth } from "@/lib/guard";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

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
  resolvido_at: string | null;
  created_at: string;
  clientes: { nome: string } | null;
};

type Cliente = { id: string; nome: string };

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
  const [items, setItems] = useState<Chamado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Chamado>>(empty);

  const load = async () => {
    const { data, error } = await supabase
      .from("chamados")
      .select("*, clientes(nome)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as unknown as Chamado[]) ?? []);
    const { data: cl } = await supabase.from("clientes").select("id, nome").order("nome");
    setClientes((cl as Cliente[]) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo) return toast.error("Título obrigatório");
    const payload: Record<string, unknown> = { ...form };
    delete payload.clientes;
    delete payload.id;
    delete payload.numero;
    if (payload.status === "resolvido" && !payload.resolvido_at) {
      payload.resolvido_at = new Date().toISOString();
    }
    if (payload.status !== "resolvido" && payload.status !== "fechado") {
      payload.resolvido_at = null;
    }
    const { error } = form.id
      ? await supabase.from("chamados").update(payload).eq("id", form.id)
      : await supabase.from("chamados").insert(payload as never);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Chamado atualizado" : "Chamado aberto");
    setOpen(false);
    setForm(empty);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este chamado?")) return;
    const { error } = await supabase.from("chamados").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Chamado removido");
    load();
  };

  const filtered = items.filter((c) => {
    const matchSearch =
      c.titulo.toLowerCase().includes(search.toLowerCase()) ||
      (c.clientes?.nome ?? "").toLowerCase().includes(search.toLowerCase()) ||
      String(c.numero).includes(search);
    const matchStatus = statusFilter === "todos" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <AppShell title="Chamados">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <div className="flex items-center gap-2 border border-border bg-card px-3 py-2 flex-1 max-w-md">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, cliente ou ID…"
              className="flex-1 bg-transparent text-sm focus:outline-none font-mono"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-card border border-border px-3 py-2 text-sm font-mono"
          >
            <option value="todos">Todos os status</option>
            <option value="aberto">Aberto</option>
            <option value="em_andamento">Em andamento</option>
            <option value="resolvido">Resolvido</option>
            <option value="fechado">Fechado</option>
          </select>
        </div>
        <button
          onClick={() => {
            setForm(empty);
            setOpen(true);
          }}
          className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo Chamado
        </button>
      </div>

      <div className="border border-border bg-card overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-secondary/50 border-b border-border text-muted-foreground">
            <tr>
              <th className="p-4 font-medium font-mono">ID</th>
              <th className="p-4 font-medium font-mono">CLIENTE</th>
              <th className="p-4 font-medium font-mono">TÍTULO</th>
              <th className="p-4 font-medium font-mono">CATEGORIA</th>
              <th className="p-4 font-medium font-mono">PRIORIDADE</th>
              <th className="p-4 font-medium font-mono">STATUS</th>
              <th className="p-4 font-medium font-mono text-right">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground font-mono">
                  Nenhum chamado encontrado.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-secondary/30">
                <td className="p-4 font-mono text-muted-foreground">#TK-{String(c.numero).padStart(4, "0")}</td>
                <td className="p-4 font-medium">{c.clientes?.nome ?? "—"}</td>
                <td className="p-4">{c.titulo}</td>
                <td className="p-4 font-mono text-muted-foreground">{c.categoria ?? "—"}</td>
                <td className={`p-4 font-mono uppercase ${prioridadeColor(c.prioridade)}`}>{c.prioridade}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 border font-mono uppercase ${statusBadge(c.status)}`}>
                    {c.status.replace("_", " ")}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => {
                        setForm(c);
                        setOpen(true);
                      }}
                      className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(c.id)}
                      className="p-1.5 hover:bg-secondary text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Título *</label>
                <input
                  required
                  value={form.titulo ?? ""}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Cliente</label>
                <select
                  value={form.cliente_id ?? ""}
                  onChange={(e) => setForm({ ...form, cliente_id: e.target.value || null })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                >
                  <option value="">— Sem cliente —</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Categoria</label>
                <input
                  value={form.categoria ?? ""}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  placeholder="Ex: Conexão, Financeiro, Instalação"
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Prioridade</label>
                <select
                  value={form.prioridade ?? "media"}
                  onChange={(e) => setForm({ ...form, prioridade: e.target.value as Prioridade })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Status</label>
                <select
                  value={form.status ?? "aberto"}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                >
                  <option value="aberto">Aberto</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="resolvido">Resolvido</option>
                  <option value="fechado">Fechado</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Técnico responsável</label>
                <input
                  value={form.tecnico_responsavel ?? ""}
                  onChange={(e) => setForm({ ...form, tecnico_responsavel: e.target.value })}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Descrição</label>
                <textarea
                  value={form.descricao ?? ""}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  rows={4}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-mono text-muted-foreground hover:text-foreground">Cancelar</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}