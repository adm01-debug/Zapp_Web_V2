# Varredura de PRs e branches — 16/11/2026

Sessão `session_01N1ArYPVtJ9CutqjaJRoe4a`. `main` no início: `4bc94cb75`.
Tudo abaixo tem evidência de comando, arquivo:linha ou consulta ao banco oficial.

## 1. O que havia

**5 PRs abertas** (o retrato de 30 PRs do `/merge-prs` está vencido; sessões anteriores já limparam):

| PR | Autor | O que é | Estado no início |
|---|---|---|---|
| #3164 | dependabot | `peter-evans/create-pull-request` 8.1.2 → 8.1.3 | CLEAN, tudo verde |
| #3165 | dependabot | grupo `deps-semanal`, 16 updates | `🧩 Node CI Scripts` + E2E vermelhos |
| #3166 | claude (sessão anterior) | handoff da sessão + 2 endereços errados do relatório | CLEAN, 3 required verdes |
| #3158 | claude (sessão anterior) | Copiloto: RLS do supervisor | draft → `Build`/`Unit Tests` SKIPPED |
| #3160 | claude (sessão anterior) | Copiloto: tick transacional | draft → `Build`/`Unit Tests` SKIPPED |

**289 branches remotas.** Critério de incorporação: para cada branch, os arquivos que ela alterou desde a
merge-base (`git diff --name-only origin/main...origin/B`) foram comparados com a `main`
(`git diff --name-only origin/main..origin/B -- $files`). Resultado: **275 sem um byte fora da main**,
14 com conteúdo pendente — das quais 5 eram as PRs acima.

## 2. As 9 branches órfãs (conteúdo pendente, sem PR)

| Branch | Veredito | Evidência |
|---|---|---|
| `claude/fix-talkx-wizard-remonta-rascunho-261114-0715` | fix já na main por outra escrita; **teste resgatado** | `TalkXView.tsx` da main tem `keepLocalDraft` (~155) e `routedCampaign?.id !== localDraftRouteId` (~271); o cherry-pick conflita só nesses 2 pontos |
| `claude/feat-copiloto-edges-261115-1555` | código já na main; **contrato resgatado** | `_shared/ai-feature-flags.ts` com blob idêntico; `ai-multimodal-analysis/index.ts` já usa `toInlineImage` + `bearerTokenDoPedido` |
| `claude/fix-e2e-onboarding-modal-oculta-261114-0709` | já implementada | `e2e/fixtures/onboarding-isolated.ts` da main já usa `includeHidden: true` em main/heading/tab, pelo mesmo motivo (`hideOthers`) |
| `claude/perf-bundle-inicial-261113` | superada pela main | `vite.config.ts` da main já tem `use-sync-external-store` no `vendor-ui`, `vendor-motion` separado, e a decisão de `date-fns` revista depois |
| `claude/fix-multiplix-retomar-seguro-261114` | já incorporada | hooks, migration `20261114130000` e testes com blob idêntico; `multiplix-send/index.ts`, `ESTADO.md` e `db-guard.yml` sem nenhuma linha nova faltando |
| `claude/fix-department-invites-rls-261114-1200` | já implementada e **aplicada** | arquivo na main como `20261114121000_...` (conteúdo idêntico); policy `dept_invites_select_admin` existe em `pg_policies`; version no ledger |
| `claude/fix-merge-contato-telefone-secundario-261114-0000` | já implementada e **aplicada** | arquivo na main como `20261114120500_...`; version no ledger |
| `dependabot/bun/deps-semanal-0b89910d44` | superada pela #3165 | propunha o mesmo pin 1.65.0 e o mesmo digest `sha256:9beb54…` |
| `claude/wizardly-ride-dimxnt` | **descartar — remoção já revertida de propósito** | `.github/workflows/vercel-env-cleanup.yml` da main: "14/11/2026: este workflow foi removido por engano e restaurado no mesmo dia"; 7 segredos de servidor na Vercel mantêm a limpeza pendente |

A colisão de versão que as duas branches de migration tinham (`20261114120000` nas duas, já pertencente a
`set_conversations_status_encerramento_repetido`) foi resolvida por quem as incorporou, renumerando.

## 3. O que foi resgatado

- **#3167** — `src/components/talkx/__tests__/TalkXView.rascunhoNaoRemonta.test.tsx` (97 linhas).
  `vitest run` contra a main: 2/2 passando. Nenhuma linha de produção.
