import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/ivi-logo.jpeg";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Verifique seu e-mail");
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
          <h1 className="font-display text-xl font-bold mb-1 text-center">Recuperar senha</h1>
          <p className="text-xs text-muted-foreground font-mono mb-6 text-center">Enviaremos um link para o seu e-mail</p>

          {sent ? (
            <div className="text-center space-y-4">
              <p className="text-sm">Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.</p>
              <Link to="/login" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary"><ArrowLeft className="h-3 w-3" /> Voltar ao login</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Email</label>
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full bg-background border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
                  placeholder="voce@ivitelecom.com.br"
                />
              </div>
              <button disabled={loading} className="w-full bg-primary text-primary-foreground py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50">
                {loading ? "Enviando…" : "Enviar link"}
              </button>
              <Link to="/login" className="block text-center text-xs font-mono text-muted-foreground hover:text-primary">← voltar ao login</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}