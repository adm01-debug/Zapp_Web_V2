Especialista: Edgar (area-edge-api)

## O que mudou e por quê
Diff contra a base (dia/2026-10-11): 4 arquivos, 290 inserções, 77 remoções; 1 arquivo de teste.
- supabase/functions/ai-suggest-reply/index.ts (alterado): passa a consultar só os artigos devolvidos por search_knowledge_base para a última mensagem do cliente; RPC vazio ou em erro deixa o contexto vazio, sem fallback para artigos publicados. Cherry-pick do trabalho anterior (917741078).
- supabase/functions/ai-suggest-reply/index.test.ts (novo): 6 casos de teste novos chamando o handler real — provam o RPC com a última mensagem, artigos no prompt, tabela de publicados intocada, erro/vazio com contexto vazio e nenhum RPC sem mensagem do cliente.
- docs/DB-INVENTORY.md (1 linha): a linha de `knowledge_base_articles` troca o consumidor `supabase/functions/ai-suggest-reply/index.ts` por `supabase/functions/_shared/ai-kb-ingest.ts` — depois do cherry-pick o index.ts deixou de citar a tabela (passou a usar o RPC), e o espelho do CI acusava consumidor que não cita o objeto (motivo registrado da recusa).
- .tmp/relato.md: este relato.

## Prova
- vermelho antes (motivo registrado, reproduzido): `node --test scripts/ci/db-inventory-doc.unit.mjs` → `✖ docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` com `'"knowledge_base_articles" lista "supabase/functions/ai-suggest-reply/index.ts", mas esse arquivo não cita o objeto'` (14 passed, 1 fail).
- verde depois: `node --test scripts/ci/db-inventory-doc.unit.mjs` → `tests 15 / pass 15 / fail 0`.
- verde depois: `deno test -A supabase/functions/ai-suggest-reply/index.test.ts` → `ok | 19 passed | 0 failed (88ms)`.

## O que NÃO fiz e por quê
- Não mexi em schema-catalog.json nem em migration: não há objeto novo no banco; a mudança é só de consumidor.
- Não usei zapp-verify full (estourou 420s no terminal); rodei a guarda do CI que falhava e o teste do módulo, ambos verdes.
