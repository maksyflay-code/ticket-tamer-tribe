import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, Ticket, BarChart3, LogOut, Activity, Package, UserCog, UserCircle, ShieldCheck, Shield, Eye } from "lucide-react";
import logo from "@/assets/ivi-logo.jpeg";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, n: "01" },
  { to: "/clientes", label: "Clientes", icon: Users, n: "02" },
  { to: "/chamados", label: "Chamados", icon: Ticket, n: "03" },
  { to: "/planos", label: "Planos", icon: Package, n: "04" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, n: "05" },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const { user, role, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const onLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const roleBadge =
    role === "admin" ? { label: "Admin", icon: ShieldCheck, cls: "text-primary" } :
    role === "operador" ? { label: "Operador", icon: Shield, cls: "text-emerald-400" } :
    role === "visualizador" ? { label: "Visualizador", icon: Eye, cls: "text-muted-foreground" } :
    { label: "Sem permissão", icon: Eye, cls: "text-destructive" };
  const RoleIcon = roleBadge.icon;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 border-r border-border bg-sidebar shrink-0 flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-3">
            <img src={logo} alt="IVI Telecom" className="h-9 w-9 rounded-md object-cover" />
            <span className="font-display text-xl font-extrabold tracking-tighter uppercase text-primary">
              IVI TELECOM
            </span>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => {
            const active = path.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors border-l-2",
                  active
                    ? "bg-accent text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50",
                )}
              >
                <span className="text-[10px] opacity-60">{item.n}</span>
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="pt-4 mt-4 border-t border-sidebar-border space-y-1">
            <Link
              to="/perfil"
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors border-l-2",
                path.startsWith("/perfil")
                  ? "bg-accent text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50",
              )}
            >
              <span className="text-[10px] opacity-60">06</span>
              <UserCircle className="h-4 w-4" />
              <span>Meu perfil</span>
            </Link>
            {isAdmin && (
              <Link
                to="/usuarios"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors border-l-2",
                  path.startsWith("/usuarios")
                    ? "bg-accent text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50",
                )}
              >
                <span className="text-[10px] opacity-60">07</span>
                <UserCog className="h-4 w-4" />
                <span>Usuários</span>
              </Link>
            )}
          </div>
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between gap-2">
            <div className="overflow-hidden">
              <div className="text-xs font-medium truncate">{user?.email ?? "—"}</div>
              <div className={cn("text-[10px] font-mono uppercase flex items-center gap-1", roleBadge.cls)}>
                <RoleIcon className="h-3 w-3" /> {roleBadge.label}
              </div>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-card/30 flex items-center justify-between px-8 sticky top-0 backdrop-blur z-10">
          <h1 className="font-display text-lg font-bold tracking-tight">{title}</h1>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span>SISTEMA OPERACIONAL</span>
          </div>
        </header>
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}