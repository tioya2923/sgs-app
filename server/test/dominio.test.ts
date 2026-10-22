import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContexto, EMAILS, type Ctx } from "./helpers.js";

let ctx: Ctx;
beforeAll(async () => {
  ctx = await criarContexto();
});
afterAll(() => ctx.fechar());

const api = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, headers: Record<string, string>, payload?: unknown) =>
  ctx.app.inject({ method, url: `/api/v1${url}`, headers, payload: payload as object });

async function stock(artigoId: string) {
  const r = await ctx.prisma.lote.aggregate({ where: { artigoId, estado: "disponível" }, _sum: { quantidade: true } });
  return r._sum.quantidade ?? 0;
}

async function armazem(codigo: string) {
  return ctx.prisma.armazem.findUniqueOrThrow({ where: { codigo } });
}

describe("permissões e visibilidade dos dados", () => {
  it("exige autenticação no bootstrap", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/bootstrap" })).statusCode).toBe(401);
  });

  it("a Direção e o Técnico veem processos completos; o voluntário só a composição dos agregados", async () => {
    const dir = (await api("GET", "/bootstrap", await ctx.login(EMAILS.direcao))).json();
    expect(dir.contactos.length).toBeGreaterThan(0);
    expect(dir.agregados[0].morada).toBeTruthy();
    expect(dir.utilizadores.length).toBe(7);
    expect(JSON.stringify(dir)).not.toMatch(/passwordHash|password_hash/);

    const vol = (await api("GET", "/bootstrap", await ctx.login(EMAILS.voluntario))).json();
    expect(vol.contactos).toEqual([]);
    expect(vol.documentos).toEqual([]);
    expect(vol.atendimentos).toEqual([]);
    expect(vol.utilizadores).toEqual([]);
    expect(vol.agregados.every((a: { morada: string; rendimentoTotal: number }) => a.morada === "" && a.rendimentoTotal === 0)).toBe(true);
    expect(vol.processos.every((p: { tecnicaReferencia: string }) => p.tecnicaReferencia === "")).toBe(true);
    expect(vol.cartoes).toEqual([]);
    expect(vol.mensagens).toEqual([]);
  });

  it("cada perfil só recebe o stock dos armazéns que pode consultar", async () => {
    const adm = (await api("GET", "/bootstrap", await ctx.login(EMAILS.admin))).json();
    expect(adm.artigos).toEqual([]);
    expect(adm.cartoes.length).toBeGreaterThan(0);
    expect(adm.pessoas.every((p: { nif: string }) => p.nif === "")).toBe(true);

    const coz = (await api("GET", "/bootstrap", await ctx.login(EMAILS.cozinha))).json();
    const codigos = new Set(coz.armazens.map((a: { codigo: string }) => a.codigo));
    expect(codigos).toEqual(new Set(["RES", "CDC"]));
    expect(coz.refeicoesContagem.length).toBeGreaterThan(0);
    expect(coz.entregasCabaz).toEqual([]);
  });

  it("proíbe escritas fora do perfil (403) mesmo conhecendo o endpoint", async () => {
    const vol = await ctx.login(EMAILS.voluntario);
    expect((await api("POST", "/agregados", vol, {})).statusCode).toBe(403);
    expect((await api("POST", "/utilizadores", vol, {})).statusCode).toBe(403);
    const adm = await ctx.login(EMAILS.admin);
    expect((await api("POST", "/mensagens", adm, {})).statusCode).toBe(403);
    expect((await api("GET", "/relatorios/resumo", await ctx.login(EMAILS.cozinha))).statusCode).toBe(403);
    expect((await api("GET", "/relatorios/resumo", adm)).statusCode).toBe(200);
  });

  it("valida os dados de entrada (400) com mensagens claras", async () => {
    const h = await ctx.login(EMAILS.direcao);
    const res = await api("POST", "/agregados", h, { agregado: { morada: "", freguesia: "X", situacaoHabitacional: "Inventada", rendimentoTotal: -1 }, titular: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().erro).toBe("validacao");
  });
});

