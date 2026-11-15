# Dossiê: claude/br-dossies-lote4-261031 (PR #2429)

- **ref**: `origin/claude/br-dossies-lote4-261031` · tip `01fff64d1d2e1b7c6033861e749f755ac65a512b` · merge_base `004e74a8c596959f45f61c8b0b64b30a70c1ff19`
- **Commit único**: `01fff64d1 docs(analise): dossiês lote 4 — BR-031..BR-055 (25 branches COBERTA, apagadas)`
- **Escopo**: 26 arquivos, +1290 linhas, **100% documentação** (`analise/dossies/*.md` + `analise/progresso.json`). Zero código, zero migration, zero edge, zero workflow.
- **Pré-classificação mecânica**: MISTO_CONFLITO (falso positivo — a pasta `analise/` foi arquivada em `docs/_arquivo/analise/` depois desta branch).

## Veredito: INCORPORADA (confiança alta)

Todo o conteúdo entrou na main e depois foi movido para o arquivo morto pelo PR
`c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)`.

## Tabela arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `analise/dossies/*.md` (25 arquivos: `chore-regen-edge-manifest-261030`, `codex-consolida-contatos-fab`, `codex-sincronizacao-canonica-20261016`, `dia-2026-10-23`, `feat-copiloto-cv061-070-ghost-text`, `feat-media-migration-tool`, `fix-ci-mocks-framer-261025`, `fix-ci-talkx-segments-261025`, `fix-ci-teamchat-mount-261025`, `fix-ci-testes-admin-261025`, `fix-ci-testes-geral-261025`, `fix-ci-testes-inbox-261025`, `fix-ci-testes-talkx-251025`, `fix-ci-testes-ui-261025`, `fix-ci-unit-tests-261025`, `fix-contatos-cabecalho-fab-261020`, `fix-deno-lock-tslib-261030`, `fix-deploy-functions-deno-auto-20261030`, `fix-deploy-functions-deno-none`, `fix-f1a-lote-b-batch8`, `fix-f1a-lote-b-useknowledgebase`, `fix-main-tests-231023`, `fix-talkx-hook-morto-261025`, `optimistic-hypatia`, `wizardly-meitner`) | **Byte-idêntico** em `docs/_arquivo/analise/dossies/<mesmo nome>` na main | Loop `diff <(git show <tip>:analise/dossies/$bn) <(git show origin/main:docs/_arquivo/analise/dossies/$bn)` → **IGUAL para os 25**. Commit que arquivou: `c570d5d46` (`git log --oneline -3 origin/main -- docs/_arquivo/analise/dossies/wizardly-meitner.md`) |
| `analise/progresso.json` | Os **56 registros** da branch estão todos presentes e **idênticos campo a campo** em `docs/_arquivo/analise/progresso.json` na main (75 registros = superconjunto) | Comparação de `analisadas[]` por `branch` + igualdade de dict: `falta no arquivo: []`, `registros diferentes vs arquivo: []`. `git log --oneline -3 origin/main -- docs/_arquivo/analise/progresso.json` → `c570d5d46` |

### Por que a mecânica marcou CONFLITO
1. O arquivo não existe em `analise/dossies/` na main hoje (a main tem 21 dossiês novos ali, de outro ciclo) — a cópia desta branch vive em `docs/_arquivo/analise/dossies/`.
2. `analise/progresso.json` na main foi **reescrito** por `529389d3f chore(analise): auditoria de branches — lote 1 e 2 (21 branches, 18 deletadas) (#2761)` e hoje tem 21 registros de um ciclo posterior; o conteúdo desta branch ficou no arquivo morto. Daí o CONFLICT textual.

### Observação (defeito que a main já corrigiu)
`analise/progresso.json` na branch começa com uma linha solta `Total: 56 entries` antes do `{`, o que quebra `json.load`. A versão arquivada na main (`docs/_arquivo/analise/progresso.json`) começa direto em `{` e parseia. Nada a portar.

