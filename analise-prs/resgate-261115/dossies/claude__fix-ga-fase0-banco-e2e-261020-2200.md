# claude/fix-ga-fase0-banco-e2e-261020-2200 (PR #2124)

- tip `e966771219ba418e3c97ca22b79407bfaa9fdd58` · merge_base `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc` (19/10/2026) · 1 commit, 13 arquivos
- Commit: `FASE0-GA02-GA12: parar o sangramento (banco, E2E, notificacao)` — lote da "fase 0" do plano de GitHub Actions: GA02 (trava anti-apagão do CLAUDE.md), GA03/GA04/GA05 (testes de contrato de CI), GA08/GA09/GA12 (gatilho/fila/orçamento do E2E logado), GA10 (headers `# docs:` dos workflows), GA11 (RPC `e2e_fixture_message` para a fixture E2E), GA56/GA58 (timeout interno do Vitest, grupo de concorrência do dispatch).
- **Veredito: PERDIDA_PARCIAL.** 9 de 13 arquivos estão incorporados ou obsoletos com prova; sobram **4 lacunas reais** (2 no `ci.yml`, 2 testes de contrato).

## Tabela arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/ci.yml` (GA02) | **INCORPORADA** (versão melhor) | `origin/main:.github/workflows/ci.yml:73-76` — passo `🛡️ Integridade do CLAUDE.md (GA02)` com `git fetch --depth=1 origin main` + `CLAUDE_MD_BASE=FETCH_HEAD`; a branch comparava contra `HEAD`, que no checkout do CI é o próprio arquivo (no-op). |
| `.github/workflows/ci.yml` (GA58) | **PERDIDA** | `origin/main:.github/workflows/ci.yml:34` ainda é `group: ci-${{ github.event.pull_request.number \|\| github.ref }}`; o dispatch manual continua disputando/cancelando o grupo do push na main. |
| `.github/workflows/ci.yml` (GA56) | **PERDIDA** | `origin/main:.github/workflows/ci.yml:108-109` roda `bun vitest run --shard=...` sem `timeout`; o job tem `timeout-minutes: 12` (linha 89 do bloco `unit-tests`). Sem o `timeout 11m` interno, o runner mata o passo como `cancelled` e o agregado lê "pulado" em vez de vermelho. |
| `.github/workflows/e2e-logado.yml` (GA08/GA09) | **INCORPORADA** (mais rigorosa) | `origin/main:.github/workflows/e2e-logado.yml:13-19` (`workflow_run` de `CI/CD Pipeline`, `branches:[main]`), `:43-48` (`if` no JOB com `conclusion=='success'` + `event=='push'` + `head_branch=='main'` + `head_repository.full_name == github.repository`), `:32-33` (grupo fixo `e2e-logado` na main, grupo próprio por `run_id` fora dela). Travado por teste: `origin/main:scripts/ci/e2e-isolated-legacy-workflow.unit.mjs:115-125`. |
| `.github/workflows/e2e-logado.yml` (GA12) | **OBSOLETA** | Main substituiu o orçamento por `timeout-minutes` por grupo da matriz (`:43`, `:53-65` → 75/75/75/45/45), pinado em `e2e-isolated-legacy-workflow.unit.mjs:103-113`. E o passo que a branch patcheia não existe mais: main executa `bash scripts/e2e-isolated/run.sh suite ...` em backend descartável (`:134-150`), não `bun run test:e2e` direto — não há stdout de Playwright para `tee`/`grep 'did not run'`. |
| `.github/workflows/notifica-falha-main.yml` (GA10) | **INCORPORADA** | `origin/main:.github/workflows/notifica-falha-main.yml:4-6` tem `falha:` e `avisa:` (texto mais completo) **e** mantém a linha `workflows monitorados:` que a branch apagava, já com `front-release-targets` somado. |
| `.github/workflows/vercel-env-cleanup.yml` (GA10) | **INCORPORADA** | `origin/main:.github/workflows/vercel-env-cleanup.yml:1-5` — header `# docs:` com `gatilho/prova/falha/avisa`. |
| `docs/ci/README.md` | **OBSOLETA** (artefato gerado) | Gerado por `origin/main:scripts/ci/render-workflow-docs.mjs` com `--check` no `ci.yml`. Main está em `**21 workflows.**` (`docs/ci/README.md:7`) e já cobre CodeQL, E2E logado, Notifica falha, Vercel Env Cleanup e `check-talkx-pr-body.yml`; a versão da branch diz `**16 workflows.**` e cita `talkx-pr-body.yml`, nome que não existe na main. |
| `e2e/fixtures/e2e-contact.ts` (GA11) | **OBSOLETA** (decisão registrada na main) | `origin/main:supabase/migrations/_superseded/README.md:101-118`: "Nunca aplicada — movida para evitar `missing_count=2` no `db-migrate.yml` (2026-11-02)… A suite E2E usa o fallback legado em `e2e/fixtures/e2e-contact.ts` enquanto a função não existir… **Não mover de volta**". Produção (leitura via MCP, 15/11): `schema_migrations` com `version='20261020120000'` → **0**; `pg_proc` com `proname='e2e_fixture_message'` → **0**. Sem a função, o `POST /rpc/e2e_fixture_message` falha sempre e cai no fallback: comportamento idêntico ao da main, com um request extra por chamada. (O trigger `trg_guard_message_provenance_fields` **existe** em produção, mas a suíte logada da main roda contra backend descartável.) |
| `scripts/ci/check-claude-md-integrity.mjs` (GA02) | **OBSOLETA** (superada) | Main tem a mesma ideia muito mais evoluída: alvo `AGENTS.md` + `docs/agentes/*.md` + os 2 skills, referência órfã, limiar por arquivo (`FILE_SHRINK_THRESHOLD`), base configurável e `execFileSync` contra injeção de comando. As seções que a branch exige (`'Banco de dados OFICIAL'`, `'Perímetro do GitHub'`, `'um PR por lote'`) não existem mais — `CLAUDE.md` hoje é só `@AGENTS.md`; as obrigatórias da main são `## Postura … ## Grafo de código`. |
| `scripts/ci/check-claude-md-integrity.unit.mjs` (GA02) | **OBSOLETA** | Testa `avaliarClaudeMd`, export que não existe na main. Main tem suíte própria sobre `secoesFaltando` / `referenciasDocsInvalidas` / `skillsDivergentes` / `erroDeEncolhimento`. |
| `scripts/ci/confirm-hash.unit.mjs` (GA04) | **PERDIDA** (teste) | O comportamento JÁ está na main: `origin/main:scripts/db-audit/validate-runtime-proof.mjs:643` (`process.stderr.write(modHash.descreverConfirmacao(…))`), `:649` (`process.stdout.write(confirmacao + '\n')` — único `process.stdout.write` do arquivo), `:611` (`process.stderr.write('Contrato generico: …')`). Falta só o teste que trava o contrato: `origin/main:scripts/ci/confirm-hash.unit.mjs` não tem o caso GA04. Aplica limpo (`MAIN_UNCHANGED_SINCE_BASE` + `ABSENT_APPLIES_CLEAN`) e passa. |
| `scripts/ci/verify-ledger-statements.unit.mjs` (GA05) | **PERDIDA** (teste) | O comportamento JÁ está na main: `origin/main:scripts/db-audit/verify-ledger-statements.mjs:48-49` normaliza via `splitStatements`. Rodado contra a main nesta triagem: cabeçalho `-- ledger exportado pelo CLI…` → `{"ok":true,"total":2}`; arquivo divergente com cabeçalho → `{"ok":false,"motivo":"o statement 2 do ledger difere do arquivo"}`. Falta o teste. Aplica limpo e passa. |
| `scripts/ci/e2e-logado-workflow.unit.mjs` (GA08/09/12) | **OBSOLETA** (superada) | `origin/main:scripts/ci/e2e-isolated-legacy-workflow.unit.mjs:46-79,103-125` cobre o mesmo contrato com muito mais rigor (parse de YAML, não `includes` de texto). As asserções da branch **reprovariam** contra a main: `workflows: [CI/CD Pipeline]` (main usa `workflows: ["CI/CD Pipeline"]`, com aspas), `/group: e2e-logado\n/` (main interpola `${{ github.ref == 'refs/heads/main' && 'e2e-logado' \|\| … }}`), `global_timeout_ms` (não existe mais). |
| `scripts/ci/fila-merge.unit.mjs` (GA03/GA49) | **OBSOLETA** (alvo removido de propósito) | `scripts/ci/fila-merge.mjs` (204 linhas) e `scripts/ci/fila-merge.unit.mjs` (167 linhas) foram **apagados** da main pelo commit `41853318c` — `chore(pacote): pacote 6 — as 26 PRs abertas integradas num ciclo de CI (#3113)`. Hoje só restam menções em `analise-prs/` e `docs/_arquivo/`. |
| `supabase/migrations/20261020120000_e2e_fixture_message_rpc.sql` (GA11) | **INCORPORADA** (arquivada) | `diff` byte a byte contra `origin/main:supabase/migrations/_superseded/20261020120000_e2e_fixture_message_rpc.sql` → **idênticos**. Movida pelo commit `7c42b7ce1` (`chore(db): move 2 migrations não-aplicadas para _superseded/ — db-migrate fica verde (#2606)`). Nada a recuperar: o SQL está preservado e a decisão de não aplicar é registrada. |