describe("existências", () => {
  it("regista entradas e reutiliza o artigo quando o nome já existe (sem duplicar)", async () => {
    const h = await ctx.login(EMAILS.armazem);
    const res = await ctx.prisma.armazem.findUniqueOrThrow({ where: { codigo: "RES" } });
    const antes = await ctx.prisma.artigo.count({ where: { armazemId: res.id } });
    const existente = await ctx.prisma.artigo.findFirstOrThrow({ where: { armazemId: res.id } });

    const r = await api("POST", "/existencias/entradas", h, {
      armazemId: res.id,
      novoArtigo: { nome: `  ${existente.nome.toUpperCase()}  `, categoria: "Mercearia", unidade: "kg", stockMinimo: 5 },
      quantidade: 7,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().artigo.id).toBe(existente.id);
    expect(await ctx.prisma.artigo.count({ where: { armazemId: res.id } })).toBe(antes);

    const novo = await api("POST", "/existencias/entradas", h, {
      armazemId: res.id,
      novoArtigo: { nome: "Molho de tomate 500g", categoria: "Mercearia", unidade: "un", stockMinimo: 2 },
      quantidade: 10,
      validade: "2027-01-31",
      fornecedor: "Mercado X",
    });
    expect(novo.statusCode).toBe(201);
    expect(await ctx.prisma.artigo.count({ where: { armazemId: res.id } })).toBe(antes + 1);
    expect(novo.json().movimento).toMatchObject({ tipo: "entrada", quantidade: 10, fornecedor: "Mercado X" });
  });

  it("o perfil sem permissão sobre o armazém não regista entradas", async () => {
    const bsa = await armazem("BSA");
    const r = await api("POST", "/existencias/entradas", await ctx.login(EMAILS.cozinha), {
      armazemId: bsa.id,
      novoArtigo: { nome: "Qualquer", categoria: "x" },
      quantidade: 1,
    });
    expect(r.statusCode).toBe(403);
  });

  it("saída consome primeiro o lote que caduca antes e recusa stock insuficiente sem alterar nada", async () => {
    const h = await ctx.login(EMAILS.armazem);
    const bsa = await armazem("BSA");
    const artigo = await ctx.prisma.artigo.create({ data: { nome: "Teste FIFO", categoria: "t", unidade: "un", armazemId: bsa.id, stockMinimo: 0 } });
    const hoje = "2026-10-22";
    const tardio = await ctx.prisma.lote.create({ data: { artigoId: artigo.id, quantidade: 10, validade: "2027-06-01", localizacaoFisica: "A", estado: "disponível", entrada: hoje } });
    const cedo = await ctx.prisma.lote.create({ data: { artigoId: artigo.id, quantidade: 5, validade: "2026-12-01", localizacaoFisica: "A", estado: "disponível", entrada: hoje } });

    const ok = await api("POST", "/existencias/saidas", h, { artigoId: artigo.id, quantidade: 8, destino: "Teste" });
    expect(ok.statusCode).toBe(201);
    expect((await ctx.prisma.lote.findUniqueOrThrow({ where: { id: cedo.id } })).quantidade).toBe(0);
    expect((await ctx.prisma.lote.findUniqueOrThrow({ where: { id: tardio.id } })).quantidade).toBe(7);
    expect(ok.json().movimentos).toHaveLength(2);

    const mau = await api("POST", "/existencias/saidas", h, { artigoId: artigo.id, quantidade: 8, destino: "Teste" });
    expect(mau.statusCode).toBe(409);
    expect(await stock(artigo.id)).toBe(7);
  });

  it("duas saídas em simultâneo nunca gastam o mesmo stock duas vezes", async () => {
    const h = await ctx.login(EMAILS.armazem);
    const bsa = await armazem("BSA");
    const artigo = await ctx.prisma.artigo.create({ data: { nome: "Teste concorrência", categoria: "t", unidade: "un", armazemId: bsa.id, stockMinimo: 0 } });
    await ctx.prisma.lote.create({ data: { artigoId: artigo.id, quantidade: 10, validade: null, localizacaoFisica: "A", estado: "disponível", entrada: "2026-10-22" } });

    const pedidos = await Promise.all(
      Array.from({ length: 4 }, () => api("POST", "/existencias/saidas", h, { artigoId: artigo.id, quantidade: 4, destino: "Teste" })),
    );
    const codigos = pedidos.map((p) => p.statusCode).sort();
    expect(codigos).toEqual([201, 201, 409, 409]);
    expect(await stock(artigo.id)).toBe(2);
  });

  it("transfere entre armazéns mantendo a validade de cada porção", async () => {
    const h = await ctx.login(EMAILS.armazem);
    const bsa = await armazem("BSA");
    const res = await armazem("RES");
    const artigo = await ctx.prisma.artigo.create({ data: { nome: "Teste transferência", categoria: "t", unidade: "un", armazemId: bsa.id, stockMinimo: 1 } });
    await ctx.prisma.lote.createMany({
      data: [
        { artigoId: artigo.id, quantidade: 3, validade: "2026-11-10", localizacaoFisica: "A", estado: "disponível", entrada: "2026-10-01" },
        { artigoId: artigo.id, quantidade: 6, validade: "2027-02-01", localizacaoFisica: "A", estado: "disponível", entrada: "2026-10-02" },
      ],
    });
    const r = await api("POST", "/existencias/transferencias", h, { artigoId: artigo.id, armazemDestinoId: res.id, quantidade: 5 });
    expect(r.statusCode).toBe(201);
    expect(await stock(artigo.id)).toBe(4);
    const destino = await ctx.prisma.artigo.findFirstOrThrow({ where: { armazemId: res.id, nome: artigo.nome }, include: { lotes: true } });
    expect(destino.lotes.map((l) => [l.validade, l.quantidade]).sort()).toEqual([["2026-11-10", 3], ["2027-02-01", 2]]);

    expect((await api("POST", "/existencias/transferencias", h, { artigoId: artigo.id, armazemDestinoId: bsa.id, quantidade: 1 })).statusCode).toBe(409);
    expect((await api("POST", "/existencias/transferencias", await ctx.login(EMAILS.cozinha), { artigoId: artigo.id, armazemDestinoId: res.id, quantidade: 1 })).statusCode).toBe(403);
  });
});

describe("distribuição", () => {
  it("entrega de cabaz desconta o stock, regista movimentos e recusa quando falta stock", async () => {
    const h = await ctx.login(EMAILS.voluntario);
    const bsa = await armazem("BSA");
    const modelo = await ctx.prisma.modeloCabaz.findFirstOrThrow({ where: { ativo: true } });
    const todas = modelo.linhas as { artigoId: string; quantidade: number }[];
    // o modelo da demonstração inclui artigos esgotados: o servidor recusa-os (testado abaixo)
    const linhas: typeof todas = [];
    for (const l of todas) if ((await stock(l.artigoId)) > 0) linhas.push(l);
    expect(linhas.length).toBeGreaterThanOrEqual(2);
    const agregado = await ctx.prisma.agregado.findFirstOrThrow({ where: { pessoas: { some: { processos: { some: {} } } } } });

    const antes = await stock(linhas[0]!.artigoId);
    const movsAntes = await ctx.prisma.movimento.count({ where: { artigo: { armazemId: bsa.id } } });
    const r = await api("POST", "/cabazes/entregas", h, { agregadoId: agregado.id, modeloId: modelo.id, linhas: linhas.map((l) => ({ ...l, quantidade: 1 })) });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ estado: "Entregue", modeloVersao: modelo.versao });
    expect(await stock(linhas[0]!.artigoId)).toBe(antes - 1);
    expect(await ctx.prisma.movimento.count({ where: { artigo: { armazemId: bsa.id } } })).toBe(movsAntes + linhas.length);

    const entregasAntes = await ctx.prisma.entregaCabaz.count();
    const demais = await api("POST", "/cabazes/entregas", h, {
      agregadoId: agregado.id, modeloId: modelo.id,
      linhas: [{ artigoId: linhas[0]!.artigoId, quantidade: 1 }, { artigoId: linhas[1]!.artigoId, quantidade: 9_999 }],
    });
    expect(demais.statusCode).toBe(409);
    // transação revertida: nem a entrega nem o desconto da 1.ª linha ficaram
    expect(await ctx.prisma.entregaCabaz.count()).toBe(entregasAntes);
    expect(await stock(linhas[0]!.artigoId)).toBe(antes - 1);

    expect((await api("POST", "/cabazes/entregas", await ctx.login(EMAILS.cozinha), { agregadoId: agregado.id, modeloId: modelo.id, linhas })).statusCode).toBe(403);
  });

  it("editar o modelo de cabaz cria nova versão (só Direção/Técnico)", async () => {
    const modelo = await ctx.prisma.modeloCabaz.findFirstOrThrow({ where: { ativo: true } });
    const linhas = (modelo.linhas as { artigoId: string; quantidade: number }[]).slice(0, 2);
    expect((await api("PATCH", `/modelos-cabaz/${modelo.id}`, await ctx.login(EMAILS.voluntario), { linhas })).statusCode).toBe(403);
    const r = await api("PATCH", `/modelos-cabaz/${modelo.id}`, await ctx.login(EMAILS.tecnico), { linhas });
    expect(r.statusCode).toBe(200);
    expect(r.json().versao).toBe(modelo.versao + 1);
  });

  it("entrega de roupa soma linhas do mesmo artigo e não deixa passar o stock", async () => {
    const h = await ctx.login(EMAILS.voluntario);
    const bsr = await armazem("BSR");
    const artigo = await ctx.prisma.artigo.findFirstOrThrow({ where: { armazemId: bsr.id } });
    const processo = await ctx.prisma.processo.findFirstOrThrow();
    const antes = await stock(artigo.id);
    const ok = await api("POST", "/roupa/entregas", h, {
      processoId: processo.id,
      itens: [{ tipo: artigo.nome, tamanho: "M", quantidade: 1, estado: "Usado" }, { tipo: artigo.nome, tamanho: "L", quantidade: 1, estado: "Usado" }],
    });
    expect(ok.statusCode).toBe(201);
    expect(await stock(artigo.id)).toBe(antes - 2);
    const mau = await api("POST", "/roupa/entregas", h, { processoId: processo.id, itens: [{ tipo: artigo.nome, tamanho: "M", quantidade: antes, estado: "Novo" }] });
    expect(mau.statusCode).toBe(409);
    expect(await stock(artigo.id)).toBe(antes - 2);
  });

  it("uma contagem por dia e turno", async () => {
    const h = await ctx.login(EMAILS.cozinha);
    const corpo = { turno: "Jantar", numPessoas: 40, sopas: 40, pratos: 40, sobremesas: 40, pao: 40, aguas: 40 };
    const a = await api("POST", "/refeicoes/contagens", h, corpo);
    expect([201, 409]).toContain(a.statusCode);
    expect((await api("POST", "/refeicoes/contagens", h, corpo)).statusCode).toBe(409);
  });
});

