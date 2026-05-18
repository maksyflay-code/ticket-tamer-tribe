import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, Ticket, BarChart3, LogOut, Activity, Package, UserCog, UserCircle, ShieldCheck, Shield, Eye, Server, Menu, FileText, Clock, Bell } from "lucide-react";
import logo from "@/assets/ivi-logo.jpeg";
import { useState, useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, n: "01" },
  { to: "/clientes", label: "Clientes", icon: Users, n: "02" },
  { to: "/chamados", label: "Chamados", icon: Ticket, n: "03" },
  { to: "/planos", label: "Planos", icon: Package, n: "04" },
  { to: "/equipamentos", label: "Equipamentos", icon: Server, n: "05" },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, n: "06" },
  { to: "/rfo", label: "Gerar RFO", icon: FileText, n: "07" },
] as const;

const adminNav = [
  { to: "/configuracoes/sla", label: "Config. SLA", icon: Clock, n: "08" },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title: string }) {
  const { user, role, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const refresh = async () => {
      try {
        const [totalRes, readRes] = await Promise.all([
          supabase.from("chamado_historico").select("id", { count: "exact", head: true }),
          supabase
            .from("notification_reads")
            .select("historico_id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);
        if (active) setUnread(Math.max(0, (totalRes.count ?? 0) - (readRes.count ?? 0)));
      } catch { /* ignore */ }
    };
    refresh();
    const channel = supabase
      .channel("appshell-notif")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chamado_historico" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_reads" }, refresh)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user]);

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

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
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
                onClick={onNavigate}
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
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors border-l-2",
                path.startsWith("/perfil")
                  ? "bg-accent text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50",
              )}
            >
              <span className="text-[10px] opacity-60">08</span>
              <UserCircle className="h-4 w-4" />
              <span>Meu perfil</span>
            </Link>
            {isAdmin && (
              <Link
                to="/usuarios"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors border-l-2",
                  path.startsWith("/usuarios")
                    ? "bg-accent text-primary border-primary"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50",
                )}
              >
                <span className="text-[10px] opacity-60">09</span>
                <UserCog className="h-4 w-4" />
                <span>Usuários</span>
              </Link>
            )}
            {isAdmin && adminNav.map((item) => {
              const Icon = item.icon;
              const active = path.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to} onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm font-mono transition-colors border-l-2",
                    active ? "bg-accent text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50",
                  )}>
                  <span className="text-[10px] opacity-60">10</span>
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
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
    </>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="hidden md:flex w-64 border-r border-border bg-sidebar shrink-0 flex-col sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 md:h-16 border-b border-border bg-card/30 flex items-center justify-between px-4 md:px-8 sticky top-0 backdrop-blur z-10 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="md:hidden p-2 -ml-2 rounded hover:bg-secondary text-muted-foreground"
                  aria-label="Abrir menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border flex flex-col">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <h1 className="font-display text-base md:text-lg font-bold tracking-tight truncate">{title}</h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground shrink-0">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span>SISTEMA OPERACIONAL</span>
          </div>
          <Link
            to="/notificacoes"
            className="relative ml-auto sm:ml-2 p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Notificações"
            title="Notificações"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}