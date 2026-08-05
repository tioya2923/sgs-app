import { useMemo, useState } from "react";
import { useDb } from "../store/db";
import { computeAlertas } from "../lib/alerts";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  SectionHeading,
  gravidadeTone,
} from "../components/ui";
import { formatDateTime } from "../lib/format";
import type { Alerta, EstadoAlerta } from "../types";

type Filtro = "Ativo" | "Tratado" | "Adiado" | "Todos";

export function Alertas() {
  const { db, currentUser, addRecord, updateRecord } = useDb();
  const [filtro, setFiltro] = useState<Filtro>("Ativo");
  const [aAdiar, setAAdiar] = useState<Alerta | null>(null);
  const [motivo, setMotivo] = useState("");

  const alertas = useMemo(() => computeAlertas(db), [db]);
  const visiveis = filtro === "Todos" ? alertas : alertas.filter((a) => a.estado === filtro);

  function aplicarEstado(alerta: Alerta, estado: EstadoAlerta, motivoAdiamento: string | null) {
    const existe = db.alertas.some((a) => a.id === alerta.id);
    const patch = { estado, motivoAdiamento, tratadoPor: currentUser.nome };
    if (existe) {
      updateRecord("alertas", alerta.id, patch);
    } else {
      addRecord("alertas", { ...alerta, ...patch });
    }
  }

  const contagens = {
    Ativo: alertas.filter((a) => a.estado === "Ativo").length,
    Tratado: alertas.filter((a) => a.estado === "Tratado").length,
    Adiado: alertas.filter((a) => a.estado === "Adiado").length,
  };

  return (
    <div>
      <SectionHeading title="Alertas automáticos" />


      <div className="mb-5 flex gap-1 rounded-lg border border-pine-900/15 bg-paper-raised p-1">
        {(["Ativo", "Adiado", "Tratado", "Todos"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
              filtro === f ? "bg-pine-800 text-pine-50" : "text-ink-soft hover:text-ink"
            }`}
          >
            {f === "Ativo" ? `Ativos (${contagens.Ativo})` : f === "Tratado" ? `Tratados (${contagens.Tratado})` : f === "Adiado" ? `Adiados (${contagens.Adiado})` : "Todos"}
          </button>
        ))}
      </div>

      <Card padded={false}>
        <div className="p-5">
          <DataTable
            emptyLabel="Sem alertas nesta vista."
            rowKey={(a) => a.id}
            rows={visiveis}
            columns={[
              { header: "Gravidade", cell: (a) => <Badge tone={gravidadeTone(a.gravidade)}>{a.gravidade}</Badge> },
              { header: "Tipo", cell: (a) => a.tipo },
              { header: "Entidade", cell: (a) => <span className="text-ink-soft">{a.entidade}</span> },
              { header: "Gerado em", cell: (a) => formatDateTime(a.geradoEm) },
              {
                header: "Estado",
                cell: (a) => (
                  <div>
                    <Badge tone={a.estado === "Ativo" ? "brick" : a.estado === "Adiado" ? "gold" : "pine"}>
                      {a.estado}
                    </Badge>
                    {a.estado === "Adiado" && a.motivoAdiamento && (
                      <p className="mt-1 text-xs text-ink-soft">“{a.motivoAdiamento}”</p>
                    )}
                  </div>
                ),
              },
              {
                header: "",
                align: "right",
                cell: (a) =>
                  a.estado === "Ativo" || a.estado === "Adiado" ? (
                    <div className="flex justify-end gap-1.5">
                      <Button variant="secondary" onClick={() => aplicarEstado(a, "Tratado", null)}>
                        Tratado
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setAAdiar(a);
                          setMotivo("");
                        }}
                      >
                        Adiar
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" onClick={() => aplicarEstado(a, "Ativo", null)}>
                      Reabrir
                    </Button>
                  ),
              },
            ]}
          />
        </div>
      </Card>

      <Modal open={!!aAdiar} onClose={() => setAAdiar(null)} title="Adiar alerta">
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">{aAdiar?.entidade}</p>
          <Field label="Porquê fica adiado?">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: já contactado, aguarda resposta" />
          </Field>
          <Button
            variant="primary"
            onClick={() => {
              if (aAdiar) aplicarEstado(aAdiar, "Adiado", motivo || "Sem motivo indicado");
              setAAdiar(null);
            }}
          >
            Confirmar adiamento
          </Button>
        </div>
      </Modal>
    </div>
  );
}
