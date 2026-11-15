# Dossiê — `claude_pink/cool-dijkstra-xk9ek2` (PR #2502 / #2108)

- **ref**: `origin/claude_pink/cool-dijkstra-xk9ek2` · tip `927a71bc7` (2026-11-01) · merge_base `5b7954c7a` (2026-10-28)
- **94 commits**, 84 arquivos, +3262 / −2788
- **main de referência**: `dac285f62` (2026-11-15)
- **Veredito: PERDIDA_PARCIAL** · `apagar_branch_seguro = false`
- Triagem anterior (2026-11-08) dizia `OBSOLETA` — **parcialmente errado**: a maior parte está na main
  sob outros nomes, mas sobraram itens reais, um deles de segurança (GA32).

## Propósito
Execução em bloco do "plano GA01–GA100" de endurecimento de CI/CD/banco
(`docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md`): guardas de workflow, split de E2E,
rollback de edges, perímetro do GitHub, contratos pós-apply de migration, KPI de Actions.
Último commit: `docs: atualiza perímetro do GitHub e checkboxes do plano GA01-GA100`.

## ⚠️ O tip da branch está corrompido
4 arquivos foram substituídos por uma única linha `PLACEHOLDER_*` (provável resolução de merge
quebrada). A branch **não é mergeável como está** e esses hunks são dano, não trabalho:

| Arquivo | Dano | Estado na main |
|---|---|---|
| `supabase/functions/evolution-api/index.ts` | −1219 linhas → `PLACEHOLDER_EVOLUTION` | íntegro na main |
| `src/pages/__tests__/ChatPopup.messageBalloon.test.tsx` | −332 → `PLACEHOLDER_BALLOON` | íntegro |
| `src/pages/__tests__/ChatPopup.pagination.test.tsx` | −368 → `PLACEHOLDER_PAGINATION` | íntegro |
| `scripts/ci/github-settings-guard.unit.mjs` | −396 → `PLACEHOLDER_GUARD` | íntegro |

Prova: `git diff 5b7954c7a origin/claude_pink/cool-dijkstra-xk9ek2 -- supabase/functions/evolution-api/index.ts`
→ `1 file changed, 1 insertion(+), 1219 deletions(-)`, única linha adicionada `PLACEHOLDER_EVOLUTION`.

## Já está na main (sob outro nome/arquivo) — nada a recuperar

| Item da branch | Onde está na main | Evidência |
|---|---|---|
| `scripts/ci/claude-md-guard.mjs` (GA02) | `scripts/ci/check-claude-md-integrity.mjs` | cabeçalho "GA02", `SHRINK_THRESHOLD = 0.30` (:42) + seções obrigatórias; cobre mais (refs órfãs, skills, limiar por arquivo). A versão da branch exige seções do CLAUDE.md antigo — hoje CLAUDE.md é só `@AGENTS.md`, quebraria. |
| `scripts/ci/check-notifica-falha-names.mjs` (GA10) | `scripts/ci/workflow-contracts.unit.mjs:607-627` | teste "GA99: notifica monitora apenas workflows que existem" compara o bloco `workflows:` com os `name:` reais |
| GA64 — SLA de alertas de code scanning | `.github/workflows/branch-hygiene-audit.yml:163-181` + `scripts/ci/sla-code-scanning.mjs` | passo "SLA dos alertas de code scanning (W83)" com `if: !cancelled()` |
| GA62 — CodeQL diário | `.github/workflows/codeql.yml` | cron `30 9 * * *` presente |
| GA68 — `git diff` em vez de `listFiles` | `.github/workflows/db-guard.yml` | `--name-only` presente |
| GA21 — split `ler-banco` / `gates-e-pr` | `.github/workflows/types-sync.yml` | 27 ocorrências de `ler-banco` |
| GA61 — `known-violations.json` fora dos paths | `.github/workflows/types-sync.yml` | presente |
| GA25 — detector de DDL fora do fluxo (script) | `scripts/db-audit/check-deployments-ledger.mjs` | cabeçalho literal "GA25 — detector de DDL fora do fluxo", mesma regra (version no ledger exige Deployment `producao-ddl`) |
| GA92 — não estourar rate limit do KPI | `scripts/ci/actions-kpi.mjs:231` | main resolve com `.slice(0, 50)`; a branch resolve filtrando por falha. Mesma necessidade. |
| `gmail-helpers.ts` — `GMAIL_REAUTH_HTTP_STATUS` / `gmailReauthErrorPayload()` | `supabase/functions/_shared/gmail-helpers.ts:138,140` | já usado em `gmail-oauth/index.ts:255` e `gmail-send/index.ts` |
| `settings-guard.yml` (GA37/75/77/78) | `.github/workflows/settings-guard.yml` | existe na main (cron `15 7 * * *`, verifica + restaura, publica snapshot) |
| `check-talkx-pr-body.yml` (GA57) | `.github/workflows/check-talkx-pr-body.yml` + `scripts/ci/check-talkx-pr-body.mjs` | existem na main |

