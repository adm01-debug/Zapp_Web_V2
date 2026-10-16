# Workflows de CI — o que cada um faz

> **Gerado por `scripts/ci/render-workflow-docs.mjs`.** Não edite à mão: o CI roda
> `--check` e falha se este arquivo divergir do bloco `# docs:` de cada workflow.
> Para mudar o que está aqui, mude o bloco no YAML.

**14 workflows.**

| Workflow | Arquivo | Gatilho | O que prova | Quando falha | Quem é avisado | Custo/sem (min) | Falha (7 d) |
|---|---|---|---|---|---|---|---|
| Branch Hygiene Audit | [`branch-hygiene-audit.yml`](../../.github/workflows/branch-hygiene-audit.yml) | agendado (semanal) e dispatch | quais branches sao podaveis e quais PRs estao paradas ha mais de 7 dias | relatorio nao e publicado nem a issue e atualizada | issue `[branch-hygiene]` no repositorio | — | — |
| CI/CD Pipeline | [`ci.yml`](../../.github/workflows/ci.yml) | pull_request, push na main e dispatch | checagem de tipos, testes de unidade e build do app | o run fica vermelho (a main nao tem branch protection: nada e bloqueado) | autor do PR, via checks do GitHub | — | — |
| CodeQL | [`codeql.yml`](../../.github/workflows/codeql.yml) | agendado (semanal) e dispatch | analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows | alerta aparece em Security -> Code scanning | aba Security | — | — |
| CRM Sync Worker | [`crm-sync-worker.yml`](../../.github/workflows/crm-sync-worker.yml) | dispatch (operacao manual; schedule desligado e nenhum job do pg_cron drena o outbox — W93) | health do CRM externo e um lote de 1..10 itens do crm_sync_outbox processado sem falha | o job fica vermelho e nada e sincronizado; os itens continuam no outbox para replay | quem disparou | — | — |
| DB Guard (offline) | [`db-guard.yml`](../../.github/workflows/db-guard.yml) | dispatch manual | guardas OFFLINE do banco (nunca recebe DESTINO_URL, roda codigo de PR) | o run fica vermelho; nunca alcanca o banco de producao | quem disparou | — | — |
| DB Live Guard | [`db-live-guard.yml`](../../.github/workflows/db-live-guard.yml) | agendado (semanal, segunda) e dispatch sobre main | o contrato do banco de PRODUCAO (drift, paridade, runtime config) | issue aberta ou comentada com a causa; o guarda vivo nao passa em silencio | issue de guardas vivos | — | — |
| DB Migrate (production) | [`db-migrate.yml`](../../.github/workflows/db-migrate.yml) | dispatch na main, com o job gateado por environment | dry-run obrigatorio e apply com hash estrutural da migration | nada e aplicado; o dry-run precisa passar antes | operador que disparou e a issue de ops | — | — |
| Deploy Edge Functions | [`deploy-functions.yml`](../../.github/workflows/deploy-functions.yml) | push na main (supabase/functions/**, config.toml) e dispatch manual | as Edge Functions publicadas batem com o repo | o deploy aborta antes de publicar | operador que disparou | — | — |
| E2E logado | [`e2e-logado.yml`](../../.github/workflows/e2e-logado.yml) | push na main e dispatch sobre main | o fluxo logado (Playwright com login real) contra producao | artefato do Playwright e issue/relatorio; nunca roda em PR de terceiro | issue de E2E e autor do push | — | — |
| E2E Talk X | [`e2e-talkx.yml`](../../.github/workflows/e2e-talkx.yml) | dispatch manual | o fluxo do Talk X no navegador | run fica vermelho com o artefato do Playwright | quem disparou | — | — |
| Notifica falha na main | [`notifica-falha-main.yml`](../../.github/workflows/notifica-falha-main.yml) | workflow_run (conclusao dos workflows principais na main) | abre issue quando qualquer workflow critico falha na main | registra o run e o commit na issue de falha | mantenedores, pela issue falha-main | — | — |
| Talk X V4 placar regen (push) | [`talkx-status-regen.yml`](../../.github/workflows/talkx-status-regen.yml) | push | o placar do Talk X regenerado a partir dos dados atuais | o job fica vermelho e o placar nao e atualizado | autor do push | — | — |
| Targeted Ledger Evidence | [`targeted-ledger-evidence.yml`](../../.github/workflows/targeted-ledger-evidence.yml) | dispatch | a evidencia do ledger de migrations para uma version especifica | o job aborta sem publicar evidencia | operador que disparou | — | — |
| types-sync | [`types-sync.yml`](../../.github/workflows/types-sync.yml) | push na main, agendado e dispatch | os tipos gerados batem com o banco oficial (Gates 1 e 2) | PR em `automation/types-sync` ou issue `[types-sync]`; nunca passa com tipo divergente | PR de types e issue de gate | — | — |

## Detalhe

### Branch Hygiene Audit (`branch-hygiene-audit.yml`)

- **Gatilho:** agendado (semanal) e dispatch
- **O que prova:** quais branches sao podaveis e quais PRs estao paradas ha mais de 7 dias
- **Quando falha:** relatorio nao e publicado nem a issue e atualizada
- **Quem é avisado:** issue `[branch-hygiene]` no repositorio

### CI/CD Pipeline (`ci.yml`)

- **Gatilho:** pull_request, push na main e dispatch
- **O que prova:** checagem de tipos, testes de unidade e build do app
- **Quando falha:** o run fica vermelho (a main nao tem branch protection: nada e bloqueado)
- **Quem é avisado:** autor do PR, via checks do GitHub

### CodeQL (`codeql.yml`)

- **Gatilho:** agendado (semanal) e dispatch
- **O que prova:** analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows
- **Quando falha:** alerta aparece em Security -> Code scanning
- **Quem é avisado:** aba Security

### CRM Sync Worker (`crm-sync-worker.yml`)

- **Gatilho:** dispatch (operacao manual; schedule desligado e nenhum job do pg_cron drena o outbox — W93)
- **O que prova:** health do CRM externo e um lote de 1..10 itens do crm_sync_outbox processado sem falha
- **Quando falha:** o job fica vermelho e nada e sincronizado; os itens continuam no outbox para replay
- **Quem é avisado:** quem disparou

### DB Guard (offline) (`db-guard.yml`)

- **Gatilho:** dispatch manual
- **O que prova:** guardas OFFLINE do banco (nunca recebe DESTINO_URL, roda codigo de PR)
- **Quando falha:** o run fica vermelho; nunca alcanca o banco de producao
- **Quem é avisado:** quem disparou

### DB Live Guard (`db-live-guard.yml`)

- **Gatilho:** agendado (semanal, segunda) e dispatch sobre main
- **O que prova:** o contrato do banco de PRODUCAO (drift, paridade, runtime config)
- **Quando falha:** issue aberta ou comentada com a causa; o guarda vivo nao passa em silencio
- **Quem é avisado:** issue de guardas vivos

### DB Migrate (production) (`db-migrate.yml`)

- **Gatilho:** dispatch na main, com o job gateado por environment
- **O que prova:** dry-run obrigatorio e apply com hash estrutural da migration
- **Quando falha:** nada e aplicado; o dry-run precisa passar antes
- **Quem é avisado:** operador que disparou e a issue de ops

### Deploy Edge Functions (`deploy-functions.yml`)

- **Gatilho:** push na main (supabase/functions/**, config.toml) e dispatch manual
- **O que prova:** as Edge Functions publicadas batem com o repo
- **Quando falha:** o deploy aborta antes de publicar
- **Quem é avisado:** operador que disparou

### E2E logado (`e2e-logado.yml`)

- **Gatilho:** push na main e dispatch sobre main
- **O que prova:** o fluxo logado (Playwright com login real) contra producao
- **Quando falha:** artefato do Playwright e issue/relatorio; nunca roda em PR de terceiro
- **Quem é avisado:** issue de E2E e autor do push

### E2E Talk X (`e2e-talkx.yml`)

- **Gatilho:** dispatch manual
- **O que prova:** o fluxo do Talk X no navegador
- **Quando falha:** run fica vermelho com o artefato do Playwright
- **Quem é avisado:** quem disparou

### Notifica falha na main (`notifica-falha-main.yml`)

- **Gatilho:** workflow_run (conclusao dos workflows principais na main)
- **O que prova:** abre issue quando qualquer workflow critico falha na main
- **Quando falha:** registra o run e o commit na issue de falha
- **Quem é avisado:** mantenedores, pela issue falha-main

### Talk X V4 placar regen (push) (`talkx-status-regen.yml`)

- **Gatilho:** push
- **O que prova:** o placar do Talk X regenerado a partir dos dados atuais
- **Quando falha:** o job fica vermelho e o placar nao e atualizado
- **Quem é avisado:** autor do push

### Targeted Ledger Evidence (`targeted-ledger-evidence.yml`)

- **Gatilho:** dispatch
- **O que prova:** a evidencia do ledger de migrations para uma version especifica
- **Quando falha:** o job aborta sem publicar evidencia
- **Quem é avisado:** operador que disparou

### types-sync (`types-sync.yml`)

- **Gatilho:** push na main, agendado e dispatch
- **O que prova:** os tipos gerados batem com o banco oficial (Gates 1 e 2)
- **Quando falha:** PR em `automation/types-sync` ou issue `[types-sync]`; nunca passa com tipo divergente
- **Quem é avisado:** PR de types e issue de gate

## O que NÃO é bug

> Comportamentos que parecem erros mas são design intencional.
> Cada item vem do bloco `# nao-e-bug:` do YAML do workflow.

| Workflow | Situação | Por quê não é bug |
|---|---|---|
| [`crm-sync-worker.yml`](../../.github/workflows/crm-sync-worker.yml) | **schedule comentado** | decisao pendente do dono (W93); religar exige vars.CRM_SYNC_WORKER_ENABLED=true e o roteiro em docs/runbooks/CRM_INTEGRATION_ROLLOUT.md |
| [`types-sync.yml`](../../.github/workflows/types-sync.yml) | **TYPES_SYNC_PR_TOKEN ausente** | esperado -- o workflow usa GITHUB_TOKEN; o passo "Destravar os checks" aprova os runs com actions:write; um PAT funciona mas nao e necessario |
