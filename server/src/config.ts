import "dotenv/config";
import { z } from "zod";

// Variáveis presentes mas vazias (comum em painéis de deploy) contam como não definidas.
const vazioParaUndefined = <T extends z.ZodType>(t: T) => z.preprocess((v) => (v === "" ? undefined : v), t);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3300),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa de pelo menos 32 caracteres"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((o) => o.trim()).filter(Boolean)),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  LOGIN_MAX_FAILS: z.coerce.number().int().positive().default(5),
  // Pedidos de login por minuto e por IP (o bloqueio por conta é independente).
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  // Atrás de um proxy (Render, Fly, nginx…) para o rate-limit ver o IP real.
  TRUST_PROXY: z.coerce.boolean().default(false),
  // Cookie do refresh token. Para o frontend noutro domínio (GitHub Pages) usar
  // COOKIE_SAMESITE=none (exige HTTPS).
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  // Pasta com o frontend compilado: se definida, a própria API serve a aplicação (mesma origem,
  // sem CORS e com cookies de primeira parte). Ver DEPLOY.md.
  FRONTEND_DIR: vazioParaUndefined(z.string().optional()),
  // Primeira conta de Direção numa instalação sem utilizadores (ver src/startup.ts).
  BOOTSTRAP_ADMIN_EMAIL: vazioParaUndefined(z.string().email().optional()),
  BOOTSTRAP_ADMIN_PASSWORD: vazioParaUndefined(z.string().min(10, "BOOTSTRAP_ADMIN_PASSWORD precisa de pelo menos 10 caracteres").optional()),
  BOOTSTRAP_ADMIN_NAME: vazioParaUndefined(z.string().optional()).transform((v) => v ?? "Direção"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.JWT_SECRET.startsWith("dev-only")) {
    throw new Error("JWT_SECRET de desenvolvimento não pode ser usado em produção");
  }
  return parsed.data;
}
