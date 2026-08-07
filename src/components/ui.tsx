import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// --- Estrutura básica ------------------------------------------------------

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-pine-900/10 bg-paper-raised shadow-[0_1px_0_rgba(33,31,26,0.04)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-pine-900/10 px-5 py-4">
          <div>
            {subtitle && (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                {subtitle}
              </p>
            )}
            {title && <h2 className="font-display text-lg font-medium text-ink">{title}</h2>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-pine-600">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-medium text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// --- Tabela genérica ---------------------------------------------------

export interface DataTableColumn<T> {
  header: string;
  cell: (row: T, index: number) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = "Sem registos.",
  dense = false,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  dense?: boolean;
}) {
  if (rows.length === 0) {
    return <EmptyState message={emptyLabel} />;
  }
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-pine-900/15 text-left">
            {columns.map((col) => (
              <th
                key={col.header}
                className={`whitespace-nowrap px-3 py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-soft ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
                } ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row)}
              className="border-b border-pine-900/[0.06] last:border-0 hover:bg-pine-50/70"
            >
              {columns.map((col) => (
                <td
                  key={col.header}
                  className={`px-3 ${dense ? "py-1.5" : "py-2.5"} align-middle text-ink ${
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
                  } ${col.className ?? ""}`}
                >
                  {col.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-pine-900/20 px-4 py-8 text-center text-sm text-ink-soft">
      {message}
    </div>
  );
}

// --- Badge / etiquetas ------------------------------------------------

export type Tone = "pine" | "terracotta" | "brick" | "gold" | "neutral";

const badgeTones: Record<Tone, string> = {
  pine: "bg-pine-100 text-pine-800 ring-1 ring-inset ring-pine-700/15",
  terracotta: "bg-terracotta-100 text-terracotta-700 ring-1 ring-inset ring-terracotta-600/20",
  brick: "bg-brick-100 text-brick-700 ring-1 ring-inset ring-brick-600/20",
  gold: "bg-gold-100 text-[#7a5a13] ring-1 ring-inset ring-gold-500/30",
  neutral: "bg-ink/[0.06] text-ink-soft ring-1 ring-inset ring-ink/10",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function gravidadeTone(g: "Informação" | "Atenção" | "Urgente"): Tone {
  if (g === "Urgente") return "brick";
  if (g === "Atenção") return "terracotta";
  return "pine";
}

export function estadoTone(estado: string): Tone {
  const positivos = ["Ativo", "Ativa", "Entregue", "Tratado", "Entregue", "Enviada", "Entregue"];
  const negativos = ["Urgente", "Em falta", "Cancelada", "Cancelado", "Falhou", "Sem consentimento", "Encerrado", "Expirado"];
  if (negativos.includes(estado)) return "brick";
  if (positivos.includes(estado)) return "pine";
  return "gold";
}

export function tipoMovimentoTone(tipo: string): Tone {
  if (tipo === "entrada") return "pine";
  if (tipo === "saída") return "terracotta";
  if (tipo === "quebra") return "brick";
  return "gold"; // transferência
}

// --- Formulário ----------------------------------------------------------

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const controlClass =
  "rounded-lg border border-pine-900/15 bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-pine-600 focus:ring-2 focus:ring-pine-600/15";

export function Input({ onFocus, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  // Um campo numérico não precisa de esticar até à largura do formulário —
  // só os campos de texto (nome, morada…) beneficiam de largura total.
  const largura = props.type === "number" ? "w-28" : "w-full";
  return (
    <input
      {...props}
      onFocus={(e) => {
        // Nos campos numéricos (quantidade, valores, mínimos de stock…) o
        // valor pré-preenchido fica selecionado ao focar, para escrever um
        // número novo substituir logo o antigo em vez de se lhe juntar. Um
        // clique de rato reposiciona o cursor logo a seguir ao focus (o
        // próprio comportamento nativo do input), desfazendo a seleção — por
        // isso a seleção é adiada para depois desse reposicionamento.
        if (props.type === "number") {
          const el = e.target;
          window.setTimeout(() => el.select(), 0);
        }
        onFocus?.(e);
      }}
      className={`${controlClass} ${largura} ${props.className ?? ""}`}
    />
  );
}

// Campo de palavra-passe com opção de mostrar/esconder — sem isto, um erro
// de escrita (maiúsculas, teclado…) só se descobre depois de falhar o login.
export function PasswordInput({
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visivel ? "text" : "password"}
        className={`${controlClass} w-full pr-10 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Esconder palavra-passe" : "Mostrar palavra-passe"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-soft transition hover:text-ink"
      >
        {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} w-full ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} w-full ${props.className ?? ""}`} />;
}

// --- Campo de texto com sugestões -----------------------------------------
// Substitui <input list> + <datalist>: o dropdown nativo do browser pode
// aparecer desalinhado do campo (bug conhecido, mais visível dentro de
// modais). Aqui o dropdown é desenhado pela aplicação, sempre ancorado ao
// campo, e continua a aceitar qualquer texto novo — não é uma lista fechada.
export function SuggestInput({
  value,
  onChange,
  suggestions,
  className = "",
  onFocus,
  onBlur,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [aberto, setAberto] = useState(false);

  const filtradas = suggestions
    .filter((s) => s.toLowerCase().includes(value.trim().toLowerCase()))
    .slice(0, 8);

  return (
    <div className="relative">
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          setAberto(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // adia o fecho para o clique numa sugestão ainda registar
          window.setTimeout(() => setAberto(false), 150);
          onBlur?.(e);
        }}
        autoComplete="off"
        className={`${controlClass} w-full ${className}`}
      />
      {aberto && filtradas.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-pine-900/15 bg-paper-raised py-1 shadow-lg">
          {filtradas.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setAberto(false);
                }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:bg-pine-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Botões --------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-pine-800 text-pine-50 hover:bg-pine-700 shadow-sm",
  secondary: "bg-paper text-ink border border-pine-900/20 hover:bg-pine-50",
  ghost: "text-ink-soft hover:text-ink hover:bg-ink/[0.05]",
  danger: "bg-brick-600 text-brick-50 hover:bg-brick-700",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${buttonVariants[variant]} ${className}`}
    />
  );
}

// --- Caixa de alteração (homenagem ao código de cor do próprio documento) --

export function Callout({
  tone,
  title,
  children,
}: {
  tone: "pine" | "terracotta" | "brick";
  title: string;
  children: ReactNode;
}) {
  const borders: Record<string, string> = {
    pine: "border-pine-700",
    terracotta: "border-terracotta-600",
    brick: "border-brick-600",
  };
  const bgs: Record<string, string> = {
    pine: "bg-pine-50",
    terracotta: "bg-terracotta-50",
    brick: "bg-brick-50",
  };
  return (
    <div className={`rounded-r-lg border-l-4 ${borders[tone]} ${bgs[tone]} px-4 py-3`}>
      <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">
        {title}
      </p>
      <div className="text-sm text-ink-soft">{children}</div>
    </div>
  );
}

// --- Estatística -----------------------------------------------------

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const accents: Record<Tone, string> = {
    pine: "text-pine-700",
    terracotta: "text-terracotta-600",
    brick: "text-brick-600",
    gold: "text-[#8a6a1c]",
    neutral: "text-ink",
  };
  return (
    <div className="rounded-2xl border border-pine-900/10 bg-paper-raised px-4 py-3.5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">{label}</p>
      <p className={`mt-1 font-display text-2xl font-medium sm:text-3xl ${accents[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

// --- Diálogo modal simples ---------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={`w-full ${width} rounded-2xl border border-pine-900/10 bg-paper-raised shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-pine-900/10 px-5 py-4">
          <h3 className="font-display text-lg font-medium text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-ink/[0.06] hover:text-ink"
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