## Lacunas a recuperar
Nenhuma. Nenhum arquivo de código, teste, migration, edge ou workflow nesta branch; todo o conteúdo documental está na main em `docs/_arquivo/analise/`.

## Decisão
`apagar_branch_seguro = true` — prova completa para os 26 arquivos.

## Verificação adversarial

Verificador independente (papel: refutar a triagem). Resultado: **triagem CONFIRMADA — INCORPORADA, `apagar_branch_seguro = true`**. Não achei nenhum hunk de valor ausente na main.

Checagens feitas (todas somente leitura):

1. **Escopo real da branch.** `git diff --name-only 004e74a8c origin/claude/br-dossies-lote4-261031` → 26 caminhos, todos sob `analise/`: 25 `analise/dossies/*.md` + `analise/progresso.json`. `git diff --stat` → `26 files changed, 1290 insertions(+)`, zero deleções. Único commit: `01fff64d1 docs(analise): dossiês lote 4 — BR-031..BR-055`. Confirma `counts` do JSON (src/edges/migrations/workflows = 0).

2. **Os 25 dossiês estão na main, byte a byte.** Loop comparando md5 de `git show 01fff64d1:<path>` com `git show origin/main:docs/_arquivo/analise/dossies/<basename>` → `IGUAL_ARQUIVO` nos 25, nenhum `DIFERE`. Nenhum dos 25 existe em `origin/main:analise/dossies/` (`git cat-file -e` falhou em todos os 25) — ou seja, só existem na pasta arquivada, o que é a localização atual canônica desse acervo (`docs/_arquivo/analise/dossies/` tem 76 arquivos; a raiz `analise/dossies/` tem 21, de um ciclo posterior).

3. **`analise/progresso.json` — subconjunto exato.** Parse comparativo em Python dos três objetos: branch (56 registros em `analisadas`), `origin/main:docs/_arquivo/analise/progresso.json` (75) e `origin/main:analise/progresso.json` (21). Resultado: `falta no arquivo: []` e `registros diferentes vs arquivo: []` — os 56 registros da branch estão no arquivo com igualdade de registro campo a campo; `schema_version` idêntico. 54 dos 56 não estão na raiz, o que explica o `CONFLICT` mecânico sem indicar perda.

4. **Prova documental de incorporação deliberada.** `git log --oneline -3 origin/main -- analise/progresso.json` → `df4d597dc chore: recriar dossiês de análise e relatório CI final (substitui #2429 #2415 #2413 #2396 #2372 #2200) (#2458)`. O corpo desse commit nomeia explicitamente a PR desta branch (**#2429**) e descreve: "reaplica só o conteúdo documental ainda ausente na `main`", "52 dossiês novos em `analise/dossies/`", "`analise/progresso.json`: união da versão da `main` (31 entradas) com as entradas novas das PRs → 75 entradas, sem duplicar `branch`; JSON válido. (O de #2429 tinha uma linha `Total: 56 entries` antes do `{`, que invalidava o JSON; descartada.)". Depois disso, `c570d5d46 chore: arquiva prosa morta em docs/_arquivo (fase B) (#2630)` moveu o acervo para `docs/_arquivo/`, e `529389d3f ... (#2761)` reescreveu o `analise/progresso.json` da raiz com um ciclo novo de auditoria.

5. **Defeito da branch, já corrigido na main.** `git show 01fff64d1:analise/progresso.json | head -2` → primeira linha solta `Total: 56 entries` antes do `{`, o que quebra `json.load` (precisei remover a linha para parsear). A versão em `docs/_arquivo/analise/progresso.json` começa em `{` e parseia. Portanto a main tem a versão estritamente melhor; recuperar a branch reintroduziria o JSON inválido.

Conclusão: nada a recuperar, nenhum impacto em produto (zero código/teste/migration/edge/workflow), conteúdo presente na main byte-idêntico e superconjunto, e a própria main registra em mensagem de commit que absorveu a PR #2429. Apagar a branch é seguro.
