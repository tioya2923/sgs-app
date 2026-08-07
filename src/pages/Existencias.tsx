import { useMemo, useState } from "react";
import { useDb } from "../store/db";
import { Badge, Button, Card, DataTable, Field, Input, Modal, SectionHeading, Select, StatTile } from "../components/ui";
import { newId } from "../lib/id";
import type { Artigo } from "../types";

export function Existencias() {
  const { db, currentUser, hasPerfil, addRecord, updateRecord } = useDb();
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
        registadoPor={currentUser.nome}
        onTransferir={(op) => {
          op.updates.forEach(({ loteId, quantidade }) => updateRecord("lotes", loteId, { quantidade }));
          if (op.novoLote) addRecord("lotes", op.novoLote);
          if (op.novoArtigo) addRecord("artigos", op.novoArtigo);
          addRecord("movimentos", op.movimento);
        }}
      />
    </div>
  );
}

function TransferirModal({
  open,
  onClose,
  registadoPor,
  onTransferir,
}: {
  open: boolean;
  onClose: () => void;
  registadoPor: string;
  onTransferir: (op: {
    updates: { loteId: string; quantidade: number }[];
    novoLote: ReturnType<typeof useDb>["db"]["lotes"][number] | null;
    novoArtigo: Artigo | null;
    movimento: ReturnType<typeof useDb>["db"]["movimentos"][number];
  }) => void;
}) {
  const { db } = useDb();
  const [artigoOrigemId, setArtigoOrigemId] = useState(db.artigos[0]?.id ?? "");
  const [armazemDestinoId, setArmazemDestinoId] = useState(
    db.armazens.find((a) => a.id !== db.artigos[0]?.armazemId)?.id ?? ""
  );
  const [quantidade, setQuantidade] = useState(1);

  const artigoOrigem = db.artigos.find((a) => a.id === artigoOrigemId) ?? null;
  const disponivelOrigem = artigoOrigem
    ? db.lotes.filter((l) => l.artigoId === artigoOrigem.id && l.estado === "disponível").reduce((s, l) => s + l.quantidade, 0)
    : 0;
  const armazensDestino = db.armazens.filter((a) => a.id !== artigoOrigem?.armazemId);

  function submeter() {
    if (!artigoOrigem) return;
    const armazemDestino = db.armazens.find((a) => a.id === armazemDestinoId);
    const armazemOrigem = db.armazens.find((a) => a.id === artigoOrigem.armazemId);
    if (!armazemDestino || !armazemOrigem) return;

    let restante = quantidade;
    const updates: { loteId: string; quantidade: number }[] = [];
    const lotesOrigem = db.lotes
      .filter((l) => l.artigoId === artigoOrigem.id && l.estado === "disponível" && l.quantidade > 0)
      .sort((a, b) => (a.validade ?? "9999").localeCompare(b.validade ?? "9999"));
    for (const lote of lotesOrigem) {
      if (restante <= 0) break;
      const retirar = Math.min(restante, lote.quantidade);
      updates.push({ loteId: lote.id, quantidade: lote.quantidade - retirar });
      restante -= retirar;
    }
    const transferido = quantidade - restante;
    if (transferido <= 0) {
      onClose();
      return;
    }

    let artigoDestino = db.artigos.find((a) => a.armazemId === armazemDestino.id && a.nome === artigoOrigem.nome);
    let novoArtigo: Artigo | null = null;
    if (!artigoDestino) {
      novoArtigo = {
        id: newId("art"),
        nome: artigoOrigem.nome,
        categoria: artigoOrigem.categoria,
        unidade: artigoOrigem.unidade,
        armazemId: armazemDestino.id,
        stockMinimo: artigoOrigem.stockMinimo,
        consumivel: artigoOrigem.consumivel,
      };
      artigoDestino = novoArtigo;
    }

    const novoLote = {
      id: newId("lot"),
      artigoId: artigoDestino.id,
      quantidade: transferido,
      validade: null,
      localizacaoFisica: "Transferido",
      estado: "disponível" as const,
      entrada: new Date().toISOString().slice(0, 10),
    };

    onTransferir({
      updates,
      novoLote,
      novoArtigo,
      movimento: {
        id: newId("mov"),
        artigoId: artigoOrigem.id,
        loteId: null,
        tipo: "transferência",
        quantidade: transferido,
        data: new Date().toISOString().slice(0, 10),
        origemOuDestino: `${armazemOrigem.designacao} → ${armazemDestino.designacao}`,
        fornecedor: null,
        benfeitor: null,
        documento: null,
        preco: null,
        registadoPor,
        referencia: null,
      },
    });
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
          disabled={disponivelOrigem <= 0 || quantidade > disponivelOrigem}
        >
          Confirmar transferência
        </Button>
      </div>
    </Modal>
  );
}
