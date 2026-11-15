# Dossiê — `claude/charming-mccarthy-jbxy56` (PR #2537)

- tip `0191895b8c969937681a415582ec94b5163e4f64` · merge_base `1252bb5a41123ba4d49efd84d0f91604bff6c87c` · 132 commits · 61 arquivos
- `main` auditada em `dac285f62dbb96370abb2ca4aa7adbac2c88b7a5`
- Triagem anterior (2026-11-08) dizia `JA_NA_MAIN` para #2537 — **incorreto em parte**: 7 itens de CI/segurança não estão na main.

## Propósito
Lote 1 do "Plano GitHub Actions 100 etapas" (GA01–GA92) + onda de correções de testes e de
acessibilidade (`text-primary-glow` → token AA). A maior parte do conteúdo entrou na main por
outras PRs; sobrou um núcleo de endurecimento de CI/CD que nunca foi mergeado.

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/ci/redigir-relatorio.mjs` | **PERDIDO (GA38)** — redação automática de JWT em relatórios/traces E2E | `git show origin/main:scripts/ci/redigir-relatorio.mjs \| grep -n 'RE_JWT\|eyJ'` → vazio |
| `scripts/ci/redigir-relatorio.unit.mjs` | **PERDIDO** — 5 testes do GA38 | idem (38 linhas ausentes) |
| `.github/workflows/deploy-functions.yml` | **PERDIDO (GA27)** — passo `deno test` antes do Deploy | `git show origin/main:.github/workflows/deploy-functions.yml \| grep -n 'deno test'` → vazio; main tem 229 `.test.ts` em `supabase/functions` e `scripts/ci/deno.json` existe |
| `.github/workflows/deploy-functions.yml` | **PERDIDO (GA30)** — grupo de concorrência próprio p/ rollback + pular Deployment com SHA atual | main:91 `group: deploy-edge-functions-${{ inputs.function_name \|\| 'all' }}`; `grep currentSha` → vazio. Hoje o rollback automático pode "reverter para si mesmo" |
| `scripts/ci/deploy-functions-workflow.unit.mjs` | **PERDIDO** — contratos GA27/GA30 (28 linhas) | main:assert fixa `group: deploy-edge-functions-...` |
| `scripts/ci/e2e-teardown.mjs` | **PERDIDO (GA39)** — `POST /auth/v1/logout?scope=global` no teardown | `grep logout` na main → vazio |
| `scripts/ci/e2e-teardown.unit.mjs` | **PERDIDO** — 3 testes do GA39 | main espera `chamadas.length === 2` (login+RPC) |
| `scripts/ci/actions-kpi.mjs` | **PERDIDO (GA92)** — `maxRuns=300` prioriza runs mais longos p/ não furar 1 000 req/h | `grep maxRuns` na main → vazio |
| `scripts/ci/actions-kpi.unit.mjs` | **PERDIDO** — teste do GA92 | idem |
| `scripts/ci/migration-drift-stdout.unit.mjs` | **PERDIDO** — teste do E53 (linha de divergência 1ª no stdout) | arquivo ausente na main; o **comportamento existe** (`check-migration-drift.mjs:923,945,978` citam E53) → teste protege regressão |
| `scripts/ci/verify-ledger-statements.unit.mjs` | **PERDIDO** — 3 testes GA05 (cabeçalho `--` do psql CLI) | comportamento existe (`verify-ledger-statements.mjs:48 flatMap(splitStatements)`); `grep GA05` na main → 0. Fixture `20261004195051_gmail_oauth_state_attempts.sql` existe na main |
| `.github/codeql/codeql-config.yml` | **PERDIDO (baixo)** — `paths-ignore` de `docs/**`, `**/*.md`, `supabase/migrations/**` | main para em `e2e/**` |
| `vitest.config.ts` | **PERDIDO (baixo)** — reporter `json-summary` (Job Summary de coverage, E12/E72) | main:23 `["text-summary","lcov"]` |
| `scripts/ci/ga04-runtime-stdout.unit.mjs` | **PERDIDO (baixo)** — teste de separação stdout/stderr | intenção coberta por `scripts/ci/db-migrate-contratos.unit.mjs` (asserts de `stdout` vazio) e `validate-runtime-proof.mjs` tem exatamente 1 `process.stdout.write` |
| `scripts/edge-deploy/health-check.mjs` | **OBSOLETA (GA29)** — alvo reescrito | main usa `/analytics/endpoints/logs` + SQL ClickHouse (`log_attributes['response.status_code']`, `toInt32OrZero`) e `TransientAnalyticsError` p/ 5xx/timeout. A branch patcheia `logs.all` + BigQuery (`m.function_id`, `metadata` UNNEST), que não existe mais. Commit: `7991a1f47 fix: endurecer scripts e automatizar guardas residuais (#2773)` |
| `scripts/db-audit/lote-pendente.mjs` | **OBSOLETA/incoerente (GA19)** — exit 2→3 | `check-migration-drift.mjs` **nunca retorna 3** (nem na main `return 2 / 1 / 0`, nem no tip da própria branch: `git show origin/claude/...:scripts/db-audit/check-migration-drift.mjs \| grep 'return 3'` → vazio). O ramo `rc === 3` da branch é código morto; a main (`rc === 2`) está correta |
| `scripts/ci/check-claude-md.unit.mjs` | **OBSOLETA (GA02)** — superada | main tem `scripts/ci/check-claude-md-integrity.mjs` + `.unit.mjs` (cabeçalho cita GA02, seções + encolhimento >30%/50%). As seções que a branch exige (`## 1. Banco de dados OFICIAL`, `## Perímetro do GitHub`, `## Auditoria de workflows`) **não existem mais** — `CLAUDE.md` hoje é só `@AGENTS.md`. O teste da branch **falharia** na main |
| `src/components/inbox/chat/ChatMessagesArea.tsx` | **OBSOLETA/nociva** — remove `cancelScroll()` | premissa falsa ("cancelScroll inexistente"): `node_modules/@tanstack/virtual-core/dist/esm/index.d.ts:209  cancelScroll: () => void`. Main:133 usa `if (!nearBottom && !wasProgrammatic) virtualizerRef.current?.cancelScroll()` — versão mais rica. **Não portar** |
| `src/components/talkx/kit/primitives.tsx` | **OBSOLETA** — `Th` com spread p/ `aria-sort` | superado por `src/components/talkx/kit/table.tsx` (único não-teste do talkx com `aria-sort`); nenhum `<Th aria-sort` na main |
| `src/components/settings/__tests__/AppearanceSettings.a11y.test.tsx` | **OBSOLETA/nociva** — rebaixa teste a `it.todo` | main **tem** o radiogroup: `src/components/theme/ChatTextSize.tsx:17 <div role="radiogroup" aria-label="Tamanho do texto do chat">`, usado em `AppearanceSettings.tsx:133 <ChatTextSize />` |
| `src/components/team-chat/__tests__/TeamChatPanel.settings-wiring.test.tsx` | **OBSOLETA** — renomeia `isSearching`→`isSearchingMessages` | `TeamChatPanel.tsx:117,140` lê `s.isSearching`; `useTeamChatPanel.ts:525-526` expõe os dois. O rename quebraria o teste na main |
| `src/components/talkx/__tests__/TalkXOverview.states.test.tsx` | **OBSOLETA/defeituosa** | a branch corrompe a regex: `/--(\w-]+):\s*([^;]+);/g` (classe de caractere sem `[`). Mocks de `useTalkXLifecycle` são do código X079 da branch, ausente na main |
| `src/components/dashboard/SatisfactionMetrics.tsx`, `ScheduledReportsManager.tsx`, `multiplix/MultiplixMonitor.tsx`, `goals/*`, `catalog/CatalogRail.tsx`, `contacts/ContactToolbar.tsx`, `dashboard/AIQuickAccess.tsx`, `AgentPerformancePanel.tsx`, `SentimentTrendChart.tsx`, `overview/GreetingBanner.tsx`, `talkx/tracking/*`, `styles/components.css` | **INCORPORADA** — a11y `text-primary-glow` → token AA | main já usa `text-[hsl(var(--primary-text))]` (`SatisfactionMetrics.tsx:20,271`; `ScheduledReportsManager.tsx:135,136,232`; `MultiplixMonitor.tsx:151,442,444,464`) e tem guarda `src/components/talkx/__tests__/primaryGlowProibido.test.ts`. Resíduo "ausente" é só a escolha `text-primary/70` vs `text-[hsl(var(--primary-text)/0.7)]` — a main é a melhor |
| `src/styles/utilities.css` | **INCORPORADA** | main:72-82 `@media (max-width:767px)` com `.safe-area-top`, `.safe-area-bottom`, `.scrollbar-none`, `body{overscroll-behavior-y:none}` + teste `src/styles/__tests__/mobileAreaSeguraRolagem.test.ts` |
| `.github/workflows/vercel-env-cleanup.yml` | **INCORPORADA (melhor)** | main:21-23 `shell: bash --noprofile --norc -euo pipefail {0}` |
| `.github/workflows/deploy-functions.yml` (preflight curl) | **INCORPORADA (melhor)** | main:386-391 já tem `--connect-timeout 10 --max-time 30` + `--show-error` + tratamento GR-001 de exit code |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | **OBSOLETA/falsa** | marca E12/E19/E20/E21/E67–E72/E77/E90/E97 como `[x] CONCLUÍDA — PR #2537`; a PR **não** foi mergeada. Substrato de E67/E68/E72/E77/E90 **está** na main por outras PRs (`ci.yml:62,476-477,269` cache bun/playwright e retention; `dependabot.yml:107` docker; `.github/workflows/notifica-falha-main.yml`), mas E19/E20/E27/E30/E38/E39/E92 não |
| `docs/reconciliation/tasks/P006.json` | **OBSOLETA/artefato gerado** | `plan` idêntico; só **14 das 100 tasks** mudam de status para `DONE_VERIFIED` citando #2537, e `plan.status_counts` **não** foi atualizado (fica inconsistente com as 14 mudanças). Formato: main minificada em 1 linha (223 821 B), branch pretty-print (280 089 B) — a main segue o formato do gerador |
| `docs/talkx/README.md` | **OBSOLETA/ruído** | adiciona 2ª linha para `ESTADOS.md`; main:21 já lista o arquivo uma vez |
| `scripts/ci/secrets-environments.unit.mjs` | **nenhum valor** | `.filter(Boolean)` é no-op: os 4 valores de `DESTINO_URL_POR_JOB` na main são strings não vazias |
| `scripts/db-audit/consolidar-veredito.test.mjs`, `check-migration-drift.test.mjs` | **nenhum valor** | ajustes (11→12 passos, `sql-sha256` no fixture) atrelados a mudanças de workflow/fixture da própria branch |
| `src/components/.../AvatarUpload.invalidacao`, `SettingsView`, `reduzirMovimentoInboxCrmConexoes`, `useDiagnosticsData.select`, `TalkXSegments.route`, `TalkXTemplatesRail`, `TalkXSegmentProgressTable`, `TalkXOverview.table`, `AdminView.*`, `AgentsView.conexoes`, `useNotifications*`, `TalkXCampaignScheduled.calendario`, `check-talkx-docs.unit.mjs` | **nenhum valor** | churn de teste: a branch **remove** 16/19/13/6/5/3 linhas de asserção que a main ainda tem, ou adiciona mocks de código que só existe na branch |
| `src/components/inbox/CRMAutoSync.tsx` | **nenhum valor** | `sonner` → `@/lib/lazyToast`: cosmético; a main usa `sonner` direto em 202 arquivos de `src/components/` |
| `src/components/dashboard/goals/GoalsTable.tsx` | **INCORPORADA** | `PRESENT_REVERSE_APPLIES` (prova mecânica) |

## Veredito: PERDIDA_PARCIAL — `apagar_branch_seguro = false`

## Lacunas a recuperar (hunks prontos p/ portar)

### 1. GA38 — JWT redigido automaticamente (ALTO · segurança)
`scripts/ci/redigir-relatorio.mjs`
```js
// após `export const TAMANHO_MINIMO = 5;`
// GA38: JWTs aparecem em traces/reports do E2E sem serem passados como --segredo-env
// (cabeçalho Authorization, campo access_token, etc.). Padrão: eyJ<header>.<payload>.<sig>
export const RE_JWT = /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu;
```
em `redigirConteudo`, depois do laço de segredos, antes do `return`:
```js
  // GA38: JWT automático — não depende de --segredo-env (Authorization Bearer, access_token…)
  saida = saida.replace(/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu, () => {
    ocorrencias += 1;
    return '[redigido]';
  });
```
em `redigirBytes`, antes do `return`:
```js
  // GA38: JWT em entradas de ZIP (JSON de network, traces…). latin1 é bijeção: cada byte
  // vira exatamente um char e volta — sem perda. Bytes > 127 não casam com [A-Za-z0-9_-].
  if (saida.includes(Buffer.from('eyJ'))) {
    const texto = saida.toString('latin1');
    let n = 0;
    const redigido = texto.replace(
      /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/gu,
      () => { n += 1; return '[redigido]'; },
    );
    if (n > 0) {
      saida = Buffer.from(redigido, 'latin1');
      ocorrencias += n;
    }
  }
```
Testes: `git show origin/claude/charming-mccarthy-jbxy56:scripts/ci/redigir-relatorio.unit.mjs` (5 testes GA38: RE_JWT, texto, arquivo, ZIP, `contarRestantes`).

### 2. GA27 — `deno test` antes do Deploy (ALTO · edges)
`.github/workflows/deploy-functions.yml`, logo após o passo `Typecheck das edge functions (deno check)`:
```yaml
      - name: Testes das edge functions (deno test)
        # GA27: roda os testes .test.ts de supabase/functions com o lock fixo do CI,
        # para nao publicar funcao com erro de tipo ou de comportamento.
        run: |
          set -euo pipefail
          shopt -s globstar
          deno test \
            --config scripts/ci/deno.json \
            --allow-env --allow-read --allow-net=127.0.0.1 \
            --no-check \
            supabase/functions/**/*.test.ts
