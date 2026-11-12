# scripts/qa

Scripts de qualidade visual e acessibilidade:

- `contraste-auditores.unit.mjs`, `contraste-combobox.mjs`, `contraste-contatos.mjs`
  — auditoria de contraste de cores
- `contatos-redesign-baseline.cjs` — baseline visual do redesign de contatos (execução manual)
- `contatos-redesign-baseline.unit.mjs` — testes automatizados do baseline; cobertos via `ci/qa-vercel-auditores.unit.mjs`
- `medir-tipografia.cjs` — mede métricas tipográficas contra os thresholds de `tipografia-budget.json`
- `prova-orcamento-rate-limit.sh` — smoke test de rate-limit do orçamento
- `prova-visao-classificadores.mjs` — smoke test manual do fluxo de visão
- `prova-visao-classificadores.unit.mjs` — smoke test do fluxo de visão executado no CI (`node --test`)
- `tipografia-budget.json` — thresholds de métricas tipográficas consumidos por `medir-tipografia.cjs`
