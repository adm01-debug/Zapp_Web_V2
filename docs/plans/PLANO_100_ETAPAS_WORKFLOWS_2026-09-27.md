# Plano de correções e melhorias — GitHub Actions (100 etapas)

**Data da auditoria:** 2026-09-27 · **Commit auditado:** `26c78a0` (main)
**Escopo:** os 58 arquivos de `.github/workflows/` + 68 workflows registrados na API + branch protection + secrets + histórico real de runs (2.500 runs da `main` analisados).
**Status:** PLANO APROVADO PARA EXECUÇÃO FUTURA — **nada deste documento foi executado ainda.**

---

## Sumário executivo dos achados

### 🔴 Crítico (produção/segurança afetadas HOJE)

| # | Achado | Evidência |
|---|--------|-----------|
| A1 | **Branch protection da `main` não exige NENHUM status check.** Os ~40 gates construídos não bloqueiam merge de nada — basta 1 aprovação. O sentinel que vigiava isso está com schedule suspenso (PAT sem escopo). `enforce_admins` também está OFF. | API `/branches/main/protection`: campo `required_status_checks` ausente |
| A2 | **`db-migrate` vermelho na main**: migration `20260927210000_multiplix_rls_hardening_realtime_pii.sql` falha em prod com `relation "public.multiplix_dispatches" does not exist`. Migrations novas ficam represadas atrás dela. Padrão suspeito de contaminação cross-projeto (mesma classe do incidente 2026-08-30). | run 36325080322 |
| A3 | **PAT `GH_TOKEN_ACTIONS` expirado/revogado (HTTP 401)** — `ratchet-tighten` falha em TODO push na main (6 falhas seguidas); os alertas de fallback do deploy-vps que usam esse PAT também estão mudos. | run 36337822386: `gh: Bad credentials (HTTP 401)` |
| A4 | **Gatilho pós-deploy do `bundle-secret-guard` está morto**: o `workflow_run` referencia `"Build & Deploy — ZAPP web v3"`, mas o nome real tem o prefixo `🚀 `. O guard de service_role/anon-key só roda no cron diário — um bundle ruim fica até ~24h em produção sem detecção. | 12 últimas runs: 100% `schedule`, zero `workflow_run` |
| A5 | **Secrets `service_role`/meta-token expostos a código de PR em runner self-hosted**: `contract-gate` e `quality` (ci.yml) e `measure-invariants` rodam em `pull_request` executando scripts do HEAD do PR com `SUPABASE_SERVICE_ROLE_KEY`/`ZAPP_META_TOKEN` no env — um PR malicioso pode exfiltrar. O próprio ci.yml documenta esse risco para o `audit-contract-live` mas o `contract-gate` reabriu o buraco. Agravante: repo público + runners self-hosted persistentes na VPS de produção. | ci.yml:380-414, measure-invariants.yml:411-423 |

### 🟠 Alto (workflows quebrados/mortos por construção)

| # | Achado | Evidência |
|---|--------|-----------|
| B1 | `contract-guards.yml` e `e2e-nightly-full.yml` usam `npm ci` + `cache: npm`, mas **o repo não tem `package-lock.json`** (só `bun.lock`) — quebram por construção. | `ls package-lock.json` → não existe |
| B2 | `notify-ci-failure` vigia `"E2E Nightly Full (VPS)"`, mas o nome real é `"E2E Nightly Full"` — nunca notifica. E não cobre `db-migrate`, `DB Guard`, `edge-deploy`, `bundle-secret-guard` (justamente os que estão/estiveram vermelhos sem ninguém ver). | notify-ci-failure.yml:23-36 |
| B3 | `migration-smoke-test`: publica `-p 5432:5432`; na VPS a porta está sempre ocupada → `PG_SMOKE_SKIPPED=true` e o apply real das migrations **nunca roda** (a conexão já é via `docker exec`, o publish de porta é desnecessário). | migration-smoke-test.yml:88-104 |
| B4 | `score-ratchet` é no-op permanente (lê `decouple-score.json` do checkout, que nunca existe — o artifact fica em OUTRO workflow) e ainda **comenta em todo PR** um texto fixo (spam). | score-ratchet.yml:541-586 |
| B5 | `edge-drift-check` vermelho: exige secret `SUPABASE_ANON_KEY`, que **não existe** no repo (existe `VITE_SUPABASE_ANON_KEY`). Jobs `drift` e `e39` são duplicados (rodam o mesmo `deploy-edge.sh` 2×) e instala Supabase CLI via `curl \| sh` sem usar. | run 36328889424 + lista de secrets |
| B6 | Cadeia quebrada: `gen-types-zapp` falha → `types.ts` só declara schema `public` → gate "Catálogo local está determinístico" do `DB Guard` vermelho na main (documentado no próprio YAML). | run 36326553078 + db-guard.yml:72-86 |
| B7 | 7 schedules suspensos por comentário em 2026-09-27 (cleanup-e2e-data, contract-guards, deno-contract-tests, e2e-inbox, e2e-nightly, edge-drift-check, migration-drift-guard, branch-protection-sentinel) — varreduras diárias desligadas sem prazo/dono para religar. | comentários `2026-09-27: schedule suspenso` |
| B8 | 688 shadow migrations no banco vs 173 arquivos no repo (migration-drift-guard WARN-ONLY). | migration-drift-guard.yml cabeçalho |

