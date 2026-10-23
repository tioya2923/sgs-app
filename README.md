# SGS App

Aplicação web em React, TypeScript e Vite para apoiar a gestão de operações sociais e de atendimento, com foco em organização de informações e navegação entre módulos como painel, alertas, banco de alimentos, banco de roupas, residências, cartões e administração.

## Visão geral

O projeto foi criado para oferecer uma interface simples e objetiva para acompanhar demandas operacionais, organizar cadastros e facilitar o acesso rápido a funcionalidades essenciais em um ambiente de apoio social.

## Funcionalidades

- Painel inicial com visão geral das atividades
- Gestão de alertas e mensagens
- Cadastro e acompanhamento de itens em banco de alimentos e banco de roupas
- Registro de informações relacionadas a residências, cartões e portas abertas
- Navegação por rotas organizadas em páginas separadas
- Interface responsiva com componentes reutilizáveis

## Tecnologias

- React 19
- TypeScript
- Vite
- React Router DOM
- Tailwind CSS
- Lucide React

## Backend

A aplicação usa uma API própria (pasta [`server/`](server/README.md): Fastify + PostgreSQL + Prisma). Os dados deixaram de
ficar no browser: login real, permissões aplicadas no servidor e dados partilhados entre dispositivos.
Arranque primeiro a API (ver `server/README.md`) e depois o frontend. O endereço da API configura-se com `VITE_API_URL`
(por omissão `http://localhost:3300`; ver `.env.example`).

## Como executar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
3. Abra o endereço exibido no terminal, geralmente:
   ```text
   http://localhost:5173
   ```

## Build

Para gerar a versão de produção:

```bash
npm run build
```

Os arquivos prontos para publicação serão gerados na pasta dist.

## Publicação

A aplicação publica-se num só serviço (a API serve também o frontend), com PostgreSQL gerido. Instruções passo a passo em
[`DEPLOY.md`](DEPLOY.md) (Render via `render.yaml`, Docker Compose ou manual).

O workflow `Deploy to GitHub Pages` continua a existir, mas o site do Pages só funciona se `VITE_API_URL` apontar para uma API
publicada (e o cookie de sessão é de terceiros, o que o Safari bloqueia). Depois de migrar para o deploy num só serviço, desative-o.

## Licença

Este projeto está licenciado sob a licença MIT. Consulte o arquivo LICENSE para mais detalhes.

## Contribuição

Contribuições são bem-vindas. Para isso, faça um fork do repositório, crie uma branch com suas alterações e abra um pull request.
