# SGS — API (servidor)

Backend do Sistema de Gestão Social do Centro Social Paroquial de São Nicolau.

**Stack:** Node 22+ · TypeScript · Fastify 5 · Zod · PostgreSQL 18 · Prisma 7 · argon2id · JWT + refresh token rotativo.

## Arranque local

Precisa de uma base PostgreSQL. Com uma instalação local (ex.: `C:\Program Files\PostgreSQL\18`):

```bash
# 1. base de dados privada de desenvolvimento (porta 5545), criada uma vez
initdb -D ../../sgs-pgdata -U postgres --auth=trust -E UTF8
pg_ctl -D ../../sgs-pgdata -o "-p 5545 -h 127.0.0.1" start
psql -h 127.0.0.1 -p 5545 -U postgres -c "CREATE DATABASE sgs;" -c "CREATE DATABASE sgs_test;"

# 2. configuração
cp .env.example .env        # ajuste DATABASE_URL e JWT_SECRET

# 3. dependências, migrações e dados de demonstração
npm install
npx prisma migrate deploy
npm run db:seed

# 4. servidor em http://localhost:3300
npm run dev
```

O frontend (`npm run dev` na raiz) fala com `http://localhost:3300` (variável `VITE_API_URL`).

**Contas de demonstração** (palavra-passe `SEED_PASSWORD`, por omissão `Demo-Sgs-2026!`):
`direcao@cssaonicolau.pt`, `marta.ribeiro@cssaonicolau.pt`, `helena.sousa@voluntarios.pt`,
`cozinha@cssaonicolau.pt`, `armazem@cssaonicolau.pt`, `secretaria@cssaonicolau.pt`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API com recarregamento automático |
| `npm test` | Testes (Vitest) contra a base `sgs_test` (migrações aplicadas automaticamente) |
| `npm run typecheck` | Verificação de tipos |
| `npm run db:migrate` | Cria/aplica uma migração em desenvolvimento |
| `npm run db:deploy` | Aplica migrações pendentes (produção) |
| `npm run db:seed` | **Apaga tudo** e repõe os dados de demonstração (recusa em produção sem `SEED_FORCE=1`) |
| `npm run build` / `npm start` | Compila e corre a versão de produção |

## Segurança

- Palavras-passe com argon2id; mínimo de 10 caracteres; contas novas têm de mudar a palavra-passe no primeiro acesso.
- Token de acesso JWT de 15 min (em memória no browser) + refresh token opaco de uso único, em cookie `httpOnly`;
  um refresh token reutilizado fecha todas as sessões da conta.
- Bloqueio temporário da conta após 5 tentativas falhadas; rate-limit por IP; cabeçalhos `helmet`; CORS só para as origens configuradas.
- Permissões por perfil aplicadas **no servidor** (`src/domain/permissoes.ts`), antes da validação do pedido. Cada perfil só recebe
  os dados a que tem direito (`GET /api/v1/bootstrap`): por exemplo, o voluntário não recebe moradas nem processos.
- Auditoria (`registos_acesso`): logins, alterações a dados sensíveis e exportações CSV.
- Operações de stock atómicas: lotes bloqueados (`FOR UPDATE`), nunca stock negativo (também por `CHECK` na base de dados).

## Produção

`docker compose up -d --build` (API + PostgreSQL). Defina `DB_PASSWORD`, `JWT_SECRET` e `CORS_ORIGINS` no `.env`.

- O frontend publicado no GitHub Pages está noutro domínio: use HTTPS na API e `COOKIE_SAMESITE=none`. O ideal é servir a API
  no mesmo site (ex.: `api.` sob o domínio do centro) e usar `lax`.
- Compile o frontend com `VITE_API_URL=https://<endereço da API>` (no workflow do GitHub Pages).
- Crie as contas reais pela Administração e **não** corra `db:seed` em produção.
- Faça cópias de segurança regulares da base de dados (`pg_dump`): contém dados pessoais de pessoas apoiadas (RGPD).

## Estrutura

```
prisma/        schema, migrações (com CHECKs de integridade), seed
src/domain/    tipos, schemas Zod e matriz de permissões
src/services/  stock (FIFO), numeração, alertas
src/modules/   rotas: auth, bootstrap, casos, existencias, distribuicao, cartoes, mensagens, utilizadores, alertas, relatorios
test/          testes de integração (fastify.inject) e unitários
```