### 🟡 Médio (higiene, eficiência, supply-chain)

- **Duplicação pesada por PR**: unit tests rodam 2× (ci.yml `test` + quality-gate), build 3× (ci.yml `build` + quality-gate + perf-budget), E2E boot 2× (ci.yml `e2e` + quality-gate chromium/firefox). Custo dobrado e PR ~2× mais lento.
- **19 refs de actions de terceiros sem pin por SHA** (oven-sh/setup-bun@v2 ×12, denoland/setup-deno@v2 ×3, docker/* ×6, gitleaks@v3) — o `action-pin-check` só cobre linhas novas; o legado segue exposto.
- **33 workflows com jobs sem `timeout-minutes`** (default 6h) num pool self-hosted de ~6 runners.
- **30 workflows sem bloco `permissions:`** e casos de over-permission (`zapp-schema-drift-gate` com `contents: write` no nível do workflow, inclusive no job disparado por PR; `edge-drift-check` com `issues: write` sem uso).
- **~43 jobs no pool `vps-zapp` sendo que vários são grep/echo puro** (db-invariants INV-1..5, health-score-anti-drift, migration-lint, edge-guard, branch-protection-sentinel check-quality, pr-check stubs dos e2e) — fila desnecessária no pool de 6.
- **`actionlint.yaml` existe, mas nenhum workflow roda actionlint.**
- 7 registros órfãos de workflows deletados (`bootstrap-runner`, `merge-bot`, `db-health`, `commitlint`, etc.) + `deploy-vps-selfhosted.yml [DRAFT]` desabilitado no repo.
- `gen-types-zapp` faz `gh pr merge --auto` (squash) — viola a política "merge é ato humano" do CLAUDE.md/HERMES.md sem exceção documentada.
- Secrets duplicados/órfãos: `SUPABASE_SERVICE_KEY` (sem uso), `DATABASE_URL` (rota morta, ECONNREFUSED), `ZAPP_META_URL` vs `SUPABASE_META_URL`.

---

## Regras de execução do plano

1. **Uma etapa = um PR pequeno** (ou um ato de configuração via API), na ordem das fases. Etapas independentes dentro da mesma fase podem ser paralelizadas.
2. Cada etapa tem **critério de aceite** — só marcar concluída com evidência (run verde, resposta da API, query).
3. Mudança em `name:` de workflow exige grep por `workflow_run` antes (lição do achado A4).
4. Nada de fase 5+ antes de fechar as fases 0–2 (produção primeiro).

---

## FASE 0 — Apagar incêndio: main vermelha e produção (etapas 1–10)

**1.** Diagnosticar a migration `20260927210000_multiplix_rls_hardening_realtime_pii.sql`: confirmar no banco de produção se `public.multiplix_dispatches` deveria existir (migration anterior não aplicada?) ou se é código de outro projeto (contaminação cross-tenant, mesma classe do incidente 2026-08-30). *Aceite: causa raiz escrita em `docs/ops/`.*

**2.** Corrigir a etapa 1 pelo caminho decidido: (a) corrigir/guardar a migration com `IF EXISTS`/pré-criação, ou (b) removê-la + rollback, registrando em `supabase_migrations.schema_migrations` se necessário. *Aceite: `db-migrate` verde na main e fila de migrations desbloqueada.*

**3.** Rotacionar o PAT `GH_TOKEN_ACTIONS` (fine-grained: `contents:read`, `pull_requests:write`) e atualizar o secret. *Aceite: `ratchet-tighten` verde no próximo push à main.*

**4.** Resolver o estado `RATCHET_PR_CLOSED` do ratchet (o step de "prior PR" falha se o PR canônico foi fechado sem merge): fechar/reabrir/mergear o PR pendente de `chore/ratchet-tighten-*` conforme o caso. *Aceite: run de ratchet-tighten sem `RATCHET_PR_*` de erro.*

**5.** Criar o secret `SUPABASE_ANON_KEY` (valor da anon key atual do Kong) — é exigido pelo E38/E39 do `edge-drift-check` e não existe. *Aceite: `edge-drift-check` via dispatch passa do step E38.*

**6.** Diagnosticar e corrigir a falha do `gen-types-zapp` (2 falhas em dispatch; provável `SUPABASE_META_URL`/postgres-meta inacessível do ubuntu-latest — o postgres-meta não é publicado fora do Swarm). Se for isso, mover o job para o runner `vps-zapp` como o `db-guard`. *Aceite: PR automático de types gerado com schemas `public,zapp,evo`.*

**7.** Após a etapa 6, rodar `db-guard` com `regen=true` para regenerar `supabase/schema-catalog.json` da fonte canônica. *Aceite: step "Catálogo local está determinístico" verde na main.*

**8.** Corrigir o nome vigiado no `bundle-secret-guard`: `workflows: ["🚀 Build & Deploy — ZAPP web v3"]` (com emoji, idêntico ao `name:` do deploy-vps.yml). *Aceite: próximo deploy dispara run com `event=workflow_run`.*

**9.** Corrigir `notify-ci-failure`: `"E2E Nightly Full (VPS)"` → `"E2E Nightly Full"` e **adicionar** à lista: `db-migrate`, `DB Guard`, `edge-deploy`, `Bundle Secret Guard`, `Migration Drift Guard`. *Aceite: teste controlado (dispatch de um workflow quebrado de propósito em branch) gera e-mail.*

**10.** `migration-smoke-test`: remover `-p 5432:5432` do `docker run` do pg-smoke (a conexão é 100% via `docker exec`; o publish é o único motivo do skip permanente na VPS). *Aceite: run na main SEM a linha `PG_SMOKE_SKIPPED`, com apply delta executando.*

## FASE 1 — Fazer os gates voltarem a bloquear (etapas 11–20)

**11.** Definir a lista canônica de required status checks da `main` (proposta mínima, todos hoje existentes): `Verify Lockfile`, `Edge guard checks`, `DB Invariants`, `Migration Uniqueness Gate`, `schema-drift-guard`, `PR Size Gate`, `Analyze (javascript-typescript)`, `🔍 Secret Scan (gitleaks)`, `Verify security_invoker on all views`, `edge-auth-smoke`, `edge-parse-gate`, `Contract Tests (Deno)`, `quality-gate`. Documentar em `docs/CI_REQUIRED_CHECKS.md`. *Aceite: doc mergeado.*

**12.** Aplicar a lista da etapa 11 na branch protection da `main` (`required_status_checks.strict=true`). *Aceite: API retorna os contexts; PR de teste com check vermelho não mergeia.*

**13.** Ligar `enforce_admins` na proteção da `main`. *Aceite: API `enforce_admins.enabled=true`.*

**14.** Ligar `required_conversation_resolution` na `main`. *Aceite: API confirma.*

**15.** Regerar `BRANCH_PROT_PAT` com escopo `Administration:read` e atualizar o secret. *Aceite: `branch-protection-sentinel` via dispatch passa lendo a proteção real.*

**16.** Reabilitar o `schedule` do `branch-protection-sentinel` (removido em 27/09) e alinhar `EXPECTED_CONTEXTS` à lista da etapa 11. *Aceite: run diária verde.*

**17.** Garantir que todo required check reporta SEMPRE (padrão check-paths + `checks.create` skipped, como `deno-contract-tests`/`migration-tests`) para PR docs-only não travar. Aplicar onde a etapa 11 exigir (ex.: quality-gate). *Aceite: PR só-docs mergeável com todos os checks reportados.*

**18.** Revisar `require_last_push_approval` (proteção contra self-approval de agente que pusha em PR alheio) — decisão de negócio: ligar. *Aceite: API confirma.*

**19.** `zapp-schema-drift-gate`: mover `permissions: contents: write` do nível do workflow para APENAS o job de regen (que só roda em dispatch); job de PR fica `contents: read`. *Aceite: YAML aplicado; drift-check em PR roda com token read-only.*

**20.** Atualizar a tabela de "Incidentes fechados"/CLAUDE.md com a política: **nunca renomear `name:` de workflow sem grep por `workflow_run`** (lição A4/B2). *Aceite: CLAUDE.md atualizado.*

## FASE 2 — Segurança dos workflows e do pool self-hosted (etapas 21–35)

**21.** `ci.yml contract-gate`: parar de expor `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_URL` a código do PR. Caminho recomendado: rodar o audit completo só em `push` (o `audit-contract-live` já faz) e, em PR, rodar contra um **snapshot commitado** do contrato (mesmo padrão do decouple-guard) — sem secret nenhum. *Aceite: nenhum job de `pull_request` no ci.yml com service_role no env.*

**22.** `ci.yml quality` (schema gate) : mesmo tratamento — em PR usar snapshot/catálogo commitado (o `db-guard` já compara catálogo commitado × vivo em push); remover `ZAPP_META_TOKEN` de evento PR. *Aceite: idem 21.*

**23.** `measure-invariants`: mover a medição online (service_role) para `push`/schedule; em PR, comentar usando o último score de main (artifact/branch dedicado). Alternativa: environment `db-live` com required reviewer. *Aceite: evento `pull_request` sem `SUPABASE_SERVICE_ROLE_KEY`.*

**24.** Actions → Settings: exigir **aprovação para TODOS os forks externos** (`Require approval for all outside collaborators` ou mais restrito), já que repo é público com runner self-hosted persistente na VPS de produção. *Aceite: configuração confirmada (screenshot/API).*

**25.** Separar runners: label dedicado `vps-deploy` só para `deploy-vps`/`edge-deploy`/`db-migrate` (jobs com docker.sock), e o restante do pool sem acesso ao socket. Hoje qualquer job PR no pool alcança `/var/run/docker.sock` (o `db-invariants` INV-7 usa `docker exec` no Postgres de produção a partir de job disparável por PR). *Aceite: jobs de PR não conseguem `docker exec` no supabase_db.*

**26.** Pinar por SHA as 19 refs de terceiros: `oven-sh/setup-bun` (12×), `denoland/setup-deno` (3×), `docker/setup-buildx-action`, `docker/login-action` (2×), `docker/build-push-action` (2×), `gitleaks/gitleaks-action`. Modelos já existem no repo (perf-budget e migration-tests pinados). *Aceite: `action-pin-check` estendido (etapa 27) verde.*

**27.** Endurecer `action-pin-check`: remover o modo incremental (passar a varrer o ESTADO, não o diff) depois da etapa 26 zerar o legado. *Aceite: gate falha se qualquer uses de terceiro sem SHA existir no repo.*

**28.** `edge-drift-check`: remover o step `curl https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh` (CLI não é usada pelos steps seguintes; se for necessária no futuro, baixar release pinada com checksum). *Aceite: workflow sem `curl \| sh`.*

**29.** Adicionar `permissions: contents: read` explícito nos 30 workflows sem bloco (lista no sumário). *Aceite: 0 workflows sem bloco permissions.*

**30.** Remover permissões sem uso: `issues: write` do `edge-drift-check`; revisar `actions: write` (só onde o cache save precisa). *Aceite: diff aplicado.*

**31.** `notify-ci-failure`: montar o payload com `jq --arg` (hoje interpola `head_branch`/`actor` direto na string JSON — branch com aspas quebra/injeta). *Aceite: payload gerado via jq.*

**32.** Criar `ci-workflows-lint.yml` (ubuntu-latest, PR em `.github/workflows/**`): rodar **actionlint** (a config `.github/actionlint.yaml` já existe e ninguém a usa) + **zizmor** (auditoria de segurança de workflows) em modo bloqueante para findings High. *Aceite: gate verde na main; passa a ser required check.*

**33.** Faxina de secrets: apagar `SUPABASE_SERVICE_KEY` (órfão — o measure-invariants mapeia a partir de `SUPABASE_SERVICE_ROLE_KEY`), decidir destino de `DATABASE_URL` (rota TCP morta; schema-drift live-drift depende dele e nunca roda) e unificar `SUPABASE_META_URL` × `ZAPP_META_URL` num nome só. Atualizar `docs/SECRETS_INVENTORY.md`. *Aceite: inventário e lista real batem 1:1.*

**34.** Auditar as 3 RPCs E2E `SECURITY DEFINER` (`rpc_e2e_seed_user`, `rpc_e2e_seed_contacts`, `rpc_e2e_cleanup`) — quem pode executá-las além de service_role; janela de 90d do cleanup. *Aceite: `REVOKE` confirmado para anon/authenticated (query).*

**35.** Revisar as duas exceções hardcoded do fallback de `ghcr-protected-tags` (deploy-vps step `protect`) e mover para o arquivo versionado. *Aceite: fallback hardcoded removido ou documentado.*

## FASE 3 — Consertar workflows quebrados/mortos restantes (etapas 36–50)

**36.** `contract-guards.yml`: trocar `npm ci` + `cache: npm` por `setup-bun` pinado + `bun install --ignore-scripts` (padrão do repo). Remover `node-version-file` se ficar sem uso. *Aceite: run verde em PR de teste.*

**37.** Rodar `node scripts/check-error-shapes.mjs --atualizar-teto` (pré-requisito documentado no YAML) e reabilitar o `schedule` do `contract-guards`. *Aceite: cron reativado e verde.*

**38.** `e2e-nightly-full.yml`: migrar `npm ci`→bun, `actions/setup-node@v4`→`@v7`, `upload-artifact@v4`→`@v7`, `runs-on: self-hosted`→labels completos `[Linux, X64, vps-zapp, playwright]`. *Aceite: dispatch manual verde (ou falha só por specs, não por infra).*

**39.** Corrigir `atomic-counter.test.ts:283` (1 de 18 testes falhando — motivo da suspensão do cron do `deno-contract-tests`) e reabilitar o schedule. *Aceite: cron diário verde.*

**40.** Corrigir `rpc_e2e_cleanup` (falha porque `evolution_contacts` é VIEW — ajustar a RPC para deletar na física `evo.evolution_contacts`) e reabilitar o schedule do `cleanup-e2e-data`. *Aceite: dispatch verde + cron reativado.*

**41.** `score-ratchet.yml`: decidir e executar — (a) deletar o workflow (recomendado: o measure-invariants já publica o score como comment), ou (b) reescrever para baixar o artifact `decouple-score` via API. Em qualquer caso, acabar com o comentário incondicional em todo PR. *Aceite: 0 comentários fixos de score-ratchet em PRs novos.*

**42.** `migration-drift-guard`: dedupe de comentários com MARKER + `updateComment` (padrão do pr-size-gate); remover o comentário "clean" (só atualizar o existente se houver). *Aceite: 1 comentário no máximo por PR.*

**43.** `edge-drift-check`: fundir os jobs `drift` e `e39` (rodam o mesmo `deploy-edge.sh` read-only 2× no pool). *Aceite: 1 job, 1 execução.*

**44.** Consolidar o parse-gate deno: `edge-parse-gate.yml` vira reusable (`workflow_call`) e `edge-deploy.yml` chama-o, eliminando a cópia interna. *Aceite: um único lugar com a lógica `deno check`.*

**45.** Apagar os registros órfãos de workflows deletados via API (`DELETE /actions/workflows` não existe — na prática: confirmar que estão `disabled_manually` e documentar; para `bootstrap-runner.yml` que consta ativo sem arquivo, desabilitar). *Aceite: nenhum workflow "ativo" sem arquivo correspondente.*

**46.** Decidir destino do `deploy-vps-selfhosted.yml` [DRAFT, desabilitado]: remover do repo (as partes boas — convergência verificada — já foram portadas para o deploy-vps em 2026-08-20) ou promover. Recomendação: remover. *Aceite: decisão aplicada.*

**47.** Reabilitar o schedule do `migration-drift-guard` (a correção de 27/09 já fez o check reportar o drift real; o cron foi suspenso junto). *Aceite: cron reativado.*

**48.** Reabilitar o schedule do `edge-drift-check` após etapas 5/43. *Aceite: cron diário verde.*

**49.** E2E noturno contra a VPS: em vez de religar a suíte completa (suspensa por instabilidade), criar um **smoke diário mínimo** (2–3 specs: login, inbox carrega, envio de mensagem) com retry 1 — religar o full só quando o smoke tiver 7 dias verdes. *Aceite: smoke diário verde 7 dias seguidos.*

**50.** Corrigir comentários/documentação defasados nos YAMLs: header do `security.yml` diz "advisory" mas o gate é bloqueante; comentários "repo privado + cota esgotada" já invalidados; nota do `quality` no ci.yml. *Aceite: comentários batem com o comportamento.*

## FASE 4 — Confiabilidade e padronização (etapas 51–65)

**51.** Adicionar `timeout-minutes` em TODOS os jobs sem (33 arquivos; ver sumário). Padrão: 10 para guards estáticos, 15 para gates com DB, 30 para builds, 60+ só E2E. *Aceite: `grep -c timeout-minutes` ≥ nº de jobs em todos os YAMLs.*

**52.** Adicionar `concurrency` nos workflows sem (decouple-guard, ownership-gate, evo-ddl-gate, gen-types-zapp, migration-lint, check-multiplix-guards, edge-guard). Padrão do repo: grupo por PR sem cancelar / por ref cancelando em push. *Aceite: todos com concurrency.*

**53.** Padronizar o "guard de secret ausente" numa action composta local (`.github/actions/require-secrets`): notice+skip em PR, error em main/schedule. Hoje cada workflow implementa diferente (E38 erra em dispatch, INV-6 avisa e passa, edge-auth pula). *Aceite: action criada e adotada em ≥5 workflows.*

**54.** Padronizar versões: `actions/checkout@v7` em todos (hoje v4 em perf-budget, contract-guards, check-multiplix-guards, e2e-nightly), `setup-node@v7` + node 22 (migration-drift-guard usa 20), `bun-version: 1.3.14` (flaky-detector usa '1.2'). *Aceite: grep sem versões divergentes.*

**55.** Runner image: pré-instalar `psql` (postgresql-client) nos runners vps-zapp — hoje 4 workflows fazem `apt-get install` a cada run (db-invariants, db-reference-integrity, db-guard, schema-drift). *Aceite: steps de install viram no-op (command -v psql OK).*

**56.** Mover jobs grep-only do pool vps-zapp para ubuntu-latest: `db-invariants` INV-1..5 (split em 2 jobs: estático hosted + INV-6/7 no pool), `health-score-anti-drift`, `migration-lint`, `edge-guard`, `branch-protection-sentinel check-quality`, `schema-drift static-drift`. *Aceite: pool só com jobs que precisam de rede interna/docker.*

**57.** `e2e-crm-vps`/`e2e-inbox-vps`: `pr-check` stub (echo) sai do pool vps-zapp → `ubuntu-latest`. *Aceite: nenhum stub ocupando runner do pool.*

**58.** `seed-e2e-user`/`seed-e2e-contacts`/`validate-e2e-user`/`cleanup-e2e-data`: mover para `ubuntu-latest` (fazem só curl para URL pública `supabase.atomicabr.com.br`). *Aceite: 4 workflows fora do pool.*

**59.** Unificar o consumo de secrets nos 3 e2e-vps: `secrets: inherit` (admin) vs lista explícita (crm/inbox) — padronizar na lista explícita. *Aceite: os 3 iguais.*

**60.** Extrair helper compartilhado `infra/ci/db-exec.sh` para a rota `docker exec supabase_db` (hoje duplicada em migration-drift-guard, schema-snapshot, db-invariants INV-7, com 3 variantes de seleção de container — uma delas já causou falso verde documentado). *Aceite: 1 implementação, com o guard de ambiguidade do INV-7.*

**61.** Watchdog de runners: workflow horário (ubuntu-latest) que consulta `/actions/runners`, alerta no webhook se `offline > 1` ou `busy == total` por 2 checks seguidos. *Aceite: alerta de teste disparado.*

**62.** Cache do Playwright nos jobs `e2e`/`a11y` do ci.yml (hoje `playwright install --with-deps` full a cada run; e2e-vps já cacheia `~/.cache/ms-playwright`). *Aceite: hit de cache nas runs seguintes.*

**63.** `deploy-vps`: TTM check do post-deploy-health com 2 tentativas antes de falhar (limite fixo de 3.0s numa medição única é flaky por natureza). *Aceite: retry implementado.*

**64.** `flaky-test-detector`: persistir resultado comparável (JSON por run em branch `automation/flaky-history` ou artifact + issue automática quando um teste falha ≥2 noites) — hoje é warning que ninguém lê. *Aceite: primeira issue automática aberta/atualizada.*

**65.** Adicionar `--retry-all-errors --max-time` e verificação de HTTP nos curls "best effort" restantes do deploy (HC pós-PUT). *Aceite: diff aplicado.*

## FASE 5 — Eficiência: eliminar trabalho duplicado (etapas 66–75)

**66.** Definir dono único de cada gate entre `ci.yml` × `quality-gate.yml` (hoje: unit tests 2×, build 3×, e2e boot 2× por PR). Proposta: quality-gate mantém lint/typecheck/ratchets/audits; ci.yml mantém test+build+e2e+a11y; quality-gate REMOVE `bun run test`, `test:coverage`, `playwright`, `build`, `perf:budget` (perf-budget.yml já cobre). *Aceite: cada gate roda exatamente 1× por PR.*

**67.** Medir o antes/depois da etapa 66 (tempo p95 de PR e minutos consumidos) e registrar em docs. *Aceite: números no doc.*

**68.** `ci.yml`: subir artifacts `dist/` só em push na main (hoje sobe em todo PR, 7d de retenção). *Aceite: PR sem artifact dist.*

**69.** Reduzir `fetch-depth: 0` para os jobs que não precisam de histórico completo (ci.yml lockfile precisa; codeql não usa; action-pin-check precisa). Auditar um a um. *Aceite: lista revisada aplicada.*

**70.** Padronizar retenção de artifacts: relatórios playwright 7d, resumos 14d, schema/catalog 14d — e nomear com `${{ github.run_id }}` onde há colisão. *Aceite: política única aplicada.*

**71.** Consolidar a família de migration-gates (hoje 6 lugares: migration-uniqueness, migration-lint, migration-tests, migration-smoke-test, migration-drift-guard, migration-gates dentro do ci.yml) em no máx. 3 workflows com jobs agrupados — menos 3 checkouts/setups por PR de migration. *Aceite: mesmos checks, menos workflows.*

**72.** Revisar o job `Report bundle size` do ci.yml (du/find manual) — remover em favor do perf-budget (que mede gz e orçamento). *Aceite: step removido.*

**73.** `codeql.yml`: manter semanal, confirmar que `paths-ignore` de docs não é necessário (build-mode none é barato) — sem ação se ok. *Aceite: decisão registrada.*

**74.** Avaliar `hashFiles('bun.lock')` compartilhado via reusable workflow de setup (checkout+node+bun+cache em 8 workflows copiados). Criar `.github/actions/setup-zapp` composite. *Aceite: composite adotado em ≥5 workflows.*

**75.** Rodar 1 semana e medir minutos self-hosted vs hosted pós-fases 4–5; meta: fila zero no pool em horário de pico. *Aceite: medição documentada.*

## FASE 6 — Cobertura que falta hoje (etapas 76–90)

**76.** **Rollback com um clique**: workflow `rollback-vps.yml` (dispatch com input `sha12`) que valida a tag em `ghcr-protected-tags.txt`/GHCR e faz o PUT no Portainer com a imagem antiga + convergência verificada (reusando os steps do deploy). *Aceite: rollback de teste executado em horário controlado.*

**77.** Retestar `environment: production` no deploy-vps (o bloqueio "pending sem jobs" é de 2026-08-06; pode ter sido corrigido) — se funcionar, ganhar approval gate para dispatch manual + secrets escopados. *Aceite: deploy com environment OU registro de que segue quebrado.*

**78.** Smoke pós-deploy com **login real**: step que faz `POST /auth/v1/token?grant_type=password` com o E2E user e valida 200 + JWT (hoje o health só checa TTM/status codes). *Aceite: step no post-deploy-health.*

**79.** `dependency-review-action` em PRs (bloquear CVE crítica/licença proibida ANTES do merge — o `bun audit` atual roda depois, e só critical). *Aceite: check ativo em PR.*

**80.** OSSF Scorecard workflow (repo público) com badge e upload SARIF. *Aceite: score inicial registrado.*

**81.** Assinatura de imagem: `cosign sign --yes` (keyless OIDC) pós-push no GHCR + verificação no deploy (`cosign verify`) — fecha a cadeia build→deploy. *Aceite: deploy recusa imagem não assinada (testado).*

**82.** Gate de referências `workflow_run`: script `scripts/check-workflow-run-refs.mjs` (compara `workflows:` de todos os `workflow_run` com os `name:` reais) rodando no ci-workflows-lint (etapa 32) — impede regressão do achado A4/B2 para sempre. *Aceite: teste com nome errado falha o gate.*

**83.** "Schedule health": job semanal que greppa `schedule suspenso` nos YAMLs e mantém UMA issue aberta listando os crons desligados + data — anti-esquecimento institucional. *Aceite: issue criada/atualizada automaticamente.*

**84.** Subir os floors de coverage do ci.yml (25/18/15/24) para o valor real atual medido − 1pt e automatizar o aperto (mesmo padrão ratchet-tighten). *Aceite: floors novos verdes.*

**85.** Tornar `migration-drift-guard` bloqueante para **DB_ONLY novo** (delta > baseline commitado de 688), mantendo WARN para o estoque histórico — ratchet de shadow migrations. *Aceite: PR que criaria shadow migration nova falha.*

**86.** `db-migrate`: passar a registrar em `GITHUB_STEP_SUMMARY` as migrations aplicadas + criar issue automática em falha (além do e-mail da etapa 9). *Aceite: summary visível na próxima aplicação.*

**87.** Lighthouse CI (budget de performance real: LCP/TBT nas rotas /auth e /inbox) semanal contra produção, advisory. *Aceite: primeira medição publicada.*

**88.** Dependabot: adicionar `groups` para github-actions (updates de actions num PR só por semana). *Aceite: dependabot.yml atualizado.*

**89.** Cobertura de testes dos scripts de CI (`scripts/check-*.mjs` críticos sem teste além dos 4 já cobertos) — mapear e cobrir os 5 mais críticos (audit-contract, check-data-layer, lint-migrations, check-migration-version-bank-drift, evo-ddl-gate). *Aceite: `node --test` verde no ci.*

**90.** Job de paridade de templates: consolidar `PULL_REQUEST_TEMPLATE.md` × diretório `PULL_REQUEST_TEMPLATE/` (existem os dois em `.github/`) — deixar um só. *Aceite: 1 template canônico.*

## FASE 7 — Governança e operação contínua (etapas 91–100)

**91.** `docs/CI_ARCHITECTURE.md`: mapa dos workflows (gatilho, runner, o que bloqueia, dono, link do runbook), gerado a partir de um script para não desatualizar. *Aceite: doc gerado + check de frescura no ci-workflows-lint.*

**92.** Política de nomes: padronizar `name:` sem emoji para workflows referenciados por `workflow_run` (ou congelar via etapa 82). Registrar no CLAUDE.md. *Aceite: regra escrita e gate cobrindo.*

**93.** Decisão formal sobre o auto-merge do `gen-types-zapp` (`gh pr merge --auto` viola "merge é ato humano" do HERMES.md): ou exceção documentada com required checks completos, ou remover `--auto`. *Aceite: decisão registrada + YAML alinhado.*

**94.** Runbook `docs/ops/RUNBOOK-CI.md`: o que fazer quando cada gate crítico fica vermelho (db-migrate, DB Guard, deploy, edge-deploy, ratchet) — 1 página por classe com comandos prontos. *Aceite: runbook mergeado.*

**95.** Matriz de crons: consolidar horários (hoje: 03:00, 04:00 dom, 06:00, 06:15, 08:00, 08:17, 09:10, 09:00 seg CodeQL, 06:00 seg gitleaks) e re-espalhar para não coincidir com backup/pico da VPS. *Aceite: tabela em docs + YAMLs ajustados.*

**96.** Limpeza de comentários históricos nos YAMLs consolidada (pós-fase 3) — mover narrativa de incidentes para `docs/CHANGELOG_SESSIONS.md` e deixar nos YAMLs só o essencial. *Aceite: redução mensurável de linhas de comentário sem perda de contexto (revisão humana).*

**97.** Revisar `ai-agent-pr-policy` (hoje: detecta push direto de AI só DEPOIS do fato, em push) — com enforce_admins + required checks (fase 1) ele vira redundante; decidir manter como tripwire ou remover. *Aceite: decisão registrada.*

**98.** SLO de CI: definir e medir (workflow-telemetry ou script sobre a API) — p95 de PR até verde < 20min; fila do pool < 5min. Publicar semanalmente no STEP_SUMMARY de um workflow de métricas. *Aceite: primeira medição semanal publicada.*

**99.** Simulação de desastre: exercício documentado — runner pool inteiro offline → o que ainda funciona? (deploy usa ubuntu-latest no build, mas deploy/convergência precisam do pool). Documentar plano B (bootstrap runner novo ≤ 15min, usando infra/runner/). *Aceite: exercício executado e cronometrado.*

**100.** **Validação final**: branch-protection-sentinel verde diário por 7 dias, zero workflows vermelhos na main por 7 dias, fila do pool ok, e este documento revisado com o status real (✅/⏭️/❌ por etapa). *Aceite: checklist assinado no doc.*

---

## Dependências principais entre etapas

- 3 → 4 (token antes do estado do PR de ratchet)
- 6 → 7 (types antes do catálogo)
- 11 → 12 → 13/16/17 (lista antes da proteção; proteção antes do sentinel)
- 26 → 27 (zerar legado antes de endurecer o pin-check)
- 32 → 82/83 (o workflow de lint hospeda os novos gates)
- 66 → 67/75 (dedupe antes de medir)

## Fora de escopo deste plano

- Reescrever scripts de aplicação (`scripts/*.mjs`) além do necessário para os gates.
- Migração de plataforma de CI.
- As correções do frontend dos "Bugs Abertos A–D" do CLAUDE.md (planos próprios).
