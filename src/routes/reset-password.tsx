import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/ivi-logo.jpeg";

export const Route = createFileRoute("/reset-password")({
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts recovery in URL hash; client picks it up automatically
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Mínimo 8 caracteres");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      toast.success("Senha redefinida com sucesso");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <img src={logo} alt="IVI Telecom" className="h-20 w-20 rounded-xl object-cover" />
            <span className="font-display text-2xl font-extrabold tracking-tighter uppercase text-primary">IVI TELECOM</span>
          </div>
        </div>
        <div className="border border-border bg-card p-8">
          <h1 className="font-display text-xl font-bold mb-1 text-center">Definir nova senha</h1>
          <p className="text-xs text-muted-foreground font-mono mb-6 text-center">
            {ready ? "Escolha uma senha forte" : "Validando link…"}
          </p>
          {ready && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Nova senha</label>
                <input
                  type="password" required minLength={8} value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                />
              </div>
              <button disabled={loading} className="w-full bg-primary text-primary-foreground py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50">
                {loading ? "Salvando…" : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}