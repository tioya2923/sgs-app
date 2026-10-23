import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createPrisma, type PrismaClient } from "../src/db.js";
import { garantirDadosBase, garantirPrimeiraDirecao } from "../src/startup.js";

let prisma: PrismaClient;
const log = { info: () => undefined, warn: () => undefined };

beforeAll(() => {
  prisma = createPrisma(process.env["DATABASE_URL"]!);
});
afterAll(() => prisma.$disconnect());

const limpar = () => prisma.$executeRawUnsafe('TRUNCATE "refresh_tokens","utilizadores","modelos_cabaz","artigos","armazens" CASCADE');

describe("arranque numa base nova", () => {
  it("cria os armazéns e os modelos de cabaz base, sem duplicar ao repetir", async () => {
    await limpar();
    await garantirDadosBase(prisma);
    await garantirDadosBase(prisma);
    expect((await prisma.armazem.findMany({ orderBy: { codigo: "asc" } })).map((a) => a.codigo)).toEqual(["BSA", "BSR", "CDC", "RES"]);
    const modelos = await prisma.modeloCabaz.findMany();
    expect(modelos).toHaveLength(3);
    // a app escolhe o modelo pelo nome: têm de conter estas palavras
    for (const parte of ["Pessoa Só", "até 4", "5+"]) expect(modelos.some((m) => m.nome.includes(parte))).toBe(true);
  });

  it("cria a primeira Direção só quando não há utilizadores e obriga a mudar a palavra-passe", async () => {
    await limpar();
    const semVariaveis = loadConfig({ ...process.env, BOOTSTRAP_ADMIN_EMAIL: "", BOOTSTRAP_ADMIN_PASSWORD: "" });
    await garantirPrimeiraDirecao(prisma, semVariaveis, log);
    expect(await prisma.utilizador.count()).toBe(0);

    const config = loadConfig({ ...process.env, BOOTSTRAP_ADMIN_EMAIL: "Direcao@Exemplo.pt", BOOTSTRAP_ADMIN_PASSWORD: "Inicial-Segura-1", BOOTSTRAP_ADMIN_NAME: "" });
    await garantirPrimeiraDirecao(prisma, config, log);
    await garantirPrimeiraDirecao(prisma, config, log);
    const u = await prisma.utilizador.findMany();
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ email: "direcao@exemplo.pt", perfil: "Direção", nome: "Direção", mustChangePassword: true, ativo: true });
    expect(u[0]!.passwordHash).not.toContain("Inicial-Segura-1");

    const app = await buildApp({ ...config, LOGIN_RATE_MAX: 1000 }, prisma);
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "direcao@exemplo.pt", password: "Inicial-Segura-1" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().utilizador.mustChangePassword).toBe(true);
    await app.close();
  });

  it("recusa BOOTSTRAP_ADMIN_PASSWORD curta", () => {
    expect(() => loadConfig({ ...process.env, BOOTSTRAP_ADMIN_EMAIL: "a@b.pt", BOOTSTRAP_ADMIN_PASSWORD: "curta" })).toThrow(/BOOTSTRAP_ADMIN_PASSWORD/);
  });
});

describe("API a servir o frontend", () => {
  it("serve ficheiros, devolve o index nas rotas do React Router e 404 JSON na API", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sgs-front-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>SGS</title><div id=root></div>");
    writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
    writeFileSync(join(dir, "sw.js"), "// sw");

    const app = await buildApp(loadConfig({ ...process.env, FRONTEND_DIR: dir }), prisma);
    const html = { accept: "text/html" };

    const raiz = await app.inject({ method: "GET", url: "/", headers: html });
    expect(raiz.statusCode).toBe(200);
    expect(raiz.body).toContain("<title>SGS</title>");
    expect(raiz.headers["cache-control"]).toBe("no-cache");

    const rota = await app.inject({ method: "GET", url: "/porta-aberta", headers: html });
    expect(rota.statusCode).toBe(200);
    expect(rota.body).toContain("<title>SGS</title>");

    const asset = await app.inject({ method: "GET", url: "/assets/app-abc123.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect((await app.inject({ method: "GET", url: "/sw.js" })).headers["cache-control"]).toBe("no-cache");

    const api404 = await app.inject({ method: "GET", url: "/api/v1/nada", headers: html });
    expect(api404.statusCode).toBe(404);
    expect(api404.json().erro).toBe("nao_encontrado");
    expect((await app.inject({ method: "GET", url: "/assets/nao-existe.js" })).statusCode).toBe(404);

    // a API continua a funcionar ao lado do frontend
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });

  it("falha cedo se FRONTEND_DIR não tiver index.html", async () => {
    const vazio = mkdtempSync(join(tmpdir(), "sgs-vazio-"));
    await expect(buildApp(loadConfig({ ...process.env, FRONTEND_DIR: vazio }), prisma)).rejects.toThrow(/index.html/);
  });
});
