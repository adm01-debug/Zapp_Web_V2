# QA — provas visuais e de contraste

Scripts de verificação visual/QA que não cabem em `ui-audit/` (layout) nem em
`ci/` (gates puros).

- `prova-visao-classificadores.mjs` — prova de ponta a ponta, contra o
  ambiente **publicado**, de que `classify-sticker` e `classify-emoji`
  realmente classificam (não caem no fallback `outros`) e que o consumo
  aparece em `ai_usage_logs`, correlacionado por baseline antes/depois
  (IA-032/IA-033, R2-INF-020).
- `contraste-auditores.unit.mjs` / `contraste-combobox.mjs` /
  `contraste-contatos.mjs` — auditoria de contraste de cor em telas
  específicas.
- `contatos-redesign-baseline.cjs` / `.unit.mjs` — baseline do redesign de
  Contatos.
- `medir-tipografia.cjs` + `tipografia-budget.json` — orçamento de tipografia.
- `prova-orcamento-rate-limit.sh` — prova do orçamento de rate limit.

Teste: `node --test scripts/qa/prova-visao-classificadores.unit.mjs scripts/qa/contatos-redesign-baseline.unit.mjs scripts/qa/contraste-auditores.unit.mjs`.
