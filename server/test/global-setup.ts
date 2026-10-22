import { execSync } from "node:child_process";

// Aplica as migrações à base de dados de teste (nunca à de desenvolvimento).
export default function setup() {
  const url = process.env["TEST_DATABASE_URL"] ?? "postgresql://postgres@127.0.0.1:5545/sgs_test";
  if (!/_test\b/.test(url)) throw new Error(`A base de dados de testes tem de terminar em _test (recebido: ${url})`);
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
