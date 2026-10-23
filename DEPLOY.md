# Publicar o SGS (frontend + API)

A aplicação publica-se **num só serviço**: a API (Fastify) serve também o frontend compilado. Assim o
browser fala sempre com a mesma origem — não há CORS e o cookie de sessão é de primeira parte (funciona
no Safari/iPhone e com os bloqueios de cookies de terceiros). O GitHub Pages deixa de ser necessário.

```
Browser ──https──▶  sgs (Docker: API + frontend)  ──▶  PostgreSQL
```

## Opção recomendada: Render (já usado no projeto da Diocese do Sumbe)

O ficheiro [`render.yaml`](render.yaml) cria o serviço web (imagem Docker) e a base PostgreSQL, ambos em Frankfurt.

1. Fazer **merge do pull request** para o `main` (o Render faz deploy a partir do `main`).
2. Em [dashboard.render.com](https://dashboard.render.com): **New → Blueprint** → escolher o repositório `tioya2923/sgs-app`.
3. Quando pedir as variáveis marcadas como secretas, preencher:
   - `BOOTSTRAP_ADMIN_EMAIL` — e-mail da primeira conta de Direção;
   - `BOOTSTRAP_ADMIN_PASSWORD` — palavra-passe inicial (mínimo 10 caracteres). **É temporária:** a pessoa é obrigada a mudá-la no primeiro acesso.
4. Aguardar o primeiro deploy (cria a base, aplica as migrações, cria os 4 armazéns e os modelos de cabaz base).
5. Abrir o endereço `https://sgs-xxxx.onrender.com`, entrar com a conta acima e mudar a palavra-passe.
6. Apagar `BOOTSTRAP_ADMIN_PASSWORD` nas variáveis do serviço (já não é precisa) e criar as restantes contas em **Administração**.

Custos aproximados (confirmar no Render): serviço `starter` + base `basic-256mb`. Os planos gratuitos adormecem o
serviço e a base gratuita é apagada ao fim de algumas semanas — **não servem para dados reais**.

### Domínio próprio (opcional)
Render → serviço → **Settings → Custom Domains**; basta apontar o DNS. Não é preciso mudar mais nada (a aplicação usa caminhos relativos).

## Outras formas de correr

**Docker Compose** (VPS próprio, com um proxy HTTPS à frente, ex.: Caddy):

```bash
cp .env.docker.example .env    # preencher DB_PASSWORD, JWT_SECRET e a conta de Direção inicial
docker compose up -d --build   # app em http://localhost:3300 (ponha TRUST_PROXY=true atrás do proxy)
```

**Sem Docker:** `npm run build` com `VITE_BASE=/` na raiz, depois em `server/` `npm run build` e
`FRONTEND_DIR=../dist NODE_ENV=production node dist/server.js` (com `DATABASE_URL`, `JWT_SECRET` definidos e `npx prisma migrate deploy` antes).

## Variáveis de ambiente (servidor)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Ligação PostgreSQL (no Render vem da base gerida) |
| `JWT_SECRET` | sim | ≥ 32 caracteres aleatórios (o Render gera) |
| `FRONTEND_DIR` | — | Pasta do frontend; a imagem Docker já a define (`/app/public`) |
| `TRUST_PROXY` | atrás de proxy | `true` no Render/Caddy/nginx, para o rate-limit ver o IP real |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | 1.º arranque | Cria a primeira Direção se não existirem utilizadores |
| `CORS_ORIGINS`, `COOKIE_SAMESITE` | só se o frontend estiver noutro domínio | Ver abaixo |

### Frontend noutro domínio (ex.: GitHub Pages)
Não recomendado: o cookie de sessão passa a ser de terceiros e o Safari/iPhone bloqueia-o (a sessão perde-se ao recarregar).
Se mesmo assim for preciso: definir na API `CORS_ORIGINS=https://tioya2923.github.io` e `COOKIE_SAMESITE=none`, e no repositório a
variável de Actions `VITE_API_URL=https://<api>` (o workflow do Pages já a passa ao build). Com `VITE_API_URL` por definir, a
versão do Pages **não consegue iniciar sessão** — desative o workflow `Deploy to GitHub Pages` depois de migrar.

## Depois de publicar

- **Dados reais:** a base começa vazia (só armazéns e modelos de cabaz sem artigos). Registe as entradas de stock
  pela aplicação e edite a composição dos modelos em *Banco Solidário de Alimentos → Modelos de cabaz*.
  **Nunca** corra `npm run db:seed` em produção: apaga tudo (recusa-se sem `SEED_FORCE=1`).
- **Cópias de segurança (RGPD):** a base contém dados pessoais de pessoas apoiadas. Confirme no painel do fornecedor a política de
  backups da base e faça também cópias periódicas: `pg_dump "$DATABASE_URL" -Fc -f sgs-$(date +%F).dump`. Guarde-as cifradas.
- **Mensagens:** o envio real de SMS/e-mail ainda não está ligado a nenhum fornecedor; ficam registadas como enviadas/agendadas.
- **Atualizações:** cada push ao `main` faz novo deploy; as migrações correm automaticamente no arranque.
