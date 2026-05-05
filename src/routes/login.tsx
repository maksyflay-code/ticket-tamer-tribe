import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/ivi-logo.jpeg";
import { AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      toast.success("Bem-vindo de volta!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro de autenticação";
      const friendly = /invalid login credentials/i.test(msg)
        ? "E-mail ou senha incorretos."
        : /email not confirmed/i.test(msg)
          ? "Confirme seu e-mail antes de entrar."
          : msg;
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo} alt="IVI Telecom" className="h-24 w-24 rounded-2xl object-cover shadow-lg shadow-primary/10 mb-4" />
          <span className="font-display text-3xl font-extrabold tracking-tighter uppercase text-primary">
            IVI TELECOM
          </span>
          <p className="mt-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Painel de operações
          </p>
        </div>

        <div className="border border-border bg-card p-8">
          <h1 className="font-display text-xl font-bold mb-1 text-center">Bem-vindo de volta</h1>
          <p className="text-xs text-muted-foreground font-mono mb-6 text-center">Entre com suas credenciais para continuar</p>

          {error && (
            <div className="mb-4 flex items-start gap-2 border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
                placeholder="operador@provedor.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Senha</label>
                <Link to="/forgot-password" className="text-[10px] uppercase tracking-widest text-primary hover:underline">Esqueci</Link>
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Processando…" : "Entrar"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          Acesso restrito · IVI Telecom © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}