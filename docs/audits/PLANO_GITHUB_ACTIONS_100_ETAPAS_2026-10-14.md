# Auditoria exaustiva do GitHub Actions — plano de correções e melhorias em 100 etapas (v4)

**Data:** 2026-10-14 (18:50 UTC) · **Repo:** `adm01-debug/Zapp_Web_V2` · **HEAD da `main` auditado:** `3ddb52f`
(`3ddb52fd04256361041973107935bb37d4b1a386`)
**Escopo:** os **18** arquivos de `.github/workflows/` (7.304 linhas, lidos integralmente), os 3 workflows
dinâmicos (Dependabot Updates, Dependency Graph, Copilot reviewer), `dependabot.yml`, `toolchain.json`,
`CODEOWNERS`, templates, os scripts que os workflows chamam (`scripts/ci/`, `scripts/db-audit/`,
`scripts/edge-deploy/`, `scripts/talkx/`), `playwright.config.ts`, `vitest.config.ts`, `vercel.json`,
`.sonarcloud.properties`, e o **estado ao vivo** via API do GitHub (branch protection, settings do repo,
environments, secrets por escopo, variables, cache, artifacts, Code Scanning, Dependabot, rulesets, webhooks,
check-runs do HEAD, runs de 07/10 a 14/10, falhas individuais com log) e via API da Vercel (teams).
**Método:** cada afirmação abaixo tem a evidência ao lado (arquivo:linha, run id, issue, resposta da API).
Nada foi inferido do texto dos planos anteriores: o plano de 01/10 foi lido para saber o que ficou pendente,
mas todo achado desta versão foi **re-medido hoje**.
**Status:** EM EXECUÇÃO desde 14/10 20:50 UTC (aprovado pelo dono). Executado até agora: **W01** e **W02**
(perímetro restaurado; evidência em `docs/audits/evidence/branch-protection-2026-10-14.json`); PRs abertas
**#1920** (W04/W05), **#1921** (W07), **#1922** (W10), **#1923** (W09). Tudo o mais continua plano. A tabela da
seção 0 descreve o estado **medido às 18:30 UTC**, antes da execução.

> Este plano **substitui** `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` como plano vigente de Actions
> assim que o dono o adotar (etapa W100 registra a troca no plano antigo e no `CLAUDE.md`). Até lá, o de 01/10
> continua sendo o citado pelo `CLAUDE.md` e coberto por `scripts/ci/ci-docs-baseline.unit.mjs`.

---

## 0. Sumário executivo — o que está quebrado agora

