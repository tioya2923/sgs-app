import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "./ui";

// Evento não normalizado pelo TypeScript — só existe em browsers Chromium.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "sgs-app:instalar-dispensado-ate";
const DISMISS_DIAS = 14;

function estaInstalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari não tem display-mode: standalone fiável — expõe isto em vez disso.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function eIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// Pede para instalar o SGS App como aplicação (PWA) assim que o link é
// aberto. No Android/desktop usa o prompt nativo do browser; no iOS, que não
// dispara esse evento, mostra instruções para "Adicionar ao ecrã principal".
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [mostrarAjudaIos, setMostrarAjudaIos] = useState(false);

  useEffect(() => {
    if (estaInstalada()) return;

    const dispensadoAte = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dispensadoAte > Date.now()) return;

    if (eIos()) {
      setVisivel(true);
      return;
    }

    function aoPropor(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisivel(true);
    }
    function aoInstalar() {
      setVisivel(false);
      localStorage.removeItem(DISMISS_KEY);
    }

    window.addEventListener("beforeinstallprompt", aoPropor);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPropor);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  function dispensar() {
    setVisivel(false);
    setMostrarAjudaIos(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DIAS * 24 * 60 * 60 * 1000));
  }

  async function instalar() {
    if (eIos()) {
      setMostrarAjudaIos(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      setVisivel(false);
    } else {
      dispensar();
    }
  }

  if (!visivel) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-pine-900/10 bg-paper-raised px-4 py-3.5 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine-800 text-pine-50">
          <Download size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-medium text-ink">Instale o SGS App</p>
          {mostrarAjudaIos ? (
            <p className="mt-0.5 text-xs text-ink-soft">
              Toque em <Share size={12} className="-mt-0.5 inline" aria-hidden /> Partilhar e depois
              em "Adicionar ao ecrã principal".
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-soft">
              Adicione ao ecrã principal para abrir mais rápido, como uma aplicação.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!mostrarAjudaIos && (
            <Button variant="primary" className="px-3 py-1.5 text-xs" onClick={instalar}>
              Instalar
            </Button>
          )}
          <button
            onClick={dispensar}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-ink/[0.06] hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
