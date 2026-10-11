Especialista: Edgar (area-edge-api)

## O que mudou e por quê
- supabase/functions/ai-suggest-reply/index.ts + index.test.ts: trazidos do trabalho anterior (cherry-pick de 917741078) — só os artigos devolvidos por search_knowledge_base para a última mensagem do cliente entram no prompt; RPC vazio ou em erro deixa o contexto vazio, sem fallback para publicados.
- docs/DB-INVENTORY.md: linha de `knowledge_base_articles` troca o consumidor `supabase/functions/ai-suggest-reply/index.ts` por `supabase/functions/_shared/ai-kb-ingest.ts` — motivo do motivo registrado: depois do cherry-pick, index.ts deixou de citar a tabela (passou a usar o RPC), e o espelho do CI acusava consumidor que não cita o objeto.

## Prova
- vermelho antes (motivo registrado, reproduzido): `node --test scripts/ci/db-inventory-doc.unit.mjs` → `✖ docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` com `'"knowledge_base_articles" lista "supabase/functions/ai-suggest-reply/index.ts", mas esse arquivo não cita o objeto'` (14 passed, 1 fail).
- verde depois: `node --test scripts/ci/db-inventory-doc.unit.mjs` → `tests 15 / pass 15 / fail 0`.
- verde depois: `deno test -A supabase/functions/ai-suggest-reply/index.test.ts` → `ok | 19 passed | 0 failed (88ms)`.

## O que NÃO fiz e por quê
- Não mexi em schema-catalog.json nem em migration: não há objeto novo no banco; a mudança é só de consumidor.
- Não usei zapp-verify full (estourou 420s no terminal); rodei a guarda do CI que falhava e o teste do módulo, ambos verdes.
