# Workflows de CI — o que cada um faz

> **Gerado por `scripts/ci/render-workflow-docs.mjs`.** Não edite à mão: o CI roda
> `--check` e falha se este arquivo divergir do bloco `# docs:` de cada workflow.
> Para mudar o que está aqui, mude o bloco no YAML.

**21 workflows.**

| Workflow | Arquivo | Gatilho | O que prova | Quando falha | Quem é avisado | Custo/sem (min) | Falha (7 d) |
|---|---|---|---|---|---|---|---|
| Auto Update PR Branches | [`auto-update-pr-branch.yml`](../../.github/workflows/auto-update-pr-branch.yml) | push na main, fim de CI/DB Guard em PR, agendado (a cada 30 min) e dispatch | fila de merge serial — so a proxima PR com auto-merge e atualizada; as demais esperam sem gastar CI | a fila para e as PRs com auto-merge ficam BEHIND ate o proximo evento | Job Summary com a fila (em voo, proxima, esperando, bloqueadas) | — | — |
| Branch Hygiene Audit | [`branch-hygiene-audit.yml`](../../.github/workflows/branch-hygiene-audit.yml) | agendado (semanal) e dispatch | branches podaveis, PRs paradas ha mais de 7 dias e SLA dos alertas de code scanning | SLA vencido deixa o job vermelho e publica o diagnostico se o relatorio foi gerado | issue `[branch-hygiene]` no repositorio | — | — |
| CI/CD Pipeline | [`ci.yml`](../../.github/workflows/ci.yml) | pull_request, push na main e dispatch | tipos, testes de unidade, contratos Node/Edge, build, security, lint dos workflows (actionlint + shellcheck + zizmor) e E2E publico | PR fica vermelho e o merge e bloqueado pelos required checks | autor do PR e revisor, via checks do GitHub | — | — |
| CodeQL | [`codeql.yml`](../../.github/workflows/codeql.yml) | agendado (diário) e dispatch | analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows | alerta aparece em Security -> Code scanning | aba Security | — | — |
| Contexto para agentes de IA (10 min) | [`contexto.yml`](../../.github/workflows/contexto.yml) | push em main que toque código, banco, scripts das automações ou docs/contexto/regras/manual/; a cada 10 min (minuto 3); dispatch | branch contexto com docs/contexto/{codigo,supabase,regras}/ regerados das três fontes de verdade (código em main, banco oficial, código+migrations+manual/) e docs/contexto/00-INDEX.md montado a partir dos manifests | falha fatal de produtor reprova o workflow; fontes com artefato publicam e as demais mantêm a última versão; erro de download impede a publicação | ninguém (a branch contexto é a prova; errors.md em supabase/ e erros_do_gerador em codigo/ listam seções com falha) | — | — |
| CRM Sync Worker | [`crm-sync-worker.yml`](../../.github/workflows/crm-sync-worker.yml) | dispatch (operacao manual; schedule desligado e nenhum job do pg_cron drena o outbox — W93) | health do CRM externo e um lote de 1..10 itens do crm_sync_outbox processado sem falha | o job fica vermelho e nada e sincronizado; os itens continuam no outbox para replay | quem disparou | — | — |
| DB Guard (offline) | [`db-guard.yml`](../../.github/workflows/db-guard.yml) | pull_request, push na main, merge_group e dispatch | guardas OFFLINE do banco (nunca recebe DESTINO_URL, roda codigo de PR) | PR fica vermelho; nenhum codigo de PR alcanca o banco de producao | autor do PR e revisor | — | — |
| DB Live Guard | [`db-live-guard.yml`](../../.github/workflows/db-live-guard.yml) | agendado (semanal, segunda) e dispatch sobre main | o contrato do banco de PRODUCAO (drift, paridade, runtime config) | issue aberta ou comentada com a causa; o guarda vivo nao passa em silencio | issue de guardas vivos | — | — |
| DB Migrate (production) | [`db-migrate.yml`](../../.github/workflows/db-migrate.yml) | dispatch na main, com o job gateado por environment | dry-run obrigatorio e apply com hash estrutural da migration | nada e aplicado; o dry-run precisa passar antes | operador que disparou e a issue de ops | — | — |
| Deploy Edge Functions | [`deploy-functions.yml`](../../.github/workflows/deploy-functions.yml) | push na main (supabase/functions/**, config.toml) e dispatch manual | as Edge Functions publicadas batem com o repo | o deploy aborta antes de publicar | operador que disparou | — | — |
| E2E isolado - login e suíte completa | [`e2e-logado-isolado.yml`](../../.github/workflows/e2e-logado-isolado.yml) | pull_request valida login; dispatch escolhe login, full-suite, network-proof ou network-proof-contexts | login e 15 projetos; network-proof mede conectividade nativa; network-proof-contexts compara Library e Test reais em loopback com TLS e canário | isolamento, TLS, testes, protocolo ou limpeza inválidos bloqueiam; somente network-proof exige dummy previamente carregada | autor e revisor via check; relatórios fechados; contextos distingue coleta, API, online natural e Test; nenhum corte libera a suíte autenticada | — | — |
| E2E logado | [`e2e-logado.yml`](../../.github/workflows/e2e-logado.yml) | workflow_run (CI/CD Pipeline concluiu com sucesso na main) e dispatch sobre main | os mesmos 15 projetos Playwright em três grupos com Supabase descartável e TLS local | preparo, testes e limpeza bloqueiam; publica só diagnóstico redigido e preserva o alerta da suíte | mesma issue de E2E; fecha somente após sucesso dos três grupos | — | — |
| E2E Talk X (visual/launch + Auth smoke) | [`e2e-talkx.yml`](../../.github/workflows/e2e-talkx.yml) | pull_request e dispatch | o fluxo do Talk X no navegador | PR fica vermelho com o artefato do Playwright | autor do PR | — | — |
| Front release targets (V2/V3) | [`front-release-targets.yml`](../../.github/workflows/front-release-targets.yml) | push na main; schedule de hora em hora (minuto 17); dispatch | V2 no alias Vercel corresponde ao SHA da main e V3 no domínio publica uma release V3 íntegra | a trilha divergente fica vermelha e a automação de falhas abre uma issue | equipe de operação, por meio do check separado e da issue de falha na main | — | — |
| Inventário do estado real (semanal) | [`inventario-estado-semanal.yml`](../../.github/workflows/inventario-estado-semanal.yml) | agendado (seg 10:23 UTC) e dispatch | inventario/estado (banco, rotas, edges) regerado do banco oficial e do codigo | o job fica vermelho e o inventario nao e atualizado | PR automation/inventario-estado com o inventario novo | — | — |
| Notifica falha na main | [`notifica-falha-main.yml`](../../.github/workflows/notifica-falha-main.yml) | workflow_run (conclusao dos workflows principais na main) | abre issue quando qualquer workflow critico falha na main | a falha do workflow original fica sem issue de acompanhamento | equipe de operacao, por meio da issue criada no repositorio | — | — |
| Settings Guard | [`settings-guard.yml`](../../.github/workflows/settings-guard.yml) | agendado e dispatch | o perimetro do GitHub (branch protection, merge, environments) contra o baseline versionado | issue aberta; sem escopo suficiente o guarda reporta ponto cego em vez de falhar em silencio | issue de settings | — | — |
| Talk X V4 placar regen (push + semanal) | [`talkx-status-regen.yml`](../../.github/workflows/talkx-status-regen.yml) | push na main; schedule semanal (seg 07:45 UTC); dispatch | o placar do Talk X regenerado a partir dos dados atuais | o job fica vermelho e o placar nao e atualizado | autor do push | — | — |
| Targeted Ledger Evidence | [`targeted-ledger-evidence.yml`](../../.github/workflows/targeted-ledger-evidence.yml) | dispatch | a evidencia do ledger de migrations para uma version especifica | o job aborta sem publicar evidencia | operador que disparou | — | — |
| types-sync | [`types-sync.yml`](../../.github/workflows/types-sync.yml) | push na main, agendado e dispatch | os tipos gerados batem com o banco oficial (Gates 1 e 2) | PR em `automation/types-sync` ou issue `[types-sync]`; nunca passa com tipo divergente | PR de types e issue de gate | — | — |
| V043-V065 Vercel Env Cleanup | [`vercel-env-cleanup.yml`](../../.github/workflows/vercel-env-cleanup.yml) | dispatch manual com dry-run por padrão | remove variáveis Vercel perigosas ou mortas conforme o inventário | o script aborta antes de alterar variáveis e informa a causa | operador que disparou o workflow | — | — |

## Detalhe

### Auto Update PR Branches (`auto-update-pr-branch.yml`)

- **Gatilho:** push na main, fim de CI/DB Guard em PR, agendado (a cada 30 min) e dispatch
- **O que prova:** fila de merge serial — so a proxima PR com auto-merge e atualizada; as demais esperam sem gastar CI
- **Quando falha:** a fila para e as PRs com auto-merge ficam BEHIND ate o proximo evento
- **Quem é avisado:** Job Summary com a fila (em voo, proxima, esperando, bloqueadas)

### Branch Hygiene Audit (`branch-hygiene-audit.yml`)

- **Gatilho:** agendado (semanal) e dispatch
- **O que prova:** branches podaveis, PRs paradas ha mais de 7 dias e SLA dos alertas de code scanning
- **Quando falha:** SLA vencido deixa o job vermelho e publica o diagnostico se o relatorio foi gerado
- **Quem é avisado:** issue `[branch-hygiene]` no repositorio

### CI/CD Pipeline (`ci.yml`)

- **Gatilho:** pull_request, push na main e dispatch
- **O que prova:** tipos, testes de unidade, contratos Node/Edge, build, security, lint dos workflows (actionlint + shellcheck + zizmor) e E2E publico
- **Quando falha:** PR fica vermelho e o merge e bloqueado pelos required checks
- **Quem é avisado:** autor do PR e revisor, via checks do GitHub

### CodeQL (`codeql.yml`)

- **Gatilho:** agendado (diário) e dispatch
- **O que prova:** analise estatica de seguranca (SAST) de src, scripts, functions e dos workflows
- **Quando falha:** alerta aparece em Security -> Code scanning
- **Quem é avisado:** aba Security

### Contexto para agentes de IA (10 min) (`contexto.yml`)

- **Gatilho:** push em main que toque código, banco, scripts das automações ou docs/contexto/regras/manual/; a cada 10 min (minuto 3); dispatch
- **O que prova:** branch contexto com docs/contexto/{codigo,supabase,regras}/ regerados das três fontes de verdade (código em main, banco oficial, código+migrations+manual/) e docs/contexto/00-INDEX.md montado a partir dos manifests
- **Quando falha:** falha fatal de produtor reprova o workflow; fontes com artefato publicam e as demais mantêm a última versão; erro de download impede a publicação
- **Quem é avisado:** ninguém (a branch contexto é a prova; errors.md em supabase/ e erros_do_gerador em codigo/ listam seções com falha)

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

- **Gatilho:** dispatch na main, com o job gateado por environment
- **O que prova:** dry-run obrigatorio e apply com hash estrutural da migration
- **Quando falha:** nada e aplicado; o dry-run precisa passar antes
- **Quem é avisado:** operador que disparou e a issue de ops

### Deploy Edge Functions (`deploy-functions.yml`)

- **Gatilho:** push na main (supabase/functions/**, config.toml) e dispatch manual
- **O que prova:** as Edge Functions publicadas batem com o repo
- **Quando falha:** o deploy aborta antes de publicar
- **Quem é avisado:** operador que disparou

### E2E isolado - login e suíte completa (`e2e-logado-isolado.yml`)

- **Gatilho:** pull_request valida login; dispatch escolhe login, full-suite, network-proof ou network-proof-contexts
- **O que prova:** login e 15 projetos; network-proof mede conectividade nativa; network-proof-contexts compara Library e Test reais em loopback com TLS e canário
- **Quando falha:** isolamento, TLS, testes, protocolo ou limpeza inválidos bloqueiam; somente network-proof exige dummy previamente carregada
- **Quem é avisado:** autor e revisor via check; relatórios fechados; contextos distingue coleta, API, online natural e Test; nenhum corte libera a suíte autenticada

### E2E logado (`e2e-logado.yml`)

- **Gatilho:** workflow_run (CI/CD Pipeline concluiu com sucesso na main) e dispatch sobre main
- **O que prova:** os mesmos 15 projetos Playwright em três grupos com Supabase descartável e TLS local
- **Quando falha:** preparo, testes e limpeza bloqueiam; publica só diagnóstico redigido e preserva o alerta da suíte
- **Quem é avisado:** mesma issue de E2E; fecha somente após sucesso dos três grupos

### E2E Talk X (visual/launch + Auth smoke) (`e2e-talkx.yml`)

- **Gatilho:** pull_request e dispatch
- **O que prova:** o fluxo do Talk X no navegador
- **Quando falha:** PR fica vermelho com o artefato do Playwright
- **Quem é avisado:** autor do PR

### Front release targets (V2/V3) (`front-release-targets.yml`)

- **Gatilho:** push na main; schedule de hora em hora (minuto 17); dispatch
- **O que prova:** V2 no alias Vercel corresponde ao SHA da main e V3 no domínio publica uma release V3 íntegra
- **Quando falha:** a trilha divergente fica vermelha e a automação de falhas abre uma issue
- **Quem é avisado:** equipe de operação, por meio do check separado e da issue de falha na main

### Inventário do estado real (semanal) (`inventario-estado-semanal.yml`)

- **Gatilho:** agendado (seg 10:23 UTC) e dispatch
- **O que prova:** inventario/estado (banco, rotas, edges) regerado do banco oficial e do codigo
- **Quando falha:** o job fica vermelho e o inventario nao e atualizado
- **Quem é avisado:** PR automation/inventario-estado com o inventario novo

### Notifica falha na main (`notifica-falha-main.yml`)

- **Gatilho:** workflow_run (conclusao dos workflows principais na main)
- **O que prova:** abre issue quando qualquer workflow critico falha na main
- **Quando falha:** a falha do workflow original fica sem issue de acompanhamento
- **Quem é avisado:** equipe de operacao, por meio da issue criada no repositorio

### Settings Guard (`settings-guard.yml`)

- **Gatilho:** agendado e dispatch
- **O que prova:** o perimetro do GitHub (branch protection, merge, environments) contra o baseline versionado
- **Quando falha:** issue aberta; sem escopo suficiente o guarda reporta ponto cego em vez de falhar em silencio
- **Quem é avisado:** issue de settings

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

- **Gatilho:** dispatch manual com dry-run por padrão
- **O que prova:** remove variáveis Vercel perigosas ou mortas conforme o inventário
- **Quando falha:** o script aborta antes de alterar variáveis e informa a causa
- **Quem é avisado:** operador que disparou o workflow

## O que NÃO é bug

> Comportamentos que parecem erros mas são design intencional.
> Cada item vem do bloco `# nao-e-bug:` do YAML do workflow.

| Workflow | Situação | Por quê não é bug |
|---|---|---|
| [`ci.yml`](../../.github/workflows/ci.yml) | **merge_group ausente** | este workflow declara somente push, pull_request e workflow_dispatch; a fila de merge nao esta disponivel para a conta adm01-debug (tipo User, nao Organization) |
| [`contexto.yml`](../../.github/workflows/contexto.yml) | **sem-commit** | "nada mudou" no publicar significa que nenhuma das três fontes mudou desde a última publicação |
| [`contexto.yml`](../../.github/workflows/contexto.yml) | **metricas** | métricas/manifests do banco aguardam 60 min desde a coleta publicada; commits de código não reiniciam o prazo; data ausente/inválida/futura e mudanças de saúde/estado do índice publicam sem espera |
| [`contexto.yml`](../../.github/workflows/contexto.yml) | **banco-pulado** | sem o secret SUPABASE_DB_URL o job do banco sai verde com aviso e a pasta supabase/ fica como estava |
| [`crm-sync-worker.yml`](../../.github/workflows/crm-sync-worker.yml) | **schedule comentado** | decisao pendente do dono (W93); religar exige vars.CRM_SYNC_WORKER_ENABLED=true e o roteiro em docs/runbooks/CRM_INTEGRATION_ROLLOUT.md |
| [`types-sync.yml`](../../.github/workflows/types-sync.yml) | **TYPES_SYNC_PR_TOKEN ausente** | esperado -- o workflow usa GITHUB_TOKEN; o passo "Destravar os checks" aprova os runs com actions:write; um PAT funciona mas nao e necessario |
