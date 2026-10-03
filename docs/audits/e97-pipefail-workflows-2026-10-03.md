# E97 — `-euo pipefail` em todos os workflows com passo shell

**Data:** 03/10/2026 · **Etapa:** E97 (Fase 7, `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, G-41)
**Status:** ✅ concluída

## O que a etapa pedia

> `set -euo pipefail` como primeira linha de todo `run:` multi-linha (ou `defaults.run.shell:
> bash -euo pipefail {0}` por workflow) nos 8 workflows que não têm. Verificação: `actionlint`/`shellcheck`
> sem SC2086/SC2181.

## O que foi feito

**Opção (b)**, em **9** workflows (a lista cresceu de 8 para 9 porque a E95 tocou o `settings-guard.yml`
depois que o plano foi escrito):

```yaml
defaults:
  run:
    shell: bash --noprofile --norc -euo pipefail {0}
```

`crm-sync-worker` · `db-guard` · `db-live-guard` · `e2e-talkx` · `settings-guard` · `supabase-sync` ·
`talkx-status-regen` · `targeted-ledger-evidence` · `types-sync`

**Por que a opção (b) e não `set -euo pipefail` em cada bloco:** a opção (a) só alcança `run:` **multi-linha**;
um `run: bun install --frozen-lockfile` de uma linha continuaria sem `pipefail`. O `defaults` cobre os dois
formatos com uma linha por arquivo.

**O que a mudança realmente altera:** o GitHub **já** executa `bash -e` por padrão. O que passa a valer é
`-u` (variável não definida vira erro, não string vazia) e `pipefail` (o código de saída do pipe é o do
primeiro comando que falhar, não o do último). `--noprofile --norc` evita que um `~/.bashrc` do runner
religue `-e` por acidente e transforme o guarda em decoração.

## Verificação da etapa — cumprida

`actionlint -shellcheck <shellcheck 0.10.0>` em todos os workflows:

| Código | Ocorrências | Situação |
|---|---|---|
| **SC2086** (variável sem quotes) | **0** | ✅ critério da etapa |
| **SC2181** (`if [ $? -eq 0 ]`) | **0** | ✅ critério da etapa |

O `shellcheck` **não estava instalado** neste WSL: a primeira rodada de `actionlint` checou **só sintaxe** e
teria dado o critério por cumprido sem medir nada. Baixei o binário estático 0.10.0 e refiz a medição.

Achados do shellcheck fora do critério (nenhum é SC2086/SC2181): SC2046 (warning) no `ci.yml` — arquivo
**travado pelo #1610** — e SC2129/SC2295/SC2012 (style/info) em `db-live-guard`, `db-migrate` e
`types-sync`. Registrados, não corrigidos.

## Teste que trava o invariante

O caso **`E97: todo workflow com run: roda com -euo pipefail`** foi acrescentado a
`scripts/ci/workflow-contracts.unit.mjs` (a E98 criou o arquivo; este PR o estende). **9/9 passam.**
Mutação verificada: remover o bloco `defaults` do `db-guard.yml` derruba o caso; restaurado, verde.

## Arquivos

- `.github/workflows/*.yml` (9 arquivos, +3 linhas cada)
- `scripts/ci/workflow-contracts.unit.mjs` (caso novo)
- `docs/audits/e97-pipefail-workflows-2026-10-03.md` (este relatório)
- `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (checkbox E97)

## Risco conhecido e como será medido

`-u` é a parte com risco real: um `$VAR` que hoje expande para vazio passa a **abortar** o passo. As
variáveis dos workflows vêm de `env:` de step/job e de `$GITHUB_*`, que existem sempre — mas isso é
**análise estática**, não medição. A prova é o próprio CI: os 9 workflows rodam nos checks deste PR
(inclusive `db-live-guard` e `types-sync`, que não disparam em PR comum). Se algum passo abortar por `-u`,
o PR mostra onde e eu ajusto o comando para `"${VAR:-}"`.

## Verificação

| Gate | Resultado |
|---|---|
| `actionlint -shellcheck shellcheck-0.10.0` | **0 SC2086, 0 SC2181** |
| `node --test scripts/ci/workflow-contracts.unit.mjs` | **9 pass, 0 fail** |
| Mutação (bloco `defaults` removido do `db-guard`) | caso E97 cai; restaurado, verde |
| `node scripts/ci/lint-ratchet.mjs` | nenhuma dívida nova |
| `node scripts/ci/typecheck-ratchet.mjs` | nenhum erro novo |
