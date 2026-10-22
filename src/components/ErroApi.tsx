import { X } from "lucide-react";
import { useDb } from "../store/db";

/** Mostra o erro da última operação na API (ex.: "Stock insuficiente de Arroz…"). */
export function ErroApi() {
  const { erro, limparErro } = useDb();
  if (!erro) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-3 z-[60] mx-auto flex w-[min(92vw,36rem)] items-start gap-3 rounded-xl border border-brick-600/30 bg-brick-50 px-4 py-3 text-sm text-brick-700 shadow-lg"
    >
      <p className="flex-1">{erro}</p>
      <button onClick={limparErro} aria-label="Fechar aviso" className="shrink-0 rounded-full p-1 hover:bg-brick-100">
        <X size={16} />
      </button>
    </div>
  );
}
