# Dossiê — claude/fix-unit-tests-createlogger-261019-1620 (PR #2110)

- Ref: `origin/claude/fix-unit-tests-createlogger-261019-1620` · tip `e34c3f4dc` · merge-base `ee2947491` (2026-10-18) · 3 commits, 21 arquivos, +26/-0.
- Triagem anterior (2026-11-08): OBSOLETA. Veredito agora: **INCORPORADA** (prova por arquivo abaixo).

## Propósito
1. `90645bb20` — adicionar `createLogger` ao `vi.mock('@/lib/logger')` em 20 testes (o mock sem `createLogger` quebrava quando o componente/`@/lib/audit` passou a importar `createLogger`/`getLogger`).
2. `c43641bbe` — `PGUSER: postgres` no step "Testar comparadores de catalogo, manifesto e migrations" do `db-guard.yml` (alegava resolver `FATAL: role "root" does not exist`).
3. `e34c3f4dc` — commit "consolidado" cuja mensagem lista fixes de outras PRs (#2091 #2035 #2097 #2104 #2042), mas o diff real contra o merge-base só contém os 21 arquivos acima (`git diff --stat ee2947491 e34c3f4dc`). Nada de hooks/edges/docs nesta branch.

## Arquivo × achado × evidência (origin/main = dac285f62)

| Arquivo | Lacuna mecânica | Achado | Evidência na main |
|---|---|---|---|
| `.github/workflows/db-guard.yml` | `PGUSER: postgres` no step | **Coberto de outra forma** (necessidade atendida pelo docker-shim E47) | job `Contrato DB offline` define `POSTGRES_SERVICE_USER: postgres` (db-guard.yml:73); `scripts/db-audit/docker-shim:22` `PG_USER="${POSTGRES_SERVICE_USER:-postgres}"` e usa `-U "$PG_USER"` (linhas 30/130/150). Step "Testar comparadores" (db-guard.yml:219-226) roda sem PGUSER e o workflow está verde nas 5 últimas execuções em `main` (última `dac285f62`, 2026-11-15T06:16Z, `gh run list --workflow db-guard.yml --branch main`). `git log -S'PGUSER' origin/main -- .github/workflows/db-guard.yml` = vazio (nunca entrou nem foi removido). Os únicos testes que leem `PGUSER` (`check-runtime-config.test.mjs:78`, `check-triple-parity.test.mjs:242`) injetam fixtures próprias no subprocesso (`check-triple-parity` exige `PGUSER='fixture'`), então `PGUSER=postgres` no step seria inócuo ou conflitante. |
| `src/components/admin/__tests__/GmailWebhookMonitor.falha-consulta.test.tsx` | `createLogger` | Incorporada (forma mais rica, com `withCorrelation`) | linhas 38-40 |
| `src/components/auth/__tests__/ProtectedRoute.acesso-negado.test.tsx` | `getLogger`+`createLogger` | Incorporada | linhas 49-52 |
| `src/components/auth/__tests__/ProtectedRoute.mfa.test.tsx` | `createLogger` | Incorporada | linhas 49-53 |
| `src/components/auth/__tests__/ProtectedRoute.saida.test.tsx` | `getLogger`+`createLogger` | Incorporada | linhas 35-38 |
| `src/components/calls/__tests__/IncomingCallAlert.canal.test.tsx` | `createLogger` | Incorporada | linhas 97-99 |
| `src/components/calls/__tests__/IncomingCallAlert.encerrada.test.tsx` | `createLogger` | Incorporada | linhas 114-116 |
| `src/components/calls/__tests__/IncomingCallAlert.foto.test.tsx` | `createLogger` | Incorporada | linhas 59-62 |
| `src/components/calls/__tests__/IncomingCallAlert.provider.test.tsx` | `createLogger` | Incorporada | linhas 97-99 |
| `src/components/calls/__tests__/IncomingCallAlert.ringtone.test.tsx` | `createLogger` | Incorporada | linhas 139-141 |
| `src/components/calls/__tests__/IncomingCallAlert.volume.test.tsx` | `createLogger` | Incorporada | linhas 155-157 |
| `src/components/calls/__tests__/telefoniaContraste.test.tsx` | `createLogger` | Incorporada | linhas 60-62 |
| `src/components/compliance/__tests__/LGPDComplianceView.test.tsx` | `createLogger` | Incorporada | linhas 32-34 |
| `src/components/queues/__tests__/AddMemberDialog.test.tsx` | `createLogger` | Incorporada | linhas 30-33 |
| `src/components/queues/__tests__/QueueGoalsDialog.salvarMetas.test.tsx` | `createLogger` | Incorporada | linhas 62-65 |
| `src/components/queues/__tests__/QueuesView.editar.test.tsx` | `createLogger` | Incorporada | linhas 89-92 |
| `src/components/queues/__tests__/QueuesView.metricasRpc.test.tsx` | `createLogger` | Incorporada | linhas 84-87 |
| `src/components/queues/__tests__/QueuesView.test.tsx` | `createLogger` | Incorporada | linhas 99-102 |
| `src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` | `createLogger` | Incorporada | linhas 14-16 |
| `src/components/transcriptions/__tests__/TranscriptionsHistoryView.a11y.test.tsx` | `getLogger`+`createLogger` | Incorporada | linhas 47-50 |
| `src/components/transcriptions/__tests__/TranscriptionsHistoryView.paginacao.test.tsx` | `getLogger`+`createLogger` | Incorporada | linhas 73-76 |

Forma na main (todos os 20 arquivos): `createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ ... })) }))` — superconjunto do que a branch adicionava (`createLogger: () => ({ error, debug, info, warn })`). O "CONFLICT" mecânico é só diferença textual do mock. `src/lib/logger.ts` exporta `createLogger` (l.89), `log` (l.97) e `getLogger` (l.100) na main.

Suite vitest não foi rodada localmente (sem `node_modules` no clone); evidência de que os 20 testes passam: `ci.yml` (`bun vitest run --shard=N/3`, ci.yml:109) verde nas 3 últimas execuções em `main` (última `dac285f62`, 2026-11-15T06:16Z).

## Veredito
**INCORPORADA** — 20/21 arquivos com a mesma intenção já na main em forma mais completa; o 21º (`PGUSER`) tem a necessidade (conexão ao Postgres do serviço como `postgres`) atendida pelo docker-shim E47 e o workflow está verde sem a linha. Nada a recuperar.

`apagar_branch_seguro = true`.

## Verificação adversarial

Parecer: **CONCORDO** com INCORPORADA. `apagar_branch_seguro = true`. Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Conferência independente (origin/main = `dac285f62`, merge-base `ee2947491`, tip `e34c3f4dc`):

1. **Diff total da branch**: `git diff --stat ee2947491 e34c3f4dc` = 21 arquivos, **+26/-0** — zero remoções, nenhum arquivo novo, nenhum hook/edge/migration/doc. `git log ee2947491..` = exatamente 3 commits (`90645bb20`, `c43641bbe`, `e34c3f4dc`). O commit "consolidado" `e34c3f4dc`, apesar da mensagem citar #2091 #2035 #2097 #2104 #2042, **não traz um único byte além dos 21 arquivos** — confirmado lendo o diff completo linha por linha. Não há trabalho escondido para resgatar.
2. **Os 20 testes**: varri os 20 caminhos com `git show origin/main:<arquivo> | grep -n 'createLogger\|getLogger'` — **20/20 têm `createLogger` na main**, e os 4 que a branch também acrescentava `getLogger` (`ProtectedRoute.acesso-negado` :51, `ProtectedRoute.saida` :37, `TranscriptionsHistoryView.a11y` :49, `TranscriptionsHistoryView.paginacao` :75) também têm. A forma da main é superconjunto: `createLogger: vi.fn(() => ({ debug, info, warn, error, withCorrelation: vi.fn(() => ({ … })) }))` vs. `createLogger: () => ({ error, debug, info, warn })` da branch. Nenhum arquivo ficou sem o mock.
3. **`.github/workflows/db-guard.yml` (`PGUSER: postgres`)**: único arquivo não literalmente incorporado, e **não é lacuna**:
   - `git log -S'PGUSER' origin/main -- .github/workflows/db-guard.yml` = **vazio** → nunca entrou e nunca foi removido de propósito; não há reversão a investigar.
   - O próprio step mudou de forma na main (`b24e31500`, `3c64a5454`): hoje exclui `talkx-engine-window-contract.test.mjs` do `node --test` e o roda isolado com retry de bootstrap — a causa raiz (contenção de container/socket) foi tratada por estrutura, não por env var.
   - A identidade `postgres` chega aos testes pelo caminho real: job-level `POSTGRES_SERVICE_USER: postgres` (db-guard.yml:73) lido por `scripts/db-audit/docker-shim:22` (`PG_USER="${POSTGRES_SERVICE_USER:-postgres}"`, usado em `psql -U "$PG_USER"`).
   - `PGUSER` ambiente seria **inerte ou nocivo**: os dois testes que o leem checam o env que o CLI monta no filho, não o ambiente — `check-runtime-config.test.mjs:78` exige `PGUSER === 'postgres'` vindo de `DESTINO_URL`, e `check-triple-parity.test.mjs:242` exige `PGUSER === 'fixture'`; `psql-safe.test.mjs:24,86` prova que `PG*` é derivado/sobrescrito (`PGUSER === 'fixture-user'`), não herdado.
   - **Prova de que falta nada**: `db-guard.yml` verde nas 5 últimas execuções de push em `main`, a última exatamente no tip atual `dac285f62` (run 43684697261, 2026-11-15T06:16:39Z).
4. **PR #2110**: `state=closed`, `merged=false`, `mergeable_state=dirty`, corpo do próprio dono: "delta líquido contra a main é zero (21 arquivos de teste, todas as alterações já estão na main)". Consistente com o achado.

Limitação declarada (não altera o veredito): **NÃO VERIFICADO** por execução local — vitest não foi rodado (sem `node_modules` neste clone); a passagem dos 20 testes na forma da main é sustentada pelo CI verde em `main`, não por execução minha.

Nenhuma lacuna adicional.