describe("Porta Aberta", () => {
  it("cria agregado com titular, contacto e processo; numera sem repetir e recalcula menores", async () => {
    const h = await ctx.login(EMAILS.tecnico);
    const corpo = {
      agregado: { morada: "Rua Nova 1", freguesia: "Arroios", situacaoHabitacional: "Arrendada", rendimentoTotal: 600 },
      titular: { nome: "Maria Teste", dataNascimento: "1985-04-10", nacionalidade: "Portuguesa", estadoCivil: "Solteiro(a)", nif: "123456789" },
      telefone: "912345678",
      processo: { tecnicaReferencia: "Dr.ª Marta Ribeiro", periodicidade: "Trimestral" },
    };
    const [a, b] = await Promise.all([api("POST", "/agregados", h, corpo), api("POST", "/agregados", h, corpo)]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json().agregado.codigo).not.toBe(b.json().agregado.codigo);
    expect(a.json().processo.numero).not.toBe(b.json().processo.numero);

    const agId = a.json().agregado.id as string;
    const filho = await api("POST", `/agregados/${agId}/pessoas`, h, { nome: "Filho Teste", dataNascimento: "2015-01-01", nacionalidade: "Portuguesa", parentesco: "Filho(a)" });
    expect(filho.statusCode).toBe(201);
    const ag = await ctx.prisma.agregado.findUniqueOrThrow({ where: { id: agId } });
    expect(ag).toMatchObject({ numPessoas: 2, numMenores: 1 });

    expect((await api("DELETE", `/pessoas/${a.json().pessoa.id}`, h)).statusCode).toBe(204);
    expect(await ctx.prisma.agregado.findUniqueOrThrow({ where: { id: agId } })).toMatchObject({ numPessoas: 1, numMenores: 1 });
    // a última pessoa não se remove: elimina-se o agregado
    expect((await api("DELETE", `/pessoas/${filho.json().pessoa.id}`, h)).statusCode).toBe(409);
  });

  it("eliminar um agregado apaga o que lhe pertence e mantém o histórico (cartões, cabazes)", async () => {
    const h = await ctx.login(EMAILS.direcao);
    const agregado = await ctx.prisma.agregado.findFirstOrThrow({ where: { entregasCabaz: { some: {} } }, include: { entregasCabaz: true, pessoas: true } });
    const entregas = agregado.entregasCabaz.length;
    expect((await api("DELETE", `/agregados/${agregado.id}`, h)).statusCode).toBe(204);
    expect(await ctx.prisma.pessoa.count({ where: { agregadoId: agregado.id } })).toBe(0);
    const orfas = await ctx.prisma.entregaCabaz.count({ where: { agregadoId: null } });
    expect(orfas).toBeGreaterThanOrEqual(entregas);
  });

  it("o atendimento fica em nome do utilizador da sessão", async () => {
    const h = await ctx.login(EMAILS.tecnico);
    const processo = await ctx.prisma.processo.findFirstOrThrow();
    const r = await api("POST", `/processos/${processo.id}/atendimentos`, h, { tipo: "Acompanhamento", motivo: "Visita", tecnico: "Outra Pessoa" });
    expect(r.statusCode).toBe(201);
    expect(r.json().tecnico).toBe("Dr.ª Marta Ribeiro");
  });
});