- **#3168** (mergeada em `fb1b4a66`) — `tests/contracts/ai-copilot-radar-guards.contract.test.ts` (227
  linhas). 4/4 passando. Uma asserção ajustada: o caso do Storage 403 esperava 422 (status fixo da
  implementação antiga) e a main usa o mapa `ERROR_STATUS` de `_shared/ai-image-input.ts:67-73`
  (`IMAGE_DOWNLOAD_FAILED → 502`). As asserções que seguram o risco (não gastar provedor pago, não vazar
  `bucket/path`) ficaram intactas. Blob conferido byte a byte: `bcfa3eda8b879126696709dc7146f9b4975e5942`.
- **#3169** — correção da #3165: `@playwright/test` subiu para 1.65.0 no `bun.lock` mas os pins ficaram em
  1.64.1. Causa exata: `scripts/ci/playwright-version-lock.unit.mjs:70` contra `ci.yml:484` e
  `e2e-talkx.yml:94`. Sobe os 5 pontos (os dois workflows, `.github/toolchain.json`,
  `scripts/e2e-isolated/network-proof-policy.mjs` e `images.lock.json`), com o digest
  `sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe` confirmado no registry da
  Microsoft. Guards: 162/162 passando. `ci.yml` com +1/−1 contra a main — nenhum trecho perdido.

## 4. O incidente de merge

Todas as rotas de merge do GitHub falharam durante a sessão:

- `PUT /repos/.../pulls/{3164,3166,3167}/merge` → `error code: 502` (texto puro) e, na retentativa,
  `405 {"message":"Merge already in progress"}`
- `POST /repos/.../merges` → 502
- mutation GraphQL `mergePullRequest` → 502
- `PUT /repos/.../pulls/3167/update-branch` → 502

Descartados com evidência: rulesets (`/rulesets` e `/rules/branches/main` vazios), check pendente
(`/commits/<sha>/status` = success), rate limit (4935/5000), tamanho do repositório, e o proxy do contêiner
(`recentRelayFailures` sem nenhuma entrada para `api.github.com`).

O `405` é JSON do GitHub e só existe quando o GitHub **tomou o lock de merge da PR** — ou seja, o pedido
chega e o job de merge não conclui. Prova por contraste: a **#3168**, criada depois e nunca tentada pelo
`PUT /merge`, mergeou por **auto-merge** às 13:22:02 com a mesma base `4bc94cb`.

Conclusão operacional, para a próxima sessão: neste repositório a via que funciona é
`enablePullRequestAutoMerge(SQUASH)` — assíncrona, não depende da resposta síncrona. E, se a PR já estiver
presa pelo lock, o caminho comprovado é **branch nova a partir da `main` atual montada com os blobs que já
estão no servidor** (`create_tree` + `create_commit` + `create_ref`, todos funcionando) e PR nova. Foi assim
que a #3168 entrou e é o que esta PR em lote faz.

## 5. Aguardando o dono

- **#3158 e #3160** (Copiloto): tirei o rascunho (`isDraft: false`), então `Build` e `Unit Tests` passaram a
  rodar de verdade em vez de sair `SKIPPED` — era isso que travava o portão. **Não mergeadas**: trazem DDL
  que ainda não está em produção. Medido no banco oficial: `supabase_migrations.schema_migrations` sem
  `20261115030000` e sem `20261115040000`; função `commit_copilot_tick` inexistente (`pg_proc` = 0).
  Mergear o arquivo sem aplicar cria drift — é exatamente o que o `db-live-guard.yml` acusa.
- **`claude/wizardly-ride-dimxnt`**: remover `vercel-env-cleanup.yml` é decisão de infra, não de código.
  O workflow hoje serve para auditar os 7 segredos de servidor que estão na Vercel.
- **Apagar as 275 branches**: o critério foi submetido a refutação antes de qualquer exclusão.

## 6. Ruído de CI encontrado (não bloqueia required)

- 4 check suites ficam eternamente `queued` com 0 runs em todo head novo: apps `claude`, `cursor`,
  `devin-ai-integration`, `promo-gifts-v4`. Se algum desses contextos entrar nos required checks, nenhuma
  PR mergeia.
- `Supabase Preview` sai `FAILURE` nas PRs com migration (projeto de preview `bcaftxzkgaxyjqtltwyh`, que não
  é o oficial `tnnnlkbymytvtqngbbqh`). Não é required.
