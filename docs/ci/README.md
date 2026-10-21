# Workflows de CI — o que cada um faz

> **Gerado por `scripts/ci/render-workflow-docs.mjs`.** Não edite à mão: o CI roda
> `--check` e falha se este arquivo divergir do bloco `# docs:` de cada workflow.
> Para mudar o que está aqui, mude o bloco no YAML.

**17 workflows.**

| Workflow | Arquivo | Gatilho | O que prova | Quando falha | Quem é avisado | Custo/sem (min) | Falha (7 d) |
|---|---|---|---|---|---|---|---|
| Branch Hygiene Audit | [`branch-hygiene-audit.yml`](../../.github/workflows/branch-hygiene-audit.yml) | agendado (semanal) e dispatch | quais branches sao podaveis e quais PRs estao paradas ha mais de 7 dias | relatorio nao e publicado nem a issue e atualizada | issue `[branch-hygiene]` no repositorio | — | — |
| "Talk X PR body check" | [`check-talkx-pr-body.yml`](../../.github/workflows/check-talkx-pr-body.yml) | pull_request (opened, synchronize, edited) em PRs que tocam Talk X | valida que o corpo da PR segue o template Talk X (etapa + slug) | bloqueia o merge da PR com erro descritivo | autor da PR via check reprovado | — | — |
| CI/CD Pipeline | [`ci.yml`](../../.github/workflows/ci.yml) | pull_request, push na main, merge_group e dispatch | lint, tipos, testes, build, security e E2E do codigo | PR fica vermelho e o merge e bloqueado pelos required checks | autor do PR e revisor, via checks do GitHub | — | — |
| CodeQL | [`codeql.yml`](../../.github/workflows/codeql.yml) | agendado (diario) e dispatch | analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows | alerta aparece em Security -> Code scanning | aba Security | — | — |
| CRM Sync Worker | [`crm-sync-worker.yml`](../../.github/workflows/crm-sync-worker.yml) | dispatch (operacao manual; schedule desligado e nenhum job do pg_cron drena o outbox — W93) | health do CRM externo e um lote de 1..10 itens do crm_sync_outbox processado sem falha | o job fica vermelho e nada e sincronizado; os itens continuam no outbox para replay | quem disparou | — | — |
| DB Guard (offline) | [`db-guard.yml`](../../.github/workflows/db-guard.yml) | pull_request, push na main, merge_group e dispatch | guardas OFFLINE do banco (nunca recebe DESTINO_URL, roda codigo de PR) | PR fica vermelho; nenhum codigo de PR alcanca o banco de producao | autor do PR e revisor | — | — |
| DB Live Guard | [`db-live-guard.yml`](../../.github/workflows/db-live-guard.yml) | agendado (semanal, segunda) e dispatch sobre main | o contrato do banco de PRODUCAO (drift, paridade, runtime config) | issue aberta ou comentada com a causa; o guarda vivo nao passa em silencio | issue de guardas vivos | — | — |
| DB Migrate (production) | [`db-migrate.yml`](../../.github/workflows/db-migrate.yml) | dispatch na main, com o apply gateado por environment | dry-run obrigatorio e apply com hash estrutural da migration | nada e aplicado; o dry-run precisa passar antes | operador que disparou e a issue de ops | — | — |
| Deploy Edge Functions | [`deploy-functions.yml`](../../.github/workflows/deploy-functions.yml) | push na main (supabase/functions/**, config.toml) e dispatch manual | as Edge Functions publicadas batem com o repo | o deploy aborta antes de publicar | operador que disparou | — | — |
| E2E logado | [`e2e-logado.yml`](../../.github/workflows/e2e-logado.yml) | push na main e dispatch sobre main | o fluxo logado (Playwright com login real) contra producao | artefato do Playwright e issue/relatorio; nunca roda em PR de terceiro | issue de E2E e autor do push | — | — |
| E2E Talk X | [`e2e-talkx.yml`](../../.github/workflows/e2e-talkx.yml) | pull_request e dispatch | o fluxo do Talk X no navegador | PR fica vermelho com o artefato do Playwright | autor do PR | — | — |
| Notifica falha na main | [`notifica-falha-main.yml`](../../.github/workflows/notifica-falha-main.yml) | workflow_run (conclusao dos workflows principais na main) | abre issue quando qualquer workflow critico falha na main | silencioso (nao tem mecanismo de auto-alerta proprio) | repositorio via issue com label db-live-guard | — | — |
| Settings Guard | [`settings-guard.yml`](../../.github/workflows/settings-guard.yml) | schedule (a cada 6h) + push na main + workflow_dispatch | compara branch protection, merge settings e environments com o baseline | abre ou atualiza issue com label settings-guard descrevendo a divergencia | repositorio via issue | — | — |
| Talk X V4 placar regen (push + semanal) | [`talkx-status-regen.yml`](../../.github/workflows/talkx-status-regen.yml) | push na main; schedule semanal (seg 07:45 UTC); dispatch | o placar do Talk X regenerado a partir dos dados atuais | o job fica vermelho e o placar nao e atualizado | autor do push | — | — |
| Targeted Ledger Evidence | [`targeted-ledger-evidence.yml`](../../.github/workflows/targeted-ledger-evidence.yml) | dispatch | a evidencia do ledger de migrations para uma version especifica | o job aborta sem publicar evidencia | operador que disparou | — | — |
| types-sync | [`types-sync.yml`](../../.github/workflows/types-sync.yml) | push na main, agendado e dispatch | os tipos gerados batem com o banco oficial (Gates 1 e 2) | PR em `automation/types-sync` ou issue `[types-sync]`; nunca passa com tipo divergente | PR de types e issue de gate | — | — |
| V043-V065 Vercel Env Cleanup | [`vercel-env-cleanup.yml`](../../.github/workflows/vercel-env-cleanup.yml) | workflow_dispatch com dry_run=1 (listagem) ou dry_run=0 (aplicar) | remove vars perigosas/mortas do projeto Vercel (V043-V065) | nenhuma var e removida; o operador ve o log de erro | operador que disparou | — | — |

## Detalhe

### Branch Hygiene Audit (`branch-hygiene-audit.yml`)

- **Gatilho:** agendado (semanal) e dispatch
- **O que prova:** quais branches sao podaveis e quais PRs estao paradas ha mais de 7 dias
- **Quando falha:** relatorio nao e publicado nem a issue e atualizada
- **Quem é avisado:** issue `[branch-hygiene]` no repositorio

### "Talk X PR body check" (`check-talkx-pr-body.yml`)

- **Gatilho:** pull_request (opened, synchronize, edited) em PRs que tocam Talk X
- **O que prova:** valida que o corpo da PR segue o template Talk X (etapa + slug)
- **Quando falha:** bloqueia o merge da PR com erro descritivo
- **Quem é avisado:** autor da PR via check reprovado

### CI/CD Pipeline (`ci.yml`)

- **Gatilho:** pull_request, push na main, merge_group e dispatch
- **O que prova:** lint, tipos, testes, build, security e E2E do codigo
- **Quando falha:** PR fica vermelho e o merge e bloqueado pelos required checks
- **Quem é avisado:** autor do PR e revisor, via checks do GitHub

### CodeQL (`codeql.yml`)

- **Gatilho:** agendado (diario) e dispatch
- **O que prova:** analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows
- **Quando falha:** alerta aparece em Security -> Code scanning
- **Quem é avisado:** aba Security

### CRM Sync Worker (`crm-sync-worker.yml`)

- **Gatilho:** dispatch (operacao manual; schedule desligado e nenhum job do pg_cron drena o outbox — W93)
- **O que prova:** health do CRM externo e um lote de 1..10 itens do crm_sync_outbox processado sem falha
- **Quando falha:** o job fica vermelho e nada e sincronizado; os itens continuam no outbox para replay
- **Quem é avisado:** quem disparou

### DB Guard (offline) (`db-guard.yml`)

- **Gatilho:** pull_request, push na main, merge_group e dispatch
- **O que prova:** guardas OFFLINE do banco (nunca recebe DESTINO_URL, roda codigo de PR)
- **Quando falha:** PR fica vermelho; nenhum codigo de PR alcanca o banco de producao
- **Quem é avisado:** autor do PR e revisor

### DB Live Guard (`db-live-guard.yml`)

- **Gatilho:** agendado (semanal, segunda) e dispatch sobre main
- **O que prova:** o contrato do banco de PRODUCAO (drift, paridade, runtime config)
- **Quando falha:** issue aberta ou comentada com a causa; o guarda vivo nao passa em silencio
- **Quem é avisado:** issue de guardas vivos

### DB Migrate (production) (`db-migrate.yml`)

- **Gatilho:** dispatch na main, com o apply gateado por environment
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

- **Gatilho:** pull_request e dispatch
- **O que prova:** o fluxo do Talk X no navegador
- **Quando falha:** PR fica vermelho com o artefato do Playwright
- **Quem é avisado:** autor do PR

### Notifica falha na main (`notifica-falha-main.yml`)

- **Gatilho:** workflow_run (conclusao dos workflows principais na main)
- **O que prova:** abre issue quando qualquer workflow critico falha na main
- **Quando falha:** silencioso (nao tem mecanismo de auto-alerta proprio)
- **Quem é avisado:** repositorio via issue com label db-live-guard

### Settings Guard (`settings-guard.yml`)

- **Gatilho:** schedule (a cada 6h) + push na main + workflow_dispatch
- **O que prova:** compara branch protection, merge settings e environments com o baseline
- **Quando falha:** abre ou atualiza issue com label settings-guard descrevendo a divergencia
- **Quem é avisado:** repositorio via issue

### Talk X V4 placar regen (push + semanal) (`talkx-status-regen.yml`)

- **Gatilho:** push na main; schedule semanal (seg 07:45 UTC); dispatch
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

### V043-V065 Vercel Env Cleanup (`vercel-env-cleanup.yml`)

- **Gatilho:** workflow_dispatch com dry_run=1 (listagem) ou dry_run=0 (aplicar)
- **O que prova:** remove vars perigosas/mortas do projeto Vercel (V043-V065)
- **Quando falha:** nenhuma var e removida; o operador ve o log de erro
- **Quem é avisado:** operador que disparou

## O que NÃO é bug

> Comportamentos que parecem erros mas são design intencional.
> Cada item vem do bloco `# nao-e-bug:` do YAML do workflow.

| Workflow | Situação | Por quê não é bug |
|---|---|---|
| [`ci.yml`](../../.github/workflows/ci.yml) | **merge_group inerte** | o gatilho merge_group esta nos YAMLs mas a fila de merge nao pode ser ligada -- conta adm01-debug e tipo User, nao Organization (merge queue e exclusivo de org) |
| [`crm-sync-worker.yml`](../../.github/workflows/crm-sync-worker.yml) | **schedule comentado** | decisao pendente do dono (W93); religar exige vars.CRM_SYNC_WORKER_ENABLED=true e o roteiro em docs/runbooks/CRM_INTEGRATION_ROLLOUT.md |
| [`types-sync.yml`](../../.github/workflows/types-sync.yml) | **TYPES_SYNC_PR_TOKEN ausente** | esperado -- o workflow usa GITHUB_TOKEN; o passo "Destravar os checks" aprova os runs com actions:write; um PAT funciona mas nao e necessario |
