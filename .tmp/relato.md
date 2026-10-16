Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `scripts/ci/docs-estado-registry-convention.unit.mjs`: a guarda deixou de comparar **números globais** (quadro `## Totais`, contagem do cabeçalho `Base: N ...`, cabeçalho `## Órfãs (N)`) e passou a validar só o que é **conjunto/por linha**. Dois cartões empilhados que cada um acrescenta uma edge/âncora deixavam um dos números velho e derrubavam a guarda mesmo com as duas entregas certas — o defeito do cartão. Removida a função `totaisPorColunaMarkdown`, agora sem uso.
- `ESTADO.md` e `FEATURE_REGISTRY.md`: acrescentada 1 frase na convenção dizendo que o quadro `## Totais` e a contagem do cabeçalho são retrato manual e **não** são recalculados pela guarda (evita o documento prometer o que o teste não faz mais).
- O rigor fica igual por linha: conjunto de edges == `supabase/functions/*/index.ts`, cada âncora existe e cita a própria edge, grupo == primeiro chamador real A→B→C→D, órfã (E) sem chamador, e registro de views com componente/arquivo/classificação recalculados do código.

## Prova
- vermelho antes (guarda da base, mesma pilha): `GUARDA="$PWD/.tmp/guarda-base.mjs" bash .tmp/repro.sh dia/2026-10-13` → `ℹ fail 2` com `AssertionError: total do grupo A em ESTADO.md divergiu da tabela` e `o cabeçalho do ESTADO.md ficou para trás do número de edges` (a árvore empilhada tem as duas linhas `stack-alpha`/`stack-beta`, mas o resumo conta só uma).
- verde depois (mesmo comando, guarda do cartão): `bash .tmp/repro.sh dia/2026-10-13` → `ℹ tests 9` `ℹ pass 9` `ℹ fail 0`.
- guarda na árvore real do workspace: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `ℹ tests 9` `ℹ pass 9` `ℹ fail 0`.
- os 3 casos vermelhos continuam vermelhos (sobre a árvore empilhada, `bash .tmp/defeitos.sh`): `edge-inexistente` → `ℹ fail 3` com `ESTADO.md lista \`ghost-edge\`, que não é edge`; `ancora-orfa` → `ℹ fail 1` com `âncora desatualizada: src/tmp-stack.ts:99 não cita \`stack-alpha\``; `registro-arquivo-inexistente` → `ℹ fail 1` com `arquivo de \`dashboard\` divergiu do código`.

## Como reproduzir o empilhamento (passo 1)
O harness está em `.tmp/` (ignorado pelo git, recriável): `bash .tmp/repro.sh dia/2026-10-13` cria duas entregas isoladas sobre a mesma base (`stack-alpha`, `stack-beta`), junta as duas com 3-way merge (`git merge-file`, o mesmo algoritmo por trás de `git merge --squash`) mantendo a união das linhas — e roda a guarda do workspace na árvore resultante. `GUARDA=<arquivo> bash .tmp/repro.sh` roda qualquer versão da guarda (foi assim que colei o vermelho com a guarda da base).

## O que NÃO fiz e por quê
- Não mexi no corpo das tabelas de docs além da frase de convenção: as linhas de edge/view já estavam corretas; o defeito era só a dependência de numeração global na guarda.
- Não removi o quadro `## Totais` dos docs (decisão de forma do documento, fora do que o cartão pede); só deixei explícito que ele é manual.
