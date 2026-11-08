# scripts/catalog

`validate-plan.mjs` — valida a estrutura do plano de 100 etapas
(`PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS.md`): verifica Objetivo, 10 sub-etapas e
checklist por etapa; aceita tombstones `RISCADO` sem estrutura executável.

Uso: `node scripts/catalog/validate-plan.mjs [<caminho-do-plano.md>]`
