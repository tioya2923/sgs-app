import { useMemo, useState } from "react";
import { useDb } from "../store/db";
import { Badge, Button, Card, DataTable, Field, Input, Modal, SectionHeading, Select, StatTile } from "../components/ui";
import { api } from "../services/api";

export function Existencias() {
  const { db, hasPerfil, executar } = useDb();
  const podeTransferir = hasPerfil("Direção", "Armazém");
  const [filtroArmazem, setFiltroArmazem] = useState<string>("Todos");
  const [modalAberto, setModalAberto] = useState(false);

  const linhas = useMemo(() => {
    return db.artigos.map((artigo) => {
      const disponivel = db.lotes
        .filter((l) => l.artigoId === artigo.id && l.estado === "disponível")
        .reduce((s, l) => s + l.quantidade, 0);
      const armazem = db.armazens.find((a) => a.id === artigo.armazemId)!;
      return { artigo, armazem, disponivel };
    });
  }, [db.artigos, db.lotes, db.armazens]);

  const filtradas = linhas.filter((l) => filtroArmazem === "Todos" || l.armazem.codigo === filtroArmazem);

  const totais = {
    artigos: linhas.length,
    esgotados: linhas.filter((l) => l.disponivel <= 0).length,
    baixos: linhas.filter((l) => l.disponivel > 0 && l.disponivel < l.artigo.stockMinimo).length,
  };

  return (
    <div>
      <SectionHeading
        title="Existências"
        actions={
          podeTransferir && (
            <Button variant="primary" onClick={() => setModalAberto(true)}>
              + Transferir entre armazéns
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile label="Artigos monitorizados" value={totais.artigos} />
        <StatTile label="Stock abaixo do mínimo" value={totais.baixos} tone="terracotta" />
        <StatTile label="Esgotados" value={totais.esgotados} tone="brick" />
      </div>

      <Card
        title="Stock por armazém"
        actions={
          <Select value={filtroArmazem} onChange={(e) => setFiltroArmazem(e.target.value)} className="w-56">
            <option value="Todos">Todos os armazéns</option>
            {db.armazens.map((a) => (
              <option key={a.id} value={a.codigo}>
                {a.designacao}
              </option>
            ))}
          </Select>
        }
      >
        <DataTable
          rowKey={(l) => l.artigo.id}
          rows={filtradas}
          columns={[
            { header: "Artigo", cell: (l) => l.artigo.nome },
            { header: "Armazém", cell: (l) => <Badge>{l.armazem.designacao}</Badge> },
            { header: "Categoria", cell: (l) => <span className="text-ink-soft">{l.artigo.categoria}</span> },
            {
              header: "Disponível",
              align: "right",
              cell: (l) => `${l.disponivel} ${l.artigo.unidade}`,
            },
            { header: "Mínimo", align: "right", cell: (l) => l.artigo.stockMinimo },
            {
              header: "Estado",
              cell: (l) =>
                l.disponivel <= 0 ? (
                  <Badge tone="brick">Esgotado</Badge>
                ) : l.disponivel < l.artigo.stockMinimo ? (
                  <Badge tone="terracotta">Stock baixo</Badge>
                ) : (
                  <Badge tone="pine">Normal</Badge>
                ),
            },
          ]}
        />
      </Card>

      <TransferirModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onTransferir={(b) => executar(() => api.post("/existencias/transferencias", b))}
      />
    </div>
  );
}

function TransferirModal({
  open,
  onClose,
  onTransferir,
}: {
  open: boolean;
  onClose: () => void;
  onTransferir: (b: { artigoId: string; armazemDestinoId: string; quantidade: number }) => Promise<unknown>;
}) {
  const { db } = useDb();
  const [artigoOrigemId, setArtigoOrigemId] = useState(db.artigos[0]?.id ?? "");
  const [armazemDestinoId, setArmazemDestinoId] = useState(
    db.armazens.find((a) => a.id !== db.artigos[0]?.armazemId)?.id ?? ""
  );
  const [quantidade, setQuantidade] = useState(1);
  const [aGuardar, setAGuardar] = useState(false);

  const artigoOrigem = db.artigos.find((a) => a.id === artigoOrigemId) ?? null;
  const disponivelOrigem = artigoOrigem
    ? db.lotes.filter((l) => l.artigoId === artigoOrigem.id && l.estado === "disponível").reduce((s, l) => s + l.quantidade, 0)
    : 0;
  const armazensDestino = db.armazens.filter((a) => a.id !== artigoOrigem?.armazemId);

  async function submeter() {
    if (!artigoOrigem || !armazemDestinoId) return;
    setAGuardar(true);
    await onTransferir({ artigoId: artigoOrigem.id, armazemDestinoId, quantidade });
    setAGuardar(false);
    onClose();
    setQuantidade(1);
  }

  return (
    <Modal open={open} onClose={onClose} title="Transferir entre armazéns">
      <div className="space-y-3">
        <Field label="Artigo de origem">
          <Select
            value={artigoOrigemId}
            onChange={(e) => {
              setArtigoOrigemId(e.target.value);
              const novo = db.artigos.find((a) => a.id === e.target.value);
              const primeiroDestino = db.armazens.find((a) => a.id !== novo?.armazemId);
              if (primeiroDestino) setArmazemDestinoId(primeiroDestino.id);
            }}
          >
            {db.artigos.map((a) => {
              const arm = db.armazens.find((x) => x.id === a.armazemId);
              return (
                <option key={a.id} value={a.id}>
                  {a.nome} ({arm?.codigo})
                </option>
              );
            })}
          </Select>
        </Field>
        <p className="text-xs text-ink-soft">Disponível: {disponivelOrigem}</p>
        <Field label="Armazém de destino">
          <Select value={armazemDestinoId} onChange={(e) => setArmazemDestinoId(e.target.value)}>
            {armazensDestino.map((a) => (
              <option key={a.id} value={a.id}>
                {a.designacao}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantidade">
          <Input
            type="number"
            min={1}
            max={disponivelOrigem}
            value={quantidade}
            onChange={(e) => setQuantidade(Number(e.target.value))}
          />
        </Field>
        {quantidade > disponivelOrigem && disponivelOrigem > 0 && (
          <p className="text-xs font-medium text-brick-600">
            Só há {disponivelOrigem} disponível — reduza a quantidade.
          </p>
        )}
        <Button
          variant="primary"
          onClick={submeter}
          disabled={aGuardar || quantidade < 1 || disponivelOrigem <= 0 || quantidade > disponivelOrigem}
        >
          Confirmar transferência
        </Button>
      </div>
    </Modal>
  );
}
