# Mapa do repositório — referência para agentes

Ler quando precisar saber onde fica algo antes de buscar por texto.

## Onde olhar primeiro

| Precisa de | Leia |
|---|---|
| O que está quebrado e qual a prioridade | `docs/PRONTO_PRODUCAO.md` |
| Onde fica o código de cada fluxo (tela → hook → edge → tabela) | `docs/PRONTO_PRODUCAO.md`, tabela "Onde está o código" |
| Qual banco, migrations, Evolution, GitHub, Vercel, domínio | `AGENTS.md` + `docs/agentes/*.md` |
| Inventário de workflows de CI | `docs/ci/README.md` (gerado — não editar à mão) |
| **Contexto gerado para agentes — antes de qualquer tarefa ou planejamento** | **`docs/contexto/00-INDEX.md` na branch `contexto`** (`git show origin/contexto:docs/contexto/00-INDEX.md`): diz qual fonte é dona de cada fato e a ordem de leitura. Gerado a cada 10 min — não editar; regras humanas em `docs/contexto/regras/manual/` (main) |
| Histórico, auditorias, planos antigos | `docs/`, `docs/_arquivo/` (inclui `analise/`), `analise-prs/`, `inventario/` antigo, `qa/` — contexto, **não** fonte de verdade |

## Mapa rápido

| Onde | O que tem |
|---|---|
| `src/` | front Vite + React: `components/`, `hooks/` (por domínio: `team-chat/`, `inbox/`, `crm/`…), `pages/`, `services/`, `integrations/supabase/` (`client.ts`, `types.ts` gerado) |
| `supabase/functions/` | edge functions + `_shared/` (CORS em `cors-origins.ts`, rotas da Evolution GO em `evolution-go-routes.ts`) |
| `supabase/migrations/` | arquivos `.sql` (+ `_foreign/` e `_superseded/`, arquivo morto) |
| `supabase/schema-manifest.json` · `schema-catalog.json` | snapshot da estrutura real da produção — o esperado dos testes de contrato vem daqui |
| `scripts/db-audit/` | testes de banco em Postgres descartável (`*.test.sh`), `register-migration.mjs`, `supabase-usage-guard.mjs`, `replay-local.sh` |
| `scripts/ci/` | guardas do CI (`fila-merge.mjs`, `render-workflow-docs.mjs`, `check-claude-md-integrity.mjs`, baselines) |
| `e2e/` | specs Playwright; fixtures em `e2e/fixtures/` |
| `docs/` | `DEPLOYMENT.md`, `MIGRATIONS.md`, `INCIDENT-RUNBOOK.md`, `CONEXOES_WHATSAPP_RUNBOOK.md`, `ci/README.md` (gerado), `talkx/`, `audits/`, `agentes/` (esta pasta) |
| `inventario/estado/` | **estado real gerado por script — consulte antes de buscar por texto:** `banco.json` (tabelas, RLS, uso no código, órfãs, cron com falhas, WhatsApp, edges publicadas, `alertas`), `rotas.json` (URL/tela → menu, papéis, hooks, edges, RPCs, tabelas), `edges.json`. Refeito toda segunda pelo `inventario-estado-semanal.yml` (PR automático); como gerar à mão em `inventario/estado/README.md` |
| `docs/contexto/` (branch **`contexto`**) | contexto gerado para agentes — comece por `00-INDEX.md`: `supabase/` (banco oficial ao vivo — `scripts/supabase_snapshot/`), `codigo/` (rotas, módulos, hooks, edges, grafo, testes, convenções — `scripts/ai-context/gerar.mjs`), `regras/` (regras de negócio — `scripts/regras_negocio/`). Regerado a cada 10 min e a cada push por `contexto.yml`; **não existe em main** (só `docs/contexto/regras/manual/`). Ler: `git fetch origin contexto && git show origin/contexto:docs/contexto/00-INDEX.md`, MCP `get_file(ref=contexto)` ou raw; local: `bun run contexto:ia` (codigo/) e `python3 scripts/regras_negocio/generate.py --profile regras` |
| `docs/_arquivo/`, `qa/` | relatórios de sessões anteriores — leitura de contexto, não fonte de verdade; `inventario/estado/` é o inventário vivo |

## Automações (`scripts/`)

Automação vive em `scripts/<nome>/`, um subdiretório por automação, cada um com `README.md` dizendo o que
faz, como rodar e que secrets usa. Nada solto na raiz de `scripts/`. Scripts em `scripts/`; a saída deles
em `docs/` (ou numa branch gerada) — nunca misturar os dois. Não use `supabase/scripts` (o CLI do Supabase
é dono de `supabase/`) nem `src/scripts` (entra no bundle). **Leia o README da automação antes de alterar.**

## Comandos

O repo usa **bun**: há `bun.lock` e **não** há `package-lock.json`, então `npm ci` falha — use
`bun install --frozen-lockfile`.

- testes unitários só do que você tocou: `npx vitest run <caminho>` (a suíte inteira é longa; só o
  Team Chat leva ~90s);
- typecheck: `bun run typecheck` (`tsc -b --force`, lento) ou `npx tsc --noEmit -p tsconfig.app.json`
  para conferir rápido;
- lint dos arquivos tocados: `npx eslint <arquivos>`; E2E: `bun run test:e2e` (Playwright, 2 workers no CI e
  local — GR-016 em `playwright.config.ts`);
- guardas do CI antes do PR: `node --test scripts/ci/*.unit.mjs`, `node scripts/db-audit/supabase-usage-guard.mjs`,
  `node scripts/ci/check-claude-md-integrity.mjs` (vigia `AGENTS.md` + `docs/agentes/`).
- hooks do husky: `pre-commit` (lint ratchet dos arquivos staged, manifesto de edges), `commit-msg`
  (`scripts/ci/commit-msg-lint.mjs`), `pre-push` (typecheck ratchet, lint ratchet, `check-migration-drift`).

## Grafo de código (graphify) — detalhes

`bun run graph:setup` → `scripts/graphify/setup.sh`; precisa de `uv` ou `pipx`. `graphify-out/` (~50 MB) e os
hooks do husky ficam no `.gitignore`: cada clone gera os seus. Frescura: compare `git rev-parse --short HEAD`
com a linha "Built from commit" de `graphify-out/GRAPH_REPORT.md`; se divergir, `graphify update .` (só AST,
sem custo de API). Os hooks `PreToolUse` em `.claude/settings.json` chamam `graphify hook-guard` e não fazem
nada onde o graphify não estiver instalado. Em sessão de nuvem, `.claude/hooks/session-start.sh` instala o
graphify e gera o grafo em segundo plano (~3 min; log em `graphify-out/.session-start.log`; pula se o grafo
já é do commit atual).
