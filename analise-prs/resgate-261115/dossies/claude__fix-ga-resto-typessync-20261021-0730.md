# claude__fix-ga-resto-typessync-20261021-0730 — PERDIDA_PARCIAL

Branch `origin/claude/fix-ga-resto-typessync-20261021-0730` (tip `f63da0dd8`, 1 commit, merge_base `d7af7a67`).
PR **#2143** "fix(ci): Resto GA20-GA25 (Gate 3, DESTINO split, auto-merge grants)", fechada 2026-10-31 com
"delta líquido contra a main é zero. As mudanças já estão na main" — **alegação FALSA**, provada abaixo.
Triagem 2026-11-08 marcou OBSOLETA — também incorreta.

## Propósito
Fase 1 do plano GA20-GA25 (15/10/2026) sobre os três guardas de banco no CI:
GA20 Gate 3 contra o catálogo do HEAD · GA21 split credencial/gates · GA22 auto-merge só com grants intactos
e drift explicado por migration · GA23 lote pendente não abre PR e fica verde · GA24 catálogo/manifesto/types
neutros quando o lote explica · GA25 apply registra Deployment `producao-ddl` e o guarda vivo acusa version sem Deployment.

## O que está na main e o que não está

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/db-audit/drift-explicado.mjs` + `.test.mjs` | na main, **sem nenhum chamador** | `git log origin/main --` → `2cf0153ae 2026-11-15 chore(pacote 8) … (#3135)`; `git grep -c drift-explicado origin/main -- .github/workflows` → rc=1 (zero hits) |
| `scripts/db-audit/gate1-pendente.mjs` + `.test.mjs` | na main, **sem chamador** | idem `2cf0153ae`; zero hits em `.github/workflows` |
| `scripts/db-audit/check-deployments-ledger.mjs` + `.test.mjs` | na main, **sem chamador** | idem `2cf0153ae`; zero hits em `.github/workflows` |
| `.github/workflows/types-sync.yml` | GA21 **já na main** (jobs `ler-banco` / `gates-e-pr`, linhas 109 e 364, teste `scripts/ci/types-sync-jobs-credentials.unit.mjs`). GA20, GA22, GA23 **ausentes** | main:485 `check-remocoes-destrutivas.mjs supabase/schema-catalog.json /tmp/catalog.new.json`; main:758 `if: steps.pull-request.outputs.pull-request-number != ''` |
| `.github/workflows/db-live-guard.yml` | GA24 e GA25 **ausentes** | main:257/282 chamam `check-catalog-fresh.mjs`/`check-manifest-fresh.mjs` direto, sem fallback; sem `deployments: read`, sem `pending-versions.txt` |
| `.github/workflows/db-migrate.yml` | GA25 **ausente** | sem `deployments: write` nem `createDeployment` na main |
| `scripts/ci/ga20-ga25-contratos.unit.mjs` | arquivo **inexistente na main** | `NEW_FILE_ABSENT_IN_MAIN` |
| `scripts/db-audit/consolidar-veredito.mjs` | entrada `ddl-fora-do-fluxo` **ausente** | diff main↔branch nas `PASSOS` e `ORDEM_CAUSA` |
| `scripts/ci/allowed-actions.json` | `step-security/harden-runner` ausente na main — e **não usado por nenhum workflow** nem na branch | `git grep -c harden-runner <branch> -- .github/workflows` → zero |

Ou seja: o resgate do pacote 8 (2026-11-15, **depois** do fechamento da PR) trouxe as três bibliotecas,
mas **nenhuma fiação**. Hoje são código morto na main.

## Defeito real ativo na main hoje (GA20)

`types-sync.yml` linha 405 sobrescreve o catálogo antes dos gates:

```yaml
      - name: Aplicar candidatos no worktree
        run: |
          ...
          if [ "${{ needs.ler-banco.outputs.catalog_changed }}" = true ]; then cp /tmp/catalog.new.json supabase/schema-catalog.json; fi
```

e a linha 485 compara justamente esse arquivo com o novo:

```yaml
          if node scripts/db-audit/check-remocoes-destrutivas.mjs supabase/schema-catalog.json /tmp/catalog.new.json 2>&1 | tee /tmp/gate3.log; then
```

Quando `catalog_changed=true` (o único caso em que o Gate 3 importa) os dois arquivos são **byte a byte
iguais** → zero objetos removidos → **Gate 3 sempre passa**. O único guarda contra um PR de sync que apaga
tabela/view/função ainda consumida pelo `src/` está neutralizado. Correção da branch (portar literal):

```yaml
          git show HEAD:supabase/schema-catalog.json > /tmp/catalog.base.json
          test -s /tmp/catalog.base.json
          if node scripts/db-audit/check-remocoes-destrutivas.mjs /tmp/catalog.base.json /tmp/catalog.new.json 2>&1 | tee /tmp/gate3.log; then
```

## Lacunas a recuperar (hunks essenciais)

### 1. GA20 — Gate 3 contra o HEAD · `.github/workflows/types-sync.yml` ~485 — **alto**
Hunk acima. Dois comandos; nada mais muda.

### 2. GA22 — auto-merge só com sync explicado e grants intactos · `types-sync.yml` ~505 e ~758 — **alto**
Hoje o auto-merge é incondicional (main:758), então um DDL feito por fora do `db-migrate` é "legalizado"
sozinho pelo PR de sync. Novo step antes do label, e condição no auto-merge:

```yaml
      - name: Verificar se sync e explicado por migration (GA22)
        id: explicado
        if: >-
          needs.ler-banco.outputs.schema_changed == 'true' &&
          steps.gate1.outputs.passed == 'true' &&
          steps.gate2.outputs.passed == 'true' &&
          steps.gate3.outputs.passed == 'true'
        run: |
          if [ "${{ needs.ler-banco.outputs.grants_changed }}" = true ]; then
            echo "explicado=false" >> "$GITHUB_OUTPUT"
            echo "::notice::grants alterados: revisao humana obrigatoria (GA22)."
          elif node scripts/db-audit/drift-explicado.mjs --base /tmp/catalog.base.json --novo supabase/schema-catalog.json --migrations-dir supabase/migrations 2>&1 | tee /tmp/explicado.log; then
            echo "explicado=true" >> "$GITHUB_OUTPUT"
          else
            echo "explicado=false" >> "$GITHUB_OUTPUT"
            echo "::warning::sync com objeto sem migration no repo: sem auto-merge (GA22)."
          fi
```

```yaml
      - name: Habilitar auto-merge no PR de sincronizacao
        if: >-
          steps.pull-request.outputs.pull-request-number != '' &&
          steps.explicado.outputs.explicado == 'true' &&
          needs.ler-banco.outputs.grants_changed == 'false'
```

Mais o step "Marcar needs-human quando sync exige revisao (GA22)" (cria o label `needs-human` cor `b60205`
via `actions/github-script` e aplica `[needs-human, types-sync]`) — ver `git show f63da0dd8:.github/workflows/types-sync.yml`
na seção após o auto-merge. **Depende do item 1** (`/tmp/catalog.base.json`).

### 3. GA23 — lote pendente não abre PR e fica verde · `types-sync.yml` ~445, ~692, ~733 — **médio**
Na main o Gate 1b só repassa o booleano grosso do `lote-pendente.mjs` (main:447-449) e o PR é aberto mesmo
com apply pendente — o sync pode reverter o lote com artefatos gerados de um banco que ainda não recebeu o apply.
Portar: `pendente` como output do `ler-banco` (em vez de `awaiting_apply`), lista de versions pendentes no
artifact (`/tmp/pending-versions.txt`), Gate 1b usando o classificador com escopo + frescor de 24 h:

```yaml
      - name: Gate 1b — GA23 — verificar se falha e apply-pendente
        id: gate1b
        if: needs.ler-banco.outputs.schema_changed == 'true' && steps.gate1.outputs.passed == 'false'
        run: |
          node scripts/db-audit/gate1-pendente.mjs \
            --tsc-log /tmp/tsc.log \
            --pending /tmp/pending-versions.txt \
            --migrations-dir supabase/migrations
```

e `needs.ler-banco.outputs.pendente != 'true'` nas condições de "Abrir ou atualizar PR" (main:635) e
"Exigir PR criado ou atualizado", mais o step "Registrar sync pendente (GA23)" que escreve o estado no summary.

### 4. GA24 — guarda vivo neutro quando o lote explica · `.github/workflows/db-live-guard.yml` — **médio**
Step auxiliar novo (após o de migrations, `continue-on-error: true`, **sem `id:`** para não entrar no veredito):

```yaml
      - name: Listar versions pendentes (GA24)
        if: steps.credencial.outcome == 'success'
        continue-on-error: true
        run: |
          find supabase/migrations -maxdepth 1 -type f -name '*.sql' \
            -printf '%f\n' | cut -c1-14 | sort -u > /tmp/local-versions.txt
          node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
            -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
            > /tmp/ledger-versions.txt 2> /tmp/pending-list.log || true
          comm -23 /tmp/local-versions.txt /tmp/ledger-versions.txt > /tmp/pending-versions.txt || true
          paste -sd, /tmp/pending-versions.txt > /tmp/pending-versions.csv || true
          echo "pendentes: $(cat /tmp/pending-versions.csv)" | tee /tmp/pending-list.log
```

e, nos passos `catalog` (main:257), `manifest` (main:282) e `types` (main:333), trocar a chamada direta por
`if <check> ; elif [ -s /tmp/pending-versions.txt ] && node scripts/db-audit/drift-explicado.mjs --base <baseline> --novo <fresh> --migrations-dir supabase/migrations --versions "$(cat /tmp/pending-versions.csv)"; then <notice sync pendente> ; else <error + exit 1> ; fi`
(hunks completos em `git diff origin/main f63da0dd8 -- .github/workflows/db-live-guard.yml`).
`grants`/`triple-parity` ficam estritos — o contrato GA24 do teste exige isso.

### 5. GA25 — Deployment `producao-ddl` + detector · `db-migrate.yml`, `db-live-guard.yml`, `consolidar-veredito.mjs` — **médio, e a branch está quebrada aqui**
A ideia é válida (hoje nada detecta DDL aplicado fora do `db-migrate`), mas o código da branch **não funciona**;
três defeitos a corrigir ao portar:

1. `check-deployments-ledger.mjs:46` lê `d?.payload?.versions`, e o step da branch cria o Deployment **sem
   `payload`** (passa só `description: 'DDL aplicado pelo db-migrate: ' + versions.join(',')`). Nenhuma version
   ficaria registrada. Correção: `payload: { versions }` no `createDeployment`.
2. O step "Detector de DDL fora do fluxo (GA25)" usa `gh api …/deployments` sem `GH_TOKEN` no `env:`
   (o job do `db-live-guard` não define GH_TOKEN global). Falha de autenticação → `continue-on-error: true`
   + consolidador = job vermelho.
3. Corte `--since 20261016000000` contra o ledger real: **122 versions** já registradas desde então
   (`select count(*) … where version >= '20261016000000'` no projeto `tnnnlkbymytvtqngbbqh` → 122, de
   `20261016001136` a `20261115020000`) e os 17 Deployments `producao-ddl` existentes (criados pelo gate de
   environment, `description: null`, sem payload) não cobrem nenhuma. Ligar como está ⇒ guarda vivo vermelho
   na primeira execução. O corte precisa ser a data do merge do GA25, não 16/10.
4. A entrada `{ id: 'ddl-fora-do-fluxo', … log: '/tmp/step-ddl-fluxo.log' }` em `consolidar-veredito.mjs`
   (`PASSOS` + `ORDEM_CAUSA`) **só pode entrar junto** com o step: `consolidar()` trata `outcome === ''`
   como `❌ (ausente)` (`consolidar-veredito.mjs:103`) e derruba o job.

### 6. `scripts/ci/ga20-ga25-contratos.unit.mjs` — **médio**
142 linhas, 11 testes que travam os invariantes em YAML; roda no `ci.yml:166` (`node --test scripts/ci/*.unit.mjs`).
Os 2 testes de GA21 duplicam `scripts/ci/types-sync-jobs-credentials.unit.mjs` (já na main) — podar.
Há 3 trechos mortos no arquivo (`void auto;`, `void passo;`, `void tripla;`) — limpar ao portar.
O teste GA25 exige `20261016000000` no YAML; se o corte mudar (item 5.3), o teste muda junto.

### 7. `scripts/ci/allowed-actions.json` — `step-security/harden-runner` — **nenhum**
Nenhum workflow usa a action, nem na branch. A branch também alarga `selected_actions_patterns` em
`scripts/ci/github-settings-baseline.json` — mexer no perímetro do GitHub sem uso real. Descartar.

## Armadilha no porte
Os três YAML da branch são de 21/10 e **regridem** a main em pontos sem relação com GA20-GA25 — portar
arquivo inteiro causa dano. Já medido no diff `origin/main ↔ f63da0dd8`:
`actions/setup-node` v7.1.0→v7.0.0, `supabase/setup-cli` v3.2.0→v3.0.1,
`peter-evans/create-pull-request` v8.1.2→v8.1.1, `actions/download-artifact` v8.0.2→v7.0.0;
remoção do gate `validate-runtime-proof.mjs` (W28/E64) no `db-migrate`; volta de `--db-url "$SUPABASE_DB_URL"`
no `supabase db push`; remoção do step "Verificar invariantes gerais do banco vivo" (`live-invariants`) e do
seu log no artifact no `db-live-guard`; remoção do step "Resumo de falha" (Z029) e linhas duplicadas no Job
Summary do `types-sync`; `REF_DISPARO` revertido para interpolação direta em `run:`.
**Portar hunk a hunk, só os marcados GA20/GA22/GA23/GA24/GA25.**

## Veredito
**PERDIDA_PARCIAL** · confiança alta. GA21 incorporado; bibliotecas incorporadas mas mortas; GA20/GA22/GA23/GA24/GA25
fora da main. `apagar_branch_seguro = false` — a branch é a única cópia dos hunks de fiação.

## Verificação adversarial

Papel: refutar a triagem (PERDIDA_PARCIAL). Resultado: **não refutada — concordo**. `origin/main` em `dac285f62` (15/11).
Tentei provar que a main já cobre a fiação GA20/GA22/GA23/GA24/GA25 e falhei em todos os cinco pontos.

### 1. GA20 — Gate 3 comparando o catálogo com ele mesmo: confirmado na main
- `origin/main:.github/workflows/types-sync.yml:405` (step "Aplicar candidatos no worktree"):
  `if [ "${{ needs.ler-banco.outputs.catalog_changed }}" = true ]; then cp /tmp/catalog.new.json supabase/schema-catalog.json; fi`
- `origin/main:.github/workflows/types-sync.yml:485` (Gate 3):
  `node scripts/db-audit/check-remocoes-destrutivas.mjs supabase/schema-catalog.json /tmp/catalog.new.json`
- O arquivo de destino é sobrescrito 80 linhas ANTES do gate, logo os dois argumentos são byte-idênticos
  quando `catalog_changed=true` — exatamente o caso em que o gate deveria morder. O script usa
  `process.argv[2]`/`argv[3]` (`origin/main:scripts/db-audit/check-remocoes-destrutivas.mjs:35-36`), sem
  recuperar a base por conta própria.
- A branch corrige em `f63da0dd8:.github/workflows/types-sync.yml:518-520`:
  `git show HEAD:supabase/schema-catalog.json > /tmp/catalog.base.json` + `test -s` + o gate recebendo
  `/tmp/catalog.base.json /tmp/catalog.new.json`.
- Não está na main e nunca esteve: `git grep -n 'catalog.base' origin/main -- .github/workflows` → rc=1;
  `git log -S'catalog.base.json' --oneline origin/main -- .github/workflows/types-sync.yml` → vazio
  (não foi removido de propósito; nunca entrou).

### 2. GA22 — auto-merge incondicional: confirmado
- `origin/main:.github/workflows/types-sync.yml:758-764`: `Habilitar auto-merge no PR de sincronizacao` com
  `if: steps.pull-request.outputs.pull-request-number != ''` e `gh pr merge --auto --squash`. Nenhuma condição
  de `explicado`/`grants_changed`.
- `git log -S'drift-explicado' --oneline origin/main -- .github/workflows` → vazio: a biblioteca jamais teve
  chamador em workflow na main.
- `git grep -n 'needs-human' origin/main` → 1 único hit, e é a regra escrita no plano
  (`origin/main:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:173`), não implementação. Ou seja:
  a regra é vigente e documentada na main, só não está fiada — reforça PERDIDA, não OBSOLETA.
- A branch implementa em `f63da0dd8:.github/workflows/types-sync.yml:537-546` (step `explicado`, com
  `grants_changed` forçando revisão humana).

### 3. GA23 — Gate 1b grosso: confirmado
- `origin/main:.github/workflows/types-sync.yml:445-450`: o Gate 1b só ecoa `awaiting_apply=true` e um
  `::notice::`; não chama `gate1-pendente.mjs`.
- `git grep -n 'gate1-pendente' origin/main -- .github/workflows` → rc=1. A biblioteca existe
  (`origin/main:scripts/db-audit/gate1-pendente.mjs`, flags `--tsc-log`/`--pending`/`--migrations-dir`
  nas linhas 12-14) e é código morto.
- Não há `pendente` como output do `ler-banco` na main (só `awaiting_apply`, linha 126), nem
  `/tmp/pending-versions.txt` em lugar algum do types-sync.

### 4. GA24 — db-live-guard sem fallback de lote pendente: confirmado
- `origin/main:.github/workflows/db-live-guard.yml:254` e `:269` chamam `check-catalog-fresh.mjs` /
  `check-manifest-fresh.mjs` dentro de um subshell `set -e`, sem nenhum `elif` de drift explicado.
- `git grep -n -E 'pending-versions|drift-explicado' origin/main -- .github/workflows/db-live-guard.yml` → rc=1.
- `permissions` do job: `contents: read` + `issues: write` (`origin/main:.github/workflows/db-live-guard.yml:49-51`),
  sem `deployments: read`.

### 5. GA25 — apply sem Deployment e detector ausente: confirmado
- `git grep -n -E 'deployments: write|createDeployment' origin/main -- .github/workflows` → só
  `origin/main:.github/workflows/deploy-functions.yml:122`. O `db-migrate.yml` tem `environment: producao-ddl`
  (linha 75) mas nenhuma permissão nem chamada de `createDeployment`.
- `origin/main:scripts/db-audit/consolidar-veredito.mjs:32-47`: a lista de vereditos não tem
  `ddl-fora-do-fluxo`; `git grep -n 'step-ddl-fluxo' origin/main` só acha prosa de `docs/prod-readiness.md`.
- `check-deployments-ledger.mjs` existe na main byte-idêntico à branch e sem chamador; a branch o fia em
  `f63da0dd8:.github/workflows/db-live-guard.yml:390-396` (`gh api .../deployments --paginate` +
  `--ledger --deployments --since 20261016000000 --environment producao-ddl`).

### 6. Encaixe no código atual (o trabalho ainda serve?)
- Assinaturas batem com o que a branch chama: `drift-explicado.mjs` (`--base/--novo/--migrations-dir`,
  `origin/main:scripts/db-audit/drift-explicado.mjs:24-25`), `gate1-pendente.mjs` (linhas 12-14),
  `check-deployments-ledger.mjs` (`--ledger/--deployments/--since/--environment`, linhas 24-26 + 52-59).
- O teste de contrato `scripts/ci/ga20-ga25-contratos.unit.mjs` não existe na main
  (`git ls-tree origin/main <path>` → vazio) e seria coletado automaticamente por
  `origin/main:.github/workflows/ci.yml:166` (`node --test scripts/ci/*.unit.mjs`).
- Porém a fiação **não se aplica verbatim**: a main refez o split de credencial por outro caminho em
  `ac97c0ea3 2026-10-29 ci(types-sync): separa leitura do banco e escrita da PR (#2339)`, depois do commit da
  branch (21/10). Os três jobs são os mesmos (`preflight`/`ler-banco`/`gates-e-pr`) mas as linhas deslocaram
  (`ler-banco` 109 na main x 112 na branch; `gates-e-pr` 364 x 381). Portar hunk a hunk, como a triagem já
  recomendou; aplicar o arquivo inteiro da branch regrediria o que veio de #2339 e de
  `49a0a6b3d` (Z029, 31/10) e `49af49e25` (bumps, 09/11).

### 7. Alegação de fechamento da PR #2143
Falsa, como a triagem disse. As três bibliotecas só chegaram à main em
`2cf0153ae 2026-11-15 chore(pacote 8): resgate de 5 frentes (#3135)` — 15 dias depois do fechamento (31/10) —
e sem nenhum chamador: `git grep -c -E 'drift-explicado|gate1-pendente|check-deployments-ledger' origin/main -- .github/workflows`
→ rc=1 (zero hits). "Delta zero, já está na main" não se sustenta.

### Conclusão
`concorda = true` · `veredito_final = PERDIDA_PARCIAL` · `apagar_branch_seguro = false`.
A branch `f63da0dd8` é a única cópia dos hunks de fiação GA20/GA22/GA23/GA24/GA25 e do contrato
`scripts/ci/ga20-ga25-contratos.unit.mjs`. Impacto ativo hoje, em ordem: (a) Gate 3 do types-sync é um
no-op — um PR de sync que remova tabela/view/função ainda consumida pelo `src/` passa; (b) o auto-merge
desse PR é incondicional, então DDL feito fora do `db-migrate` é legalizado sem revisão humana.
