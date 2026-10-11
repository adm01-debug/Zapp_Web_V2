Especialista: worker (docs)

## O que mudou e por quê
- ESTADO.md: âncoras `arquivo:linha` reprojetadas para a ponta de dia/2026-10-11 — chips de empilhamento moveram linhas nos arquivos citados e a guarda exige que a linha citada contenha o nome da própria edge. Ajustadas: ai-churn-analysis (ChurnPredictionDashboard.tsx:179→182), ai-classify-tickets (AutoTicketClassifier.tsx:202→204), ai-proxy (useObjectionDetector.ts:89→90 e :163→164), chatbot-l1 (ChatbotL1Config.tsx:234→235), multiplix-send (useMultiplixDispatches.ts:316→397), talkx-link (talkx-send/index.ts:442→455), talkx-send (useTalkX.ts:442→450 · :458→466 · :467→475) e talkx-send no agendador (talkx-scheduler/index.ts:279→294).
- ESTADO.md: remoção da âncora `src/components/catalog/catalogExport.ts:13` de `promogifts-catalog` — o commit 436dec0a2 (CT-20) tirou a exportação de CSV do catálogo e o arquivo não cita mais a edge; a edge segue comprovada por `useCatalogQuickSearch.ts:12` e `useExternalCatalog.ts:201`.
- ESTADO.md: cabeçalho passa a declarar `Base: dia/2026-10-11` (estava dia/2026-10-09).
- scripts/ci/docs-estado-registry-convention.unit.mjs: trazido pelo `git cherry-pick 51c6dac8d` (guarda dos três documentos); eu NÃO alterei o teste.

## Prova
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` / `AssertionError: âncora desatualizada: src/components/ai/ChurnPredictionDashboard.tsx:179 não cita \`ai-churn-analysis\`` (fail 1).
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11` / `pass 11` / `fail 0`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## Como resolvi o motivo da recusa
- Motivo registrado: "quebra o ESPELHO DO CI no empilhamento (node: ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge)". Causa: o empilhamento de cards deslocou linhas nos arquivos-fonte, e as âncoras publicadas deixaram de apontar a linha do chamador. Reprojetei cada âncora contra o código da ponta (varredura da tabela inteira do ESTADO.md: 0 desatualizadas de 80 linhas) e restaurei o verde sem mexer no critério do teste.

## O que NÃO fiz e por quê
- Não afrouxei a guarda: a regra "a linha citada contém a própria edge" foi mantida intacta — só as evidências do documento foram atualizadas. Nenhum arquivo fora da lista do cartão foi tocado; nenhum DDL/Edge/dependência nova.
