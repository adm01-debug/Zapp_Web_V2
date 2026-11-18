# Resgate 2026-11-18 — lote 2 (adjudicação exaustiva de 89 branches)

Resultado da adjudicação **por blob** de todas as branches remotas contra a `main`
(histórico aprofundado para 1142 commits; `git merge-base` + comparação de OID por caminho).

| Medida | Valor |
|---|---|
| Branches remotas (sem `main`/`contexto`) | 88 |
| Caminhos que só existem em branch (ausentes na `main`) | 739 |
| …dos quais a `main` **removeu de propósito** depois do fork | 88 |
| …dos quais são **arquivos novos** criados pela branch | 651 |
| Novos já a caminho da `main` por PR aberta desta sessão | 51 |
| **Preservados neste lote** | **599 entradas** (482 caminhos únicos) |

Nada aqui é reescrito: cada arquivo entrou pelo **OID do blob original** (`git cat-file -e` em
todos; byte a byte o que o outro agente produziu).

## Onde cada coisa ficou

1. **Caminho original** (327 arquivos) — só conteúdo inerte: `analise-prs/dossies/PR-*.md`,
   `analise-prs/baseline/*`, `auditoria-supabase/inventario/*`, `auditoria-supabase/propostas/*`,
   `docs/copiloto/CV-016-coalescencia-delegada.md`. Nenhum é lido por build, typecheck, suites ou guards.
2. **`analise-prs/variantes-261118/<branch>/<caminho>`** (234 arquivos) — o mesmo caminho foi escrito
   por 2 branches com conteúdo diferente (ex.: `PR-2087.md` em `claude/fix-z017…` e em
   `claude_pink/dreamy-wright…`). Em vez de eleger um "vencedor", as duas versões ficam lado a lado.
3. **`analise-prs/resgate-261118-lote2/<caminho>`** (24 arquivos, esta pasta) — código que **executaria**
   se entrasse no caminho original (`scripts/ci/*.unit.mjs` roda pelo glob do `ci.yml`; `supabase/migrations/`
   entra no replay; `.github/workflows/` é regra 8; `src/` entra no build). Fica em quarentena com veredito abaixo.
   Os 14 blobs que já estão em `analise-prs/resgate-regra8-261118/` (PR #3250) **não foram duplicados**.

## Vereditos da quarentena (o que falta para promover, ou por que não promover)

| Arquivo | Origem | Veredito |
|---|---|---|
| `.github/workflows/auto-update-pr-branch.yml` | `claude/fix-z017-z020-auth-cors-261018-1950` | Regra 8 (workflow). Resolve o mesmo problema da fila de merge (#3231) por outro caminho; **decidir qual dos dois** antes de ativar. |
| `.github/workflows/scorecard.yml` | `claude/w85-w86-w87-ossf-scorecard` | Regra 8 (workflow). OSSF Scorecard: custo de CI + token; decisão do dono. |
| `scripts/ci/aplicar-perimetro.{mjs,unit.mjs}`, `docker-pins.unit.mjs` | `claude/fix-ga-fase78-perimetro-custo-261020-2200` | Guard que **falha se o alvo não existir** — precisa dos pins/perímetro do GA78 na `main` antes do glob pegar. Duas versões do `aplicar-perimetro.mjs` em `variantes-261118/`. |
| `scripts/ci/compose-confirm-hash.unit.mjs`, `proof-sha.unit.mjs`, `scripts/db-audit/{compose-confirm-hash,proof-sha}.mjs` | `claude/fix-ga-resto-dbmigrate-20261021-0729` | Pipeline GA13-17 (hash de confirmação + prova de SHA). Promover **junto** com os já preservados em `resgate-regra8-261118/` e com a mudança no `db-guard.yml` (regra 8). |
| `scripts/ci/check-edge-envs.mjs` + `edge-env-baseline.json`, `check-notifica-falha-names.mjs`, `claude-md-guard.mjs` | `claude_pink/cool-dijkstra-xk9ek2` | Guards GA01-GA100. `claude-md-guard` toca a política do `.claude/CLAUDE.md` (regra 8). Os outros precisam do `.unit.mjs` par e de entrada nominal no `db-guard.yml`. |
| `scripts/db-audit/validate-post-apply.mjs`, `verify-ledger-statements.unit.mjs` | `claude_pink/cool-dijkstra-xk9ek2` | Ledger GA25. O `.unit.mjs` **roda pelo glob** assim que entrar em `scripts/ci/`; depende do `validate-post-apply.mjs` e do ledger ao vivo. |
| `src/components/copilot/RadarPhase6Panel.tsx` | `claude/fix-radar-fase6-cv056-shortcuts-261108-2335` | **Superado**: a `main` implementa CV-051–060 em `src/components/inbox/copilot/RadarPanel.tsx` (atalhos CV-056 em `:136` e `:503`, com `RadarPanel.test.tsx`). Painel alternativo da mesma spec; não integrar. |
| `src/components/talkx/__tests__/TalkXSegments.crmUnavailable.test.tsx` | `claude/feat-talkx-x048-estados-servico-261101-2100` | **Obsoleto por decisão documentada**: o teste moca `crm: 'unavailable'`, campo que `useTalkXServiceStatus` **não expõe de propósito** (`src/hooks/integrations/useTalkXServiceStatus.ts:19-22`: "não há sinal no código atual, então não foi inventado"). O `ServiceStatusSheet` da `main` já abre sozinho pelo estado de WhatsApp desconectado (`kit/states.tsx`). Só volta se o dono decidir criar um sinal de disponibilidade do CRM. |
| `src/hooks/useMotionSeguro.ts` + teste | `hermes/telefonia-fase8-motion-a11y-responsivo-…` | Hook utilitário (T75) sem consumidor na `main` — integrar sem uso seria código morto. Promover quando uma tela de Telefonia passar a chamar `anima/duracao/atraso`. |
| `supabase/migrations/20261016193300_copilot_tick_trigger.sql`, `…193400_copilot_presence.sql` | `claude/feat-copiloto-cv011-020-migrations-261016-1930` | DDL em produção (regra 8). Completam as 4 migrations do copiloto já em `resgate-regra8-261118/`. Fluxo de `docs/agentes/banco.md`. |
| `supabase/migrations/20261016250000_e2e_fixture_message_rpc.sql` | `claude_pink/cool-dijkstra-xk9ek2` | DDL (regra 8). RPC para fixtures de E2E — conferir se o RPC já existe no banco oficial antes de aplicar. |
| `supabase/migrations/20261026100000_search_event_rpc.sql` | `codex/publish-followup-20261021` | DDL (regra 8). RPC de evento de busca. |
| `supabase/migrations/20261030200000_copilot_live_motor.sql` | `claude/radar-motor-copilot-live-301030` (= `resolve-2381-from-main`, mesmo blob) | DDL (regra 8). Motor live do copiloto. |
| `supabase/migrations/20261101133000_outbound_post_started.sql` | `claude/feat-message-delivery-post-iniciado-261101-1937` | DDL (regra 8). Estado `post_started` de entrega. |

## Verificação

- 599/599 blobs existem no repositório (`git cat-file -e`, nenhum inventado).
- Zero colisão de destino (checado antes de montar a árvore).
- Guards: o glob `scripts/ci/*.unit.mjs` **não** alcança nenhum caminho deste lote (todos fora de `scripts/ci/`).

Depois deste merge, as branches de origem podem ser fechadas sem perda: tudo que elas tinham e a `main`
não tinha está aqui, legível, byte a byte.
