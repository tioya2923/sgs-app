import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPrisma } from "./db.js";
import { garantirDadosBase, garantirPrimeiraDirecao } from "./startup.js";

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const app = await buildApp(config, prisma);

await garantirDadosBase(prisma);
await garantirPrimeiraDirecao(prisma, config, app.log);

const encerrar = async (sinal: string) => {
  app.log.info(`${sinal} recebido, a encerrar`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void encerrar("SIGINT"));
process.on("SIGTERM", () => void encerrar("SIGTERM"));

await app.listen({ port: config.PORT, host: config.HOST });
