# Workflows de CI — o que cada um faz

> **Gerado por `scripts/ci/render-workflow-docs.mjs`.** Não edite à mão: o CI roda
> `--check` e falha se este arquivo divergir do bloco `# docs:` de cada workflow.
> Para mudar o que está aqui, mude o bloco no YAML.

**16 workflows.**

| Workflow | Arquivo | Gatilho | O que prova | Quando falha | Quem é avisado |
|---|---|---|---|---|---|
| Auto Update PR Branches | [`auto-update-pr-branch.yml`](../../.github/workflows/auto-update-pr-branch.yml) | push na main | PRs abertas ficam com a main e os checks saem de `action_required` | PR atualizado fica esperando aprovacao na aba Actions e o auto-merge nunca dispara | autor do PR |
| Branch Hygiene Audit | [`branch-hygiene-audit.yml`](../../.github/workflows/branch-hygiene-audit.yml) | agendado (semanal) e dispatch | quais branches sao podaveis e quais PRs estao paradas ha mais de 7 dias | relatorio nao e publicado nem a issue e atualizada | issue `[branch-hygiene]` no repositorio |
| CI/CD Pipeline | [`ci.yml`](../../.github/workflows/ci.yml) | pull_request, push na main, merge_group e dispatch | lint, tipos, testes, build, security e E2E do codigo | PR fica vermelho e o merge e bloqueado pelos required checks | autor do PR e revisor, via checks do GitHub |
| CodeQL | [`codeql.yml`](../../.github/workflows/codeql.yml) | pull_request e agendado | analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows | alerta aparece em Security -> Code scanning | aba Security e revisores do PR |
| CRM Sync Worker | [`crm-sync-worker.yml`](../../.github/workflows/crm-sync-worker.yml) | dispatch (manual; o cron foi desligado por rodar 100% skipped) | sincronizacao do CRM executada de ponta a ponta | o job fica vermelho e nada e sincronizado | quem disparou |
| DB Guard (offline) | [`db-guard.yml`](../../.github/workflows/db-guard.yml) | pull_request, push na main, merge_group e dispatch | guardas OFFLINE do banco (nunca recebe DESTINO_URL, roda codigo de PR) | PR fica vermelho; nenhum codigo de PR alcanca o banco de producao | autor do PR e revisor |
| DB Live Guard | [`db-live-guard.yml`](../../.github/workflows/db-live-guard.yml) | push na main, agendado e dispatch sobre main | o contrato do banco de PRODUCAO (drift, paridade, runtime config) | issue aberta ou comentada com a causa; o guarda vivo nao passa em silencio | issue de guardas vivos |
| DB Migrate (production) | [`db-migrate.yml`](../../.github/workflows/db-migrate.yml) | dispatch na main, com o job gateado por environment | dry-run obrigatorio e apply com hash estrutural da migration | nada e aplicado; o dry-run precisa passar antes | operador que disparou e a issue de ops |
| Deploy Edge Functions | [`deploy-functions.yml`](../../.github/workflows/deploy-functions.yml) | push na main (supabase/functions/**, config.toml) e dispatch manual | as Edge Functions publicadas batem com o repo | o deploy aborta antes de publicar | operador que disparou |
| E2E logado | [`e2e-logado.yml`](../../.github/workflows/e2e-logado.yml) | push na main e dispatch sobre main | o fluxo logado (Playwright com login real) contra producao | artefato do Playwright e issue/relatorio; nunca roda em PR de terceiro | issue de E2E e autor do push |
| E2E Talk X | [`e2e-talkx.yml`](../../.github/workflows/e2e-talkx.yml) | pull_request e dispatch | o fluxo do Talk X no navegador | PR fica vermelho com o artefato do Playwright | autor do PR |
| Settings Guard | [`settings-guard.yml`](../../.github/workflows/settings-guard.yml) | agendado e dispatch | o perimetro do GitHub (branch protection, merge, environments) contra o baseline versionado | issue aberta; sem escopo suficiente o guarda reporta ponto cego em vez de falhar em silencio | issue de settings |
| Supabase Sync & Validate | [`supabase-sync.yml`](../../.github/workflows/supabase-sync.yml) | dispatch (manual, com confirmacao de project-ref) | import de snapshot legado validado por identidade do destino | o import aborta antes de escrever | operador que disparou |
| Talk X V4 placar regen (push) | [`talkx-status-regen.yml`](../../.github/workflows/talkx-status-regen.yml) | push | o placar do Talk X regenerado a partir dos dados atuais | o job fica vermelho e o placar nao e atualizado | autor do push |
| Targeted Ledger Evidence | [`targeted-ledger-evidence.yml`](../../.github/workflows/targeted-ledger-evidence.yml) | dispatch | a evidencia do ledger de migrations para uma version especifica | o job aborta sem publicar evidencia | operador que disparou |
| types-sync | [`types-sync.yml`](../../.github/workflows/types-sync.yml) | push na main, agendado e dispatch | os tipos gerados batem com o banco oficial (Gates 1 e 2) | PR em `automation/types-sync` ou issue `[types-sync]`; nunca passa com tipo divergente | PR de types e issue de gate |

## Detalhe

### Auto Update PR Branches (`auto-update-pr-branch.yml`)

- **Gatilho:** push na main
- **O que prova:** PRs abertas ficam com a main e os checks saem de `action_required`
- **Quando falha:** PR atualizado fica esperando aprovacao na aba Actions e o auto-merge nunca dispara
- **Quem é avisado:** autor do PR

### Branch Hygiene Audit (`branch-hygiene-audit.yml`)

- **Gatilho:** agendado (semanal) e dispatch
- **O que prova:** quais branches sao podaveis e quais PRs estao paradas ha mais de 7 dias
- **Quando falha:** relatorio nao e publicado nem a issue e atualizada
- **Quem é avisado:** issue `[branch-hygiene]` no repositorio

### CI/CD Pipeline (`ci.yml`)

- **Gatilho:** pull_request, push na main, merge_group e dispatch
- **O que prova:** lint, tipos, testes, build, security e E2E do codigo
- **Quando falha:** PR fica vermelho e o merge e bloqueado pelos required checks
- **Quem é avisado:** autor do PR e revisor, via checks do GitHub

### CodeQL (`codeql.yml`)

- **Gatilho:** pull_request e agendado
- **O que prova:** analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows
- **Quando falha:** alerta aparece em Security -> Code scanning
- **Quem é avisado:** aba Security e revisores do PR

### CRM Sync Worker (`crm-sync-worker.yml`)

- **Gatilho:** dispatch (manual; o cron foi desligado por rodar 100% skipped)
- **O que prova:** sincronizacao do CRM executada de ponta a ponta
- **Quando falha:** o job fica vermelho e nada e sincronizado
- **Quem é avisado:** quem disparou

### DB Guard (offline) (`db-guard.yml`)

- **Gatilho:** pull_request, push na main, merge_group e dispatch
- **O que prova:** guardas OFFLINE do banco (nunca recebe DESTINO_URL, roda codigo de PR)
- **Quando falha:** PR fica vermelho; nenhum codigo de PR alcanca o banco de producao
- **Quem é avisado:** autor do PR e revisor

### DB Live Guard (`db-live-guard.yml`)

- **Gatilho:** push na main, agendado e dispatch sobre main
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

- **Gatilho:** pull_request e dispatch
- **O que prova:** o fluxo do Talk X no navegador
- **Quando falha:** PR fica vermelho com o artefato do Playwright
- **Quem é avisado:** autor do PR

### Settings Guard (`settings-guard.yml`)

- **Gatilho:** agendado e dispatch
- **O que prova:** o perimetro do GitHub (branch protection, merge, environments) contra o baseline versionado
- **Quando falha:** issue aberta; sem escopo suficiente o guarda reporta ponto cego em vez de falhar em silencio
- **Quem é avisado:** issue de settings

### Supabase Sync & Validate (`supabase-sync.yml`)

- **Gatilho:** dispatch (manual, com confirmacao de project-ref)
- **O que prova:** import de snapshot legado validado por identidade do destino
- **Quando falha:** o import aborta antes de escrever
- **Quem é avisado:** operador que disparou

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