describe("cartões, mensagens e utilizadores", () => {
  it("emite, entrega e cancela cartões; recusa entregar um cartão fora de prazo", async () => {
    const h = await ctx.login(EMAILS.admin);
    const processo = await ctx.prisma.processo.findFirstOrThrow();
    const novo = await api("POST", "/cartoes", h, { processoId: processo.id, valor: 30, origemFundo: "Fundo paroquial", validade: "2099-01-01" });
    expect(novo.statusCode).toBe(201);
    expect(novo.json().numero).toMatch(/^PD-\d{6}$/);
    const id = novo.json().id as string;
    expect((await api("POST", "/cartoes", h, { processoId: processo.id, numero: novo.json().numero, valor: 30, origemFundo: "x", validade: "2099-01-01" })).statusCode).toBe(409);
    expect((await api("POST", `/cartoes/${id}/entrega`, h, { entregueEm: "2026-10-22", recebidoPor: "Maria" })).statusCode).toBe(200);
    expect((await api("POST", `/cartoes/${id}/entrega`, h, { entregueEm: "2026-10-22", recebidoPor: "Maria" })).statusCode).toBe(409);
    expect((await api("POST", `/cartoes/${id}/cancelar`, h)).statusCode).toBe(200);
    expect((await api("POST", `/cartoes/${id}/cancelar`, h)).statusCode).toBe(409);

    const expirado = await ctx.prisma.cartao.create({ data: { numero: "PD-EXP", processoId: processo.id, valor: 10, origemFundo: "x", carregadoEm: "2026-01-01", validade: "2026-02-01", emitidoPor: "t", estado: "Por entregar" } });
    expect((await api("POST", `/cartoes/${expirado.id}/entrega`, h, { entregueEm: "2026-10-22", recebidoPor: "M" })).statusCode).toBe(409);
  });

  it("não envia mensagens a quem não tem contacto ou consentimento", async () => {
    const h = await ctx.login(EMAILS.tecnico);
    const semConsentimento = await ctx.prisma.contacto.findFirst({ where: { consentimento: false, tipo: "Telemóvel" }, include: { pessoa: { include: { processos: true } } } });
    if (semConsentimento?.pessoa.processos[0]) {
      const r = await api("POST", "/mensagens", h, {
        destinatarios: { processoId: semConsentimento.pessoa.processos[0].id }, canal: "SMS", modelo: "Aviso geral", conteudoFinal: "Olá", quando: "agora",
      });
      expect(r.statusCode).toBe(409);
    }
    const massa = await api("POST", "/mensagens", h, { destinatarios: "todos", canal: "SMS", modelo: "Aviso geral", conteudoFinal: "Olá", quando: "agendar", agendada: "2030-01-01T09:00:00.000Z" });
    expect(massa.statusCode).toBe(201);
    expect(massa.json().criadas).toBeGreaterThan(0);
    const agendada = await ctx.prisma.mensagem.findFirstOrThrow({ where: { estadoEntrega: "Agendada", agendada: new Date("2030-01-01T09:00:00.000Z") } });
    expect((await api("DELETE", `/mensagens/${agendada.id}`, h)).statusCode).toBe(204);
  });

  it("protege a última Direção ativa e as contas próprias", async () => {
    const h = await ctx.login(EMAILS.direcao);
    const eu = await ctx.prisma.utilizador.findUniqueOrThrow({ where: { email: EMAILS.direcao } });
    expect((await api("PATCH", `/utilizadores/${eu.id}`, h, { perfil: "Técnico de ação social" })).statusCode).toBe(409);
    expect((await api("PATCH", `/utilizadores/${eu.id}`, h, { ativo: false })).statusCode).toBe(409);
    expect((await api("DELETE", `/utilizadores/${eu.id}`, h)).statusCode).toBe(409);

    const novo = await api("POST", "/utilizadores", h, { nome: "Novo", email: "Novo@Exemplo.pt", password: "Password-Longa-1", perfil: "Armazém" });
    expect(novo.statusCode).toBe(201);
    expect(novo.json().email).toBe("novo@exemplo.pt");
    expect((await api("POST", "/utilizadores", h, { nome: "Novo", email: "novo@exemplo.pt", password: "Password-Longa-1", perfil: "Armazém" })).statusCode).toBe(409);
    expect((await api("POST", "/utilizadores", h, { nome: "X", email: "x@exemplo.pt", password: "curta", perfil: "Armazém" })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "novo@exemplo.pt", password: "Password-Longa-1" } })).json().utilizador.mustChangePassword).toBe(true);
    expect((await api("DELETE", `/utilizadores/${novo.json().id}`, h)).statusCode).toBe(204);
  });
});

