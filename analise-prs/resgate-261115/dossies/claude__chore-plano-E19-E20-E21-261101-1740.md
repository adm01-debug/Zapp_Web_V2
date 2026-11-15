# claude/chore-plano-E19-E20-E21-261101-1740 — PR #2501

- `ref`: `origin/claude/chore-plano-E19-E20-E21-261101-1740` · tip `40f7bb3d3` · merge_base `1252bb5a4` (2026-11-01)
- Triagem anterior (2026-11-08) dizia `OBSOLETA` para a PR 2501. **Parcialmente errado**: a nota do CONTRIBUTING ficou obsoleta, mas a atualização do plano E19/E20/E21 continua verdadeira e **não está na main**.
- 100% docs. Zero `src/`, zero migration, zero edge, zero workflow (`counts` do item, confirmado por `git diff --stat`).

## Propósito

8 commits. Marcar as etapas **E19, E20 e E21** do plano de auditoria do GitHub Actions como concluídas (com evidência), propagar o novo status para o pacote de reconciliação (`docs/reconciliation/`) e acrescentar uma linha no `CONTRIBUTING.md` sobre o `auto-update-pr-branch.yml`.

```
40f7bb3d3 docs: nota sobre auto-update-pr-branch no CONTRIBUTING
6b6e7076d chore: adiciona notas FEITO para E20 e E21 no plano   <-- TRUNCOU o plano
c6ddabeac / bf81ef881 / a8b55b60d  merges de main
688a7e80a fix: corrigir hashes do pacote de reconciliacao apos mudanca de status E19/E20/E21
5999f4dcc fix(plano): atualizar P006 e tabela de reconciliação para E19/E20/E21
83ae2156c chore(plano): marcar E19/E20/E21 como [x] — implementados em types-sync.yml
```

## ⚠️ A ponta da branch está corrompida

`docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` tem **18 linhas** no tip, contra 975 na main — o commit `6b6e7076d` truncou o arquivo no meio de uma frase (`... + \`CLAUDE.md`, sem fechar). Contagem por commit:

| commit | linhas do plano |
|---|---|
| `1252bb5a4` (base) | 975 |
| `83ae2156c` | 976 |
| `5999f4dcc` … `c6ddabeac` | 979 |
| `6b6e7076d`, `40f7bb3d3` (tip) | **18** |

