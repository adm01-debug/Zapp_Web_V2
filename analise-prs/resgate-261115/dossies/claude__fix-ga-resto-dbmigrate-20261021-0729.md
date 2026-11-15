# claude__fix-ga-resto-dbmigrate-20261021-0729 — PERDIDA_PARCIAL

- Ref: `origin/claude/fix-ga-resto-dbmigrate-20261021-0729` · tip `ed3996686` · merge-base `d7af7a671c` (2026-10-19)
- PR #2142 (CLOSED, não mergeada, 2026-10-31) — título: `fix(ci): Resto GA13-GA17 (db-migrate 2 jobs, apply_all_missing, portao destrutivo)`
- **O comentário de fechamento é falso.** Dizia: "delta líquido contra a main é zero. As mudanças já estão na main."
  Prova do contrário abaixo (jobs, inputs e 6 scripts ausentes na main).

## Propósito (1 commit)
`ed3996686` GA13-GA17: db-migrate em 2 jobs com lote real, portão destrutivo e contratos em dispatcher.
Reduz `.github/workflows/db-migrate.yml` de 1764 → **466 linhas** extraindo o corpo para `scripts/db-audit/`:
- **GA13** — divide o job único `migrate` em `preflight` (`environment: banco-leitura`, 20 min, só leitura) e `apply` (`producao-ddl`, 45 min, `if: inputs.apply == true`). Hoje na main até o dry-run fica em `Waiting` aguardando revisor.
- **GA14** — input `apply_all_missing`: aplica todas as versions locais ausentes do ledger, em ordem; hash do lote (lista ordenada + sha de cada arquivo + `github.sha`) fecha a janela TOCTOU; liga `avaliarPlanoDoDryRunApplyAll`, que na main existe e **nunca é chamada**.
- **GA15** — último passo do apply dispara `types-sync.yml` + `db-live-guard.yml` (`actions: write` só nesse job).
- **GA16** — as 16 validações pós-apply históricas saem do YAML para o dispatcher `scripts/db-audit/contracts/post-apply.sh`.
- **GA17** — portão destrutivo no preflight + input `confirm_destructive` + bloco no Job Summary.
- **GA25 (gancho)** — apply imprime `GA25-DEPLOYMENT-RECORD` no summary + outputs do job.

