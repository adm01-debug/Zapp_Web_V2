# Guia de Contribuição — Zapp Web V2

## Início rápido

```bash
# 1. Clone o repositório
git clone https://github.com/adm01-debug/Zapp_Web_V2.git
cd Zapp_Web_V2

# 2. Instale dependências
bun install

# 3. Configure ambiente (desenvolvimento local — seção 0 do CLAUDE.md)
cp .env.example .env
# Adicione VITE_ZAPP_LOCAL_SUPABASE_URL e VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY

# 4. Rode em desenvolvimento
bun run dev
```

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilo | Tailwind CSS + shadcn/ui |
| Backend | Supabase Cloud (`tnnnlkbymytvtqngbbqh`) |
| Edge Functions | Deno (Supabase Functions) |
| WhatsApp | Evolution GO |
| Deploy | Vercel (front) + `deploy-functions.yml` (edges) |

## Fluxo de desenvolvimento

1. Trabalho acontece em banco **local** (`VITE_ZAPP_LOCAL_SUPABASE_URL`). Nunca desenvolver contra o banco de produção — ver seção 0 do CLAUDE.md.
2. Commits entram numa branch `dia/AAAA-MM-DD` (branch do lote diário).
3. Um PR por lote; o agente abre o PR mas **nunca** mergeia por conta própria.
4. Migrations novas ficam em `supabase/migrations/` e são registradas no ledger local antes do push.

## Comandos principais

```bash
bun run dev           # servidor de desenvolvimento
bun run build         # build de produção
bun run lint          # ESLint
bun run typecheck     # TypeScript sem emitir
bun run test          # testes unitários (node:test)
bun run test:e2e      # testes Playwright (banco local)
bun run test:e2e -- --project=chromium  # filtrado por projeto
```

## CI — 6 checks obrigatórios

Todo PR deve passar estes checks antes do merge:

| Check | Workflow |
|---|---|
| `🔎 TypeCheck` | `ci.yml` |
| `🧪 Unit Tests (1/3)` | `ci.yml` |
| `🧪 Unit Tests (2/3)` | `ci.yml` |
| `🧪 Unit Tests (3/3)` | `ci.yml` |
| `🏗️ Build` | `ci.yml` |
| `🧩 Node CI Scripts` | `db-guard.yml` |

`strict=true` está ligado: a branch do PR precisa estar atualizada com a `main` antes que os checks sejam aceitos.

## Padrão de commits

```
<tipo>(<escopo>): <descrição concisa>
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.

Exemplos:
```bash
feat(chat): adicionar botão de anexar arquivo
fix(auth): corrigir loop de redirect no login
ci(db-guard): estender contrato para migration W21
```

## Migrations

1. Criar arquivo em `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`.
2. Registrar no ledger local com `node scripts/db-audit/register-migration.mjs <arquivo.sql>`.
3. Verificar: `node scripts/db-audit/supabase-usage-guard.mjs` deve sair com `novas: 0`.
4. **Nunca aplicar DDL diretamente em produção** — o apply passa por `db-migrate.yml` com aprovação humana no environment `producao-ddl`.

## Checklist antes de abrir PR

- [ ] `bun run lint` sem erros
- [ ] `bun run typecheck` sem erros
- [ ] `bun run build` sem erros
- [ ] `bun run test` sem falhas
- [ ] Sem `console.log` de debug
- [ ] Sem secrets hardcoded
- [ ] Migrations com arquivo + registro no ledger local
- [ ] `render-workflow-docs.mjs --check` sem erros (se tocou workflows)

## Segurança

- **Nunca** commitar tokens, chaves ou senhas.
- Usar `.env` (não commitado) para variáveis sensíveis.
- Edge functions recebem secrets via `deploy-functions.yml` + Supabase Vault.
- Escrita no GitHub via MCP `GITHUB - MCP - FOREVER`; o token padrão retorna 403 em write.

## Recursos

- [CLAUDE.md](./CLAUDE.md) — regras do projeto (banco, migrations, fluxo)
- [docs/ci/README.md](./docs/ci/README.md) — inventário gerado dos workflows
- [Supabase Docs](https://supabase.com/docs)
- [Bun Docs](https://bun.sh/docs)