| Sinal | Medido em 14/10 18:30 UTC | Leitura |
|---|---|---|
| Runs criados de 07/10 00:00 a 14/10 18:30 | **303** (ci 64 · db-guard 64 · codeql 44 · settings-guard 30 · e2e-talkx 25 · db-live-guard 18 · e2e-logado 13 · auto-update 13 · placar 13 · types-sync 10 · deploy 5) | ~1.650 min de runner na semana (KPI #1889: 1.819 min na semana anterior) |
| Branch protection `main` | **`strict: false`** · 6 contexts · `enforce_admins: true` · `required_linear_history: false` | **Divergia da política canônica** (`CLAUDE.md` "Perímetro": `strict=true`) — 4ª regressão, **não detectada por ninguém**. **Restaurado para `true` às 20:54 UTC (W01)** |
| Repo | **`allow_auto_merge: false`** · squash-only · `delete_branch_on_merge: true` | Divergia do baseline (`true`). Com isso, `auto-update-pr-branch.yml` **nunca** encontrava PR elegível: 13 runs/semana em no-op. **Restaurado para `true` às 20:54 UTC (W01)** |
| `Settings Guard` | **30 ❌ / 30** em 7 dias (KPI anterior: 24/24, 100 %) · issue #1854 com **39 comentários** de bot | O guard que deveria pegar a regressão acima está cego (403 em branch protection e actions) **e** inventa 7 divergências falsas (`GET /repos` com `GITHUB_TOKEN` devolve `null` nos campos de merge) — run 38615982485 |
| `E2E logado` | **39 cancelados / 40** últimos runs (KPI: 94,1 % de cancelamento) · único run executado (12/10) ❌ em `auth.setup` → issue #1915 aberta há 2 dias sem reação | A suíte logada **não roda** na prática: a `main` recebe ~2 pushes/h e o GitHub cancela o pendente antes de ele começar. Quando rodou, o **login quebrou** |
| `DB Live Guard` | 5 ❌ / 18 em 7 dias; nos últimos 30 runs, **12 ❌** (10 de push, 2 agendados), todos no push de um lote (#1890, #1897, #1902, #1905, #1908, #1911) | Quebra **por desenho** do fluxo diário: o lote mergeia, o DDL só vai à produção depois (seção 0 do `CLAUDE.md`), e o guard compara prod ≠ main no mesmo minuto |
| `types-sync` | 5 ❌ / 30 últimos: Gate 1 TypeScript (RPC do lote ainda não existe em prod) e Gate 2 usage-guard ("entradas obsoletas no baseline") · issue #1454 com **62 comentários** | Mesma causa estrutural do guard vivo; cada lote vira **2 PRs** (`#1905→#1907`, `#1908→#1910`, `#1911→#1913`) |
| `CI/CD Pipeline` | **27 ❌ / 64** (42 %) · 788 min/semana · Unit Tests é o job mais lento (16–17 min) | Falhas medidas hoje: PR #1899 "Deployment manifest is stale" (aberta há 8 dias, 32 comentários); PR #1918 do Dependabot (39 bumps) ❌ em `ci-docs-baseline.unit.mjs:357` porque um **teste de documento afirma `playwright@1.63.0` no `bun.lock`** |
| Code Scanning | **15 alertas abertos** (era 1 em 01/10), 10 `high`: `src/components/talkx/kit/preview.tsx:70` (xss-through-dom), `secure-random.ts:9`/`secureRandom.ts:16` (biased-cryptographic-random), `validation.ts:156/221` (stack-trace), 11 em arquivos de teste | Sem triagem, sem SLA; `#13` aberto desde 05/09 |
| Environments | **11** (baseline 7): a Vercel criou `Preview – zapp_web_v2`, `Preview – zapp-web-v2-main`, `Production – zapp_web_v2`, `Production – zapp-web-v2-main` em 03/10 | **2 projetos Vercel** deployam o mesmo repo a cada push (statuses `Vercel – zapp_web_v2` e `Vercel – zapp-web-v2-main` no HEAD); o guard só alerta environment **faltando** ("environments: OK") |
| Secrets | **14 no repo, 0 em qualquer environment** (`producao-ddl`, `producao-edge-functions`, `db-ledger-evidence`, `legacy-import-destrutivo` todos vazios) | `DESTINO_URL` (escrita), `SUPABASE_ACCESS_TOKEN` (conta Supabase), `SUPABASE_SERVICE_ROLE_KEY` acessíveis a **todo** job que rode na `main` |
| Cache / artifacts | 11 caches · **3,03 GB** (era 1,03 GB em 01/10; CodeQL overlay 519 MB + 363 MB) · **933 artifacts** (eram 2.333) | Artifacts melhoraram (E72); cache voltou a crescer |
| Check-runs no HEAD da `main` | `SonarCloud Code Analysis` ❌ (Quality Gate) · `🧬 Mutação do mapa (não bloqueante)` ❌ · `Supabase Preview` skipped · `Verificar branch protection…` ❌ | 3 checks vermelhos em todo commit da `main` que ninguém trata — ruído que esconde vermelho real |
| PRs abertas | 3: #1899 (humano, blocked, manifesto stale), #1916 e #1918 (Dependabot) | Dependabot não consegue ficar verde sozinho (ver linha do CI) |
| Dependabot alerts · rulesets · webhooks · variables | 0 · 0 · 0 · 0 | `vars.CRM_SYNC_WORKER_ENABLED` segue inexistente apesar de `VITE_CRM_INTEGRATION_ENABLED=true` em produção desde #1919 (13/10) |

**O que já está certo e não deve ser mexido (medido hoje):** pin por SHA em 100 % dos `uses:` (13 actions distintas,
todas em `allowed_actions: selected`, `sha_pinning_required: true`); `persist-credentials: false` nos 20 checkouts;
`permissions: contents: read` no topo dos 16 workflows com elevação por job; `--frozen-lockfile --ignore-scripts` em
todas as instalações; `cancel-in-progress` só em PR; `timeout-minutes` nos 23 jobs; `db-guard` offline sem
`DESTINO_URL`; `db-live-guard`/`types-sync`/`db-migrate`/`targeted-ledger-evidence` com TLS `verify-full` + CA pinada;
docker-shim do E47 (60 % dos passos num único Postgres); `docs/ci/README.md` gerado e conferido por `--check`;
`actionlint` por release pinado com sha256; dedupe de alertas por causa (E44/E20/E83); deploy de edge com dry-run,
plano por digest, atestação com teto de 10 min e Deployment do GitHub; `supabase-sync.yml` desarmado; Dependabot
agrupado; E2E Talk X por `pull_request` sem secrets.

---

## 1. Inventário ao vivo (14/10)

| Workflow | Gatilhos | Secrets que referencia | Perm. de escrita no job | Runs 7 d | Resultado 7 d | Observação |
|---|---|---|---|---|---|---|
| `ci.yml` (6 jobs, 6 required) | push main · PR · merge_group · dispatch | `VITE_*` (públicos) | — | 64 | 29 ✅ / 27 ❌ / 8 cancel | `mutation-mapa` ❌ em todo push da main |
| `db-guard.yml` (1 job required, ~100 passos) | idem | nenhum | PR read | 64 | 52 ✅ / 5 ❌ / 7 cancel | 400 min/semana |
| `codeql.yml` (2 jobs) | PR (paths-ignore) · seg 09:30 | nenhum | security-events | 44 | 41 ✅ / 3 cancel | sem dispatch |
| `settings-guard.yml` | 6/6 h · dispatch | `GITHUB_TOKEN` | issues | 30 | **30 ❌** | cego + falsos positivos |
| `e2e-talkx.yml` | PR (paths) · dispatch | nenhum | — | 25 | 22 ✅ / 3 ❌ | artifact 27 MB/PR, 14 d |
| `db-live-guard.yml` | push main (paths) · diário 06:13 · dispatch | `DESTINO_URL` | issues | 18 | 13 ✅ / 5 ❌ | vermelho a cada lote |
| `e2e-logado.yml` | push main · dispatch | `E2E_TEST_*`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | issues | 13 | **12 cancel / 1 ❌** | efetivamente não roda |
| `auto-update-pr-branch.yml` | push main · dispatch | `GITHUB_TOKEN` | contents/PR/actions | 13 | 13 ✅ (no-op) | `allow_auto_merge=false` |
| `talkx-status-regen.yml` | push main | `GITHUB_TOKEN` | contents/PR/actions | 13 | 13 ✅ | sem `concurrency`; `ubuntu-latest` |
| `types-sync.yml` (2 jobs) | push main (paths) · seg 05:49 · dispatch | `DESTINO_URL`, `TYPES_SYNC_PR_TOKEN` (ausente) | contents/issues/PR/actions | 10 | 9 ✅ / 1 ❌ | 5 ❌ nos últimos 30 |
| `deploy-functions.yml` | push main (`supabase/functions/**`, `config.toml`) · dispatch | `SUPABASE_ACCESS_TOKEN` + 7 de integrações | contents/actions/deployments | 5 | 5 ✅ | auto desde 07/10 (#1901) |
| `branch-hygiene-audit.yml` | seg 07:56 · dispatch | `GITHUB_TOKEN` | issues | 1 | 1 ✅ | issues #1810 e #1889 |
| `db-migrate.yml` (1.510 linhas) | dispatch (env `producao-ddl`) | `DESTINO_URL` | — | 0 (5 na semana anterior, 4 ❌) | — | bundles hardcoded |
| `crm-sync-worker.yml` | dispatch | `CRON_SECRET` | — | 0 | — | cron comentado |
| `targeted-ledger-evidence.yml` | dispatch (env `db-ledger-evidence`) | `DESTINO_URL` | — | 0 | — | ok |
| `supabase-sync.yml` | dispatch (env `legacy-import-destrutivo`) | `DESTINO_URL`, `LEGACY_IMPORT_UNLOCK` (ausente) | — | 0 | — | desarmado de propósito |

Apps de terceiros com check/status no HEAD da `main`: GitHub Actions, **SonarCloud** (❌), **Supabase** (`Supabase
Preview` skipped), **Vercel** ×2 projetos (`zapp_web_v2`, `zapp-web-v2-main`). Na PR #1899 (3 arquivos, 28 linhas):
32 comentários, badges de **cubic** e **Devin Review** no corpo.

---

## 2. O que o plano de 01/10 entregou e o que ficou (medido pelo repo e pela API, não pelos checkboxes)

Entregue e confirmado hoje: E17/E18 (debounce e paths do types-sync, #1439), E19 (Gate 3 por objeto), E20 (dedupe
do types-sync), E21 (`head_branch` no destravar), E23, E27, E28, E29 (parcial — ver N-08), E30, E31, E32, E33,
E38–E50, E52, E54–E60, E63–E66, E68 (cache do Playwright nos 3 workflows), E72, E74, E75 (`toolchain.json`), E76,
E78, E79, E82–E85, E87, E91–E93, E95–E99.

**Pendentes herdados e re-medidos (reaparecem abaixo com número novo):** E10 (SonarCloud → W89), E24/E25 (service_role
no E2E → W62/W74), E26 (role RO → W63/W64), E34/E35/E36 (identidade de bot e revisores → W20), E37 (validity checks →
W16), E53 (saída do drift → W21), E61 (rollback → W66), E62 (db-migrate enxuto → W28/W31: o YAML ainda tem **1.510
linhas e ~640 de asserções inline por versão**), E67 (cache do Bun → W35), E69/E70 (paralelizar/dividir → W36/W37),
E71 (drafts → W45), E73 (retenção → W47), E77 (Dependabot do toolchain → W40), E80 (concurrency por SHA → W71), E81
(config do Playwright → W75), E86 (Supabase local no E2E → W79), E88 (só Chromium no PR → W76), E89 (apps → W90), E90
(WhatsApp → W97), E94 (environments órfãos → W67), E100 (required novo → W37).

**Regredido desde 01/10:** `strict` (de volta a `false`), `allow_auto_merge` (de volta a `false`), credencial em argv no
`db-migrate` (`--db-url "$SUPABASE_DB_URL"`, #1895, porque "o CLI 2.116 ignora `SUPABASE_DB_URL`").

---

## 3. Achados (com evidência)

### P0 — quebra hoje ou mascara quebra

- **N-01 · A política canônica não está em vigor e ninguém detecta.** `GET /branches/main/protection` →
  `required_status_checks.strict: false`; `GET /repos` → `allow_auto_merge: false`. O `CLAUDE.md` ("Perímetro do GitHub
  — estado canônico") e `scripts/ci/github-settings-baseline.json` dizem `true` nos dois. É a 4ª regressão do `strict`
  (25/09, 27/09, 01/10, e esta) e a 1ª sem registro de data. Consequência direta: `auto-update-pr-branch.yml:43-45`
  filtra `autoMergeRequest != null` — com auto-merge desligado no repo nenhuma PR jamais o tem, logo os 13 runs/semana
  terminam em "Nenhum PR com auto-merge esta behind." (código morto, de novo — G-06 de 01/10 reaberto).
- **N-02 · O `settings-guard` falha 100 % das vezes e com motivo errado.** Run 38615982485: `branch protection: NAO
  VERIFICAVEL — 403`; `actions: NAO VERIFICAVEL — 403`; `merge/repo: 7 divergencia(s)` com **`encontrado=null`** em todos
  os 7 campos (`allow_squash_merge`, `allow_auto_merge`, …) — o `GET /repos` com `GITHUB_TOKEN` simplesmente **não
  devolve** esses campos (exigem `push`/admin), e o script (`github-settings-guard.mjs:118-128`) trata `null` como
  divergência. A "restauração" de `allow_auto_merge` falha com 403. Resultado: 30 ❌/30 em 7 dias, issue #1854 com 39
  comentários (política E51: fechar acima de 20), zero proteção real, e um `exit 1` que treina todo mundo a ignorar o
  vermelho. O baseline (`medido_em: 2026-10-03`) foi medido com token de admin, o guard roda com token de workflow —
  comparam coisas diferentes.
- **N-03 · `E2E logado` não roda.** 39 dos 40 últimos runs `cancelled` (lista em `list_runs_for_workflow`): com
  `cancel-in-progress: false` o GitHub mantém 1 em execução + **1 pendente**, e cada push novo cancela o pendente; a
  `main` recebe ~2 pushes/hora e a suíte leva ~15 min, então o pendente quase nunca chega a começar. O único run que
  executou (38239077346, 12/10) falhou em `auth.setup.ts` (`authenticate-setup` + `retry1`) e abriu #1915 — **o login
  real está quebrado há 2 dias** e a issue tem 0 comentários. 192 min/semana gastos em runs cancelados.
- **N-04 · Os guardas vivos quebram a cada lote por desenho do fluxo diário.** Seção 0 do `CLAUDE.md` (desde 04/10):
  o lote mergeia, e o DDL só chega à produção depois, por `db-migrate.yml` com aprovação humana. Mas `db-live-guard`
  dispara no push do lote (`paths: supabase/migrations/**`) e compara prod ≠ main no mesmo minuto → ❌ em
  `migrations`/`types`/`catalog` (runs 37343930859, 37455614799, 37678683533, 37779070540, 37866279744, 37957302260 —
  **todos pushes de lote**). `types-sync` dispara junto e Gate 1 falha porque `src/` já usa RPCs
  (`create_team_group_conversation`, `transfer_team_conversation_ownership`) que o banco ainda não tem (#1454,
  comentário de 05/10). Gate 2 falha por "entradas obsoletas no baseline" (#1454, 09/10). Cada lote gera um 2º PR
  `chore(db): sincronizar` e uma janela vermelha de horas. Nenhum guard distingue "apply pendente, esperado" de "drift".
- **N-05 · CI com 42 % de falha, por duas causas auto-infligidas.** (a) PR #1899 (humano, `_shared/validation.ts`):
  `🧾 Verify Edge deployment manifest freshness` ❌ "Deployment manifest is stale" — qualquer mudança em
  `supabase/functions/**` exige regenerar `deployment-manifest.json`, e nada no fluxo local (husky) faz isso; a PR está
  bloqueada há 8 dias. (b) PR #1918 do Dependabot (39 bumps): `ci-docs-baseline.unit.mjs:357` →
  `assert.ok(/playwright@1\.63\.0/.test(lock))` — um **teste de documento pina a versão de uma devDependency**; o bump
  do Playwright exige editar `toolchain.json`, 3 workflows (6 linhas), o teste e o plano de 01/10. O Dependabot não
  consegue ficar verde sozinho por construção.
- **N-06 · 15 alertas de Code Scanning abertos, 10 `high`, sem dono.** Criados entre 02/10 e 09/10 (eram 1 em 01/10):
  `js/xss-through-dom` em `src/components/talkx/kit/preview.tsx:70`; `js/biased-cryptographic-random` em
  `supabase/functions/_shared/secure-random.ts:9` e `src/lib/secureRandom.ts:16`; `js/stack-trace-exposure` em
  `_shared/validation.ts:156` (#13, desde 05/09) e `:221` (#31); `js/bad-code-sanitization` em
  `scripts/team-chat-db-validate.unit.mjs:36`; 9 `incomplete-url-substring-sanitization`/`insufficient-password-hash` em
  arquivos `*.test.ts`/`__tests__`. CodeQL não é required e nenhum workflow olha a lista.
- **N-07 · Deploy de edge: fail-open na reescrita de secrets e privilégio sobrando.** `scripts/edge-deploy/
  secrets-scope.mjs:68-72`: se `supabase secrets list` falhar (`nomesRemotos === null`) → `reescrever: true` ("mantendo
  o comportamento anterior") — uma falha de leitura reescreve **todos** os 7 secrets das edges. O job tem `contents:
  write` (`deploy-functions.yml:103`) sem uso desde que a tag virou Deployment (E60). O smoke valida CORS só para
  `https://zapp-web-v2.vercel.app` (`smoke-functions.mjs:7`); o domínio canônico `zappweb.app.br` (PR #1899) fica
  fora. `SUPABASE_ACCESS_TOKEN` (token da conta Supabase) está no nível do repo (14/14 secrets no repo, 0 em
  environments).

### P1 — risco real, desperdício grande ou dívida que cresce

- **N-08 · `db-migrate.yml` não serve ao fluxo diário que o `CLAUDE.md` descreve.** O preflight só aceita (a) 1 version
  ausente igual ao alvo ou (b) um dos **3 bundles hardcoded** (`ATOMIC_DELIVERY_BUNDLE`, `LOTE_0510_BUNDLE` com 8
  versions, `TALKX_RECOVERY_BUNDLE`; linhas 195-216) — cada lote novo exige **PR editando o workflow** (#1894 fez
  exatamente isso). 4 ❌/5 na semana anterior (KPI). `--db-url "$SUPABASE_DB_URL"` em argv (linhas 908 e 917) é regressão
  da E29 (introduzida em #1895 porque o CLI ignora a env). O passo "Provar estado runtime antes do push" ainda carrega
  **~640 linhas de asserções inline por versão** (264-900) apesar da E62 ter extraído os SQL para `contracts/`; e há
  contradição entre `run-runtime-contract.mjs` (falha fechado sem `contracts/<versão>.sql`, exit 2) e o ramo
  `proof.contract === 'generic'` do YAML (849-862) — é preciso provar que o contrato genérico prometido pela regra 1 da
  seção 1 do `CLAUDE.md` ainda é alcançável para uma version nova. 17 validações pós-apply (947-1507) são de versions
  históricas que nunca mais serão alvo.
- **N-09 · Dois (ou três) projetos Vercel no mesmo repo.** Statuses do HEAD: `Vercel – zapp_web_v2` e `Vercel –
  zapp-web-v2-main`, ambos "Deployment has completed" (18:07). A Vercel criou 4 environments em 03/10 14:04-14:09 (fora
  do baseline de 7 — o guard aceita extras em silêncio, `checarEnvironments` só olha `faltando`). O pedido desta
  auditoria cita um 3º projeto (`zapp-web`). `docs/DEPLOYMENT.md:48` conhece só `zapp_web_v2`. Cada push constrói
  2-3×, e qual deles responde pelo domínio canônico não está documentado. `vercel.json` `installCommand` roda `bun
  install --frozen-lockfile` **sem `--ignore-scripts`** — a política E23 vale no CI e não vale no build que vai para
  produção.
- **N-10 · Check ❌ fantasma em todo commit da `main`.** `ci.yml:452-499` `mutation-mapa` é `continue-on-error: true`
  no job, mas em push (sem `BASE_REF`) o filtro é fail-open (`map_changed=true`) e o runner de mutação falha → check-run
  `🧬 Mutação do mapa (não bloqueante)` **failure** no HEAD. Soma-se ao SonarCloud ❌ e ao `settings-guard` ❌: três
  vermelhos permanentes dessensibilizam quem olha a `main`.
- **N-11 · SonarCloud Quality Gate ❌ na `main` desde antes de 01/10 (E10 nunca decidida); `Supabase Preview` ainda
  reporta `skipped` em todo push** (app instalado; `CLAUDE.md` diz que "parou de reagir a PRs" — verdade só para PR).
- **N-12 · `types-sync`: debounce e Gate 2 têm semântica errada.** `types-sync.yml:90-92`: o debounce usa
  `pr.updated_at`, que qualquer comentário de bot renova → com 5 bots comentando, o debounce pode nunca expirar. Gate 2
  trata "entrada obsoleta no baseline" (violação que **sumiu**) como falha e bloqueia a sincronização inteira (#1454,
  09/10) — a mensagem do próprio guard diz "remova-as", não "pare".
- **N-13 · `db-live-guard.yml:200-206`: o passo "Fixtures de E2E em producao (E85)" é o único dos 11 sub-checks sem
  `if: steps.credencial.outcome == 'success'`.** Retificado em 14/10 (revisão da PR #1921): o efeito hoje é nulo, porque
  `credencial` não tem `continue-on-error` e a falha dele já pula os passos seguintes pelo `success()` implícito. O
  achado é de **invariante**, não de comportamento: a guarda precisa ser explícita em todo sub-check com
  `continue-on-error`, para que relaxar o passo de credencial no futuro não faça nenhum check rodar contra destino não
  validado.
- **N-14 · Pipeline de PR serial e sem cache.** `lint-and-typecheck` tem **27 passos** (Deno check + testes, Go, download
  do actionlint, `pip install zizmor`, 819 testes Node, eslint do repo inteiro, `tsc -b --force`, …) e é `needs:` de
  `test`, `security` e `e2e`; `build` espera `test`. `bun install` roda 5× por PR sem `actions/cache` (os 2 caches
  `bun-*` existentes são de 29/08 e nenhum workflow os usa). `🧪 Unit Tests` é o job mais lento do repo (16–17 min,
  top-5 do KPI, 4 das 5 posições). Zero `actions/cache` para Bun; o cache do Playwright (E68) existe.
- **N-15 · Lint de workflow aceita tudo e `pip` sem hash.** `ci.yml:152` instala `zizmor==0.9.0` via `pip` sem
  `--require-hashes`; `:155` aceita exit 11–13 (info/low/medium) — o run 38608854544 mostra **20 findings
  informacionais** (`template-injection` de `${{ github.ref }}` e `${{ steps.*.outputs.* }}` dentro de `run:` em
  `types-sync.yml:641-654`, `targeted-ledger-evidence.yml:40-44`, …) que passam. `:139` roda `actionlint -shellcheck ''`
  — **shellcheck desligado**.
- **N-16 · `defaults.run.shell` com `-euo pipefail` ausente em 7 dos 16 workflows** (`ci.yml`, `auto-update-pr-branch.yml`,
  `branch-hygiene-audit.yml`, `codeql.yml`, `db-live-guard.yml`, `deploy-functions.yml`, `e2e-logado.yml`) — o log do
  CI mostra `shell: /usr/bin/bash -e {0}`; `set -euo pipefail` aparece à mão em alguns passos e falta em outros (E97
  cobriu 9).
- **N-17 · `db-guard.yml`: 915 linhas, ~100 passos sequenciais, 11 fora do shim (Docker real), 400 min/semana.**
  `check-test-inventory.mjs` mantém **13 `.test.sh` + 8 suítes Node** na allowlist de órfãos com a justificativa "agente
  não edita workflow" — teste que existe e o CI não roda.
- **N-18 · Dependabot não cobre o toolchain** (bun `1.4.0`, deno `2.9.5`, node `24`, go `1.24.x`, supabase-cli `2.116.0`,
  playwright `1.63.0`, digest do `postgres:17-alpine`) — só `uses:`; e, por N-05(b), as PRs que ele abre não passam.
- **N-19 · Issues de alerta acima do teto da política E51:** #1854 (39 comentários), #1454 (62). A issue `[kpi-actions]`
  #1889 mantém o título "Semana de 2026-10-05" com corpo atualizado em 12/10.
- **N-20 · `crm-sync-worker` continua só por dispatch** com `vars.CRM_SYNC_WORKER_ENABLED` inexistente (0 variables),
  mas `VITE_CRM_INTEGRATION_ENABLED=true` entrou em produção em 13/10 (#1919). Ou o outbox é drenado por outro caminho
  (pg_cron) e o workflow é redundante, ou ninguém drena.
- **N-21 · `talkx-status-regen.yml`:** sem `concurrency` (dois pushes em sequência → dois `create-pull-request` na mesma
  branch `automation/talkx-status`, force-push cruzado); `runs-on: ubuntu-latest` (único fora do pin `ubuntu-24.04`);
  `fetch-depth: 0` a cada push da `main`.
- **N-22 · Teardown do `e2e-logado` com service_role via `curl DELETE`** (E24/E25 pendentes); o 2º curl (`:208`) está
  sem `--proto '=https' --tlsv1.2` e sem `--max-time`.
- **N-23 · Blast radius de secrets.** 14 secrets no repo, **0** em environments. `DESTINO_URL` (escrita) está disponível
  a `db-live-guard`, `types-sync` (que faz `bun install` e tem `contents/actions: write`), `targeted-ledger-evidence`,
  `db-migrate` e `supabase-sync` sem nenhuma separação; `SUPABASE_SERVICE_ROLE_KEY` idem.
- **N-24 · Perímetro incompleto no baseline:** `required_linear_history: false` (squash-only já garante, ligar é
  grátis e fecha merge commit por API), `secret_scanning_validity_checks: disabled` (E37), rulesets 0; nenhum guard mede
  `required_conversation_resolution`, `lock_branch`, `allow_force_pushes`, `default_workflow_permissions`,
  `can_approve_pull_request_reviews`.
- **N-25 · Cache 3,03 GB (×3 desde 01/10):** 2 overlays CodeQL da `main` (519 MB + 363 MB), 3 cópias idênticas do cache
  Playwright `pw-cfw-…` (494 MB, uma por ref de PR) e 2 `pw-c-…` (284 MB). `regua-visual-talkx` sobe **27 MB por PR do
  Talk X mesmo em sucesso**, 14 dias.

### P2 — confiabilidade, custo e cobertura

- **N-26 · Docs divergentes:** `CONTRIBUTING.md` cita branch `develop`, `npm install`, repo `zapp-web` e PR para
  `develop`; `docs/DEPLOYMENT.md` conhece 1 projeto Vercel; `CLAUDE.md` "Perímetro" afirma um estado que não é o vivo
  (N-01).
- **N-27 · Higiene de branches só lista:** #1810 traz 3 branches podáveis há semanas; a poda é manual e ninguém poda.
- **N-28 · Sem `dependency-review-action`, sem OpenSSF Scorecard, sem proveniência** — grátis em repo público;
  `bun audit` cobre advisories mas não diff de dependências novas/licenças por PR.
- **N-29 · `ci.yml:29-32` expõe `VITE_*` (públicos) a todos os jobs**, inclusive os que não buildam.
- **N-30 · `codeql.yml` sem `workflow_dispatch`; `e2e-logado.yml` sem `schedule`** (com N-03, não há caminho confiável
  para a suíte rodar).
- **N-31 · Deploy automático de edge publica `all` (80 funções) em todo merge que toca `supabase/functions/**`**,
  inclusive mudanças só em `*.test.ts` ou `.md`; não há verificação pós-deploy de taxa de erro (só smoke de CORS/401) e o
  rollback é 100 % manual.
- **N-32 · 6 checkouts com `fetch-depth: 0`** (repo de 115 MB) — alguns necessários (gitleaks, placar), outros não
  (`mutation-mapa` só precisa da base da PR).
- **N-33 · 7+ bots comentando em PR** (cubic, Devin, CodeRabbit, Copilot, Vercel ×2, SonarCloud…): #1899 tem 32
  comentários para 28 linhas (E89 nunca decidida).

### P3 — higiene

- **N-34 · `check-quarantine.mjs` só roda via `.unit.mjs`** — nenhum passo explícito no CI; a quarentena E87 está vazia
  hoje, então o verificador nunca foi exercitado em CI com item vencido.
- **N-35 · `actions-kpi.mjs` não mede "cancelado antes de começar"** (o caso do `e2e-logado`) nem p50/p95 por job.
- **N-36 · `.github/toolchain.json` só tem leitor de conferência** (`check-workflow-pins.mjs`) — nenhum workflow lê de
  lá em runtime; cada versão vive literal em 2–6 lugares.

---

## 4. Plano de correção e melhorias — 100 etapas

**Convenções.** Cada etapa tem **Classe** (A = configuração do GitHub via API, sem PR; B = YAML em `.github/`, PR;
C = script/teste/doc, PR; D = decisão do Joaquim; E = fora do GitHub — Vercel/Supabase), **Achado** (N-xx), **Ação** e
**Verificação**. Ordem dentro da fase é a ordem recomendada. ⚠️ = exige decisão do Joaquim antes de começar. A regra da
casa continua: nenhum agente faz push, abre PR ou mergeia por conta própria; classe A e D são do dono.

### Fase 0 — Destravar hoje (W01–W10)

- [x] **W01** · A ⚠️ · N-01 · **FEITO 14/10 20:54 UTC, opção (a)** (PATCH parcial de `required_status_checks` com os 6 contexts inalterados + PATCH `allow_auto_merge`). Decidir **uma** vez e aplicar: (a) restaurar a política vigente (`strict=true` via PATCH de
  `required_status_checks`, `allow_auto_merge=true` via PATCH do repo) — recomendado, porque `auto-update-pr-branch`,
  `CLAUDE.md` e o baseline já assumem isso; ou (b) mudar baseline + `CLAUDE.md` para o estado vivo e apagar
  `auto-update-pr-branch.yml`. Verificação: `GET` devolve o estado decidido; `auto-update` deixa de ser no-op (a) ou
  deixa de existir (b).
- [x] **W02** · A · N-01 · **FEITO** (`docs/audits/evidence/branch-protection-2026-10-14.json`). Gravar snapshot **antes e depois** de W01 em `docs/audits/evidence/branch-protection-2026-10-14.json`
  (branch protection + `GET /repos` + `GET /environments`), no padrão de `branch-protection-2026-10-02.json`.
  Verificação: arquivo commitado com os dois estados e timestamps.
- [ ] **W03** · A · N-19 · Fechar #1854 (39 comentários) e #1454 (62) com comentário-resumo e link para este plano; a nova
  issue de cada guard só nasce quando ele voltar a emitir sinal verdadeiro (W04/W05/W23). Verificação: 0 issues abertas
  com labels `settings-guard`/`types-sync`.
- [~] **W04** · C · N-02 · **PR #1920 aberta.** `github-settings-guard.mjs`: campo **ausente/`null`** na resposta = ponto cego (NÃO
  VERIFICÁVEL), nunca divergência; restaurar só o que foi efetivamente lido. Verificação: unit test com a resposta real
  do `GET /repos` sem campos de merge → 0 divergências, 1 ponto cego; `node --test scripts/ci/github-settings-guard.unit.mjs`.
- [~] **W05** · B+C · N-02 · **PR #1920 aberta.** `settings-guard` deixa de `exit 1` quando só há pontos cegos: job verde com `::warning::` e
  **uma** issue "ponto cego do perímetro" com dedupe pela assinatura dos campos não verificáveis (comenta só se o conjunto
  mudar ou a cada 7 dias). Verificação: 4 runs seguidos → 1 comentário; run deixa de ser ❌ sem divergência real.
- [ ] **W06** · A · N-03 · Investigar o `auth.setup` do run 38239077346: usuário E2E no Auth de produção (lockout, senha,
  MFA, e-mail), app respondendo em `PLAYWRIGHT_BASE_URL`; disparar `e2e-logado` manual até ✅ (#1915 fecha sozinha).
  Verificação: run manual ✅ com os 10 projetos.
- [~] **W07** · B · N-13 · **PR #1921 aberta.** `db-live-guard.yml:200`: adicionar `if: steps.credencial.outcome == 'success'` ao passo E85
  (consistência + invariante, não correção de comportamento — ver N-13 retificado).
  Verificação: `workflow-contracts.unit.mjs` ganha o caso "todo passo `continue-on-error` do guarda vivo exige a guarda de
  credencial" (mutação: remover o `if` → teste ❌).
- [ ] **W08** · C · N-05a · PR #1899: regenerar `supabase/deployment-manifest.json` (`node scripts/edge-deploy/generate-manifest.mjs`)
  no branch, CI verde, e o dono decide merge; após o merge, `deploy-functions` dispara sozinho (push em `supabase/functions/**`).
  Verificação: 6 checks ✅ no head; Deployment registrado.
- [~] **W09** · C · N-05b · **PR #1923 aberta** (resolve pela raiz: versão vem só do `bun.lock`, pin literal vira violação). `ci-docs-baseline.unit.mjs:355-360`: remover a asserção literal `playwright@1.63.0` do
  `bun.lock`/workflows; o que se afirma passa a ser "versão dos workflows == `toolchain.json` == `bun.lock`", lendo os
  três. Verificação: PR #1918 do Dependabot passa no job `Lint & TypeCheck` sem edição manual (ou falha só por motivo de
  código).
- [~] **W10** · B · N-10 · **PR #1922 aberta.** `ci.yml` `mutation-mapa`: `if: github.event_name == 'pull_request'` no job (em push não há base
  para filtrar). Verificação: check-runs do próximo HEAD da `main` sem `🧬 Mutação do mapa` ❌.

### Fase 1 — Perímetro verificável de verdade (W11–W20)

- [ ] **W11** · D ⚠️ · N-02 · Criar credencial de **leitura administrativa** para o guard: PAT fine-grained (ou GitHub
  App) restrito a este repo com `administration: read` + `metadata: read`, guardado como secret do environment novo
  `perimetro-leitura` (branch policy `main`; o workflow só roda por `schedule`/`dispatch`, nunca em PR). Decisão: o
  Joaquim cria o token e define a rotação (90 dias).
- [ ] **W12** · B · N-02 · `settings-guard.yml`: `environment: perimetro-leitura` e `GITHUB_TOKEN` do passo = o secret de
  W11; `check-pr-workflow-secrets.mjs` já proíbe PR, nada muda ali. Verificação: Job Summary com 0 pontos cegos;
  branch protection, actions permissions e repo lidos de verdade.
- [ ] **W13** · C · N-09 · `checarEnvironments` alerta environment **a mais** (não só faltando) e classifica os
  `Preview – *`/`Production – *` como "gerenciados pela Vercel" se listados numa chave própria do baseline.
  Verificação: fixture com os 11 de hoje → divergência listando os 4 extras.
- [ ] **W14** · C · N-24 · Baseline e guard passam a cobrir `required_linear_history`, `allow_force_pushes`,
  `allow_deletions`, `required_conversation_resolution`, `lock_branch`, `required_signatures`,
  `default_workflow_permissions`, `can_approve_pull_request_reviews`, `secret_scanning*`, `rulesets` (count) e
  `selected_actions.patterns_allowed` (== `allowed-actions.json`). Verificação: unit tests por campo; baseline JSON
  ampliado com `medido_em` novo.
- [ ] **W15** · A · N-24 · Ligar `required_linear_history=true` na `main` (squash-only já é a política; isto fecha o
  merge commit por API). Verificação: `GET` → `enabled: true`; nenhum fluxo quebra (não há rebase/merge commit).
- [ ] **W16** · A · N-24 · Ligar `secret_scanning_validity_checks` (E37, grátis). Verificação: `GET /repos` →
  `security_and_analysis.secret_scanning_validity_checks.status: enabled`.
- [ ] **W17** · B · N-01 · `settings-guard` publica o snapshot JSON do perímetro como artifact (14 dias) a cada run e,
  quando há divergência, anexa o **diff** contra o run anterior ao comentário — a próxima regressão de `strict` ganha
  pelo menos uma janela de 6 h datada. Verificação: artifact presente; mutação de teste (alterar `strict` por dispatch
  controlado do Joaquim) → diff no comentário em < 6 h.
- [ ] **W18** · C · N-26 · Reescrever a tabela "Perímetro do GitHub — estado canônico" do `CLAUDE.md` e o baseline com o
  estado **decidido em W01** (`medido_em: 2026-10-14`), e travar a coerência entre os dois com teste
  (`ci-docs-baseline.unit.mjs` compara cada campo do baseline com a tabela). Verificação: teste verde; mutar um campo →
  ❌. (Arquivo protegido: PR aguarda o Joaquim.)
- [ ] **W19** · B · N-01 · `auto-update-pr-branch.yml`: 1º passo lê `allow_auto_merge` do repo (via `gh api`) e, se
  estiver desligado, falha com `::error::` apontando W01 — a premissa do workflow deixa de falhar em silêncio como
  "Nenhum PR". Verificação: com auto-merge off → run ❌ com mensagem; on → comportamento atual.
- [ ] **W20** · D ⚠️ · N-24 · Decidir, junto com a identidade de bot (E36): `required_conversation_resolution`,
  `prevent_self_review` nos 3 environments com revisor, e revisão humana obrigatória. Registrar a decisão no
  `CLAUDE.md` (mesmo que seja "não, enquanto humano e agentes usam a mesma conta").

### Fase 2 — Fluxo diário (lote) × guardas vivos: parar de brigar por desenho (W21–W34)

- [ ] **W21** · C · N-04 · `check-migration-drift.mjs --classificar`: separa **"arquivo local sem ledger"** (apply
  pendente — esperado no fluxo diário) de **"ledger sem arquivo"**, **"conteúdo divergente"** e **"version duplicada"**
  (drift real), com saída de 1 linha por version (`version | disco | ledger | classe`) no topo do stdout (E53) e JSON
  em `--json`. Verificação: fixtures para as 4 classes; snapshot test da saída.
- [ ] **W22** · B · N-04 · `db-live-guard.yml` no evento `push`: se W21 reporta **só** apply pendente, os sub-checks
  `types`/`catalog`/`manifest`/`triple-parity`/`migrations` ficam como `PENDENTE DE APPLY` (neutral, com aviso) e o
  veredito **não** abre issue; no `schedule` diário (06:13) e no `dispatch` o guard continua estrito e abre issue se o
  apply ainda não aconteceu. Verificação: push de lote → verde com aviso; schedule sem apply → ❌ com a lista de W21.
- [ ] **W23** · B · N-04 · `types-sync.yml` Gate 1: quando o typecheck falha **só** por objeto (RPC/tabela/coluna)
  presente em migration local ainda não aplicada (W21 + `supabase-usage-guard` em modo projeção), classificar como
  `aguardando apply` — sem comentar em issue, sem `exit 1`; publicar os candidatos como artifact (já existe) e encerrar
  verde. Verificação: fixture com o erro real `create_team_group_conversation` de #1454.
- [ ] **W24** · B+C · N-12 · Gate 2: "entradas obsoletas no baseline" vira **aviso** (não bloqueia) e o PR de sync passa a
  incluir a poda de `scripts/db-audit/known-violations.json` (add-paths). Verificação: fixture; PR de sync com o arquivo
  podado.
- [ ] **W25** · B · N-12 · Debounce E17 usa a data do **head commit** do PR de sync (`pulls.get` → `head.sha` →
  `commits.get` → `committer.date`), não `updated_at`. Verificação: unit test: comentário há 1 min + head há 30 min → não
  debounce.
- [ ] **W26** · C · N-04 · Um único helper `scripts/db-audit/lote-pendente.mjs` (sobre W21) alimenta `db-live-guard`,
  `types-sync` e o Job Summary dos dois — fonte única da regra "apply pendente". Verificação: os dois YAML chamam o mesmo
  script; teste.
- [ ] **W27** · B · N-08 · `db-migrate.yml`: novo input `apply_all_missing` (bool) — aplica **todas** as versions locais
  ausentes do ledger em ordem (`comm -23`), com `confirm_bundle_sha256 = sha256(lista ordenada ‖ sha256 de cada arquivo ‖
  github.sha)` impresso no dry-run e exigido no apply; substitui os 3 bundles hardcoded para lotes futuros (os antigos
  ficam até W31). **Dividir o workflow em 2 jobs**: `preflight` (identidade, TLS, ledger, contrato de runtime, `--dry-run`,
  hash) **sem** `environment`, e `apply` (`needs: preflight`, `environment: producao-ddl`) que só recebe o hash por
  `outputs` — hoje o job único (`db-migrate.yml:66-75`) para no environment **antes de qualquer passo**, então o
  dry-run não roda sem aprovação e o aprovador decide às cegas. Verificação: fixture com 8 versions; editar um arquivo
  entre dry-run e apply → recusa; `remote-only` continua bloqueando; dispatch com `apply=false` termina sem pedir
  aprovação.
- [ ] **W28** · B+C · N-08 · Mover as ~640 linhas de asserções inline por versão (`db-migrate.yml:264-900`) para
  `scripts/db-audit/contracts/<versão>.expect.json`, lidas por `run-runtime-contract.mjs` (comparação `antes`/`depois`
  por `NEEDS_APPLY`). Verificação: `db-migrate-contratos.unit.mjs` prova equivalência por fixture para as 12 versions;
  YAML perde ≥ 600 linhas.
- [ ] **W29** · C · N-08 · Provar o contrato **genérico**: hoje `run-runtime-contract.mjs` falha fechado (exit 2) sem
  `contracts/<versão>.sql`, mas o YAML espera `proof.contract === 'generic'`. Decidir a semântica (recomendação: sem
  arquivo dedicado → executar `generic-migration-runtime.sql` e marcar `contract: generic`, mantendo fail-closed só para
  arquivo **vazio**) e cobrir com teste. Verificação: version nova sem contrato → dry-run passa pelo genérico; a regra 1
  da seção 1 do `CLAUDE.md` volta a ser verdadeira.
- [ ] **W30** · B · N-08 · Tirar a credencial do argv do `supabase db push` (linhas 908/917): se o CLI 2.116 ignora
  `SUPABASE_DB_URL`, testar `supabase link --project-ref` + `SUPABASE_DB_PASSWORD` em env, ou pinar a versão do CLI que
  respeita a env (registrar em `toolchain.json`); se nada servir, documentar a exceção no `workflow-contracts.unit.mjs`
  com a prova de que `::add-mask::` cobre o log. Verificação: `ps -ef` capturado durante o dry-run sem a URL.
- [ ] **W31** · B+C · N-08 · Arquivar as 17 validações pós-apply de versions históricas (`db-migrate.yml:947-1507`) em
  `docs/audits/evidence/db-migrate-contratos-historicos.md` com o **comando de reexecução** de cada uma; manter no YAML
  só o genérico + ledger + paridade. Verificação: `wc -l db-migrate.yml` < 500; doc lista as 17 com comando.
- [ ] **W32** · C · N-04 · `docs/MIGRATIONS.md`: seção "Fluxo diário (lote)" com a ordem real (merge → `db-migrate
  apply_all_missing` dry-run → aprovação `producao-ddl` → apply → `types-sync` → PR de sync → merge) e os estados dos
  guards (`PENDENTE DE APPLY` × drift). Verificação: `check-talkx-docs`-style unit test cobrindo os termos.
- [ ] **W33** · B · N-04 · Fechar o lote no mesmo dia sem esperar push/schedule: o **último passo do job `apply`** do
  `db-migrate.yml` (só quando `inputs.apply == true` e o apply terminou ✅) dispara o `types-sync` por
  `workflow_dispatch` (`gh workflow run types-sync.yml --ref main`, `actions: write` só nesse job). Não usar
  `workflow_run` no `types-sync`: esse gatilho **não expõe os inputs** do dispatch de origem, então o sync não
  conseguiria distinguir dry-run de apply sem consultar a API do run. Verificação: apply ✅ → run de types-sync em < 5
  min → PR de sync; dry-run ✅ → nenhum run de types-sync.
- [ ] **W34** · B · N-04 · PRs `automation/types-sync` e `automation/talkx-status` habilitam auto-merge (`gh pr merge
  --auto --squash`) logo após criados — só funciona com W01(a). Verificação: PR de sync mergeia sozinho quando os 6
  checks ficam verdes; `auto-update-pr-branch` passa a ter trabalho real.

### Fase 3 — Pipeline de PR mais rápido, barato e honesto (W35–W50)

- [ ] **W35** · B · N-14 · `actions/cache` (pinado) para `~/.bun/install/cache` com chave `bun-${{ hashFiles('bun.lock')
  }}-${{ runner.os }}` nos 5 jobs do `ci.yml`, `db-guard`, `types-sync`, `e2e-logado`, `e2e-talkx`; apagar os 2 caches
  `bun-*` de 29/08. Verificação: `bun install` < 10 s com cache quente (medir no log antes/depois).
- [ ] **W36** · B · N-14 · `test`, `security` e `e2e` deixam de depender de `lint-and-typecheck`; `build` depende só de
  `test`. Nomes dos 6 required checks intactos. Verificação: wall-clock de PR verde medido pelo KPI (W92) cai ≥ 30 %.
- [ ] **W37** · B · N-14 · Dividir `lint-and-typecheck`: `🔍 Lint & TypeCheck` (ratchets + guards de workflow + docs) e
  novo `🦕 Edge contracts & Go` (Deno check/test + Go). O novo fica não required por 7 dias e depois entra nos required
  (E100) via PUT que preserva `strict` de W01. Verificação: `Lint & TypeCheck` < 2 min; `GET` lista 7 contexts.
- [ ] **W38** · B+C · N-14 · `🧪 Unit Tests` (16–17 min): medir perfil (`vitest --reporter=verbose` com tempos), e aplicar
  o que couber: `--shard 1/2`,`2/2` em matrix com merge de cobertura (`vitest run --coverage --coverage.reportsDirectory`
  + `nyc merge`), cobertura só na `main`, `pool: 'threads'`. Verificação: job < 8 min com o mesmo piso de cobertura.
- [ ] **W39** · C · N-05b · Regra em `ci-docs-baseline.unit.mjs`: **nenhum teste de documento pina versão de
  dependência**; toda versão citada em doc/plano é lida de `toolchain.json`. Verificação: grep no teste sem
  `\d+\.\d+\.\d+` literal de toolchain; mutação → ❌.
- [ ] **W40** · C · N-18 · `scripts/ci/bump-toolchain.mjs` (semanal, no `branch-hygiene-audit` ou job próprio): consulta
  as releases de Bun/Deno/Supabase CLI/Playwright e o digest do `postgres:17-alpine`, reescreve `toolchain.json` **e** os
  literais dos 16 YAML, roda `check-workflow-pins.mjs`, e abre PR (`create-pull-request`, mesmo destravar de checks).
  Verificação: PR automático na segunda com diff em `toolchain.json` + YAML.
- [ ] **W41** · C · N-05a · `generate-manifest.mjs --check` falha com mensagem acionável (comando exato + "commite o
  arquivo") e o hook `pre-commit` do husky regenera `deployment-manifest.json` quando `supabase/functions/**` ou
  `config.toml` estão no commit. Verificação: commit local tocando edge → manifesto atualizado sem intervenção.
- [ ] **W42** · B · N-15 · `zizmor` por **binário** do release do GitHub pinado com sha256 (como o actionlint), `--persona
  regular` com `exit 0` obrigatório e um `zizmor.yml` de baseline só para findings aceitos com justificativa; mover
  `${{ github.ref }}` e `${{ steps.*.outputs.* }}` de `run:` para `env:` nos 20 pontos do run 38608854544.
  Verificação: `zizmor` 0 findings; `pip` desaparece do CI.
- [ ] **W43** · B · N-15 · Ligar shellcheck no actionlint (`-shellcheck` com binário pinado) e corrigir os avisos.
  Verificação: `actionlint` exit 0 com shellcheck ativo.
- [ ] **W44** · B · N-16 · `defaults.run.shell: bash --noprofile --norc -euo pipefail {0}` nos 7 workflows restantes;
  remover `set -euo pipefail` redundantes; `workflow-contracts.unit.mjs` exige 16/16. Verificação: teste; log mostra o
  shell novo.
- [ ] **W45** · B · N-30 · PR **draft**: `test`, `build`, `e2e`, `security` (e o `db-guard`) terminam com `exit 0` e resumo
  "pulado: draft" (o nome do check continua existindo); `ready_for_review` roda tudo (E71). Verificação: PR draft roda
  só lint; `ready_for_review` dispara os 6.
- [ ] **W46** · B · N-25 · `e2e-talkx.yml`: `regua-visual-talkx` só `if: failure()` (ou 3 dias) — hoje 27 MB por PR em
  sucesso. Verificação: PR verde do Talk X cria 0 artifacts.
- [ ] **W47** · A · N-25 · `actions.artifact_and_log_retention_days = 14` no repo e limpeza dos artifacts > 14 dias (933
  hoje). Verificação: `GET /actions/artifacts` `total_count` < 300.
- [ ] **W48** · B · N-32 · `fetch-depth: 0` só onde necessário: `mutation-mapa` passa a `fetch-depth: 1` + `git fetch
  origin "$BASE_REF" --depth=50`; revisar os outros 5. Verificação: tempo de checkout no log.
- [ ] **W49** · B · N-29 · `env:` top-level do `ci.yml` (VITE_*) movido para os jobs `build` e `e2e`. Verificação:
  `lint-and-typecheck` sem `VITE_*` no log de `env:`.
- [ ] **W50** · B · N-30 · `workflow_dispatch` no `codeql.yml` (reexecutar varredura completa após triagem W81).
  Verificação: dispatch manual roda os 2 jobs.

### Fase 4 — `db-guard` sustentável (W51–W58)

- [ ] **W51** · B+C · N-17 · Converter os 11 passos `SKIP_DOCKER_SHIM` para o shim: (a) readiness por `docker logs` →
  o shim já emite "ready"; ajustar os `.test.sh` para `pg_isready`; (b) `proof.database === 'postgres'` → shim aceita
  `SHIM_DB_NAME` e os testes param de afirmar o nome; (c) só PostgREST e os 2 que criam roles globais ficam no Docker
  real. Verificação: ≤ 3 passos com `SKIP_DOCKER_SHIM`; job < 4 min.
- [ ] **W52** · B · N-17 · Shard do `db-guard` em 3 jobs paralelos por domínio (`core`, `talkx`, `multiplix+ia+team`)
  mais um job agregador **com o nome `Contrato DB offline`** (`needs:` dos 3, `if: always()`, falha se qualquer shard
  falhou) — required check preservado. Verificação: wall-clock < 3 min; `GET` da protection inalterado.
- [ ] **W53** · B · N-17 · Promover os órfãos da allowlist de `check-test-inventory.mjs`: os 8 Node e os 2 `.test.sh`
  offline (`replay-classify`, `replay-local-harness`) imediatamente; os 11 `.test.sh` com Docker próprio para o shard
  certo (W51/W52). Verificação: `ALLOWLIST`/`ALLOWLIST_NODE` ≤ 5 itens, cada um com recurso externo nomeado.
- [ ] **W54** · C · N-17 · Allowlist com prazo: campo `desde` por item e falha quando > 30 dias (mesma regra da quarentena
  E87). Verificação: fixture vencida → ❌.
- [ ] **W55** · B · N-17 · Filtro de caminho **dentro** do `db-guard`: se o diff da PR não toca `supabase/**`,
  `scripts/db-audit/**`, `src/**` (consumidores de `.from()/.rpc()`), `tests/**`, rodar só os guards estáticos
  (usage-guard, realtime, drift local, inventário) e encerrar com resumo "contratos pulados: diff não toca banco".
  Verificação: PR só de docs → job < 1 min, check verde.
- [ ] **W56** · C · N-17 · Teste próprio do `docker-shim` (`scripts/db-audit/docker-shim.test.sh`, offline, com `psql`
  de mentira no PATH) cobrindo `run/exec/rm/logs/image inspect/pull/tag` e `SKIP_DOCKER_SHIM`. Verificação: passo no
  `db-guard`; mutação no shim → ❌.
- [ ] **W57** · B · N-17 · `POSTGREST_TEST_IMAGE` pinado direto em `ghcr.io/supabase/postgrest@sha256:…` (hoje ECR com
  espelho em runtime); `retry-disposable-postgres-test.sh` mantém o espelho só como fallback. Verificação: 0 ocorrências
  de "espelho" no log de um run normal.
- [ ] **W58** · C · N-08 · `dry-run-plan.mjs` e `verify-ledger-statements.mjs` ganham fixtures do modo `apply_all_missing`
  (W27): lista ordenada, 1 arquivo faltando, 1 arquivo a mais. Verificação: suíte `node --test`.

### Fase 5 — Deploy de edge e Vercel (W59–W70)

- [ ] **W59** · C · N-07 · `secrets-scope.mjs`: `nomesRemotos === null` → `reescrever: false` + `::error::` pedindo
  `rotate_secrets=true` explícito (fail-closed). Verificação: unit test; deploy com listagem falhando → ❌ antes de tocar
  secrets.
- [ ] **W60** · B · N-07 · `deploy-functions.yml` `permissions`: remover `contents: write`; manter `deployments: write`
  e `actions: read`. Verificação: run verde; `workflow-contracts.unit.mjs` cobra "`contents: write` só onde há push/tag".
- [ ] **W61** · C · N-07 · Smoke lê as origens permitidas de `supabase/functions/_shared/validation.ts` (export) ou de
  `scripts/edge-deploy/allowed-origins.json` gerado no manifesto; positivo para **cada** origem canônica
  (`zapp-web-v2.vercel.app`, `zappweb.app.br`), negativo mantido. Verificação: smoke 80/80 após #1899.
- [ ] **W62** · A+B · N-23 · Secrets de deploy (`SUPABASE_ACCESS_TOKEN`, `CRON_SECRET`, `PROMOGIFTS_*`, `EXTERNAL_*`,
  `PREVIEW_EGRESS_*`) criados no environment `producao-edge-functions` e apagados do nível repo; `crm-sync-worker` passa
  a usar o mesmo environment para `CRON_SECRET`. Verificação: `GET /actions/secrets` sem eles; deploy e worker verdes.
- [ ] **W63** · A+B · N-23 · `DESTINO_URL` movido para os environments que cada consumidor **já declara**:
  `producao-ddl` (db-migrate), `legacy-import-destrutivo` (supabase-sync, que roda nesse environment — não em
  `producao-ddl`), `db-ledger-evidence` (targeted-ledger-evidence) e um environment novo `banco-leitura` (db-live-guard,
  types-sync, que hoje não têm environment) — mesmo valor por enquanto, blast radius por environment. Verificação: 0
  secrets `DESTINO_URL` no repo; os 5 workflows verdes (o `supabase-sync` continua falhando fechado por
  `LEGACY_IMPORT_UNLOCK` ausente, que é o desarme deliberado, não por falta de `DESTINO_URL`).
- [ ] **W64** · D ⚠️ · N-23 · Role Postgres `ci_readonly` + `DESTINO_URL_RO` em `banco-leitura` (E26 original; envolve
  DDL de role, só o Joaquim). Verificação: `supabase db push` com a role RO → `permission denied`; guards verdes.
- [ ] **W65** · B+C · N-31 · Pós-deploy de saúde: 5 min após o deploy, consultar logs/erros das funções do escopo pela
  Management API (`/v1/projects/{ref}/analytics/endpoints/functions.*` ou `functions/{slug}/logs`) e falhar com
  `::error::` se a taxa de 5xx subir acima do limiar configurado. Verificação: ensaio controlado com o Joaquim (função
  propositalmente quebrada em branch de teste + `dry_run=false`).
- [ ] **W66** · B · N-31 · Input `rollback_to_last_success` (bool): resolve o `ref` do último Deployment `success` do
  environment e redispara com `source_ref` (E61 sem automação em falha). Verificação: dispatch manual publica o SHA
  anterior e registra Deployment.
- [ ] **W67** · D+E ⚠️ · N-09 · Vercel: decidir o projeto canônico (`zapp_web_v2` por `DEPLOYMENT.md`), **desconectar**
  `zapp-web-v2-main` e `zapp-web` do repo (ou arquivá-los), e apagar os environments fantasmas no GitHub. Verificação:
  1 status `Vercel – …` por commit; `GET /environments` → 7 (+ os 2 do projeto canônico, se a Vercel exigir, listados no
  baseline por W13).
- [ ] **W68** · E · N-09 · `vercel.json` `installCommand: bun install --frozen-lockfile --ignore-scripts` (+ `bun pm
  trust <pkg>` explícito se algum postinstall for necessário — hoje o CI prova que nenhum é). Verificação: build de
  produção verde na Vercel.
- [ ] **W69** · C · N-09/N-26 · `docs/DEPLOYMENT.md`: projetos Vercel reais, domínio canônico, environments que a Vercel
  cria, e que o `deploy-functions` é automático desde 07/10 (o PR template ainda diz "disparar `deploy-functions` após o
  merge"). Verificação: doc test; PR template atualizado.
- [ ] **W70** · B · N-31 · `deploy-functions.yml` `push`: `paths-ignore` para `supabase/functions/**/*.test.ts`,
  `supabase/functions/**/*.md` e `supabase/functions/**/fixtures/**` (não mudam bundle publicado). Verificação: PR só de
  teste de edge não dispara deploy.

### Fase 6 — E2E que roda e avisa (W71–W80)

- [ ] **W71** · B · N-03 · `e2e-logado.yml`: trocar `push` por `workflow_run` (após `CI/CD Pipeline` ✅ na `main`) +
  `schedule` a cada 2 h + `dispatch`; `concurrency.cancel-in-progress: true` (só o commit mais novo importa; hoje o
  pendente é cancelado **antes** de rodar). Verificação: taxa de cancelamento < 20 % e ≥ 1 run executado por lote (KPI
  W92).
- [ ] **W72** · B+C · N-03 · `auth.setup.ts`: timeout curto, mensagem que distingue "app não respondeu" de "credencial
  recusada" e falha rápida do job (< 2 min) em vez de 15 min. Verificação: run com senha errada → ❌ em < 2 min com causa
  no log.
- [ ] **W73** · B · N-22 · 2º `curl DELETE` do teardown com `--proto '=https' --tlsv1.2 --max-time 30`. Verificação: diff;
  `workflow-contracts.unit.mjs` cobra flags em todo `curl` de workflow.
- [ ] **W74** · C+D ⚠️ · N-22 · RPC `e2e_cleanup()` `SECURITY DEFINER` restrita ao `auth.uid()` do usuário E2E e ao
  contato fixo, chamada com o JWT do próprio teste; `SUPABASE_SERVICE_ROLE_KEY` sai do CI (E25). DDL → decisão.
  Verificação: teardown ✅ sem o secret; secret apagado.
- [ ] **W75** · C · N-03 · `playwright.config.ts`: `workers: 2` nos projetos deslogados, `retries: 1` só nos logados,
  `trace: 'retain-on-failure'` (E81). Verificação: job `e2e` do `ci.yml` < 3 min.
- [ ] **W76** · B · N-14 · Job `e2e` do PR só com Chromium (`chromium`, `chromium-theme`, `chromium-mapa`,
  `chromium-contacts-visual`, `chromium-a11y`, `chromium-email-navy`); `firefox-*`/`webkit-*` deslogados migram para o
  `e2e-logado` (que já instala os 3 engines). Verificação: cache `pw-c-*` basta no PR; tempo cai.
- [ ] **W77** · B · N-03 · Alerta do `e2e-logado` (#1915): corpo com as 20 primeiras linhas do erro do passo e link do
  artifact redigido (padrão E43). Verificação: próxima falha traz a causa sem abrir o run.
- [ ] **W78** · B · N-34 · Passo explícito `node scripts/ci/check-quarantine.mjs` no `lint-and-typecheck` (hoje só via
  unit test). Verificação: item vencido em `e2e/quarantine.json` → CI ❌.
- [ ] **W79** · D ⚠️ · N-03 · Avaliar `supabase start` + seed mínimo em CI para a suíte logada (E86), com o custo medido
  por W92 (minutos/semana do `e2e-logado` após W71). Decisão.
- [ ] **W80** · C · N-03 · `marcador-specs.mjs`: quando os únicos nomes são `auth.setup.ts-*`, o título da issue vira
  "[e2e-logado] login E2E falhou" — causa distinta de spec quebrado, dono distinto. Verificação: unit test.

### Fase 7 — Segurança, supply chain e Code Scanning (W81–W90)

- [ ] **W81** · C · N-06 · Triagem dos 15 alertas: **corrigir** os 5 em código de produção (`preview.tsx:70`,
  `secure-random.ts:9`, `secureRandom.ts:16`, `validation.ts:156`, `validation.ts:221`) e **dismiss com motivo** (`used
  in tests`) os 10 em arquivos de teste/scripts de CI. Verificação: 0 alertas `high` abertos; #13 fechado.
- [ ] **W82** · B · N-06 · `.github/codeql/codeql-config.yml` com `paths-ignore` para `**/*.test.ts`, `**/__tests__/**`,
  `tests/contracts/**`, `scripts/**/*.unit.mjs` (ou `query-filters` por regra) — alertas de teste param de poluir; o job
  referencia o config. Verificação: varredura seguinte sem alertas em caminhos de teste.
- [ ] **W83** · B+C · N-06 · SLA de Code Scanning no `branch-hygiene-audit`: tabela de alertas abertos por idade na issue
  `[kpi-actions]` e `::error::` se algum `high` > 30 dias. Verificação: tabela na issue da próxima segunda.
- [ ] **W84** · D ⚠️ · N-06 · Decidir tornar `🔬 CodeQL (javascript-typescript)` required (41/44 verdes em 7 dias, ~3 min)
  — ou manter informativo com o SLA de W83. Decisão registrada no `CLAUDE.md`.
- [ ] **W85** · B · N-28 · `actions/dependency-review-action` (pinado) no job `security` em `pull_request`: falha em
  vulnerabilidade `high` nova e lista licenças. Verificação: PR com dependência vulnerável → ❌ com tabela.
- [ ] **W86** · B · N-28 · OpenSSF Scorecard semanal (`ossf/scorecard-action`, pinado) publicando SARIF em Code Scanning.
  Verificação: score visível; itens abaixo de 7 virando etapas.
- [ ] **W87** · A+C · N-28 · Adicionar `ossf/scorecard-action` e `actions/dependency-review-action` em
  `scripts/ci/allowed-actions.json` **e** em `patterns_allowed` (API) no mesmo turno (hoje 12 padrões; W14 cobra a
  igualdade). Verificação: `check-workflow-pins.mjs` e `settings-guard` verdes.
- [ ] **W88** · C · N-15 · `check-workflow-pins.mjs`: todo binário baixado por `curl` em `run:` (actionlint, zizmor,
  shellcheck) precisa de versão + sha256 declarados em `toolchain.json` e conferidos. Verificação: teste; mutação do
  hash → ❌.
- [ ] **W89** · D+E ⚠️ · N-11 · SonarCloud (E10): ajustar o Quality Gate de New Code (duplicação ≤ 6 %, Reliability ≥ C)
  com ratchet mensal, **ou** desinstalar; e desinstalar o app `Supabase for GitHub` (check `skipped` em todo push, sem
  função desde 25/09). Verificação: HEAD da `main` sem check ❌/skipped de terceiro.
- [ ] **W90** · D ⚠️ · N-33 · Inventário e poda dos GitHub Apps (E89): ≤ 2 revisores bot; remover os que só postam badge
  ou aviso; registrar a lista no `CLAUDE.md`. Verificação: PR nova recebe ≤ 3 comentários de bot.

### Fase 8 — Observabilidade, higiene e documentação (W91–W100)

- [ ] **W91** · B+C · N-19 · Política E51 em código: o passo de alerta de cada guard (`db-live-guard`, `types-sync`,
  `settings-guard`, `e2e-logado`) conta os comentários da issue e, acima de 20, fecha com resumo e abre uma nova com
  link (helper comum `scripts/ci/issue-rotativa.mjs`). Verificação: fixture com 21 comentários → fecha + abre.
- [ ] **W92** · C · N-35 · `actions-kpi.mjs`: título da issue com a semana corrente (hoje preso em "2026-10-05"), colunas
  "cancelado antes de começar" (sem `run_started_at` útil), "minutos desperdiçados", p50/p95 por job, e taxa de falha
  por **causa** (passo que falhou) para `CI/CD Pipeline`. Verificação: issue da próxima segunda.
- [ ] **W93** · D+B ⚠️ · N-20 · `crm-sync-worker`: decidir religar o `schedule` (`vars.CRM_SYNC_WORKER_ENABLED=true`,
  cadência compatível com o outbox) **ou** documentar no YAML e no `docs/` que o outbox é drenado por pg_cron e o
  workflow é só operação manual. Verificação: decisão + 1 run verde no modo escolhido.
- [ ] **W94** · B · N-21 · `talkx-status-regen.yml`: `concurrency: {group: talkx-status-regen, cancel-in-progress:
  false}`, `runs-on: ubuntu-24.04`, checkout com `fetch-depth: 0` só se `v4-status.mjs` realmente precisar (senão
  `--shallow-since`). Verificação: 2 pushes em 1 min → 1 PR; `check-workflow-pins` cobra `runs-on` igual nos 16.
- [ ] **W95** · C · N-26 · `CONTRIBUTING.md` reescrito: sem `develop`, `bun` em vez de `npm`, repo `Zapp_Web_V2`, fluxo
  `dia/AAAA-MM-DD` + lote + regras da seção 0 do `CLAUDE.md`, lista dos 6 required checks. Verificação:
  `ci-docs-baseline.unit.mjs` cobre os termos.
- [ ] **W96** · C · N-26 · `docs/ci/README.md` (gerado) ganha colunas "custo/semana (min)" e "taxa de falha (7 d)" lidas do
  último KPI, e uma seção gerada "o que NÃO é bug" (merge_group inerte, `supabase-sync` desarmado, `TYPES_SYNC_PR_TOKEN`
  ausente, …) a partir de um bloco `# nao-e-bug:` nos YAML. Verificação: `--check` verde.
- [ ] **W97** · B · N-23 · Notificação de falha da `main` por WhatsApp via N8N (webhook `workflow_run` → Evolution GO
  `PRINCIPAL`), só para `conclusion: failure` de `e2e-logado`, `db-live-guard` (schedule), `deploy-functions`,
  `db-migrate` e `settings-guard` (após W05, só divergência real), dedupe 1 h por workflow (E90). Verificação: forçar 1
  falha → 1 mensagem.
- [ ] **W98** · C+D ⚠️ · N-27 · `branch-hygiene-audit`: para branches patch-equivalentes à `main` há > 7 dias e sem PR
  aberta, apagar automaticamente (`git push origin --delete`) com lista no Job Summary — decisão do Joaquim entre apagar
  ou só gerar o comando pronto na issue. Verificação: lista de podáveis em #1810 zera.
- [ ] **W99** · C · N-01 · `workflow-contracts.unit.mjs` ganha os invariantes deste plano: guarda de credencial em todo
  passo `continue-on-error` do guarda vivo (W07); nenhum teste pina versão de dependência (W39); `defaults.run.shell`
  16/16 (W44); `concurrency` em todo workflow que abre PR (W94); `contents: write` só onde há push/tag (W60); retenção
  explícita em todo `upload-artifact`; `runs-on` igual ao pin; flags TLS em todo `curl`. Verificação: cada caso derrubado
  por mutação no YAML real.
- [ ] **W100** · C · N-26 · Fechar a troca de plano: marcar no `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` as etapas
  superadas por este (E10→W89, E24→W62, E25→W74, E26→W63/W64, E37→W16, E53→W21, E61→W66, E62→W28/W31, E67→W35,
  E69→W36, E70→W37, E71→W45, E73→W47, E77→W40, E81→W75, E86→W79, E88→W76, E89→W90, E90→W97, E94→W67, E100→W37) com o
  padrão de reconciliação TRA-009, apontar o `CLAUDE.md` para este arquivo como plano vigente, e ajustar
  `ci-docs-baseline.unit.mjs` para cobrir **este** plano. Verificação: teste verde; `grep "Plano vigente" CLAUDE.md`
  aponta para 2026-10-14. (Arquivo protegido: PR aguarda o Joaquim.)

---

## 5. O que **não** mexer (parece bug, não é)

- `merge_group` em `ci.yml`, `db-guard.yml`, `codeql.yml` — inerte em conta `User`, sem custo.
- `supabase-sync.yml` sem `LEGACY_IMPORT_UNLOCK` — desarmado de propósito; exceção TLS registrada em E98.
- `TYPES_SYNC_PR_TOKEN` ausente — o passo "Destravar os checks" substitui o PAT (provado em 36134562996).
- `db-live-guard` sem `pull_request` — não expor `DESTINO_URL` a código de PR. Isto **não** muda com W22: o guard
  continua só na `main`; muda só o que ele considera falha no evento `push`.
- `can_approve_pull_request_reviews: true` — governa a **criação** de PR pelo Actions (types-sync, placar, W40).
- O guard de imutabilidade de migration no `db-guard` — correto; a solução para corrigir migration aplicada é arquivo
  novo.
- `talkx.spec.ts` nos 3 engines e os fixtures E2E em produção — ver `CLAUDE.md` (28/09) e E85.
- `vars.CRM_SYNC_WORKER_ENABLED` inexistente — preparação deliberada; W93 só pede a **decisão** agora que o CRM está
  ligado.
- `secret_scanning_non_provider_patterns` desligado — exige GitHub Secret Protection (pago).
- `Contrato DB vivo` fora dos required checks — por design (não roda em PR).

---

## 6. Ordem recomendada e dependências

| Dia | Etapas | Resultado esperado |
|---|---|---|
| 1 (hoje) | W01, W02, W03, W06, W08, W09, W10 | política decidida e aplicada; login E2E de volta; #1899 e #1918 destravadas; `main` sem ❌ fantasma do mapa |
| 2 | W04, W05, W07, W11, W12, W13 | `settings-guard` para de mentir (0 falsos positivos) e passa a **ver** o perímetro |
| 3 | W21, W22, W23, W24, W25, W26 | o próximo lote mergeia sem janela vermelha nos guardas; `types-sync` não comenta "aguardando apply" |
| 4 | W27, W29, W30, W32, W33 | `db-migrate` aplica o lote inteiro sem editar o YAML; types-sync fecha o dia sozinho |
| 5 | W35, W36, W37, W38, W44, W42, W43 | PR verde em ~4 min; Unit Tests < 8 min; lint de workflow com shellcheck e zizmor em 0 |
| 6 | W59, W60, W61, W62, W63, W70 | deploy de edge fail-closed, com secrets em environment e smoke no domínio canônico |
| 7 | W71, W72, W75, W76, W77, W80 | `e2e-logado` roda a cada lote e avisa com causa |
| 8 | W51, W52, W53, W55, W56 | `db-guard` < 3 min e sem testes órfãos |
| 9 | W81, W82, W83, W85, W87, W88 | 0 alertas `high`; supply chain revisado por PR |
| 10 | W14–W20, W28, W31, W39–W41, W45–W50, W91–W100 e decisões ⚠️ (W64, W67, W68, W79, W84, W89, W90, W93, W98) | perímetro ampliado, YAML enxuto, docs e KPIs honestos, plano antigo fechado |

**Dependências duras:** W02 antes e depois de W01; W19 e W34 dependem de W01(a); W12 depende de W11; W22/W23/W26
dependem de W21; W33 depende de W27; W37 (required novo) só após 7 dias verde; W58 depende de W27; W61 depende do merge
de #1899 (W08); W62/W63 antes de W64; W67 antes de W13 fechar o baseline de environments; W85/W86 dependem de W87;
W99 por último na Fase 8; W100 ao final de tudo.

---

## 7. Anexo — como as medições foram feitas (reprodutível)

- Workflows: `wc -l .github/workflows/*.yml` (5.923); leitura integral dos 16 arquivos; `grep` de `uses:`, versões,
  `retention-days`, `cron:`, `secrets.`, `runs-on`, `permissions`, `defaults.run.shell`.
- Runs: `GET /actions/runs?created=2026-10-07..2026-10-11&per_page=100` (3 páginas, 221) + `?created=>=2026-10-12` (82)
  → 303 runs únicos agregados por `name`×`conclusion` e `updated_at − run_started_at`; `GET /actions/workflows/
  {file}/runs?per_page=30|40` para `types-sync`, `deploy-functions`, `e2e-logado`, `talkx-status-regen`,
  `db-live-guard`.
- Falhas individuais: `get_run_failure_summary` dos runs 38615982485 (settings-guard), 38239077346 (e2e-logado),
  38608854544 (CI de #1899), 38612380513 (CI de #1918).
- Perímetro: `GET /repos`, `/branches/main/protection`, `/actions/permissions`, `/actions/permissions/selected-actions`,
  `/actions/permissions/workflow`, `/environments`, `/environments/{name}/secrets` (×4), `/actions/secrets`,
  `/actions/variables`, `/actions/cache/usage`, `/actions/caches`, `/actions/artifacts`, `/rulesets`, `/hooks`,
  `/code-scanning/alerts?state=open`, `/dependabot/alerts?state=open`, `/commits/main/check-runs`,
  `/commits/main/statuses`, issues abertas e PRs abertas, comentários finais de #1854 e #1454, corpo de #1889, #1915,
  #1810.
- Vercel: `GET /v2/teams` (team `juca1`); `list_projects` com filtro de repo devolveu vazio — a existência dos 2 projetos
  foi comprovada pelos **statuses de commit** no HEAD, não pela API da Vercel.
- Todas as leituras foram **somente leitura**. Nenhum PATCH/POST/DELETE foi feito em GitHub, Vercel ou Supabase.
