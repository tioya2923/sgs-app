import type { Perfil } from "../types";

export interface NavModule {
  title: string;
  path: string;
  perfis: Perfil[] | "todos";
}

export interface NavGroup {
  label: string | null;
  modules: NavModule[];
}

export const NAV: NavGroup[] = [
  {
    label: null,
    modules: [{ title: "Painel", path: "/", perfis: "todos" }],
  },
  {
    label: "Pessoas",
    modules: [
      {
        title: "Porta Aberta",
        path: "/porta-aberta",
        perfis: ["Direção", "Técnico de ação social", "Voluntário — distribuição"],
      },
    ],
  },
  {
    label: "Serviços",
    modules: [
      {
        title: "Banco Solidário de Alimentos",
        path: "/banco-alimentos",
        perfis: ["Direção", "Técnico de ação social", "Voluntário — distribuição", "Armazém"],
      },
      {
        title: "Residência",
        path: "/residencia",
        perfis: ["Direção", "Armazém", "Cozinha"],
      },
      {
        title: "Casa da Caridade",
        path: "/casa-caridade",
        perfis: ["Direção", "Técnico de ação social", "Cozinha"],
      },
      {
        title: "Banco Solidário de Roupa",
        path: "/banco-roupa",
        perfis: ["Direção", "Técnico de ação social", "Voluntário — distribuição"],
      },
    ],
  },
  {
    label: "Recursos",
    modules: [
      {
        title: "Existências",
        path: "/existencias",
        perfis: ["Direção", "Armazém"],
      },
      {
        title: "Cartões Pingo Doce",
        path: "/cartoes",
        perfis: ["Direção", "Administrativo"],
      },
    ],
  },
  {
    label: "Comunicação",
    modules: [
      {
        title: "Alertas automáticos",
        path: "/alertas",
        perfis: "todos",
      },
      {
        title: "Mensagens",
        path: "/mensagens",
        perfis: ["Direção", "Técnico de ação social"],
      },
    ],
  },
  {
    label: "Gestão",
    modules: [
      {
        title: "Relatórios",
        path: "/relatorios",
        perfis: ["Direção", "Administrativo"],
      },
      {
        title: "Administração",
        path: "/administracao",
        perfis: ["Direção"],
      },
    ],
  },
];

export function podeAceder(perfil: Perfil, permitido: Perfil[] | "todos"): boolean {
  if (permitido === "todos") return true;
  if (perfil === "Direção") return true;
  return permitido.includes(perfil);
}

export function moduloVisivel(path: string, perfil: Perfil): boolean {
  for (const grupo of NAV) {
    const mod = grupo.modules.find((m) => m.path === path);
    if (mod) return podeAceder(perfil, mod.perfis);
  }
  return true;
}