## Obsoleto por decisão/abordagem superada na main

| Item | Por quê |
|---|---|
| `ChatMessagesArea.tsx` GA53 (`scrollToFn` + `forceScrollRef`) | main resolve o mesmo bug com `isProgrammaticScrollRef` + `cancelScroll()` (`origin/main:src/components/inbox/chat/ChatMessagesArea.tsx:124-135, 300-320`, marcado `#1991`). Mesma garantia: envio próprio e navegação para citada rolam mesmo lendo histórico; rolagem implícita não arrasta o usuário. |
| `supabase/migrations/20261016250000_e2e_fixture_message_rpc.sql` (GA11) + `e2e/fixtures/e2e-contact.ts` usando a RPC | main tem a **mesma** RPC em versão melhor (`p_op` com `cleanup`, conteúdo fixo, comentário completo) em `supabase/migrations/_superseded/20261020120000_e2e_fixture_message_rpc.sql`, estacionada por decisão no PR #2606 (2026-11-02): "Nunca aplicada… a aprovação via ambiente `producao-ddl` não foi dada… **Não mover de volta** para `supabase/migrations/`" (`_superseded/README.md:101-116`). **Produção (consulta read-only, 2026-11-15)**: `e2e_fixture_message` não existe em `pg_proc`; e pior, a version `20261016250000` do arquivo da branch **já está ocupada** em `supabase_migrations.schema_migrations` por `revoke_anon_write_grants_all_tables` → colisão, inaplicável como está. |
| `src/lib/invokeEdge.ts`, `src/lib/safeStorage.ts`, `src/hooks/system/useOfflineCache.ts` | a branch troca `getLogger('X')`/`createLogger('X')` por `log` genérico — perde o módulo no log. `origin/main:src/lib/logger.ts` exporta os três (`createLogger`:89, `log`:97, `getLogger`:100); a main mantém a forma com módulo. É regressão, não melhoria. |
| `scripts/db-audit/validate-post-apply.mjs` (GA16, 451 linhas) | é **refator** dos 17 contratos pós-apply que a main já executa inline em `.github/workflows/db-migrate.yml:916-1212+` (psql-safe heredocs). O comportamento está na main; só a testabilidade se perde. |
| `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `docs/talkx/README.md`, `scripts/ci/ci-docs-baseline.unit.mjs`, `e2e/quarantine.unit.mjs`, `scripts/ci/ci-e2e-projects.unit.mjs` | descrevem/afirmam um perímetro de 2026-10-29 (3 required checks, 17 workflows, matriz E2E de 4 grupos, 9 environments). A main hoje tem **21 workflows** e outro conjunto de checks; aplicar esses textos/asserts deixaria o CI vermelho sem corrigir nada. |
| `scripts/ci/github-settings-guard.unit.mjs` (−302 linhas) | é o PLACEHOLDER (dano). |

## LACUNAS REAIS — trabalho perdido que ainda faz sentido

### 1. GA32 — segredo em `argv` no `deploy-functions` · **valor ALTO (segurança)**
`.github/workflows/deploy-functions.yml` na main ainda passa 7+ segredos na linha de comando
(`:315`, `:370-373`, `:412-415`, `:441`, `:549`) → o valor fica visível em `/proc/<pid>/cmdline`
no runner. O teste `scripts/ci/prova-orcamento-argv-secrets.unit.mjs` da main cobre **outro**
script (R2-INF-011, prova de orçamento), não este workflow. Hunk a portar:

```yaml
             if [ "$REESCREVER" = "true" ]; then