## Lacunas a recuperar (hunks prontos para portar)

### 1. `.github/workflows/ci.yml` — GA56: `timeout 11m` no shard do Vitest (valor médio)
Alvo: `origin/main:.github/workflows/ci.yml:108-109`. Sem isso, o estouro do `timeout-minutes: 12` do job vira `cancelled` e o check agregado trata como pulado em vez de vermelho.
```diff
+      # GA56: `timeout 11m` interno — sai com erro (exit 124) antes do teto de
+      # 12 min do job; sem isso o runner mata o passo como `cancelled` e o
+      # agregado marcaria o check como pulado em vez de vermelho.
       - name: 🧪 Run Vitest shard ${{ matrix.shard }}/3
-        run: bun vitest run --shard=${{ matrix.shard }}/3
+        run: timeout 11m bun vitest run --shard=${{ matrix.shard }}/3
         env:
           CI: true
```

### 2. `.github/workflows/ci.yml` — GA58: grupo próprio para o dispatch manual (valor baixo)
Alvo: `origin/main:.github/workflows/ci.yml:33-35`.
```diff
 concurrency:
-  group: ci-${{ github.event.pull_request.number || github.ref }}
+  # GA58: o dispatch manual ganha o proprio grupo (run_id unico) em vez de
+  # disputar/cancelar o grupo do push. Push na main compartilha o grupo por
+  # ref de proposito: um grupo por SHA nunca cancelaria nada e a fila de
+  # builds da main cresceria sem fim (comentario honesto em vez de SHA).
+  group: ci-${{ github.event_name == 'workflow_dispatch' && github.run_id || github.event.pull_request.number || github.ref }}
   cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

### 3. `scripts/ci/confirm-hash.unit.mjs` — GA04: trava o contrato do stdout (valor médio)
Inserir depois do teste `E64 (F-11)` (hoje `origin/main:scripts/ci/confirm-hash.unit.mjs:56-58`). Passa contra a main como está.
```js
test('GA04: validate-runtime-proof imprime o hash SOZINHO no stdout (captura do bash) e a descricao no stderr', () => {
  assert.match(preflight, /process\.stderr\.write\(modHash\.descreverConfirmacao/, 'descricao vai para o stderr, nao contamina a captura');
  assert.ok(preflight.includes('process.stdout.write(confirmacao'), 'hash vai para o stdout');
  const saidasStdout = preflight.split('\n').filter((l) => l.includes('process.stdout.write'));
  assert.equal(saidasStdout.length, 1, 'stdout carrega exatamente uma linha: o hash');
  assert.match(preflight, /process\.stderr\.write\('Contrato generico/, 'log informativo do contrato generico vai para o stderr');
});
```

### 4. `scripts/ci/verify-ledger-statements.unit.mjs` — GA05: cabeçalho `--` do CLI (valor médio)
Inserir depois de `conteudo diferente e recusado nomeando o statement` (hoje `origin/main:scripts/ci/verify-ledger-statements.unit.mjs:50-55`). Passa contra a main como está (verificado em execução).
```js
test('GA05: cabecalho `--` do CLI no ledger e normalizado (run 37355980323)', () => {
  const arquivo = ['create table a ();', 'select 1;'];
  const ledgerComCabecalho = JSON.stringify([
    '-- ledger exportado pelo CLI em 2026-10-15',
    'create table a ();',
    'select 1;',
  ]);
  const r = avaliarStatementsDoLedger({ bruto: ledgerComCabecalho, statementsDoArquivo: arquivo });
  assert.equal(r.ok, true);
  assert.equal(r.total, 2);
});

test('GA05: arquivo diferente continua reprovando mesmo com cabecalho', () => {
  const ledgerComCabecalho = JSON.stringify(['-- cabecalho do CLI', 'create table a ();', 'select 2;']);
  const r = avaliarStatementsDoLedger({ bruto: ledgerComCabecalho, statementsDoArquivo: ['create table a ();', 'select 1;'] });
  assert.equal(r.ok, false);
});
```

## Não recuperar
- `docs/ci/README.md`: artefato gerado. Se o `ci.yml` mudar, rodar `node scripts/ci/render-workflow-docs.mjs` em vez de portar o diff.
- `e2e/fixtures/e2e-contact.ts` (GA11) e a migration: só quando o dono aprovar a DDL via `producao-ddl`, seguindo `supabase/migrations/_superseded/README.md:113-118`.
- `check-claude-md-integrity.*`, `e2e-logado-workflow.unit.mjs`, `fila-merge.unit.mjs`, GA12 do `e2e-logado.yml`: alvo removido ou superado na main.

## Apagar branch?
**Não** (`apagar_branch_seguro=false`): as 4 lacunas acima ainda não estão na main.

## Verificação adversarial

Parecer: **concordo com PERDIDA_PARCIAL**; branch **não** pode ser apagada. Tentei refutar as 4 lacunas e também reabrir os 9 arquivos dados como incorporados/obsoletos. Nenhuma lacuna nova; uma correção de valor (GA56).

Lacunas confirmadas (não estão na main, não foram removidas de propósito, ainda encaixam):
- GA56 e GA58 nunca existiram na main: `git log -S'timeout 11m' origin/main` → só `c41f5e573` (outro arquivo); `git log -S"ci-\${{ github.event_name == 'workflow_dispatch'" origin/main -- .github/workflows/ci.yml` → vazio. Estado atual: `origin/main:.github/workflows/ci.yml:34` (`group: ci-${{ github.event.pull_request.number || github.ref }}`) e `:108-109` (`run: bun vitest run --shard=...`, job com `timeout-minutes: 12` em `:81`). Ambos seguem abertos no plano vigente: `origin/main:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:267` (GA56) e `:271` (GA58), marcados `- [ ]` · P3.
- GA04 e GA05: executei as asserções da branch contra o código da main (script em `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/verif/ga0405.mjs`, worktree idêntico a `origin/main` nesses arquivos via `git diff --stat origin/main --` vazio): `GA05-1 {"ok":true,"total":2}`, `GA05-2 {"ok":false,"motivo":"o statement 2 do ledger difere do arquivo"}`, `GA04 stdout writes = 1 ["process.stdout.write(confirmacao + '\n');"]` — todas passam. E os casos realmente não existem na main: `origin/main:scripts/ci/confirm-hash.unit.mjs` tem 5 testes (E64/F-11), nenhum sobre stdout/stderr; `origin/main:scripts/ci/verify-ledger-statements.unit.mjs` tem 11 testes, nenhum com cabeçalho `--`.

**Correção ao dossiê — GA56 vale BAIXO, não médio.** A justificativa ("o agregado lê como pulado em vez de vermelho"), que vem do próprio plano (`PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:268`), não se sustenta contra a main de hoje: o `ci-gate` (`origin/main:.github/workflows/ci.yml:406-430`) roda com `if: always()` e reprova com `exit 1` em qualquer `needs.unit-tests.result != "success"` — `cancelled` por estouro do `timeout-minutes: 12` já sai **vermelho**; a única exceção é `skipped` em PR draft (`:422`). O ganho restante do `timeout 11m` é cosmético (falha como `failure`/exit 124 em vez de `cancelled`). GA56 tem ainda uma segunda metade que a branch não fez (nome do check sem `${{ matrix.shard }}` literal).

Tentativas de refutar os descartes (todas falharam, os descartes procedem):
- GA02 (`ci.yml` + `check-claude-md-integrity.*`): `git grep avaliarClaudeMd origin/main` → **vazio**; a main mira `AGENTS.md` + `docs/agentes/*.md` + os 2 skills, com `FILE_SHRINK_THRESHOLD` e base configurável (`check-claude-md-integrity.mjs:4-15,23-43,129-145`). As 3 seções exigidas pela branch não existem mais.
- GA08/GA09: `origin/main:.github/workflows/e2e-logado.yml:12-17,28-30,36-42` — mais rigoroso que a branch (exige `event=='push'` **e** `head_branch=='main'` **e** mesmo repo). As asserções do `e2e-logado-workflow.unit.mjs` da branch reprovariam: a main escreve `workflows: ["CI/CD Pipeline"]` (com aspas) e `group: ${{ github.ref == 'refs/heads/main' && 'e2e-logado' || format('e2e-logado-branch-{0}', github.run_id) }}`.
- GA12: `grep` em `origin/main:.github/workflows/e2e-logado.yml` por `test:e2e`/`global-timeout`/`did not run` → **nenhum**; só `:150 bash scripts/e2e-isolated/run.sh suite "$E2E_GROUP" "$E2E_OUTPUT"`, com `timeout-minutes` por grupo (`:43,53-65`). O passo que a branch patcheia não existe.
- GA11 (`e2e/fixtures/e2e-contact.ts`): a main resolveu **melhor** que a branch, sem DDL — `origin/main:e2e/fixtures/e2e-contact.ts:115-121` desvia para `insertIsolatedFixtureMessage` quando `ZAPP_E2E_LOCAL === '1'` (preparo privilegiado no backend descartável, comentado em `:86-87`) e mantém o REST autenticado só como ramo legado. A RPC da branch é desnecessária.
- Migration GA11: `diff` entre a versão da branch e `origin/main:supabase/migrations/_superseded/20261020120000_e2e_fixture_message_rpc.sql` → **idênticos** (verificado nesta sessão).
- `fila-merge.unit.mjs`: `git ls-tree -r origin/main -- scripts/ci | grep fila-merge` → **vazio**; alvo apagado por `41853318c` (`chore(pacote): pacote 6 … (#3113)`). Teste sem módulo não roda.
- `docs/ci/README.md`: artefato gerado, com `--check` no CI (`origin/main:.github/workflows/ci.yml:153`, "📖 Verificar README gerado dos workflows").
- Headers GA10: `origin/main:.github/workflows/notifica-falha-main.yml:1-6` (inclui `workflows monitorados:` que a branch apagava) e `vercel-env-cleanup.yml:1-5` — incorporados.

Conclusão: `veredito_final=PERDIDA_PARCIAL`, `apagar_branch_seguro=false`. Ordem de recuperação por valor real: GA05 e GA04 (testes, médio) → GA58 (baixo) → GA56 (baixo, justificativa original já coberta pelo `ci-gate`).
