import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContexto, EMAILS, PASSWORD, type Ctx } from "./helpers.js";

let ctx: Ctx;
beforeAll(async () => {
  ctx = await criarContexto();
});
afterAll(() => ctx.fechar());

const post = (url: string, payload?: unknown, cookies?: Record<string, string>, headers?: Record<string, string>) =>
  ctx.app.inject({ method: "POST", url: `/api/v1/auth${url}`, payload: payload as object, cookies, headers });

function refreshDe(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.find((c) => c.name === "sgs_refresh")?.value ?? "";
}

describe("autenticação", () => {
  it("faz login, devolve token e cookie httpOnly sem expor a password", async () => {
    const res = await post("/login", { email: EMAILS.direcao.toUpperCase(), password: PASSWORD });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.utilizador).toMatchObject({ perfil: "Direção", email: EMAILS.direcao });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash|"password"/i);
    const c = res.cookies.find((x) => x.name === "sgs_refresh") as { httpOnly?: boolean; path?: string } | undefined;
    expect(c?.httpOnly).toBe(true);
    expect(c?.path).toBe("/api/v1/auth");
  });

  it("rejeita password errada e e-mail desconhecido com a mesma mensagem", async () => {
    const a = await post("/login", { email: EMAILS.tecnico, password: "errada-errada" });
    const b = await post("/login", { email: "ninguem@exemplo.pt", password: "errada-errada" });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().mensagem).toBe(b.json().mensagem);
  });

  it("bloqueia a conta após demasiadas tentativas, mesmo com a password certa", async () => {
    for (let i = 0; i < 3; i++) await post("/login", { email: EMAILS.cozinha, password: "errada-errada" });
    const res = await post("/login", { email: EMAILS.cozinha, password: PASSWORD });
    expect(res.statusCode).toBe(429);
    await ctx.prisma.utilizador.update({ where: { email: EMAILS.cozinha }, data: { lockedUntil: null, failedLogins: 0 } });
    expect((await post("/login", { email: EMAILS.cozinha, password: PASSWORD })).statusCode).toBe(200);
  });

  it("rotaciona o refresh token e fecha todas as sessões se um token usado reaparecer", async () => {
    const login = await post("/login", { email: EMAILS.armazem, password: PASSWORD });
    const r1 = refreshDe(login);
    const refresh = await post("/refresh", undefined, { sgs_refresh: r1 });
    expect(refresh.statusCode).toBe(200);
    const r2 = refreshDe(refresh);
    expect(r2).not.toBe(r1);

    const reuso = await post("/refresh", undefined, { sgs_refresh: r1 });
    expect(reuso.statusCode).toBe(401);
    // o token novo também foi revogado
    expect((await post("/refresh", undefined, { sgs_refresh: r2 })).statusCode).toBe(401);
  });

  it("logout revoga o refresh token", async () => {
    const login = await post("/login", { email: EMAILS.admin, password: PASSWORD });
    const r = refreshDe(login);
    expect((await post("/logout", undefined, { sgs_refresh: r })).statusCode).toBe(204);
    expect((await post("/refresh", undefined, { sgs_refresh: r })).statusCode).toBe(401);
  });

  it("exige token válido em /me e perde acesso quando a conta é desativada", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me" })).statusCode).toBe(401);
    const h = await ctx.login(EMAILS.voluntario);
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: h })).statusCode).toBe(200);
    await ctx.prisma.utilizador.update({ where: { email: EMAILS.voluntario }, data: { ativo: false } });
    expect((await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: h })).statusCode).toBe(401);
    await ctx.prisma.utilizador.update({ where: { email: EMAILS.voluntario }, data: { ativo: true } });
  });

  it("muda a password respeitando a política e invalida as sessões antigas", async () => {
    const login = await post("/login", { email: EMAILS.tecnico, password: PASSWORD });
    const h = { Authorization: `Bearer ${login.json().accessToken}` };
    const antigo = refreshDe(login);

    expect((await post("/change-password", { atual: PASSWORD, nova: "curta" }, undefined, h)).statusCode).toBe(400);
    expect((await post("/change-password", { atual: "outra-errada", nova: "Nova-Password-9!" }, undefined, h)).statusCode).toBe(400);
    const ok = await post("/change-password", { atual: PASSWORD, nova: "Nova-Password-9!" }, undefined, h);
    expect(ok.statusCode).toBe(204);

    expect((await post("/refresh", undefined, { sgs_refresh: antigo })).statusCode).toBe(401);
    expect((await post("/login", { email: EMAILS.tecnico, password: PASSWORD })).statusCode).toBe(401);
    expect((await post("/login", { email: EMAILS.tecnico, password: "Nova-Password-9!" })).statusCode).toBe(200);
  });

  it("envia cabeçalhos de segurança e regista tentativas na auditoria", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeTruthy();
    const acessos = await ctx.prisma.registoAcesso.count({ where: { acao: { in: ["Login", "Login falhado"] } } });
    expect(acessos).toBeGreaterThan(3);
  });
});
