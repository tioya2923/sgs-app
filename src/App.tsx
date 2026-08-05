import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DbProvider, useDb } from "./store/db";
import { Layout } from "./components/Layout";
import { Login } from "./components/Login";
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
  const { session } = useDb();
  if (!session) return <Login />;
  return <Rotas />;
}

export function App() {
  return (
    <DbProvider>
      <BrowserRouter>
        <AuthGate />
      </BrowserRouter>
    </DbProvider>
  );
}
