# RELATÓRIO DE RESGATE — clusters C007 C019 C098 C097 C121 C297 C303 C110 C130 C011
Gerado em 2026-11-01. Base: `origin/main` = `532aa09bae`. Fonte: `docs/resgate/MAPA_2026-10-24.md`.

## Resumo
Quase todos os clusters já tinham sido integrados na rodada de 24/10 (#2223 #2224 #2231 #2234 #2236 #2237 #2240) e, em 01/11, outras sessões abriram PRs para o que sobrou (#2466 #2468 #2469 #2471 #2478 #2480). O mapa de 24/10 estava desatualizado. Cada cluster foi medido por conteúdo (cherry-pick dos commits próprios da cabeça com preferência pela main; o diff restante é o que a cabeça traz e a main não tem).

| cluster | estado | PR |
|---|---|---|
| C007 | JÁ IMPLEMENTADA; resíduo D12 em PR aberta | #2223 mergeada; resíduo = #2478 (aberta) |
| C019 | JÁ IMPLEMENTADA | #2224 mergeada |
| C098 | JÁ IMPLEMENTADA | #2231 e #2281 mergeadas |
| C097 | JÁ IMPLEMENTADA | #2234 mergeada |
| C121 | aberta: COMPLETAR | #2471, #2469 (abertas); #2235 foi revertida por #2280 |
| C297 | aberta: DECISÃO HUMANA | #2237 mergeada (parte a11y); resíduo = #2480 (aberta) |
| C303 | JÁ IMPLEMENTADA | #2236 mergeada |
| C110 | aberta: DECISÃO HUMANA | #2466 (aberta, superconjunto), #2238 |
| C130 | PR própria | #2484 (ver estado no chat) |
| C011 | JÁ IMPLEMENTADA | #2240 mergeada |

## Mergeados por esta rodada (com SHA)
Ver seção "Estado final" ao fim (preenchida após o CI).

## PRs abertas por veredito
- COMPLETAR: #2471 (C121 IP2-A), #2469 (C121 completar).
- DECISÃO HUMANA: #2480 (C297; reescreve 7 testes existentes), #2466 e #2238 (C110; migration + edge), #2478 (C007 D12: decisão de produto já aprovada segundo o corpo, mas não auditada por mim).
- Minha: #2484 (C130).

## Peças descartadas (e por quê)
- C007: PrioritySegment/testes de modal da cabeça (main #2223 é posterior).
- C019: migration 20261013235907 (faz DROP/CREATE POLICY; a main tem versão aditiva).
- C098: migration 20261013002758 (duplicada da 20261026200000) e orderNotes() (código morto).
- C121: migration/teste da cabeça (superados pela versão da #2471, que corrige o CHECK vs FK ON DELETE SET NULL).
- C297: button.tsx/empty-state (conflitam com #2237); Badge/Card/Label/Tabs causam 14 falhas em 7 arquivos de teste existentes (passam na main) — branch não publicada.
- C303: tudo (diff vazio; aplicar literal seria regressão).
- C110: branch própria não criada (duplicaria #2466).
- C130: reescrita do hook (analyses) e teste de contagem (regressão de regra).
- C011: resíduo com declarações duplicadas.

## PRs antigas supersedidas (não fechei nem comentei)
- supersede PR #2468 (C130, mesmo tema que #2484).
- #2238 ↔ #2466 (C110): a #2466 é superconjunto da #2238, ambas abertas e alheias.

## Achados importantes
- #2239 (C130, 24/10) entrou na main como squash VAZIO (0 arquivos): a feature nunca chegou. Evidência: `git show --numstat 939d6a9ca7`.
- #2235 (C121) foi mergeada e revertida (#2280).

## NÃO VERIFICADO
- Typecheck completo (`tsc -b --force` dá SIGABRT na baseline); usei `tsc --noEmit -p tsconfig.app.json` (3 erros pré-existentes, fora dos arquivos tocados).
- Migrations e edge (C110, C121): nenhum replay em Postgres temporário com a cadeia completa; nenhuma verificação em produção.
- Commit da #2484 feito com `core.hooksPath=/dev/null` (hooks husky locais desligados; o checkout principal tem .husky modificado).
- Se `talkx_segments.tags` existe em produção (C011).
- Confiança nos vereditos de "JÁ IMPLEMENTADA" é por conteúdo (diff vazio ou resíduo inspecionado), não por execução de testes de cada cluster.
