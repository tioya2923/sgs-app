import { describe, expect, it } from "vitest";
import { alertaVisivel, computeAlertas, type DadosAlertas } from "../src/services/alertas.js";

const HOJE = "2026-10-22";

function dados(parcial: Partial<DadosAlertas>): DadosAlertas {
  return {
    lotes: [], artigos: [], armazens: [], processos: [], pessoas: [], documentos: [], inscricoes: [],
    entregasCabaz: [], refeicoesContagem: [], refeicoesPresenca: [], cartoes: [], guardados: [],
    ...parcial,
  };
}

const armazem = { id: "arm-bsa", codigo: "BSA" };
const artigo = { id: "art-1", nome: "Arroz", unidade: "kg", stockMinimo: 10, armazemId: "arm-bsa" };

describe("alertas automáticos", () => {
  it("validade curta: urgente até 7 dias, atenção até 30, ignora expirados e lotes vazios", () => {
    const d = dados({
      armazens: [armazem],
      artigos: [artigo],
      lotes: [
        { id: "l1", artigoId: "art-1", quantidade: 50, validade: "2026-10-25", estado: "disponível" },
        { id: "l2", artigoId: "art-1", quantidade: 50, validade: "2026-11-15", estado: "disponível" },
        { id: "l3", artigoId: "art-1", quantidade: 50, validade: "2026-10-20", estado: "disponível" },
        { id: "l4", artigoId: "art-1", quantidade: 0, validade: "2026-10-25", estado: "disponível" },
        { id: "l5", artigoId: "art-1", quantidade: 50, validade: "2027-05-01", estado: "disponível" },
      ],
    });
    const a = computeAlertas(d, HOJE).filter((x) => x.tipo === "Validade curta");
    expect(a.map((x) => [x.id, x.gravidade])).toEqual([
      ["validade-curta:l1", "Urgente"],
      ["validade-curta:l2", "Atenção"],
    ]);
    expect(a[0]!.entidade).toContain("caduca a 25/10/2026");
  });

  it("stock: esgotado é urgente e abaixo do mínimo é atenção", () => {
    const d = dados({
      armazens: [armazem],
      artigos: [artigo, { ...artigo, id: "art-2", nome: "Leite" }],
      lotes: [{ id: "l1", artigoId: "art-1", quantidade: 4, validade: null, estado: "disponível" }],
    });
    const a = computeAlertas(d, HOJE);
    expect(a.find((x) => x.id === "stock-baixo:art-1")?.gravidade).toBe("Atenção");
    expect(a.find((x) => x.id === "esgotado:art-2")?.gravidade).toBe("Urgente");
  });

  it("cartões: janela de 7 dias (ativo) e 14 dias (por entregar); expirado fica urgente", () => {
    const d = dados({
      cartoes: [
        { id: "c1", numero: "PD-1", validade: "2026-10-28", estado: "Ativo" },
        { id: "c2", numero: "PD-2", validade: "2026-11-02", estado: "Por entregar" },
        { id: "c3", numero: "PD-3", validade: "2026-11-02", estado: "Ativo" },
        { id: "c4", numero: "PD-4", validade: "2026-10-01", estado: "Ativo" },
        { id: "c5", numero: "PD-5", validade: "2026-10-01", estado: "Cancelado" },
      ],
    });
    const a = computeAlertas(d, HOJE).filter((x) => x.tipo === "Cartão a expirar");
    expect(a.map((x) => [x.id, x.gravidade])).toEqual([
      ["cartao-a-expirar:c1", "Atenção"],
      ["cartao-a-expirar:c2", "Atenção"],
      ["cartao-a-expirar:c4", "Urgente"],
    ]);
  });

  it("inscrição a renovar usa 1 ano a partir da inscrição (sem desvios por fuso)", () => {
    const d = dados({
      pessoas: [{ id: "p1", nome: "Ana", dataNascimento: "1980-01-01", documentoTipo: "Passaporte", documentoValidade: null }],
      processos: [{ id: "pr1", numero: 1, pessoaId: "p1", estado: "Ativo", proximaAvaliacao: "2027-01-01" }],
      inscricoes: [{ id: "i1", processoId: "pr1", programa: "Mais Sós", data: "2025-11-21", estado: "Ativa" }],
    });
    const a = computeAlertas(d, HOJE).find((x) => x.id === "inscricao-a-renovar:i1");
    expect(a?.entidade).toContain("renova em 30 dias");
  });

  it("aniversário no próprio dia e processo sem reavaliação", () => {
    const d = dados({
      pessoas: [{ id: "p1", nome: "Ana", dataNascimento: "1980-10-22", documentoTipo: "Passaporte", documentoValidade: null }],
      processos: [{ id: "pr1", numero: 7, pessoaId: "p1", estado: "Ativo", proximaAvaliacao: "2026-10-12" }],
    });
    const a = computeAlertas(d, HOJE);
    expect(a.find((x) => x.tipo === "Aniversário")).toBeTruthy();
    expect(a.find((x) => x.tipo === "Pessoa sem reavaliação")?.entidade).toContain("vencida há 10 dias");
  });

  it("o estado guardado (adiado) sobrepõe-se ao recalculado e mantém a data de geração", () => {
    const geradoEm = new Date("2026-10-01T10:00:00Z");
    const d = dados({
      cartoes: [{ id: "c1", numero: "PD-1", validade: "2026-10-28", estado: "Ativo" }],
      guardados: [{ id: "cartao-a-expirar:c1", geradoEm, estado: "Adiado", motivoAdiamento: "Aguarda", tratadoPor: "Marta" }],
    });
    expect(computeAlertas(d, HOJE)[0]).toMatchObject({ estado: "Adiado", motivoAdiamento: "Aguarda", tratadoPor: "Marta", geradoEm: geradoEm.toISOString() });
  });

  it("visibilidade por perfil", () => {
    const d = dados({
      armazens: [armazem, { id: "arm-res", codigo: "RES" }],
      artigos: [artigo, { ...artigo, id: "art-r", armazemId: "arm-res" }],
      lotes: [],
      pessoas: [{ id: "p1", nome: "Ana", dataNascimento: "1980-10-22", documentoTipo: "Passaporte", documentoValidade: null }],
      cartoes: [{ id: "c1", numero: "PD-1", validade: "2026-10-28", estado: "Ativo" }],
    });
    const todos = computeAlertas(d, HOJE);
    const vistos = (perfil: Parameters<typeof alertaVisivel>[1]) => todos.filter((a) => alertaVisivel(a, perfil, d)).map((a) => a.tipo);
    expect(vistos("Direção").length).toBe(todos.length);
    expect(vistos("Administrativo")).toEqual(["Cartão a expirar"]);
    expect(vistos("Técnico de ação social")).toEqual(["Aniversário"]);
    expect(vistos("Cozinha")).toEqual(["Produto esgotado"]); // só o armazém da Residência
    expect(vistos("Voluntário — distribuição")).toEqual([]);
  });
});
