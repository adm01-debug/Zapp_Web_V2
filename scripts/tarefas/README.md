# Seed local — módulo Tarefas

```bash
bun scripts/tarefas/seed-local-imagens.ts            # cria/atualiza
bun scripts/tarefas/seed-local-imagens.ts --remover   # apaga o que criou
```

Semente **LOCAL** (etapa 004 do `PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS`) que
reproduz as tarefas das imagens de referência do módulo Tarefas, só para o
usuário de teste da pré-visualização (`created_by` = perfil dele).

Exige no ambiente (saídos de `zapp-db-local env . <stack>`, **nunca** de
produção): `API_URL`, `DB_URL`, `SERVICE_ROLE_KEY`.
