# scripts/tarefas

`seed-local-imagens.ts` — semente de fixtures para o módulo de Tarefas no banco
LOCAL. Cria 14 tarefas abertas + 5 concluídas com média de ciclo de 1,4 dia (D13).

Uso (banco LOCAL apenas):
```
bun scripts/tarefas/seed-local-imagens.ts              # cria/atualiza
bun scripts/tarefas/seed-local-imagens.ts --remover    # apaga fixtures
```

Exige: `API_URL`, `DB_URL`, `SERVICE_ROLE_KEY` apontando para **host local**.
Recusa automaticamente URLs de produção.