Consequência: **não se pode portar o tip**. O conteúdo íntegro e intencional está em **`c6ddabeac`**. Os 871 `removed_still_in_main` da pré-classificação são esse truncamento, não trabalho a recuperar.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `CONTRIBUTING.md` | **OBSOLETA** | A nota descreve `.github/workflows/auto-update-pr-branch.yml`, que foi **apagado da main** em `41853318c` (2026-11-14, PR #3113). `git cat-file -e origin/main:.github/workflows/auto-update-pr-branch.yml` → *does not exist*. Aplicar a linha hoje documentaria um workflow inexistente. |
| `docs/audits/PLANO_...2026-10-01.md` | **PERDIDA** (intenção em `c6ddabeac`; tip corrompido) | Main ainda tem `- [ ] **E19**` (linha 507), `- [ ] **E20**` (512), `- [ ] **E21**` (514) e **não** tem as 3 linhas da tabela de reconciliação. As 3 afirmações são **verdadeiras na main de hoje** (provas abaixo). |
| `docs/reconciliation/PLAN_REGISTRY.json` | **PERDIDA** (derivada) | Main (linha ~211): `"DONE_VERIFIED": 23` / `"NOT_IMPLEMENTED": 15`; branch: 26 / 12. `git diff --stat 1252bb5a4 origin/main -- docs/reconciliation/` → vazio (a main não tocou o pacote desde a base). |
| `docs/reconciliation/MASTER_LEDGER.json` | **PERDIDA** (2 números) + 36.599 linhas de ruído | Diff semântico (JSON normalizado, `sort_keys`) main × branch = **12 linhas**: `DONE_VERIFIED 271→274`, `NOT_IMPLEMENTED 220→217`. Todo o resto do diff bruto é reformatação minificado→*pretty-print*. |
| `docs/reconciliation/tasks/P006.json` | **PERDIDA** (3 tarefas) + 6.359 linhas de ruído | Diff semântico = 241 linhas: `status` de E19/E20/E21 vira `DONE_VERIFIED`, com `implementation.note`, `acceptance.note` e `pr_numbers` (1897 / 2378 / —). Resto = *pretty-print*. |
| `docs/reconciliation/evidence/ARTIFACT_MANIFEST.json` | **Ruído** (4 sha256) | Rehash dos arquivos acima; só faz sentido se o pacote for regerado. |
| `docs/reconciliation/evidence/TASK_LEDGER_FULL.json.gz` | **Ruído** (binário) | Reempacotamento (2.305.252 → 2.321.369 bytes). Nenhum script ou workflow da main lê/valida esse pacote: `git grep -ln 'ARTIFACT_MANIFEST\|MASTER_LEDGER' origin/main -- scripts/ .github/workflows/` → **nenhum hit**. Logo, não é preciso mexer no `.gz` nem nos hashes para portar os status. |

## Provas de que E19/E20/E21 estão de fato implementados na main

- **E19** — `origin/main:.github/workflows/types-sync.yml:485`: `if node scripts/db-audit/check-remocoes-destrutivas.mjs supabase/schema-catalog.json /tmp/catalog.new.json ...`. Fixtures em `scripts/ci/check-remocoes-destrutivas.unit.mjs:55` (`DROP TABLE public.playbooks` bloqueia) e `:77` (migration `20260930390000` passa).
- **E20** — `types-sync.yml:541` `const marker = \`<!-- causa:${causa} -->\`;`; `:604` `if (causaAnterior === causa && idadeUltimoMs < 6 * 60 * 60 * 1000) {`; `:605` `Dedupe: mesma causa (...) ha menos de 6h; comentario suprimido.`
- **E21** — `types-sync.yml:717-722`: comentário `// E21 (G-25): sem \`head_branch\`...` + `head_branch: 'automation/types-sync',` no filtro antes do `approveWorkflowRun`.

## O que recuperar (valor baixo — documentação)

Porte **de `c6ddabeac`**, não do tip. Nada de `src/`, banco, edge ou workflow; não há CI que valide esses arquivos.

### 1. `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`

Inserir depois da linha 133 (`| **E18** | ...`), antes de `| **E22** |`:

```md
| **E19** | `[x]` CONCLUÍDA | PR #1897 | Gate 3 usa `check-remocoes-destrutivas.mjs` comparando `schema-catalog.json` antigo × novo; fixtures 20260930390000 (passa) e DROP TABLE (bloqueia) provam a aceitação. |
| **E20** | `[x]` CONCLUÍDA | PR #2378 | Dedupe com marcador `<!-- causa:<hash> -->` (hash SHA-1 do gate) e janela de 6 h implementado em `types-sync.yml`; 3 falhas iguais → 1 comentário. |
| **E21** | `[x]` CONCLUÍDA | sem PR associado | `types-sync.yml` filtra `workflow_runs` por `head_branch == 'automation/types-sync'` antes de `approveWorkflowRun`; run de outra branch no mesmo SHA não é aprovado. |
```

E trocar os 3 checkboxes (linhas 507, 512, 514 da main) de `- [ ]` para `- [x]`, acrescentando a nota FEITO da E19 após a linha `public.playbooks\` bloqueia.`:

```md
  **FEITO** (confirmado 2026-11-01): `types-sync.yml` usa `scripts/db-audit/check-remocoes-destrutivas.mjs` comparando `supabase/schema-catalog.json` antigo × novo; `scripts/ci/check-remocoes-destrutivas.unit.mjs` tem fixture `20260930390000` (passa) e `DROP TABLE public.playbooks` (bloqueia).
```

### 2. `docs/reconciliation/PLAN_REGISTRY.json` (bloco `record_id: "P006"`, `status_counts`)

`"DONE_VERIFIED": 23` → `26` · `"NOT_IMPLEMENTED": 15` → `12`

### 3. `docs/reconciliation/MASTER_LEDGER.json` (agregado global)

`"DONE_VERIFIED": 271` → `274` · `"NOT_IMPLEMENTED": 220` → `217`
**Preservar o formato minificado da main** (uma linha). Não reserializar: o *pretty-print* da branch são 36,6k linhas de churn sem valor.

### 4. `docs/reconciliation/tasks/P006.json` (3 tarefas)

Para E19, E20 e E21: `status` → `DONE_VERIFIED`; `implementation.state` e `acceptance.state` → `DONE_VERIFIED`; `implementation.note`/`acceptance.note` com as provas acima; `pr_numbers` = `[1897]` (E19), `[2378]` (E20), `[]` (E21). O texto antigo vai para `remaining_work`. Diff completo: `git diff origin/main c6ddabeac -- docs/reconciliation/tasks/P006.json`. **Preservar o minificado da main.**

### 5. Não portar

- `CONTRIBUTING.md` — obsoleto (workflow apagado em `41853318c`).
- `evidence/ARTIFACT_MANIFEST.json` e `evidence/TASK_LEDGER_FULL.json.gz` — só se o pacote for regerado pelo script de origem; nenhum guard da main os confere.

## Veredito

**PERDIDA_PARCIAL** · `apagar_branch_seguro: false` (há conteúdo documental verdadeiro e ausente da main; e o tip está corrompido, então a branch só serve por `c6ddabeac`).

## Verificação adversarial

Tentei refutar o `PERDIDA_PARCIAL`. **Não consegui**: a lacuna é real e está confirmada item por item. Mas o dossiê tem **dois erros materiais** sobre como portar.

### Confirmado (refutação falhou)

| Alegação da triagem | Verificação independente |
|---|---|
| Main ainda tem `- [ ]` em E19/E20/E21 | `git show origin/main:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md \| grep -n 'E19\|E20\|E21'` → `507:- [ ] **E19**`, `512:- [ ] **E20**`, `514:- [ ] **E21**` |
| Tabela de reconciliação da main não tem as 3 linhas | Linhas 122–150 da main vão de `\| **E18** \|` direto para `\| **E22** \|`; `c6ddabeac:134-136` tem as 3 linhas `[x] CONCLUÍDA` |
| E19/E20/E21 implementados na main | `types-sync.yml:485` (`check-remocoes-destrutivas.mjs` catalog antigo × novo), `:541` `` const marker = `<!-- causa:${causa} -->` ``, `:604` `idadeUltimoMs < 6 * 60 * 60 * 1000`, `:717` comentário `// E21 (G-25)` + `:722` `head_branch: 'automation/types-sync'` |
| Não foi remoção deliberada | `git log -S'**E19** \| `[x]`' origin/main -- <plano>` → **zero** commits: a main nunca teve essa linha |
| Pacote de reconciliação intocado na main desde a base | `git diff --stat 1252bb5a4 origin/main -- docs/reconciliation/` → **vazio** |
| Contagens | main `P006.status_counts` = `DONE_VERIFIED 23 / NOT_IMPLEMENTED 15`; `c6ddabeac` = `26 / 12`. Diff semântico (`json.dump sort_keys`) do `MASTER_LEDGER.json` main × `c6ddabeac` = **16 linhas**, só `DONE_VERIFIED 271→274` e `NOT_IMPLEMENTED 220→217`. P006 semântico = 120 linhas, só flips de E19/E20/E21 |
| Tip corrompido | tip `40f7bb3d3` = 18 linhas, terminando em `` mantida por `settings-guard` + `auto-update-pr-branch` + `CLAUDE.md `` sem fechar; `c6ddabeac` = 979; main = 975 |
| `CONTRIBUTING.md` obsoleto | `git cat-file -e origin/main:.github/workflows/auto-update-pr-branch.yml` → *does not exist*; apagado em `41853318c` (PR #3113) |

### Correção 1 — existe guard de CI nesses arquivos (o dossiê diz que não)

`scripts/ci/ci-docs-baseline.unit.mjs` lê **o plano e o `P006.json`** (`:11` e `:13`) e tem três asserts vivos:
- `:317` `plano: cada checkbox bate com o estado reconciliado do P006` — mapa `MARCA` (`:21-23`): `DONE_VERIFIED → 'x'`, `NOT_IMPLEMENTED → ' '`;
- `:324` `plano: tabela de reconciliacao cobre as discrepancias`;
- `:338` `plano: inventario atual e 21 YAML`.

Roda em CI: `.github/workflows/ci.yml:166` → `node --test scripts/ci/*.unit.mjs`.

Consequência operacional: **plano e `P006.json` têm de mudar na MESMA PR**. Flipar um só (checkbox sem status, ou status sem checkbox) **derruba a CI**. A frase do dossiê "nenhum guard da main confere esses arquivos" só vale para `evidence/ARTIFACT_MANIFEST.json` e `evidence/TASK_LEDGER_FULL.json.gz`.

### Correção 2 — nem o arquivo inteiro de `c6ddabeac` serve

`c6ddabeac:78` declara **17** arquivos YAML (medição de 2026-10-20); `origin/main:78` declara **21** (2026-11-14). Copiar o arquivo de `c6ddabeac` quebra o assert `:338`. Porte **só os hunks**: as 3 linhas da tabela (após a linha 133 da main), os 3 checkboxes (507/512/514) e a nota FEITO da E19.

### Observação sobre o pacote de reconciliação (valor ainda menor que "baixo")

`origin/main:docs/reconciliation/README.md` declara o pacote fechado no baseline `2e7cf81c6c4d` e diz, textualmente, que o adendo posterior registra "a persistência do placar defasado" e que "as contagens deste corpo continuam no baseline original". Ou seja: `MASTER_LEDGER.json` e `PLAN_REGISTRY.json` são snapshot congelado por decisão escrita, e o placar defasado é intencional. Os 4 números (`271→274`, `220→217`, `23→26`, `15→12`) são **opcionais**. O `P006.json`, ao contrário, é **obrigatório** — o guard de CI o compara com o plano.

### Parecer

`concorda = true` · `PERDIDA_PARCIAL` · `apagar_branch_seguro = false` — o conteúdo íntegro existe **apenas** em `c6ddabeac`, que só é alcançável por esta branch; apagá-la antes do port perde a redação pronta das 3 linhas de evidência.
