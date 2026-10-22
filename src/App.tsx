import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DbProvider, useDb } from "./store/db";
import { InstallPrompt } from "./components/InstallPrompt";
import { Layout } from "./components/Layout";
import { Login } from "./components/Login";
import { TrocarPassword } from "./components/TrocarPassword";
import { ErroApi } from "./components/ErroApi";
import { NAV, podeAceder } from "./lib/nav";
import { Painel } from "./pages/Painel";
import { PortaAberta } from "./pages/PortaAberta";
import { BancoAlimentos } from "./pages/BancoAlimentos";
import { Residencia } from "./pages/Residencia";
import { CasaCaridade } from "./pages/CasaCaridade";
import { BancoRoupa } from "./pages/BancoRoupa";
import { Existencias } from "./pages/Existencias";
import { Cartoes } from "./pages/Cartoes";
import { Alertas } from "./pages/Alertas";
import { Mensagens } from "./pages/Mensagens";
import { Relatorios } from "./pages/Relatorios";
import { Administracao } from "./pages/Administracao";
import type { ReactNode } from "react";

function Protegido({ path, children }: { path: string; children: ReactNode }) {
  const { currentUser } = useDb();
  const modulo = NAV.flatMap((g) => g.modules).find((m) => m.path === path);
  if (modulo && !podeAceder(currentUser.perfil, modulo.perfis)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function Rotas() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Painel />} />
        <Route
          path="/porta-aberta"
          element={
            <Protegido path="/porta-aberta">
              <PortaAberta />
            </Protegido>
          }
        />
        <Route
          path="/banco-alimentos"
          element={
            <Protegido path="/banco-alimentos">
              <BancoAlimentos />
            </Protegido>
          }
        />
        <Route
          path="/residencia"
          element={
            <Protegido path="/residencia">
              <Residencia />
            </Protegido>
          }
        />
        <Route
          path="/casa-caridade"
          element={
            <Protegido path="/casa-caridade">
              <CasaCaridade />
            </Protegido>
          }
        />
        <Route
          path="/banco-roupa"
          element={
            <Protegido path="/banco-roupa">
              <BancoRoupa />
            </Protegido>
          }
        />
        <Route
          path="/existencias"
          element={
            <Protegido path="/existencias">
              <Existencias />
            </Protegido>
          }
        />
        <Route
          path="/cartoes"
          element={
            <Protegido path="/cartoes">
              <Cartoes />
            </Protegido>
          }
        />
        <Route path="/alertas" element={<Alertas />} />
        <Route
          path="/mensagens"
          element={
            <Protegido path="/mensagens">
              <Mensagens />
            </Protegido>
          }
        />
        <Route
          path="/relatorios"
          element={
            <Protegido path="/relatorios">
              <Relatorios />
            </Protegido>
          }
        />
        <Route
          path="/administracao"
          element={
            <Protegido path="/administracao">
              <Administracao />
            </Protegido>
          }
        />
      </Route>
    </Routes>
  );
}

function AuthGate() {
  const { estado, precisaTrocarPassword, carregado, erroCarregar } = useDb();
  if (estado === "a-carregar") return <EcraCarregar />;
  if (estado === "anonimo") return <Login />;
  if (precisaTrocarPassword) return <TrocarPassword />;
  if (!carregado && erroCarregar) return <EcraErroCarregar />;
  if (!carregado) return <EcraCarregar />;
  return <Rotas />;
}

function EcraErroCarregar() {
  const { erroCarregar, recarregar, logout } = useDb();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-paper px-6 text-center" role="alert">
      <p className="max-w-md text-sm text-ink">{erroCarregar}</p>
      <div className="flex gap-2">
        <button onClick={() => void recarregar()} className="rounded-lg bg-pine-800 px-4 py-2 text-sm font-medium text-pine-50 hover:bg-pine-700">
          Tentar de novo
        </button>
        <button onClick={() => void logout()} className="rounded-lg border border-pine-900/20 px-4 py-2 text-sm font-medium text-ink hover:bg-pine-50">
          Sair
        </button>
      </div>
    </div>
  );
}

function EcraCarregar() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-paper text-sm text-ink-soft" role="status">
      A carregar…
    </div>
  );
}

export function App() {
  return (
    <DbProvider>
      <BrowserRouter basename="/sgs-app">
        <AuthGate />
        <ErroApi />
        <InstallPrompt />
      </BrowserRouter>
    </DbProvider>
  );
}
