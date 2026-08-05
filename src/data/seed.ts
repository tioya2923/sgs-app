import type {
  Agregado,
  Armazem,
  Artigo,
  Atendimento,
  Cartao,
  Contacto,
  Database,
  Documento,
  EntregaCabaz,
  EntregaRoupa,
  Inscricao,
  Lote,
  Mensagem,
  ModeloCabaz,
  Movimento,
  Pessoa,
  Processo,
  RefeicaoContagem,
  RefeicaoPresenca,
  RegistoAcesso,
  Utilizador,
} from "../types";

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(4, "0")}`;
}

const DAY = 24 * 60 * 60 * 1000;
function iso(offsetDays: number, from: Date = new Date()): string {
  return new Date(from.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
}

export function buildSeed(): Database {
  const today = new Date();

  // ---------------------------------------------------------------- Armazéns
  const armazens: Armazem[] = [
    { id: id("arm"), codigo: "BSA", designacao: "Banco Solidário de Alimentos" },
    { id: id("arm"), codigo: "RES", designacao: "Residência" },
    { id: id("arm"), codigo: "CDC", designacao: "Casa da Caridade" },
    { id: id("arm"), codigo: "BSR", designacao: "Banco Solidário de Roupa" },
  ];
  const [armBSA, armRES, armCDC, armBSR] = armazens;

  // ------------------------------------------------------------------ Artigos
  const artigoDefs: Array<[string, string, string, Armazem, number, boolean]> = [
    ["Arroz agulha 1kg", "Mercearia", "un", armBSA, 20, true],
    ["Massa esparguete 500g", "Mercearia", "un", armBSA, 25, true],
    ["Feijão enlatado 400g", "Mercearia", "un", armBSA, 30, true],
    ["Atum em lata 120g", "Mercearia", "un", armBSA, 40, true],
    ["Azeite 1L", "Mercearia", "un", armBSA, 10, true],
    ["Leite UHT 1L", "Laticínios", "un", armBSA, 30, true],
    ["Açúcar 1kg", "Mercearia", "un", armBSA, 15, true],
    ["Bolachas Maria 400g", "Mercearia", "un", armBSA, 20, true],
    ["Café moído 250g", "Mercearia", "un", armBSA, 12, true],
    ["Fruta da época (cx.)", "Fresco", "cx", armBSA, 5, true],
    ["Batata 3kg", "Fresco", "saco", armBSA, 8, true],
    ["Papel higiénico (4un)", "Higiene", "pack", armBSA, 15, true],
    ["Sabonete", "Higiene", "un", armBSA, 20, true],
    ["Frango (kg)", "Congelados", "kg", armRES, 15, true],
    ["Peixe congelado (kg)", "Congelados", "kg", armRES, 15, true],
    ["Legumes congelados (kg)", "Congelados", "kg", armRES, 20, true],
    ["Arroz para cozinha 5kg", "Mercearia", "saco", armRES, 6, true],
    ["Óleo alimentar 1L", "Mercearia", "un", armRES, 8, true],
    ["Guardanapos (pack 100)", "Consumível", "pack", armCDC, 6, true],
    ["Copos descartáveis (100)", "Consumível", "pack", armCDC, 6, true],
    ["Talheres descartáveis (100)", "Consumível", "pack", armCDC, 6, true],
    ["Água 0,5L (pack 6)", "Bebidas", "pack", armCDC, 20, true],
    ["Pão (unidade)", "Fresco", "un", armCDC, 40, true],
    ["Casaco de inverno", "Vestuário adulto", "un", armBSR, 5, false],
    ["Calças", "Vestuário adulto", "un", armBSR, 10, false],
    ["T-shirt", "Vestuário adulto", "un", armBSR, 15, false],
    ["Roupa de criança 2-6 anos", "Vestuário infantil", "un", armBSR, 8, false],
    ["Sapatos adulto", "Calçado", "par", armBSR, 6, false],
    ["Cobertor", "Casa", "un", armBSR, 8, false],
  ];
  const artigos: Artigo[] = artigoDefs.map(
    ([nome, categoria, unidade, armazem, stockMinimo, consumivel]) => ({
      id: id("art"),
      nome,
      categoria,
      unidade,
      armazemId: armazem.id,
      stockMinimo,
      consumivel,
    })
  );
  const artigoByNome = (nome: string) => artigos.find((a) => a.nome === nome)!;

  // -------------------------------------------------------------------- Lotes
  const lotes: Lote[] = [];
  const movimentos: Movimento[] = [];

  function receber(
    artigoNome: string,
    quantidade: number,
    validadeOffset: number | null,
    entradaOffset: number,
    fornecedor: string,
    localizacao = "Prateleira A"
  ) {
    const artigo = artigoByNome(artigoNome);
    const lote: Lote = {
      id: id("lot"),
      artigoId: artigo.id,
      quantidade,
      validade: validadeOffset === null ? null : iso(validadeOffset, today),
      localizacaoFisica: localizacao,
      estado: "disponível",
      entrada: iso(entradaOffset, today),
    };
    lotes.push(lote);
    movimentos.push({
      id: id("mov"),
      artigoId: artigo.id,
      loteId: lote.id,
      tipo: "entrada",
      quantidade,
      data: lote.entrada,
      origemOuDestino: armazens.find((a) => a.id === artigo.armazemId)!.designacao,
      fornecedor,
      benfeitor: null,
      documento: `GR-${1000 + movimentos.length}`,
      preco: null,
      registadoPor: "Equipa de armazém",
      referencia: null,
    });
    return lote;
  }

  receber("Arroz agulha 1kg", 60, 240, -10, "Banco Alimentar Contra a Fome");
  receber("Massa esparguete 500g", 80, 300, -10, "Banco Alimentar Contra a Fome");
  receber("Feijão enlatado 400g", 12, 20, -30, "Doação — Pingo Doce Rossio"); // validade curta
  receber("Atum em lata 120g", 15, 18, -20, "Doação — Continente Chiado"); // validade curta
  receber("Azeite 1L", 3, 400, -5, "Compra centralizada"); // stock abaixo do mínimo (min 10)
  receber("Leite UHT 1L", 0, 60, -40, "Banco Alimentar Contra a Fome"); // esgotado
  receber("Açúcar 1kg", 22, 500, -5, "Banco Alimentar Contra a Fome");
  receber("Bolachas Maria 400g", 26, 150, -12, "Doação particular");
  receber("Café moído 250g", 14, 200, -8, "Doação — Torrefação Delta");
  receber("Fruta da época (cx.)", 6, 6, -1, "Mercado de Abastecimento"); // validade muito curta
  receber("Batata 3kg", 10, 25, -3, "Mercado de Abastecimento");
  receber("Papel higiénico (4un)", 18, null, -15, "Doação particular");
  receber("Sabonete", 24, null, -15, "Doação particular");
  receber("Frango (kg)", 20, 90, -4, "Talho Central", "Arca congeladora 1");
  receber("Peixe congelado (kg)", 18, 120, -4, "Peixaria do Cais", "Arca congeladora 2");
  receber("Legumes congelados (kg)", 25, 200, -6, "Mercado de Abastecimento", "Arca congeladora 2");
  receber("Arroz para cozinha 5kg", 9, 400, -6, "Banco Alimentar Contra a Fome");
  receber("Óleo alimentar 1L", 10, 300, -6, "Compra centralizada");
  receber("Guardanapos (pack 100)", 10, null, -20, "Compra centralizada");
  receber("Copos descartáveis (100)", 9, null, -20, "Compra centralizada");
  receber("Talheres descartáveis (100)", 8, null, -20, "Compra centralizada");
  receber("Água 0,5L (pack 6)", 30, 400, -10, "Doação — Águas do Tejo");
  receber("Pão (unidade)", 35, 1, 0, "Padaria São Nicolau");
  receber("Casaco de inverno", 14, null, -60, "Recolha de roupa — paróquia");
  receber("Calças", 22, null, -60, "Recolha de roupa — paróquia");
  receber("T-shirt", 30, null, -60, "Recolha de roupa — paróquia");
  receber("Roupa de criança 2-6 anos", 16, null, -40, "Recolha de roupa — paróquia");
  receber("Sapatos adulto", 4, null, -40, "Recolha de roupa — paróquia"); // stock baixo (min 6)
  receber("Cobertor", 11, null, -40, "Doação particular");

  // ------------------------------------------------------------ Agregados / Pessoas
  interface PF {
    morada: string;
    freguesia: string;
    situacao: Agregado["situacaoHabitacional"];
    rendimento: number;
    membros: Array<{
      nome: string;
      nasc: string;
      nac: string;
      civil: Pessoa["estadoCivil"];
      parentesco: Pessoa["parentesco"];
      processo?: boolean;
      restricoes?: string[];
      incapacidade?: boolean;
    }>;
  }

  const familias: PF[] = [
    {
      morada: "Rua dos Bacalhoeiros, 12, 2º Dto",
      freguesia: "Santa Maria Maior",
      situacao: "Arrendada",
      rendimento: 620,
      membros: [
        { nome: "Rosa Maria Gonçalves", nasc: "1958-03-11", nac: "Portuguesa", civil: "Viúvo(a)", parentesco: "Titular", processo: true, incapacidade: true },
      ],
    },
    {
      morada: "Travessa do Almada, 5, 1º Esq",
      freguesia: "Santa Maria Maior",
      situacao: "Cedida",
      rendimento: 980,
      membros: [
        { nome: "Amadu Baldé", nasc: "1985-07-02", nac: "Guineense", civil: "Casado(a)", parentesco: "Titular", processo: true },
        { nome: "Fatoumata Baldé", nasc: "1989-11-19", nac: "Guineense", civil: "Casado(a)", parentesco: "Cônjuge" },
        { nome: "Ibrahima Baldé", nasc: "2015-02-08", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Filho(a)" },
        { nome: "Mariama Baldé", nasc: "2018-09-23", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Filho(a)" },
      ],
    },
    {
      morada: "Rua da Madalena, 88, 3º",
      freguesia: "Santa Maria Maior",
      situacao: "Arrendada",
      rendimento: 430,
      membros: [
        { nome: "Carlos Eduardo Souza", nasc: "1972-05-30", nac: "Brasileira", civil: "Divorciado(a)", parentesco: "Titular", processo: true, restricoes: ["Diabetes"] },
      ],
    },
    {
      morada: "Largo de São Domingos, 3, r/c",
      freguesia: "Santa Maria Maior",
      situacao: "Sem-abrigo",
      rendimento: 0,
      membros: [
        { nome: "José Carlos Pereira", nasc: "1966-01-14", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Titular", processo: true, incapacidade: false },
      ],
    },
    {
      morada: "Rua dos Douradores, 45, 4º Dto",
      freguesia: "Santa Maria Maior",
      situacao: "Arrendada",
      rendimento: 1120,
      membros: [
        { nome: "Rajesh Kumar", nasc: "1979-04-17", nac: "Indiana", civil: "Casado(a)", parentesco: "Titular", processo: true },
        { nome: "Priya Kumar", nasc: "1983-08-05", nac: "Indiana", civil: "Casado(a)", parentesco: "Cônjuge" },
        { nome: "Ananya Kumar", nasc: "2012-12-01", nac: "Indiana", civil: "Solteiro(a)", parentesco: "Filho(a)" },
      ],
    },
    {
      morada: "Rua de São Julião, 21, 2º",
      freguesia: "Misericórdia",
      situacao: "Própria",
      rendimento: 540,
      membros: [
        { nome: "Fátima Oliveira Santos", nasc: "1950-09-27", nac: "Portuguesa", civil: "Viúvo(a)", parentesco: "Titular", processo: true },
        { nome: "Manuel Santos", nasc: "1948-02-19", nac: "Portuguesa", civil: "Viúvo(a)", parentesco: "Outro" },
      ],
    },
    {
      morada: "Rua do Benformoso, 60, 1º",
      freguesia: "São Vicente",
      situacao: "Arrendada",
      rendimento: 710,
      membros: [
        { nome: "Wei Chen", nasc: "1981-06-09", nac: "Chinesa", civil: "Casado(a)", parentesco: "Titular", processo: false },
        { nome: "Lin Chen", nasc: "1984-03-22", nac: "Chinesa", civil: "Casado(a)", parentesco: "Cônjuge", processo: true },
        { nome: "Xiao Chen", nasc: "2016-10-14", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Filho(a)" },
      ],
    },
    {
      morada: "Calçada de Santo André, 17",
      freguesia: "São Vicente",
      situacao: "Ocupação",
      rendimento: 380,
      membros: [
        { nome: "Thi Lan Nguyen", nasc: "1990-12-03", nac: "Vietnamita", civil: "Solteiro(a)", parentesco: "Titular", processo: true },
      ],
    },
    {
      morada: "Rua de São Lázaro, 102, 3º Esq",
      freguesia: "Arroios",
      situacao: "Arrendada",
      rendimento: 890,
      membros: [
        { nome: "Ana Sofia Rodrigues", nasc: "1977-08-30", nac: "Portuguesa", civil: "Divorciado(a)", parentesco: "Titular", processo: true },
        { nome: "Diogo Rodrigues", nasc: "2010-04-11", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Filho(a)" },
        { nome: "Beatriz Rodrigues", nasc: "2013-01-25", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Filho(a)" },
      ],
    },
    {
      morada: "Rua da Verónica, 9, 2º",
      freguesia: "Penha de França",
      situacao: "Arrendada",
      rendimento: 505,
      membros: [
        { nome: "Joaquim Augusto Ferreira", nasc: "1954-11-06", nac: "Portuguesa", civil: "Casado(a)", parentesco: "Titular", processo: true },
        { nome: "Isabel Cristina Ferreira", nasc: "1957-06-21", nac: "Portuguesa", civil: "Casado(a)", parentesco: "Cônjuge" },
      ],
    },
    {
      morada: "Rua do Terreiro do Trigo, 33",
      freguesia: "Santa Maria Maior",
      situacao: "Cedida",
      rendimento: 350,
      membros: [
        { nome: "Fatoumata Camará", nasc: "1993-02-14", nac: "Guineense", civil: "Solteiro(a)", parentesco: "Titular", processo: true },
        { nome: "Mamadu Camará", nasc: "2019-05-19", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Filho(a)" },
      ],
    },
    {
      morada: "Beco do Jasmim, 4",
      freguesia: "Santo António",
      situacao: "Arrendada",
      rendimento: 760,
      membros: [
        { nome: "António Manuel Silva", nasc: "1969-10-08", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Titular", processo: true, restricoes: ["Sem glúten"] },
      ],
    },
    {
      morada: "Rua das Pedras Negras, 18, 1º",
      freguesia: "Santa Maria Maior",
      situacao: "Própria",
      rendimento: 490,
      membros: [
        { nome: "Conceição Fernandes", nasc: "1946-07-23", nac: "Portuguesa", civil: "Viúvo(a)", parentesco: "Titular", processo: true, incapacidade: true },
      ],
    },
    {
      morada: "Rua da Prata, 210, 5º",
      freguesia: "Santa Maria Maior",
      situacao: "Arrendada",
      rendimento: 1340,
      membros: [
        { nome: "Nuno Miguel Costa", nasc: "1983-01-29", nac: "Portuguesa", civil: "União de facto", parentesco: "Titular", processo: false },
        { nome: "Sara Alexandra Costa", nasc: "1986-09-17", nac: "Portuguesa", civil: "União de facto", parentesco: "Cônjuge", processo: true },
        { nome: "Tomás Costa", nasc: "2020-03-02", nac: "Portuguesa", civil: "Solteiro(a)", parentesco: "Filho(a)" },
      ],
    },
  ];

  const agregados: Agregado[] = [];
  const pessoas: Pessoa[] = [];
  const processos: Processo[] = [];
  const contactos: Contacto[] = [];
  const documentos: Documento[] = [];
  const inscricoes: Inscricao[] = [];
  const atendimentos: Atendimento[] = [];

  const tecnicas = ["Dr.ª Marta Ribeiro", "Dr. Filipe Andrade", "Dr.ª Helena Nunes"];
  let processoSeq = 1;

  familias.forEach((fam, famIdx) => {
    const agregado: Agregado = {
      id: id("agr"),
      codigo: `AG-${(famIdx + 1).toString().padStart(3, "0")}`,
      morada: fam.morada,
      freguesia: fam.freguesia,
      situacaoHabitacional: fam.situacao,
      rendimentoTotal: fam.rendimento,
      numPessoas: fam.membros.length,
      numMenores: fam.membros.filter((m) => {
        const idade = today.getFullYear() - Number(m.nasc.slice(0, 4));
        return idade < 18;
      }).length,
      dataAbertura: iso(-365 - famIdx * 17, today),
    };
    agregados.push(agregado);

    fam.membros.forEach((m, mIdx) => {
      const pessoa: Pessoa = {
        id: id("pes"),
        agregadoId: agregado.id,
        nome: m.nome,
        dataNascimento: m.nasc,
        nacionalidade: m.nac,
        estadoCivil: m.civil,
        nif: `2${(100000000 + famIdx * 37 + mIdx).toString().slice(0, 8)}`,
        documentoTipo: m.nac === "Portuguesa" ? "Cartão de Cidadão" : "Título de Residência",
        documentoNumero: `${famIdx}${mIdx}${Math.floor(1000000 + famIdx * 913)}`,
        documentoValidade:
          famIdx === 2 && mIdx === 0
            ? iso(20, today) // caduca em breve
            : iso(700 + famIdx * 30, today),
        parentesco: m.parentesco,
        restricoesAlimentares: m.restricoes ?? [],
        incapacidade: m.incapacidade ?? false,
        temProcessoProprio: !!m.processo,
      };
      pessoas.push(pessoa);

      contactos.push({
        id: id("con"),
        pessoaId: pessoa.id,
        tipo: "Telemóvel",
        valor: `9${(10000000 + famIdx * 731 + mIdx * 17).toString().slice(0, 8)}`,
        consentimento: !(famIdx === 7), // uma família sem consentimento, para testar a regra
        dataConsentimento: famIdx === 7 ? null : iso(-300, today),
        preferencial: true,
      });

      if (m.processo) {
        const tecnica = tecnicas[processoSeq % tecnicas.length];
        const periodicidade = (["Mensal", "Trimestral", "Semestral"] as const)[
          processoSeq % 3
        ];
        const processo: Processo = {
          id: id("prc"),
          numero: processoSeq,
          pessoaId: pessoa.id,
          tecnicaReferencia: tecnica,
          dataAbertura: iso(-300 - famIdx * 11, today),
          estado: "Ativo",
          periodicidadeReavaliacao: periodicidade,
          // dois processos ficam com reavaliação já vencida, de propósito
          proximaAvaliacao:
            processoSeq === 3 || processoSeq === 9 ? iso(-6, today) : iso(24 + processoSeq, today),
        };
        processos.push(processo);
        processoSeq += 1;

        documentos.push({
          id: id("doc"),
          processoId: processo.id,
          tipo: "Comprovativo de morada",
          ficheiro: `comprovativo_${processo.numero}.pdf`,
          data: processo.dataAbertura,
          validade: null,
        });

        const programasPossiveis: Array<[string, boolean]> = [
          ["Banco Solidário de Alimentos", true],
          ["Casa da Caridade", famIdx % 2 === 0],
          ["Banco Solidário de Roupa", famIdx % 3 === 0],
          ["Mais Sós", famIdx % 4 === 0],
        ];
        programasPossiveis
          .filter(([, incluir]) => incluir)
          .forEach(([programa]) => {
            inscricoes.push({
              id: id("ins"),
              processoId: processo.id,
              programa: programa as Inscricao["programa"],
              // a inscrição mais antiga (agregado 0) fica perto da renovação anual, para testar o alerta
              data: famIdx === 0 ? iso(-345, today) : iso(-200, today),
              estado: "Ativa",
              motivo: "Avaliação de carência socioeconómica",
              observacoes: "",
            });
          });

        atendimentos.push({
          id: id("ate"),
          processoId: processo.id,
          data: iso(-40, today),
          tipo: "Acompanhamento",
          motivo: "Reavaliação da situação socioeconómica",
          observacoes: "Agregado mantém dificuldades. Reforçado apoio alimentar.",
          necessidadesDetetadas: ["Apoio alimentar", "Apoio ao arrendamento"],
          encaminhamento: "Segurança Social — RSI",
          proximaAvaliacao: processo.proximaAvaliacao,
          tecnico: tecnica,
        });
      }
    });
  });

  const processoByPessoaNome = (nome: string) => {
    const pessoa = pessoas.find((p) => p.nome === nome)!;
    return processos.find((p) => p.pessoaId === pessoa.id)!;
  };

  // ------------------------------------------------------------ Modelos de cabaz
  const arroz = artigoByNome("Arroz agulha 1kg").id;
  const massa = artigoByNome("Massa esparguete 500g").id;
  const feijao = artigoByNome("Feijão enlatado 400g").id;
  const atum = artigoByNome("Atum em lata 120g").id;
  const azeite = artigoByNome("Azeite 1L").id;
  const leite = artigoByNome("Leite UHT 1L").id;
  const acucar = artigoByNome("Açúcar 1kg").id;
  const bolachas = artigoByNome("Bolachas Maria 400g").id;
  const cafe = artigoByNome("Café moído 250g").id;
  const fruta = artigoByNome("Fruta da época (cx.)").id;

  const modelosCabaz: ModeloCabaz[] = [
    {
      id: id("mdc"),
      nome: "Semanal — Pessoa Só",
      tipologia: "Semanal",
      versao: 3,
      ativo: true,
      linhas: [
        { artigoId: arroz, quantidade: 1 },
        { artigoId: massa, quantidade: 1 },
        { artigoId: feijao, quantidade: 2 },
        { artigoId: atum, quantidade: 3 },
        { artigoId: leite, quantidade: 2 },
        { artigoId: bolachas, quantidade: 1 },
      ],
    },
    {
      id: id("mdc"),
      nome: "Semanal — Família até 4 pessoas",
      tipologia: "Semanal",
      versao: 4,
      ativo: true,
      linhas: [
        { artigoId: arroz, quantidade: 2 },
        { artigoId: massa, quantidade: 3 },
        { artigoId: feijao, quantidade: 4 },
        { artigoId: atum, quantidade: 6 },
        { artigoId: azeite, quantidade: 1 },
        { artigoId: leite, quantidade: 4 },
        { artigoId: acucar, quantidade: 1 },
        { artigoId: bolachas, quantidade: 2 },
        { artigoId: fruta, quantidade: 1 },
      ],
    },
    {
      id: id("mdc"),
      nome: "Semanal — Família 5+ pessoas",
      tipologia: "Semanal",
      versao: 2,
      ativo: true,
      linhas: [
        { artigoId: arroz, quantidade: 3 },
        { artigoId: massa, quantidade: 4 },
        { artigoId: feijao, quantidade: 6 },
        { artigoId: atum, quantidade: 8 },
        { artigoId: azeite, quantidade: 2 },
        { artigoId: leite, quantidade: 6 },
        { artigoId: acucar, quantidade: 2 },
        { artigoId: bolachas, quantidade: 3 },
        { artigoId: cafe, quantidade: 1 },
        { artigoId: fruta, quantidade: 2 },
      ],
    },
    {
      id: id("mdc"),
      nome: "Cabaz de Natal",
      tipologia: "Natal",
      versao: 1,
      ativo: true,
      linhas: [
        { artigoId: bolachas, quantidade: 2 },
        { artigoId: cafe, quantidade: 1 },
        { artigoId: azeite, quantidade: 1 },
        { artigoId: fruta, quantidade: 2 },
      ],
    },
  ];

  // --------------------------------------------------------- Entregas de cabaz
  const entregasCabaz: EntregaCabaz[] = [];
  const modeloSó = modelosCabaz[0];
  const modeloFam4 = modelosCabaz[1];
  const modeloFam5 = modelosCabaz[2];

  function escolherModelo(numPessoas: number): ModeloCabaz {
    if (numPessoas <= 1) return modeloSó;
    if (numPessoas <= 4) return modeloFam4;
    return modeloFam5;
  }

  agregados.forEach((agregado, i) => {
    const processoTitular = processos.find(
      (p) => pessoas.find((pe) => pe.id === p.pessoaId)?.agregadoId === agregado.id
    );
    if (!processoTitular) return;
    const modelo = escolherModelo(agregado.numPessoas);
    const emFalta = i === 6; // Wei/Lin Chen — testa alerta de ausência prolongada

    // três entregas semanais passadas, mais a desta semana (uma linha por semana, sem duplicar datas)
    for (let w = 3; w >= 0; w -= 1) {
      const faltouEstaSemana = emFalta && w <= 2; // as últimas 3 semanas (0, 1, 2) ficam em falta
      entregasCabaz.push({
        id: id("ecb"),
        agregadoId: agregado.id,
        processoId: processoTitular.id,
        tipo: "Semanal",
        modeloId: modelo.id,
        modeloVersao: modelo.versao,
        dataPrevista: iso(-7 * w, today),
        dataEfetiva: faltouEstaSemana ? null : iso(-7 * w, today),
        levantadoPor: faltouEstaSemana ? null : pessoas.find((p) => p.agregadoId === agregado.id)?.nome ?? null,
        registadoPor: "Voluntário — distribuição",
        estado: faltouEstaSemana ? "Em falta" : "Entregue",
        observacoes: faltouEstaSemana ? "Não levantado" : "",
        linhas: modelo.linhas,
      });
    }
  });

  // ----------------------------------------------------------- Entregas de roupa
  const entregasRoupa: EntregaRoupa[] = [
    {
      id: id("erp"),
      processoId: processoByPessoaNome("Amadu Baldé").id,
      data: iso(-14, today),
      artigos: [
        { tipo: "Casaco de inverno", tamanho: "M", quantidade: 2, estado: "Bom estado" },
        { tipo: "Roupa de criança 2-6 anos", tamanho: "4 anos", quantidade: 3, estado: "Bom estado" },
      ],
      registadoPor: "Voluntário — distribuição",
    },
    {
      id: id("erp"),
      processoId: processoByPessoaNome("Fatoumata Camará").id,
      data: iso(-5, today),
      artigos: [
        { tipo: "Cobertor", tamanho: "Único", quantidade: 1, estado: "Novo" },
        { tipo: "Roupa de criança 2-6 anos", tamanho: "7 anos", quantidade: 2, estado: "Usado" },
      ],
      registadoPor: "Voluntário — distribuição",
    },
  ];

  // ----------------------------------------------------------------- Refeições
  const refeicoesContagem: RefeicaoContagem[] = [];
  const refeicoesPresenca: RefeicaoPresenca[] = [];

  const acompanhadosRefeicao = [
    processoByPessoaNome("Rosa Maria Gonçalves"),
    processoByPessoaNome("José Carlos Pereira"),
    processoByPessoaNome("Conceição Fernandes"),
    processoByPessoaNome("Carlos Eduardo Souza"),
  ];

  for (let d = 9; d >= 0; d -= 1) {
    (["Almoço", "Jantar"] as const).forEach((turno) => {
      const base = turno === "Almoço" ? 46 : 34;
      const variação = Math.round(Math.sin(d) * 4);
      const numPessoas = base + variação + (d === 0 ? 2 : 0);
      refeicoesContagem.push({
        id: id("rfc"),
        data: iso(-d, today),
        turno,
        numPessoas,
        sopas: Math.round(numPessoas * 0.7),
        pratos: numPessoas,
        alternativaVegetariana: Math.round(numPessoas * 0.15),
        sobremesas: Math.round(numPessoas * 0.5),
        pao: numPessoas,
        aguas: Math.round(numPessoas * 0.8),
        takeaway: Math.round(numPessoas * 0.1),
      });

      acompanhadosRefeicao.forEach((processo, idx) => {
        // José Carlos Pereira (idx 1) deixa de aparecer há mais de 3 refeições seguidas
        const desaparecido = idx === 1 && d <= 4;
        if (desaparecido && turno === "Almoço") return;
        if (desaparecido && turno === "Jantar") return;
        refeicoesPresenca.push({
          id: id("rfp"),
          data: iso(-d, today),
          turno,
          processoId: processo.id,
          modalidade: idx === 3 ? "Take-away" : "Presencial",
          numDoses: 1,
        });
      });
    });
  }

  // -------------------------------------------------------------------- Cartões
  const cartoes: Cartao[] = [
    {
      id: id("crt"),
      numero: "PD-100234",
      agregadoId: agregados[1].id,
      processoId: processoByPessoaNome("Amadu Baldé").id,
      valor: 60,
      origemFundo: "Câmara Municipal de Lisboa",
      carregadoEm: iso(-20, today),
      validade: iso(6, today), // a expirar
      entregueEm: iso(-19, today),
      recebidoPor: "Amadu Baldé",
      provaRececao: true,
      emitidoPor: "Administrativo",
      estado: "Ativo",
    },
    {
      id: id("crt"),
      numero: "PD-100235",
      agregadoId: agregados[4].id,
      processoId: processoByPessoaNome("Rajesh Kumar").id,
      valor: 45,
      origemFundo: "Fundo paroquial",
      carregadoEm: iso(-40, today),
      validade: iso(90, today),
      entregueEm: iso(-39, today),
      recebidoPor: "Rajesh Kumar",
      provaRececao: true,
      emitidoPor: "Administrativo",
      estado: "Ativo",
    },
    {
      id: id("crt"),
      numero: "PD-100236",
      agregadoId: agregados[9].id,
      processoId: processoByPessoaNome("Joaquim Augusto Ferreira").id,
      valor: 30,
      origemFundo: "Doação privada",
      carregadoEm: iso(-2, today),
      validade: iso(120, today),
      entregueEm: null,
      recebidoPor: null,
      provaRececao: false,
      emitidoPor: "Administrativo",
      estado: "Por entregar",
    },
  ];

  // ------------------------------------------------------------------ Mensagens
  const mensagens: Mensagem[] = [
    {
      id: id("msg"),
      processoId: processoByPessoaNome("Rosa Maria Gonçalves").id,
      canal: "SMS",
      modelo: "Lembrete de levantamento de cabaz",
      conteudoFinal:
        "Centro Social São Nicolau: lembramos que o seu cabaz está disponível amanhã, das 10h às 12h.",
      agendada: iso(-1, today),
      enviada: iso(-1, today),
      estadoEntrega: "Entregue",
      resposta: null,
      custo: 0.05,
    },
    {
      id: id("msg"),
      processoId: processoByPessoaNome("Lin Chen").id,
      canal: "SMS",
      modelo: "Cabaz por levantar",
      conteudoFinal:
        "Centro Social São Nicolau: o seu cabaz continua por levantar. Contacte-nos, por favor.",
      agendada: iso(-2, today),
      enviada: iso(-2, today),
      estadoEntrega: "Falhou",
      resposta: null,
      custo: 0.05,
    },
    {
      id: id("msg"),
      processoId: (() => {
        const pessoa = pessoas.find((p) => p.nome === "Thi Lan Nguyen")!;
        return processos.find((p) => p.pessoaId === pessoa.id)!.id;
      })(),
      canal: "SMS",
      modelo: "Aviso geral — mudança de horário",
      conteudoFinal: "Centro Social São Nicolau: a partir de 2 de setembro, novo horário: 9h-13h.",
      agendada: iso(1, today),
      enviada: null,
      estadoEntrega: "Sem consentimento",
      resposta: null,
      custo: null,
    },
  ];

  // -------------------------------------------------------------- Registo de acesso
  const registosAcesso: RegistoAcesso[] = [
    {
      id: id("log"),
      utilizador: "Dr.ª Marta Ribeiro",
      acao: "Consultou processo",
      entidade: `Processo nº ${processoByPessoaNome("Rosa Maria Gonçalves").numero}`,
      dataHora: iso(0, today) + "T09:14",
    },
    {
      id: id("log"),
      utilizador: "Equipa de armazém",
      acao: "Registou entrada",
      entidade: "Arroz agulha 1kg",
      dataHora: iso(-10, today) + "T08:02",
    },
    {
      id: id("log"),
      utilizador: "Voluntário — distribuição",
      acao: "Registou entrega de cabaz",
      entidade: `Agregado ${agregados[0].codigo}`,
      dataHora: iso(0, today) + "T10:31",
    },
  ];

  // -------------------------------------------------------------------- Utilizadores
  const utilizadores: Utilizador[] = [
    { id: id("usr"), nome: "Pe. Rui Almeida", perfil: "Direção", email: "direcao@cssaonicolau.pt", password: "rui2026", ativo: true, ultimoAcesso: iso(0, today) },
    { id: id("usr"), nome: "Dr.ª Marta Ribeiro", perfil: "Técnico de ação social", email: "marta.ribeiro@cssaonicolau.pt", password: "marta2026", ativo: true, ultimoAcesso: iso(0, today) },
    { id: id("usr"), nome: "Dr. Filipe Andrade", perfil: "Técnico de ação social", email: "filipe.andrade@cssaonicolau.pt", password: "filipe2026", ativo: true, ultimoAcesso: iso(-1, today) },
    { id: id("usr"), nome: "Helena Sousa", perfil: "Voluntário — distribuição", email: "helena.sousa@voluntarios.pt", password: "helena2026", ativo: true, ultimoAcesso: iso(0, today) },
    { id: id("usr"), nome: "Cozinha — Dona Alice", perfil: "Cozinha", email: "cozinha@cssaonicolau.pt", password: "alice2026", ativo: true, ultimoAcesso: iso(0, today) },
    { id: id("usr"), nome: "Armazém — Zé Manel", perfil: "Armazém", email: "armazem@cssaonicolau.pt", password: "manel2026", ativo: true, ultimoAcesso: iso(-2, today) },
    { id: id("usr"), nome: "Secretaria — Cristina Melo", perfil: "Administrativo", email: "secretaria@cssaonicolau.pt", password: "cristina2026", ativo: true, ultimoAcesso: iso(0, today) },
  ];

  return {
    agregados,
    pessoas,
    processos,
    contactos,
    documentos,
    inscricoes,
    atendimentos,
    armazens,
    artigos,
    lotes,
    movimentos,
    modelosCabaz,
    entregasCabaz,
    entregasRoupa,
    refeicoesContagem,
    refeicoesPresenca,
    cartoes,
    alertas: [],
    mensagens,
    registosAcesso,
    utilizadores,
  };
}