describe("alertas e relatórios", () => {
  it("só devolve alertas que o perfil pode tratar e guarda o estado humano", async () => {
    const dir = (await api("GET", "/alertas", await ctx.login(EMAILS.direcao))).json() as { id: string; tipo: string; estado: string }[];
    expect(dir.length).toBeGreaterThan(0);
    const adm = (await api("GET", "/alertas", await ctx.login(EMAILS.admin))).json() as { tipo: string }[];
    expect(adm.every((a) => a.tipo === "Cartão a expirar")).toBe(true);

    const h = await ctx.login(EMAILS.direcao);
    const alvo = dir[0]!;
    expect((await api("PUT", `/alertas/${encodeURIComponent(alvo.id)}/estado`, h, { estado: "Adiado", motivoAdiamento: "Aguarda resposta" })).statusCode).toBe(200);
    const depois = (await api("GET", "/alertas", h)).json() as { id: string; estado: string; motivoAdiamento: string }[];
    expect(depois.find((a) => a.id === alvo.id)).toMatchObject({ estado: "Adiado", motivoAdiamento: "Aguarda resposta" });
    // um perfil sem acesso ao alerta não o consegue alterar
    expect((await api("PUT", `/alertas/${encodeURIComponent(alvo.id)}/estado`, await ctx.login(EMAILS.voluntario), { estado: "Tratado" })).statusCode).toBe(404);
  });

  it("exporta CSV anónimo por omissão e regista a exportação", async () => {
    const h = await ctx.login(EMAILS.admin);
    const anon = await ctx.app.inject({ method: "GET", url: "/api/v1/relatorios/agregados.csv", headers: h });
    expect(anon.statusCode).toBe(200);
    expect(anon.headers["content-type"]).toContain("text/csv");
    expect(anon.body).not.toContain("Morada");
    const comMorada = await ctx.app.inject({ method: "GET", url: "/api/v1/relatorios/agregados.csv?anonimizar=false", headers: h });
    expect(comMorada.body).toContain("Morada");
    expect(await ctx.prisma.registoAcesso.count({ where: { acao: { startsWith: "Exportou agregados" } } })).toBe(2);
  });
});
