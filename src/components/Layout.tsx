import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "../store/db";
import { NAV, podeAceder } from "../lib/nav";
import { computeAlertas } from "../lib/alerts";

function grupoDaRota(pathname: string): string | null {
  const grupo = NAV.find((g) => g.label && g.modules.some((m) => m.path === pathname));
  return grupo?.label ?? null;
}

export function Layout() {
  const { db, currentUser, logout } = useDb();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const [grupoAberto, setGrupoAberto] = useState<string | null>(() => grupoDaRota(location.pathname));

  useEffect(() => {
    const grupo = grupoDaRota(location.pathname);
    if (grupo) setGrupoAberto(grupo);
  }, [location.pathname]);

  const alertasAtivos = useMemo(
    () => computeAlertas(db).filter((a) => a.estado === "Ativo"),
    [db]
  );
  const urgentes = alertasAtivos.filter((a) => a.gravidade === "Urgente").length;

  return (
    <div className="flex min-h-svh flex-col bg-paper text-ink lg:flex-row">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-pine-900/10 bg-paper-raised px-4 lg:hidden">
        <button
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
            sidebarOpen ? "border-pine-800 bg-pine-800 text-pine-50" : "border-pine-900/15 bg-paper text-ink"
          }`}
          onClick={() => setSidebarOpen((v) => !v)}
          aria-expanded={sidebarOpen}
          aria-controls="menu-lateral"
        >
          {sidebarOpen ? "Fechar" : "Menu"}
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {currentUser.nome} <span className="text-ink-soft">— {currentUser.perfil}</span>
        </span>
        <button
          onClick={logout}
          className="shrink-0 rounded-lg border border-pine-900/15 bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:text-brick-600"
        >
          Sair
        </button>
      </header>

      <aside
        id="menu-lateral"
        className={`fixed left-0 top-14 z-30 flex h-[calc(100svh-3.5rem)] w-72 shrink-0 flex-col border-r border-pine-900/10 bg-pine-950 text-pine-50 transition-transform lg:sticky lg:top-0 lg:h-svh lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="paper-grain border-b border-pine-50/10 px-6 py-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-pine-200/70">
            Centro Social Paroquial
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold leading-tight text-pine-50">
            São Nicolau
          </h1>
          <p className="mt-2 text-xs leading-snug text-pine-200/80">
            Sistema de Gestão Social · Baixa de Lisboa
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((grupo, gi) => {
            const visiveis = grupo.modules.filter((m) => podeAceder(currentUser.perfil, m.perfis));
            if (visiveis.length === 0) return null;

            const listaModulos = (
              <ul className="space-y-0.5 overflow-hidden">
                {visiveis.map((mod) => (
                  <li key={mod.path}>
                    <NavLink
                      to={mod.path}
                      end={mod.path === "/"}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition ${
                          isActive
                            ? "bg-pine-50 text-pine-950 font-medium"
                            : "text-pine-100/85 hover:bg-pine-50/10 hover:text-pine-50"
                        }`
                      }
                    >
                      {() => (
                        <>
                          <span className="truncate">{mod.title}</span>
                          {mod.path === "/alertas" && urgentes > 0 && (
                            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brick-500 px-1 text-[10.5px] font-semibold text-white">
                              {urgentes}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            );

            if (!grupo.label) {
              return (
                <div key={gi} className="mb-4">
                  {listaModulos}
                </div>
              );
            }

            const aberto = grupoAberto === grupo.label;
            return (
              <div key={gi} className="mb-1">
                <button
                  onClick={() => setGrupoAberto((prev) => (prev === grupo.label ? null : grupo.label))}
                  className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-pine-200/60 transition hover:text-pine-100"
                  aria-expanded={aberto}
                >
                  <ChevronRight
                    size={12}
                    className={`shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
                  />
                  {grupo.label}
                </button>
                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    aberto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden pt-1">{listaModulos}</div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="hidden border-t border-pine-50/10 px-4 py-4 lg:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-pine-200/60">Sessão</p>
          <p className="mt-1 truncate text-sm font-medium text-pine-50">{currentUser.nome}</p>
          <p className="truncate text-xs text-pine-200/80">{currentUser.perfil}</p>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-pine-50/15 px-2.5 py-1.5 text-xs font-medium text-pine-100/85 transition hover:border-brick-500/50 hover:text-brick-300"
          >
            Terminar sessão
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-20 bg-ink/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
