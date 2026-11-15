# chore__analise-prs-261024-2325 — INCORPORADA

- Ref: `origin/chore/analise-prs-261024-2325` · tip `1c871e471` · merge_base `2d97c44cf` (ambos 2026-10-24)
- PR: #2242 · 1 commit: `1c871e471 chore: adiciona inventário de PRs e regras de negócio para análise`
- `git diff --stat 2d97c44cf origin/chore/...` → 3 arquivos, 2666 inserções, 0 remoções. Zero `src/`, zero migration, zero edge, zero workflow. Só artefato de análise.

## Propósito
Despejar, em 2026-10-24, o inventário mecânico das 145 PRs então abertas (#1930–#2241) em CSV + JSON, mais um resumo das regras de negócio, para alimentar a análise de PRs daquela data.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `analise-prs/prs.csv` | IDENTICAL_TO_MAIN / PRESENT_BYTE | Já na main, byte a byte | `git rev-parse origin/main:analise-prs/prs.csv` = `git rev-parse <branch>:analise-prs/prs.csv` = `7d7bc7f96fe3eb730b3476ce3301b32515f43ba3` |
| `analise-prs/regras-de-negocio.md` | IDENTICAL_TO_MAIN / PRESENT_BYTE | Já na main, byte a byte | ambos os blobs = `a6464c5016bb75987a8e65fb85c1dfaee4b87a6f` |
| `analise-prs/prs.json` | BOTH_CHANGED / CONFLICT (2175 linhas "faltando") | Falso positivo: mesmo caminho, dois conteúdos distintos; o dado da branch está na main dentro do `prs.csv` | ver abaixo |

### `analise-prs/prs.json` — por que a lacuna de 2175 linhas é ruído
1. **O conteúdo da branch é a serialização JSON do `prs.csv` que a main já tem, byte a byte.**
   - Cabeçalho do CSV na main: `number,title,draft,branch,created_at,updated_at,user,labels,merge_candidate,has_migration_in_body,has_edge_fn_in_body,has_workflow_in_body,rule8,html_url,sha` — exatamente os 15 campos de cada objeto do JSON da branch.
   - Mesma contagem e mesma faixa: JSON da branch = 145 objetos (`grep -c '"number":'`), faixa #1930–#2241; CSV na main = 146 linhas (1 cabeçalho + 145 registros), faixa #1930–#2241 (`cut -d, -f1 | sort -n`).
   - Mesmos valores: 1ª linha do CSV na main é `2241,chore: auditoria exaustiva Supabase — 26 achados (CRITICAL×3 HIGH×6),True,claude_05/upbeat-faraday-9e99s8,...,0d204182d681a8671b95511bc7e6893a5e0fbcea` — idêntica ao 1º objeto do JSON da branch (que é também o `missing_sample` do item).
2. **O caminho `analise-prs/prs.json` foi reaproveitado de propósito na main para o ciclo atual**, com schema diferente (`titulo`, `autor`, `head_inicial`, `arquivos`, `veredito_dossie`, `veredito_verificado`, `estado_final`) e PRs #2553–#2972, 635 linhas.
   - `git log --oneline origin/main -- analise-prs/prs.json`: `37822ce6f 2026-11-06 chore: recupera inventario B10 e atualiza auditorias (prs.json, prs.csv, regras) (#2752)` e `d084ca753 2026-11-14 chore(pacote): pacote 4 ... (#3063)`.
   - Aplicar o hunk da branch **sobrescreveria** o inventário vivo da análise de PRs em curso. É regressão, não recuperação.

## Veredito
**INCORPORADA** (confiança alta). Os 3 arquivos da branch estão na main: 2 byte a byte; o 3º tem seu conteúdo preservado na main como `analise-prs/prs.csv` (mesmos 145 registros, mesmos 15 campos), e o caminho `prs.json` foi deliberadamente reaproveitado por trabalho posterior (#2752, #3063).

Nada a recuperar. Valor de negócio da lacuna: **nenhum** (artefato gerado, duplicata de dado já presente, de uma safra de PRs de 2026-10-24 há muito fechada).

Confirma a triagem anterior (`triagem_2804: {"2242": "JA_NA_MAIN"}`), agora com prova mecânica por arquivo.

`apagar_branch_seguro = true`.

## Verificação adversarial

Tentei refutar o veredito INCORPORADA procurando qualquer hunk de valor não coberto pela `main`. Não existe.

**1. Dois dos três arquivos são byte a byte iguais à main** (`git rev-parse`):
- `analise-prs/prs.csv`: main e branch = `7d7bc7f96fe3eb730b3476ce3301b32515f43ba3`
- `analise-prs/regras-de-negocio.md`: main e branch = `a6464c5016bb75987a8e65fb85c1dfaee4b87a6f`

**2. O único arquivo com lacuna (`analise-prs/prs.json`, 2175 linhas "missing") é redundância pura.** Comparei registro por registro, campo por campo, o JSON da branch (`2f663166c`) contra `origin/main:analise-prs/prs.csv` (`7d7bc7f96`):
```
csv rows 145   csv cols 15
json-only PRs: []     csv-only PRs: []
field diffs 0
```
145 PRs em ambos (#1930–#2241), os mesmos 15 campos (`number,title,draft,branch,created_at,updated_at,user,labels,merge_candidate,has_migration_in_body,has_edge_fn_in_body,has_workflow_in_body,rule8,html_url,sha`), **zero divergência de valor**. O `missing_sample` do item (PR #2241, sha `0d204182d681a8671b95511bc7e6893a5e0fbcea`) confere com a linha correspondente do CSV da main. A "lacuna" é só a mudança de formato CSV→JSON do mesmo dado.

**3. Aplicar o hunk seria destrutivo, não aditivo.** `origin/main:analise-prs/prs.json` (`6a3ae5472`) é outro artefato no mesmo caminho: 30 objetos, PRs #2553–#2972, schema `titulo/autor/head_inicial/arquivos/veredito_dossie/veredito_verificado/verificador_concorda/regra4/estado_final/url` — o ledger do ciclo de análise vivo, atualizado em 2026-11-14 (`d084ca753 chore(pacote): pacote 4 … (#3063)`, antes `37822ce6f … (#2752)`). O commit da branch é de 2026-10-24 (`1c871e471`). Sobrescrever perderia o inventário em uso.

**4. Escopo zero de risco e zero de valor**: `git diff --stat 2d97c44cf origin/chore/analise-prs-261024-2325` = 3 arquivos, 2666 inserções, 0 remoções, todos em `analise-prs/`; nada em `src/`, `supabase/`, `.github/`, nenhuma migration, edge ou workflow.

Concordo com a triagem. Veredito mantido: **INCORPORADA**. `apagar_branch_seguro = true`. Nenhuma lacuna adicional.