## Estado da main (medido)

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/db-migrate.yml` | **Nada de GA13-GA17 na main.** Segue job único `migrate`, 1493 linhas, `environment: producao-ddl`, `timeout-minutes: 45`, 4 inputs. Sem `apply_all_missing`, sem `confirm_destructive`, sem chamada a `list-destructive`, `calcular-lote`, `provar-lote`, `post-apply.sh`, sem `gh workflow run`. | `git show origin/main:.github/workflows/db-migrate.yml \| wc -l` → 1493; `grep -nE '^  [a-z_-]+:'` → só `migrate:` (:71), `environment: producao-ddl` (:75); grep de `apply_all_missing\|confirm_destructive\|list-destructive\|provar-lote\|post-apply\.sh\|types-sync` → 0 hits de código |
| `scripts/db-audit/assert-runtime-proof.mjs` (597 linhas) | AUSENTE na main | `git cat-file -e origin/main:…` → falha |
| `scripts/db-audit/calcular-lote.sh` (75) | AUSENTE | idem |
| `scripts/db-audit/compose-confirm-hash.mjs` (51) | AUSENTE; `comporHashLote` não existe em nenhum arquivo da main | `git grep -n comporHashLote origin/main` → vazio |
| `scripts/db-audit/contracts/post-apply.sh` (476) | AUSENTE; as 16 validações seguem inline no YAML da main | `git cat-file -e` falha; `removed_still_in_main=1240` no YAML |
| `scripts/db-audit/proof-sha.mjs` (11) | AUSENTE | idem |
| `scripts/db-audit/provar-lote.sh` (33) | AUSENTE | idem |
| `scripts/ci/assert-runtime-proof.unit.mjs`, `compose-confirm-hash.unit.mjs`, `db-migrate-ga13-17.unit.mjs`, `proof-sha.unit.mjs` | AUSENTES (4 arquivos de teste) | `git cat-file -e` falha nos 4 |
| `scripts/db-audit/dry-run-plan.mjs` | Na main a função `avaliarPlanoDoDryRunApplyAll` existe (`:125`) mas o CLI só chama `avaliarPlanoDoDryRun` (`:164`). O modo `--apply-all --esperados` da branch não está lá. | `git show origin/main:scripts/db-audit/dry-run-plan.mjs \| grep -n avaliarPlano` |
| `scripts/db-audit/list-destructive.mjs` | **INCORPORADA e melhorada na main** (PR #3135 `chore(pacote 8)`). A main tem `RE_ALTER_DROP = /\bDROP\s+(?!DEFAULT\|NOT NULL\|IDENTITY\|…)/i` (:38) e `RE_DESTRUTIVO_EMBUTIDO` (:28) — cobre `ALTER TABLE t DROP apelido` sem a palavra COLUMN e DELETE/TRUNCATE em CTE, que a versão da branch (`/\bDROP\s+(COLUMN\|CONSTRAINT)\b/i`) não cobria. As 2 linhas `missing_in_main` são justamente a regex estreita + comentário → **obsoletas**. | `git show origin/main:scripts/db-audit/list-destructive.mjs` :28,:31,:38 |
| `scripts/ci/list-destructive.unit.mjs` | INCORPORADA (8 testes GA17 na main, superset dos 5 da branch). `missing_in_main=0`. | `git show origin/main:scripts/ci/list-destructive.unit.mjs \| grep ^test` |
| `docs/runbooks/migracao-segredos-environments.md` | Lacuna real (3 linhas): main ainda documenta `db-migrate.yml › migrate` (:37, :241). É consequência documental do GA13 — só porta junto com o YAML. | `git show origin/main:docs/runbooks/…` :37,:241 |
| `scripts/ci/secrets-environments.unit.mjs` | Main pina `'db-migrate.yml:migrate': 'producao-ddl'` (:77). O mapa de 2 jobs da branch depende do YAML. | `git show origin/main:scripts/ci/secrets-environments.unit.mjs:77` |
| `scripts/ci/db-migrate-workflow.unit.mjs`, `db-migrate-contratos.unit.mjs`, `dry-run-plan.unit.mjs`, `parity-hardening.unit.mjs`, `verify-ledger-statements.unit.mjs` | Lacunas são pins estruturais do YAML novo (nome de passo, 2 timeouts, secret 2x). **Só fazem sentido junto com o YAML**; portados sozinhos quebram o CI. | `git diff d7af7a671c <ref> -- scripts/ci/` |

### GA13-GA17 ainda são backlog ABERTO na main (não foram descartados)
- `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:144-158` — GA13, GA14, GA15, GA16, GA17 todos com `- [ ]` (não feitos).
- `docs/audits/REVISAO_PLANO_MELHORIAS_2026-10-30.md:36` — "`db-migrate.yml` exige environment `producao-ddl`, aceita migration/bundles conhecidos, sem `apply_all_missing` ou confirmação específica destrutiva. → **Resolver GA13–GA17 explicitamente**; manter guardas e revisão por migration, **sem aplicar lote indiscriminado**."
- Ressalva do dono a respeitar no porte: o lote da GA14 não pode virar "apply indiscriminado". Na branch ele já é fechado (conjunto exato do ledger + hash do lote + confirmação destrutiva por version), mas vale checar com o dono se quer manter revisão por migration.

### Código órfão achado na main (defeito real, não é desta branch)
`scripts/db-audit/list-destructive.mjs` entrou na main mas **nenhum workflow o chama** — o único consumidor é o próprio teste.
`git grep -n list-destructive origin/main -- .github scripts` → só `scripts/ci/list-destructive.unit.mjs` e o próprio arquivo.
Ou seja: o detector da GA17 existe e é testado, mas o **portão** (passo no preflight + input `confirm_destructive`) nunca foi ligado. É a lacuna de maior valor e a mais barata de fechar.

## Melhorias que SÓ existem na main — não regredir no porte
A main avançou 16+/6- no YAML depois do merge-base; a branch é anterior. Ao portar, **rebaseie em cima destes**:
1. `supabase db push --db-url "$SUPABASE_DB_URL" --include-all …` nos dois pontos (dry-run e apply) — PR #2450 `fix(db-migrate): use validated database URL`. A branch tem `supabase db push --include-all …` sem `--db-url` (linhas 255 e 392 do YAML da branch).
2. Validador externo W28/E64 no passo de runtime:
   ```
   CONFIRMATION_HASH="$(RUNTIME_JSON="$RUNTIME" node scripts/db-audit/validate-runtime-proof.mjs)"
   if [ "$APPLY" = "true" ] && [ "$CONFIRMATION_HASH" != "$CONFIRM_RUNTIME_SHA256" ]; then
     echo "::error::Confirmacao recusada pelo validador externo; runtime, arquivo ou commit mudaram."; exit 1
   fi
   ```
   A branch substitui isso por `assert-runtime-proof.mjs` + `compose-confirm-hash.mjs`; decida qual fica (ou mantenha os dois) — `scripts/db-audit/validate-runtime-proof.mjs` já está na main.
3. Correções do actionlint/shellcheck/zizmor (PR #2656): `env: REF_DISPARO: ${{ github.ref }}` + `${REF_DISPARO}` no `run` (a branch ainda interpola `${{ github.ref }}` dentro do `run`, linhas 90 e 296 — **regressão de zizmor**) e `${TARGET_FILE#"${TARGET_VERSION}"_}` com aspas.
4. Pins de action atuais: `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` e `supabase/setup-cli@689adcfb80d947100a1eab127289b97d1fb07b13 # v3.2.0`. A branch tem v7.0.0 / v3.0.1.

## Como portar (ordem; branch nova de `origin/main`)
Os 6 scripts + 4 testes novos saem inteiros da branch, sem conflito:
`git show origin/claude/fix-ga-resto-dbmigrate-20261021-0729:<caminho>`
- `scripts/db-audit/assert-runtime-proof.mjs`, `calcular-lote.sh`, `compose-confirm-hash.mjs`, `contracts/post-apply.sh`, `proof-sha.mjs`, `provar-lote.sh`
- `scripts/ci/assert-runtime-proof.unit.mjs`, `compose-confirm-hash.unit.mjs`, `db-migrate-ga13-17.unit.mjs`, `proof-sha.unit.mjs`
- `scripts/db-audit/compose-confirm-hash.mjs` importa `sha256DeTexto, comporHashConfirmacao` de `./confirm-hash.mjs`, que **já está na main** — dependência satisfeita.
- `scripts/db-audit/provar-lote.sh` chama `run-runtime-contract.mjs` (na main), `assert-runtime-proof.mjs`, `proof-sha.mjs`, `compose-confirm-hash.mjs` (novos).
- `calcular-lote.sh` usa `psql-safe.mjs` (na main).

Já o `.github/workflows/db-migrate.yml` **não aplica**: é reescrita de 1738 linhas contra um arquivo que a main mexeu. Reconstrua a partir do YAML da branch (466 linhas) reaplicando os 4 itens acima. Pontos de fiação do YAML da branch (linha : conteúdo):
- `:30 apply_all_missing` e `:45 confirm_destructive` (novos inputs)
- `:69 preflight:` / `:74 environment: banco-leitura` / `:78 timeout-minutes: 20`
- `:181 bash scripts/db-audit/calcular-lote.sh` (passo "Calcular versions ausentes do ledger")
- `:183-225` passo "Portao de migration destrutiva (GA17)": `:194 node scripts/db-audit/list-destructive.mjs --arquivo "$ARQUIVO" --versao "$v"` e `:220 … --confirmar "$DESTRUCTIVE_VERSIONS" --com "$CONFIRM_DESTRUCTIVE"`
- `:235 HASH=$(bash scripts/db-audit/provar-lote.sh "$VERSIONS" "$NEEDS_APPLY" "$GITHUB_SHA")`
- `:273` e `:427 bash scripts/db-audit/contracts/post-apply.sh` (loop por version, `TARGET_VERSION`/`NEEDS_APPLY`/`APPLY` no env)
- `:276 apply:` / `:280 environment: producao-ddl` / `:284-287 permissions: contents: read + actions: write` / `:283 timeout-minutes: 45`
- `:353 Fechar janela TOCTOU do lote` + `:376 RECOMPUTADO=$(bash … provar-lote.sh "$VERSIONS_AGORA" true "$GITHUB_SHA")`
- `:433 Registrar Deployment … (gancho GA25)` → `GA25-DEPLOYMENT-RECORD` no summary + outputs `applied_versions`/`applied_at`
- `:457-466 Disparar types-sync e guarda vivo (GA15)`: `gh workflow run types-sync.yml --ref main` + `gh workflow run db-live-guard.yml --ref main`, `GH_TOKEN: ${{ github.token }}`

Depois do YAML, porte as lacunas dos 5 testes já existentes (`db-migrate-workflow.unit.mjs` 2 timeouts + secret 2x, `db-migrate-contratos.unit.mjs` → `provar-lote.sh`, `dry-run-plan.unit.mjs` + CLI `--apply-all`, `parity-hardening.unit.mjs` → dispatcher, `verify-ledger-statements.unit.mjs` nome do passo), o mapa de `scripts/ci/secrets-environments.unit.mjs` (`db-migrate.yml:preflight` → `banco-leitura`, `db-migrate.yml:apply` → `producao-ddl`), as 3 linhas do runbook e marque GA13-GA17 como feitos no plano de 2026-10-15.

Nada aqui é migration nem toca o banco por si: `counts.migrations = 0`. É workflow + scripts de CI + teste + docs.

## Caminho mais curto (se não for portar tudo)
Ligar só a GA17: passo no job `migrate` atual chamando `scripts/db-audit/list-destructive.mjs` (já na main, versão melhor) + input `confirm_destructive`. Fecha o código órfão sem reescrever o YAML.

## Veredito
**PERDIDA_PARCIAL.** Entrou na main só o detector da GA17 (`list-destructive.mjs` + unit, PR #3135, em versão melhor que a da branch). GA13, GA14, GA15, GA16, o portão da GA17 e o gancho GA25 — 6 scripts novos (1246 linhas), 4 testes novos e a reescrita do YAML — **não estão na main** e seguem como backlog aberto nos planos da main.
`apagar_branch_seguro = false`: é a única cópia desse trabalho.

## Verificação adversarial

Refutação tentada contra `origin/main@dac285f62` (2026-11-15). **Triagem confirmada: PERDIDA_PARCIAL.** Não achei na main nenhuma das lacunas alegadas, nem remoção deliberada, nem incompatibilidade que inviabilize o porte.

### 1. As lacunas realmente não estão na main (verificado por mim)
- `git show origin/main:.github/workflows/db-migrate.yml | wc -l` → **1493**; único job é `migrate:` (`:71`), com `name: Migration oficial com preflight` (`:72`). `preflight` na main é só um **step id** (`:176`, referenciado em `:244`, `:908`, `:922`…), não um job — logo o dry-run continua dentro do job gateado por `producao-ddl` e **espera aprovação**. Na branch: `preflight:` (`:69`, `environment: banco-leitura`, `timeout-minutes: 20`) + `apply:` (`:276`, `producao-ddl`, 45 min), 466 linhas.
- Inputs da main (`:34-53`): só `migration_version`, `confirm_project_ref`, `apply`, `confirm_runtime_sha256`. **Sem** `apply_all_missing`, **sem** `confirm_destructive`.
- `grep` em `origin/main:.github/workflows/db-migrate.yml` por `apply_all_missing|confirm_destructive|list-destructive|provar-lote|calcular-lote|post-apply.sh|compose-confirm-hash|gh workflow run|banco-leitura` → **0 ocorrências de código**. GA15 também: `types-sync`/`db-live-guard` aparecem só num comentário (`:23`); não há `actions: write` nem `gh workflow run`.
- 6 scripts e 4 testes: `git cat-file -e origin/main:<path>` **falha** para todos os 10 (`assert-runtime-proof.mjs`, `calcular-lote.sh`, `compose-confirm-hash.mjs`, `contracts/post-apply.sh`, `proof-sha.mjs`, `provar-lote.sh`, `scripts/ci/{assert-runtime-proof,compose-confirm-hash,db-migrate-ga13-17,proof-sha}.unit.mjs`).

### 2. Não foi removido de propósito
- `git log -S'comporHashLote' origin/main` → **vazio**: o hash do lote nunca existiu na main.
- `git log d7af7a67..origin/main -- .github/workflows/db-migrate.yml` → 6 commits, todos bumps do Dependabot, lint de workflows (#2656), `use validated database URL` (#2450) e correções de CI (#2156). **Nenhum** remove, reverte ou desativa GA13-GA17.
- Nenhum commit em `scripts/db-audit` menciona remoção desses arquivos; eles simplesmente nunca entraram.

### 3. O trabalho ainda encaixa na main
Todas as dependências que os scripts da branch importam/chamam existem na main: `scripts/db-audit/confirm-hash.mjs` (`comporHashConfirmacao`, `sha256DeTexto`), `run-runtime-contract.mjs`, `psql-safe.mjs`, `dry-run-plan.mjs`, `generic-migration-runtime.sql`, `sql-lexer.mjs`. Porte viável.

### 4. GA17: incorporação parcial confirmada — e a main é melhor
`origin/main:scripts/db-audit/list-destructive.mjs:38` traz `RE_ALTER_DROP = /\bDROP\s+(?!DEFAULT\b|NOT\s+NULL\b|IDENTITY\b|EXPRESSION\b|GENERATED\b|SYSTEM\b)/i` (pega `ALTER TABLE t DROP apelido`, sem a palavra `COLUMN`) e ainda `RE_DESTRUTIVO_EMBUTIDO` para `WITH … (DELETE FROM …)`. A branch tem a versão fraca `\bDROP\s+(COLUMN|CONSTRAINT)\b` (`:24`) e nenhum embutido. As 2 linhas "faltantes" de `list-destructive.mjs` são **regressão**: não portar.
Mas o detector está **órfão**: o único consumidor na main é o próprio teste (`origin/main:scripts/ci/list-destructive.unit.mjs:11,42,67`); nenhum workflow o invoca. Portão desligado.

### 5. Achados adicionais (reforçam a lacuna)
- **Defeito ativo na main, não só backlog**: `origin/main:docs/MIGRATIONS.md:509` manda "disparar `db-migrate.yml` com `apply_all_missing=true` e `apply=false`" — input que não existe no workflow. O dono seguindo o runbook oficial toma **HTTP 422** no dispatch. Já registrado como W27 no plano (`PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:62`).
- **GA14 morta na main**: `origin/main:scripts/db-audit/dry-run-plan.mjs:125` exporta `avaliarPlanoDoDryRunApplyAll` e `scripts/ci/dry-run-plan.unit.mjs:128,140,155` a testa, mas o CLI (`:160-167`) exige `--esperado` de 14 dígitos e chama só `avaliarPlanoDoDryRun`. Nenhum caminho de produção liga o modo lote. Segundo artefato órfão da mesma frente.
- **Backlog aberto confirmado**: `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md:144,147,151,154,156` → GA13, GA14, GA15, GA16, GA17 todos com `- [ ]`. `REVISAO_PLANO_MELHORIAS_2026-10-30.md:36` repete a pendência e põe a ressalva do dono: "Resolver GA13–GA17 explicitamente; manter guardas e revisão por migration, **sem aplicar lote indiscriminado**".
- O dossiê da triagem anterior (`origin/main:docs/_arquivo/analise-prs/dossies/PR-2142.md`) fechou a PR como `BLOQUEADO_CI_E_BEHIND` com as 4 perguntas em "NÃO VERIFICADO" — ou seja, **nunca** se verificou se estava na main. Nada ali sustenta "as mudanças já estão na main".

### 6. Ressalva de escopo para o resgate (não altera o veredito)
`apply_all_missing` é exatamente o "lote indiscriminado" que a `REVISAO_PLANO_MELHORIAS_2026-10-30.md:36` pede para evitar. A branch mitiga com hash do lote + portão destrutivo + TOCTOU, mas quem portar GA14 deve dizer isso ao dono na PR. GA17 (ligar o detector já na main + `confirm_destructive`) e GA16 (tirar 1240 linhas de validação do YAML) são o pedaço de menor risco e podem ir primeiro.

**Parecer:** `concorda=true`, `veredito_final=PERDIDA_PARCIAL`, `apagar_branch_seguro=false` — a branch é a única cópia de 1246 linhas de script + 4 testes + o YAML de 466 linhas.