```

### 3. GA30 — rollback não se reverte para si mesmo (ALTO · recuperação)
`.github/workflows/deploy-functions.yml`, bloco `concurrency` (main:90-92):
```yaml
# GA30: rollback usa grupo proprio para nao ser cancelado por um push normal
# na main que acione o grupo deploy-edge-functions-*.
concurrency:
  group: ${{ inputs.rollback_to_last_success && format('deploy-edge-rollback-{0}', inputs.function_name || 'all') || format('deploy-edge-functions-{0}', inputs.function_name || 'all') }}
  cancel-in-progress: false
```
no passo `Resolver ref para rollback automatico`, dentro do script node:
```js
          // GA30: o deploy atual acabou de ser criado com GITHUB_SHA — pular
          // qualquer Deployment com o mesmo SHA para nao "rollback" para si mesmo.
          const currentSha = process.env.GITHUB_SHA;
          for (const dep of deps) {
            if (dep.sha === currentSha) {
              process.stdout.write(`Pulando Deployment ${dep.id} (SHA atual: ${dep.sha})\n`);
              continue;
            }
```
e as duas mensagens finais (`... bem-sucedido (SHA diferente): ${dep.sha}` / `Nenhum Deployment com status success e SHA diferente de ${currentSha} ...`).
Contratos: `git diff 1252bb5a origin/claude/charming-mccarthy-jbxy56 -- scripts/ci/deploy-functions-workflow.unit.mjs` (GA27 ordem + GA30 grupo/SHA). **Atenção:** o assert da main fixa `group: deploy-edge-functions-...` com `^...$` — precisa ser relaxado junto.

### 4. GA39 — teardown E2E revoga sessões (MÉDIO · higiene de auth)
`scripts/ci/e2e-teardown.mjs`, em `limparFixture`, substituir `return { rpc, status: resposta.status };`:
```js
  // GA39: revogar todas as sessoes do usuario de teste para nao acumular tokens
  // no banco entre runs. Falha de logout nao derruba o teardown.
  let logoutStatus = null;
  try {
    const logout = await fetchImpl(`${base}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    });
    logoutStatus = logout.status;
  } catch {
    // erro de rede no logout e nao-bloqueante
  }

  return { rpc, status: resposta.status, logoutStatus };
```
e em `principal`, antes do `console.log('teardown OK...')`:
```js
    if (r.logoutStatus === null || r.logoutStatus >= 400) {
      console.log(`::warning::teardown: logout global falhou (HTTP ${r.logoutStatus ?? 'erro de rede'})`);
    }
```
Testes: `scripts/ci/e2e-teardown.unit.mjs` da branch (3 testes GA39 + `fetchFalso({logoutStatus})` e `chamadas.length === 3`).

### 5. GA92 — `actions-kpi` respeita o rate limit (MÉDIO)
`scripts/ci/actions-kpi.mjs`, em `coletarJobs`:
```js
  { repo, token, porPagina = POR_PAGINA, maxPaginas = 100, maxRuns = 300, pedir: buscar = pedir } = {},
) {
  const todos = runs ?? [];
  let alvo = todos;
  if (todos.length > maxRuns) {
    alvo = [...todos].sort((a, b) => duracaoMinutos(b) - duracaoMinutos(a)).slice(0, maxRuns);
    console.error(
      `::warning::GA92: coletarJobs: ${todos.length} runs na janela; buscando jobs apenas dos ${maxRuns} mais longos para nao ultrapassar o rate limit da API.`,
    );
  }
  const jobs = [];
  for (const run of alvo) {
```
Teste: `scripts/ci/actions-kpi.unit.mjs` da branch (5 runs, `maxRuns: 3`, confere ids 5/4/3).

### 6. Testes que protegem comportamento já na main (MÉDIO)
- `scripts/ci/migration-drift-stdout.unit.mjs` (novo, 64 linhas) — E53: `DIVERGENCE_LINE_RE = /^\d{14} \| /u` e linha de divergência como 1ª coisa no stdout.
- `scripts/ci/verify-ledger-statements.unit.mjs` (+37 linhas) — GA05: cabeçalho `--` do psql CLI; inclui fixture real `supabase/migrations/20261004195051_gmail_oauth_state_attempts.sql` (existe na main).
Copiar com `git show origin/claude/charming-mccarthy-jbxy56:<arquivo>`.

### 7. Baixo
- `.github/codeql/codeql-config.yml`: `+ - 'docs/**'`, `+ - '**/*.md'`, `+ - 'supabase/migrations/**'` em `paths-ignore`.
- `vitest.config.ts:23`: `reporter: ["text-summary", "lcov", "json-summary"]`.
- `scripts/ci/ga04-runtime-stdout.unit.mjs` (novo) — só se quiser o contrato de fonte; intenção já coberta por `db-migrate-contratos.unit.mjs`.

## Não portar
`health-check.mjs` (endpoint trocado), `lote-pendente.mjs` exit 3 (código morto), `check-claude-md.unit.mjs`
(falharia), `ChatMessagesArea.tsx` (remove método existente), `primitives.tsx` Th, `AppearanceSettings.a11y`
`it.todo`, `TeamChatPanel.settings-wiring` rename, `TalkXOverview.states` (regex corrompida), demais testes
`src/`, `CRMAutoSync` lazyToast, `docs/audits/PLANO_*.md`, `docs/reconciliation/tasks/P006.json`,
`docs/talkx/README.md`, `secrets-environments.unit.mjs`, `consolidar-veredito.test.mjs`,
`check-migration-drift.test.mjs`, `vercel-env-cleanup.yml`.

## Verificação adversarial

Papel: refutar a triagem. Resultado: **veredito PERDIDA_PARCIAL confirmado**, mas **dois dos "impactos
reais" alegados caem** e dois outros ficam *mais fortes* do que o dossiê afirmava. `apagar_branch_seguro`
segue `false`. `main` auditada em `dac285f62dbb96370abb2ca4aa7adbac2c88b7a5`.

### Base confirmada
- PR #2537: `state=closed`, `merged=false`, `merged_at=null`, `mergeable_state=behind` (GET
  `/repos/adm01-debug/Zapp_Web_V2/pulls/2537`). As marcações `[x] CONCLUÍDA — PR #2537` no plano e no
  `P006.json` são **falsas** — confirmado.
- Nenhuma das 5 lacunas de CI foi removida de propósito: `git log -S'scope=global'`, `-S'RE_JWT'`,
  `-S'maxRuns'`, `-S'currentSha'` em `origin/main` → **vazios** (nunca existiram na main).
- APIs que os testes resgatáveis usam existem na main: `avaliarStatementsDoLedger` e
  `SQL_STATEMENTS_DO_LEDGER` em `scripts/db-audit/verify-ledger-statements.mjs` (`flatMap(splitStatements)`
  nas linhas 48-49), `parseMigrationFile` em `scripts/db-audit/register-migration.mjs:187`, fixture
  `supabase/migrations/20261004195051_gmail_oauth_state_attempts.sql` presente. **Correção de caminho no
  dossiê:** o script é `scripts/db-audit/verify-ledger-statements.mjs`, não `scripts/ci/...` (lá só existe
  o `.unit.mjs`).

### REFUTADO 1 — GA38 não é buraco de segurança aberto (alto → BAIXO)
A premissa "o JWT do usuário de teste pode sair em traces/relatórios de E2E publicados" é **falsa na main
de hoje**:
- Os dois workflows que têm as credenciais reais (`e2e-logado.yml:157`, `e2e-logado-isolado.yml:136,218`)
  publicam **só** `.../public`, não `playwright-report/` nem `test-results/`.
- Esse diretório é montado por `scripts/e2e-isolated/run.mjs`: `:371-376` define
  `redacted()` com `/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g → '[JWT REDACTED]'`, aplicado em
  todo log gravado (`:425`, `:469`, `:706`, `:756`); `:781-796` copia para `public/` apenas metadados
  controlados e logs já redigidos; `:800` ainda roda `redigir-relatorio.mjs` por cima. Contrato testado em
  `scripts/ci/e2e-isolated-runtime.unit.mjs:887,915,1329` (`doesNotMatch(log.published, /eyJ.../)`).
- Os workflows que publicam `playwright-report/` (`ci.yml:513-520`, `e2e-talkx.yml:134-138`) **não recebem**
  `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` (`ci.yml:492-500`: suíte deslogada, sessão falsa via
  `installFakeSession` com REST/RPC mockados) — o JWT que aparece lá é sintético.
Logo GA38 é defesa em profundidade (valia se alguém voltar a publicar report cru), não vazamento ativo.
Recuperar: sim, mas como item **baixo**, não como "segurança/alto".

### REFUTADO 2 — GA27 já está coberto pelo check obrigatório (alto → BAIXO/redundante)
`ci.yml:218-223` (job `edge-contracts`) roda
`deno check --config scripts/ci/deno.json --frozen` + `mapfile -t testes_edge < <(git ls-files 'supabase/functions/**/*.test.ts')`
e `deno test --config scripts/ci/deno.json --frozen ... "${testes_edge[@]}"` — ou seja, **os 229 testes**.
E `edge-contracts` entra no required check: `ci.yml:406-424` o `ci-gate` (`✅ CI Gate (required check)`,
listado em `scripts/ci/github-settings-baseline.json` → `required_status_checks`) reprova se
`needs.edge-contracts.result != 'success'`. Como o deploy só roda em `push` na `main`
(`deploy-functions.yml:33-41`), nenhum commit chega ao deploy sem os 229 testes verdes. O passo da branch é
ainda **mais fraco** que o da main (`--no-check`, sem `--frozen`). Vale no máximo como defesa em
profundidade do próprio workflow de deploy.

### CONFIRMADO e reforçado
- **GA30 (real, médio-alto)** — `deploy-functions.yml:143-184`: o resolvedor pega o 1º Deployment do
  environment com algum status `success` e **não exclui `GITHUB_SHA`**; `:193-203` ("Provar checkout
  imutavel") aceita, porque `git merge-base --is-ancestor X X` é verdadeiro. Cenário real: HEAD da main
  deployou com sucesso e o comportamento está quebrado → `rollback_to_last_success` republica **o mesmo
  SHA**, sem erro. Ressalva à redação da triagem: o caminho de recuperação **não** fica inutilizado — o
  `workflow_dispatch` ainda aceita `source_ref` explícito; o que está quebrado é a automação do W66/E61.
  O grupo de concorrência único (`:90-91`, `cancel-in-progress: false`) só afeta o run *pendente*.
- **GA39 (real, médio — agora com medida)** — `git show origin/main:scripts/ci/e2e-teardown.mjs` termina em
  `return { rpc, status: resposta.status }` (:70), sem logout. Medido em produção
  (`tnnnlkbymytvtqngbbqh`, SELECT em `auth.sessions`): **539 sessões vivas** de
  `e2e.zapp@promobrindes.com.br`, de 2026-10-28 a 2026-11-14 (2ª colocada: 141 de
  `qa.hermes@promobrindes.com.br`). O acúmulo é fato, não hipótese.
- **GA92 (real, médio — agora com medida)** — `actions-kpi.mjs` não tem teto de runs (só
  `maisLentos({limite:5})`, :74-82, que é de exibição) e `coletarJobs` faz 1 GET por run da janela de 7
  dias. Medido: `GET /actions/runs?created=>=2026-11-08&per_page=1` → `total_count: 2500`. Com o
  `GITHUB_TOKEN` (1 000 req/h por repositório) o coletor do `branch-hygiene-audit.yml:74` estoura o limite.

### Lacunas adicionais / correções ao dossiê
1. GA38 e GA27 devem descer para "baixo" na fila de recuperação; o pacote de resgate de valor real é
   **GA30 + GA39 + GA92** (+ os testes GA05/E53, que encaixam na main).
2. Se GA27 for portado, use o comando da main (`--frozen`, `git ls-files`), não o da branch
   (`--no-check` + `shopt -s globstar`), que é mais fraco e não falha em arquivo de teste novo.
3. Resíduo não citado: a exclusão `!playwright-report/**/*.zip` em `ci.yml:519` e `e2e-talkx.yml:137`
   **não** cobre o ZIP em base64 embutido no `index.html` (o próprio `redigir-relatorio.mjs:271-277`
   documenta esse vetor). Hoje é inócuo (suítes deslogadas, sessão falsa); passa a importar no dia em que
   um workflow com credencial publicar `playwright-report/`.
