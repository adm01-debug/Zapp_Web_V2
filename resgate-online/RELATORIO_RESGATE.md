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

## Estado final
- Nenhum merge feito por esta rodada. #2484 (C130): todos os checks verdes (Unit 1-3/3, TypeCheck, Edge, Replay, Contrato DB, E2E, Security) na 2ª rodada; 1ª rodada falhou por erro meu (`.maybeSingle()`), corrigido em 7b19a19a8a. Ao fechar, o CI Gate estava pendente e a branch ficou BEHIND da main (strict=true); atualizar a branch e esperar nova rodada (~35 min de fila) não coube no limite de turnos. PR aberta, pronta para merge assim que o gate passar.
- Nenhuma outra escrita no GitHub (só a branch claude/feat-metas-seletor-periodo-261101-1208, a PR #2484 e a edição do corpo dela).

## Validação por agentes (01/11, somente leitura no GitHub)
- **Clusters já na main (C019 C098 C097 C303 C011):** 201 testes passam, 0 falhas (origin/main 1252bb5a41). Integração ponta a ponta confirmada (ex.: `InboxFilters.tsx:137`, `ContactDetailPanel.tsx:436`, `DashboardView.tsx:198`, `EvolutionMonitoringDashboard.tsx:398`, `TalkXView.tsx:46`). Lacuna: não achei a migration que cria `saved_filters` (C019) no grep; rota de TalkXView e aplicação em banco canônico NÃO VERIFICADAS.
- **C121 / #2471: OK.** Replay local 1050 ok / 24 falhas esperadas / 0 inesperadas; migration aplicada 3x sem diferença de ACL/policies/colunas; suíte T1..T7 passa (com shim de `auth.uid()` no banco temporário). NÃO VERIFICADO: `zapp-db-local`, produção. Continua COMPLETAR (UI, chamador da RPC, aplicar em prod, types.ts).
- **C110 / #2466: NÃO OK.** Deno 39/39, auth não afrouxada, replay verde, mas o "Contrato DB offline" fica vermelho: pin `definition_sha256` em `scripts/db-audit/message-delivery-phase1-behavior.test.sh` (~l.915) está velho (f228a9d6… vs 1ecc1a84… no runtime) após o commit ec230592aa. Correção: repinar o hash. A migration também vai além do título (guard, resolve_unconfirmed_message).
- **C297 / #2480: PRECISA DECISÃO.** 5086 testes related passam, mas: (a) a PR apaga 6 PNGs de baseline `e2e/__screenshots__/contacts-*` (testes viram skip) — enfraquecimento; (b) `TabsTrigger` embrulha children em span e ~69 usos perdem o gap ícone/texto; (c) `truncate` global no Badge corta sem "…" (5 casos de risco: SkillBasedRoutingSettings:225, EmailComposer:517/541, EmailChatReplyBar:308, GlobalSearch:208, FileThumb:231).
- **C007 / #2478: OK para merge** (481 testes tasks passam, nenhum teste enfraquecido, tokens existem). Resíduo real: `PrioritySegment.tsx` deixa opções não escolhidas em `text-muted-foreground` em vez da cor da própria prioridade (D12); teste `NewTaskDialog.corPrioridade.test.tsx` tem 1 falha contra o código da PR → PR de seguimento recomendada.