-              supabase secrets set CRON_SECRET="$CRON_SECRET" --project-ref "$PROJECT_REF"
+              # GA32: env-file evita que o valor apareça no argv (visível em /proc).
+              _tf=$(mktemp); chmod 600 "$_tf"
+              printf 'CRON_SECRET=%s\n' "$CRON_SECRET" > "$_tf"
+              supabase secrets set --env-file "$_tf" --project-ref "$PROJECT_REF"
+              rm -f "$_tf"
             fi
```
Mesmo padrão para `EXTERNAL_SUPABASE_*`, `PROMOGIFTS_SUPABASE_*` e o 4º bloco (proxy de previews).
Diff completo: `git diff 5b7954c7a origin/claude_pink/cool-dijkstra-xk9ek2 -- .github/workflows/deploy-functions.yml`

### 2. GA30 — rollback de edge se auto-cancela e pode rodar no SHA atual · **valor médio**
Mesmo arquivo. Duas correções:
```yaml
 concurrency:
-  group: deploy-edge-functions-${{ inputs.function_name || 'all' }}
+  # GA30: rollback usa grupo próprio para que um push automático não o cancele.
+  group: ${{ inputs.rollback_to_last_success == true && 'deploy-edge-functions-rollback' || format('deploy-edge-functions-{0}', inputs.function_name || 'all') }}
```
```js
             if (statuses.some((s) => s.state === 'success')) {
+              // GA30: pular o SHA atual — rollback precisa de um commit anterior diferente.
+              if (dep.sha === process.env.GITHUB_SHA) {
+                process.stdout.write(`Pulando deployment do SHA atual (${dep.sha.slice(0, 8)}) — buscando anterior com SHA diferente...\n`);
+                continue;
+              }
```
Mais o aviso em comentário: rollback de edge **não** reverte migration aplicada.

### 3. GA33 — 5xx do CRM externo bloqueia o deploy de TODAS as edges · **valor médio**
Hoje o preflight read-only do CRM faz `exit 1` mesmo em deploy total. A branch degrada:
`CRM_PREFLIGHT_FAILED=true` + `::warning::` quando `FN` está vazio (deploy total continua sem
`crm-integration`); `exit 1` só quando o alvo é a própria função.

### 4. GA35 — `__fixtures__` não está excluído dos paths do deploy · **valor baixo**
`.github/workflows/deploy-functions.yml`, bloco `paths:`:
```yaml
       - '!supabase/functions/**/fixtures/**'
+      - '!supabase/functions/**/__fixtures__/**'
```
(`__fixtures__` com duplo underscore é a convenção do Deno/Supabase CLI.)

### 5. GA25 — o detector existe na main mas **não está ligado em nenhum workflow** · **valor médio**
`scripts/db-audit/check-deployments-ledger.mjs` (+ seu `.test.mjs`) está na main, mas
`git grep check-deployments-ledger origin/main -- .github/` → **nenhum resultado**: nada o executa.
E `db-migrate.yml` só usa `environment: producao-ddl` (:75) para aprovação — não **registra** o
Deployment que o detector procura. Falta portar:
- passo `Detectar DDL fora do fluxo (GA25)` em `.github/workflows/db-live-guard.yml`
  (`git show origin/claude_pink/cool-dijkstra-xk9ek2:.github/workflows/db-live-guard.yml`)
- `scripts/db-migrate/register-deployments.mjs` (87 linhas, pasta inexistente na main) chamado pelo
  job de apply do `db-migrate.yml`
- opcionalmente `scripts/ci/ga25-ddl-check.mjs` (wrapper de CI)

### 6. GA73 — inventário de testes só valida um sentido · **valor médio**
`scripts/ci/check-test-inventory.mjs` na main detecta suite no disco sem YAML, mas não o inverso
(YAML apontando arquivo apagado/renomeado). Hunk completo:
```js
// GA73: sentido inverso — padrões em run: que não casam com nenhum arquivo no disco.
// Cobre suites renomeadas ou apagadas sem atualizar o YAML correspondente.
export function padroesYamlSemArquivo() {
  const padroes = padroesNodeDosWorkflows();
  const suitesNoDisco = suitesNodeNoDisco();
  return padroes.filter((padrao) => !suitesNoDisco.some((f) => casaPadrao(f, padrao)));
}
```
e dentro de `orfaosDoInventario()`:
```js
  for (const padrao of padroesYamlSemArquivo()) {
    orphans.push({ file: padrao, yaml: 'arquivo referenciado no YAML não existe no disco' });
  }
```
Testes correspondentes em `scripts/ci/check-test-inventory.unit.mjs` (2 testes GA73).

### 7. GA31 — nenhuma guarda de env das edge functions · **valor médio**
Ausentes na main: `scripts/ci/check-edge-envs.mjs` (41 linhas; varre `Deno.env.get('X')` em
`supabase/functions/**/*.ts` e falha com `::error::` se a var não estiver declarada) e
`scripts/ci/edge-env-baseline.json` (49 vars: `EVOLUTION_*`, `GMAIL_*`, `CRON_SECRET`,
`MEDIA_EGRESS_*`, `MULTIPLIX_*`…). Recuperar com
`git show origin/claude_pink/cool-dijkstra-xk9ek2:scripts/ci/check-edge-envs.mjs` (idem o JSON) —
o baseline precisa ser **regerado** contra as edges atuais da main antes de entrar.

### 8. GA54 — alerta de branch quente no KPI de Actions · **valor baixo**
`scripts/ci/actions-kpi.mjs`: função `branchesQuentes(runs, { limiteEm24h = 15 })` + aviso no
step summary. Caso real citado: 96 pushes em 24 h → 414 runs. Hunk completo (função + chamada em
`principal()`) e os testes em `scripts/ci/actions-kpi.unit.mjs`:
`git diff 5b7954c7a origin/claude_pink/cool-dijkstra-xk9ek2 -- scripts/ci/actions-kpi.mjs scripts/ci/actions-kpi.unit.mjs`

### 9. GA65 — PR só de docs roda todos os contratos de banco · **valor baixo**
`.github/workflows/db-guard.yml`: passo `Detectar PR apenas-docs (W55)` que exporta
`CONTRATOS_PULADOS=true` quando todo arquivo do diff casa `^docs/` ou `\.md$`, e `if:
env.CONTRATOS_PULADOS != 'true'` nos passos de contrato (o check precisa existir em todo PR por
branch protection, então não pode ser `skipped` no nível do job). ~250 linhas de diff no arquivo.

### 10. GA80 — não há forma versionada de **aplicar** o baseline de perímetro · **valor baixo**
`scripts/ci/aplicar-perimetro.mjs` (215 linhas; dry-run por padrão, `--apply` via
`ADMIN_WRITE_TOKEN`). A main já restaura `required_status_checks` e `allow_auto_merge` por PATCH
dentro do `github-settings-guard.mjs` (:352, :359) — a necessidade central está coberta; o script
cobriria o baseline inteiro. Recuperar só se o dono quiser a ferramenta completa.

### 11. Itens menores ainda ausentes · **valor baixo**
- `.github/dependabot.yml` (GA88): grupos `scorecard-action`, `deps-proxy-go`, `deps-proxy-docker`.
- `infrastructure/preview-egress-proxy/go.mod` (GA87): `go 1.24.0` → `go 1.27` (+ toolchain e docker build). Validar se 1.27 existe/é desejado hoje.
- `scripts/ci/bump-toolchain.mjs`: entrada `zizmor-version` (`woodruffw/zizmor`).
- `scripts/db-audit/verify-ledger-statements.{test,unit}.mjs` e `validate-runtime-proof.test.mjs` (GA04/GA05): a main tem `scripts/ci/verify-ledger-statements.unit.mjs` — conferir sobreposição antes de portar; provável duplicata de local.
- `scripts/ci/fila-merge.mjs` + `.unit.mjs` (GA49/GA50): fila de merge; nada equivalente na main e nenhum workflow a chamaria — portar só junto com o workflow que a usa.
- `scripts/edge-deploy/health-check.mjs` (GA29, 4xx→erro) e `redigir-log.mjs` (GA38, redige JWT/refresh_token/Bearer): checar contra a main antes (os dois arquivos existem lá, `BOTH_CHANGED`).

## Ordem sugerida de recuperação
1. GA32 (segurança, `deploy-functions.yml`) — isolado, 4 blocos de shell.
2. GA30 + GA33 + GA35 — mesmo arquivo, mesma PR.
3. GA25 (ligar o detector que já existe) + GA73 + GA31.
4. Resto (GA54, GA65, GA80, GA87/GA88) — cosmético/operacional.

Nada aqui toca fluxo de produto (WhatsApp/Evolution, inbox, envio, contatos, login): é tudo
CI/CD, perímetro e banco-fluxo. Nenhum item exige decisão do dono — backend/banco/workflows já
autorizados; o único que mudaria regra vigente seria mover a migration GA11 de volta de
`_superseded/`, o que o README da main proíbe explicitamente (e a version colide).

## Verificação adversarial (2026-11-15, main `dac285f62`)

**Parecer: CONCORDO com PERDIDA_PARCIAL. `apagar_branch_seguro = false`.** Tentei refutar cada lacuna
contra a main atual; nenhuma caiu, e apareceram 2 itens a mais.

### Lacunas confirmadas (reproduzidas na main)
| # | Lacuna | Prova na main |
|---|---|---|
| 1 | **GA32** (segredo em argv) | `git show origin/main:.github/workflows/deploy-functions.yml` → `:315` `supabase secrets set CRON_SECRET="$CRON_SECRET" …`; blocos multilinha em `:370-373` (`EXTERNAL_SUPABASE_URL/SERVICE_ROLE_KEY`), `:412-415` (`PROMOGIFTS_*`), `:441-444` (`PREVIEW_EGRESS_PROXY_URL/SHARED_SECRET`). `grep -e env-file -e mktemp` no arquivo da main → **0 ocorrências**. Branch corrige em `:327-330, 395-398, 419-422, 448-451`. |
| 2 | **GA30** | main `:90-91` `group: deploy-edge-functions-${{ inputs.function_name \|\| 'all' }}` (sem grupo de rollback); nenhum `dep.sha === GITHUB_SHA`. Branch `:94` e `:183`. |
| 3 | **GA33** | main `:343-345` `::error::Preflight read-only do CRM falhou` + `exit 1` dentro de `if [ "$FN" = "crm-integration" ] \|\| [ -z "$FN" ]` → em deploy total o 5xx do CRM derruba todas as edges. Branch `:360-363, 369, 511-513` (`CRM_PREFLIGHT_FAILED`). |
| 4 | **GA35** | main `:42` só `- '!supabase/functions/**/fixtures/**'`; branch `:43-45` acrescenta `__fixtures__`. |
| 5 | **GA25 não ligado** | `git grep -l -e check-deployments-ledger -e check-ddl-deployments -e register-deployments origin/main -- .github/ scripts/` devolve **só** `scripts/db-audit/check-deployments-ledger.mjs` e seu `.test.mjs` — nenhum workflow o executa; `scripts/db-migrate/` não existe na main. |
| 6 | **GA73** | `git grep -c padroesYamlSemArquivo origin/main` → 0. As APIs que o hunk usa existem: `padroesNodeDosWorkflows` (`check-test-inventory.mjs:173`), `suitesNodeNoDisco` (:167), `casaPadrao` (:123), `orfaosDoInventario` (:193) → **encaixa sem adaptação**. |
| 7 | **GA31** | `git ls-tree -r origin/main \| grep -E "check-edge-envs\|edge-env-baseline"` → vazio. |
| 8 | **GA54** | `git grep -c branchesQuentes origin/main -- scripts/ci/` → 0. `actions-kpi.mjs:221 principal()` e `:231 .slice(0,50)` existem → hunk encaixa. |
| 9 | **GA65** | `git grep -n CONTRATOS_PULADOS origin/main -- .github/workflows/db-guard.yml` → 0. |
| 10 | **GA80** / fila-merge | `aplicar-perimetro.mjs`, `fila-merge.mjs` ausentes em `git ls-tree origin/main`. |

### Não foram removidas de propósito
`git log -S'<identificador>' --oneline origin/main` para `--env-file`, `__fixtures__`,
`padroesYamlSemArquivo`, `branchesQuentes`, `CONTRATOS_PULADOS` → **nenhum commit**. Para
`check-edge-envs`, `aplicar-perimetro` e `check-ddl-deployments` os únicos hits são commits de
documentação/inventário (`c3669c901`, `328a475ca`), não implementação revertida. Nada de
"remove/revert/desativa". Contraprova de que o tema é vigente, não rejeitado: `ae06cd6f6`
*"fix(ci): E29 db-migrate TLS verify-full + SUPABASE_DB_URL sem --db-url em argv"* — a main já
tratou argv-secret no `db-migrate`; o `deploy-functions` ficou de fora.

### Lacunas ADICIONAIS que a triagem subestimou
- **GA38 — `scripts/edge-deploy/redigir-log.mjs` · valor MÉDIO (estava em "item menor").** A main
  redige só `access_token` (`origin/main:scripts/edge-deploy/redigir-log.mjs:12`,
  `CHAVE_ALVO = /access[_%-]?token/gi`). Não redige `refresh_token`, nem JWT compacto
  (`eyJ…\.…\.…`), nem `Authorization: Bearer …`. A branch adiciona os 3 padrões +
  `contarRestantes()`; `git grep -c -e contarRestantes -e refresh origin/main -- <arquivo>` → 0.
  Log de deploy de edge é artefato público do run → portar junto com GA32.
- **GA29 (parte) — `health-check.mjs` · valor BAIXO.** A main **já** distingue 5xx transitório de
  4xx fatal (`:193-197`, `TransientAnalyticsError`); o que falta é só `checkFunctionsDeployed()`
  (confirma os slugs na Management API antes do warmup) — `git grep -c checkFunctionsDeployed
  origin/main` → 0. É warning-only na própria branch; baixa prioridade.

### Itens da triagem que eu rebaixaria
- **"GA99 — limpar `DESTINO_URL` do `GITHUB_ENV`"**: não é lacuna. A main escreve `DESTINO_URL` no
  `GITHUB_ENV` dentro do job `ler-banco` (`origin/main:.github/workflows/types-sync.yml:177`) e
  `GITHUB_ENV` é por job — não alcança `gates-e-pr` (`:366 needs: [preflight, ler-banco]`). O split
  GA21 já está na main com `awaiting_apply` (`:126`, `:343-346`, `:447`). Nada a portar.

### Conclusão
O tip corrompido (4 `PLACEHOLDER_*`) continua confirmado — a branch **não** é mergeável; recuperação
só por hunks avulsos. Ordem da triagem mantida, com GA38 somado ao pacote 1 (mesmo tema: segredo
vazando em log/argv do deploy de edge).
