# PLANO — Correções e melhorias dos workflows em FAILURE (200 etapas) — 2026-10-16

> **Escopo:** análise exaustiva de todos os runs com `conclusion=failure` do repositório
> (https://github.com/adm01-debug/Zapp_Web_V2/actions?query=is%3Afailure), causas-raiz, gaps
> estruturais e plano de correção. **Este documento é só o plano — nada daqui foi executado.**
>
> **Relação com planos anteriores:** complementa (não substitui) o
> `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`. Vários itens daquele plano foram superados pela
> decisão "CI mínimo" de 16/10/2026 (ver Diagnóstico D7); este plano parte do estado real pós-decisão.
>
> **Convenção:** etapas `F001`–`F200`. Uma etapa = um PR (ou uma ação operacional atômica).
> Branch `claude/<tipo>-f<NNN>-<slug>-<AAMMDD-HHMM>`; título do PR termina em `(F<NNN>)`.
> Etapas marcadas **[JOAQUIM]** envolvem decisão de negócio, custo, segredo ou perímetro — não
> executar por agente sem aprovação explícita.

---

## Parte 1 — Diagnóstico (medido em 16/10/2026, ~17:30 UTC)

### Números (runs desde 2026-10-02, API do GitHub)

| Workflow | Runs | Falhas | Taxa | Situação em 16/10 |
|---|---:|---:|---:|---|
| DB Live Guard | 222 | 193 | **87%** | vermelho crônico (drift + timeout de pooler); desde 16/10 só roda semanal |
| Branch Hygiene Audit | 71 | 69 | **97%** | arquivo inválido em branches disparava por push; versão nova (16/10) nunca rodou |
| DB Migrate (production) | 6 | 5 | 83% | fail-closed: ledger ≠ arquivo (`20261004195051`) |
| types-sync | 178 | 68 | 38% | `error running container: exit 1` (supabase CLI) + lockfile hoje |
| E2E logado | 444 | 137 | 31% | suíte logada quebrada desde 12/10 (issue #1915, 17 testes) + lockfile hoje |
| CI/CD Pipeline | 1636 | 251 | 15% | **vermelho na main agora** (lockfile) |
| Talk X placar regen | 443 | 66 | 15% | falhas concentradas em 02-03/10 ("Abrir ou atualizar PR do placar"); verde hoje |
| DB Guard (offline) | 1633 | 148 | 9% | shard talkx: teste "Divergência de replay E27" (fix 0a1b039 mergeado hoje) |
| Deploy Edge Functions | 516 | 22 | 4% | **vermelho na main agora** (manifesto stale) — issue #1977 |
| Settings Guard (deletado 16/10) | — | 49 | — | falhava por divergência `default_workflow_permissions`; workflow apagado |
| OpenSSF Scorecard (deletado 16/10) | — | 6 | — | workflow apagado no "CI mínimo" |
| CodeQL | 997 | 0 | 0% | verde; desde 16/10 só semanal |

Falhas por dia: pico de 450 em 02/10 e 176 em 03/10 (onda do placar regen + bootstrap do postgres),
estabilização 06–13/10 (4–18/dia), nova onda 14–16/10 (25/170/53) — a reestruturação "CI mínimo"
(PRs #1947–#1953, #1949, 5721e4f) e o lote de 880 cartões (#1976).

### Causas-raiz ativas AGORA (main vermelha)

- **D1 — `bun.lock` inconsistente na `main`.** O merge do lote (#1976, `9c0a82c`) alterou só o
  `bun.lock` (resolução de conflito ruim), sem o `package.json` correspondente; `bun install
  --frozen-lockfile` falha com "lockfile had changes, but lockfile is frozen" — **reproduzido
  localmente neste checkout**. Derruba: CI (todos os jobs), types-sync, E2E logado, E2E Talk X e
  **toda PR nova** (herda a main). Issues #1974 (CI) e a cadeia de PRs vermelhas de hoje.
- **D2 — `supabase/deployment-manifest.json` stale.** O lote mudou `supabase/functions/**` sem
  regenerar o manifesto; `deploy-functions.yml` aborta em "Validar gerador e manifesto de
  deployment" → **as edges do lote estão fora do ar** (issue #1977). Erro literal do run
  38937702634: `Deployment manifest is stale ... Run: node scripts/edge-deploy/generate-manifest.mjs`.
- **D3 — O PR do lote foi mergeado com CI e E2E Talk X vermelhos** (runs 38937321245/38937321234,
  17:08; merge 17:10). Possível porque **a `main` não tem mais branch protection** (D7) e nenhum
  processo substituiu o gate.
- **D4 — Suíte E2E logada quebrada desde 12/10** (issue #1915, 11 comentários): 17 testes falhando
  (`expect(locator).toHaveCount(...)`) no run 38889636384, antes mesmo do lockfile. Sem dono; o
  workflow roda a cada push na main e falha ~31% há 4 dias.
- **D5 — db-live-guard 87% vermelho**, três classes misturadas no mesmo sinal: (a) drift real
  (migrations mergeadas e ainda não aplicadas — no modelo de lote isso é **estado esperado** entre
  merge e apply); (b) catálogo/manifesto/types desatualizados até o PR do types-sync mergear
  (#1968 está aberto e agora bloqueado pelo D1); (c) **timeout de pooler/auth** ("timeout expired",
  "EAUTHQUERY auth_query secret check timed out" — issue #1965) que o retry de transporte 2× não
  cobre. Alerta "contrato quebrado" perdeu o valor de sinal: está sempre vermelho.
- **D6 — db-guard shard talkx**: teste "Divergência de replay E27 (CAIXA-7eb1)" falhou em série
  (16/10, ~12 runs: `claude/zen-gauss` 9×, `fix/dba-audit...` 2×) após migration ir para
  `_superseded/`; fix `0a1b039` (fallback) mergeado hoje 12:33 — **sem prova de verde pós-fix**
  porque o push seguinte (17:10) já caiu no D1.

### Gaps estruturais (independem do incêndio do dia)

- **D7 — Perímetro desprotegido e não documentado.** Em 16/10 (decisão do Joaquim, "CI mínimo"):
  branch protection da `main` **removida por completo** (API: 404 "Branch not protected"),
  `settings-guard.yml`, `scorecard.yml` e `auto-update-pr-branch.yml` **deletados** (5721e4f),
  CodeQL e db-live-guard viraram semanais. Consequências não tratadas: nada impede merge com CI
  vermelho (D3 aconteceu no mesmo dia), nada impede force-push/deleção da `main`, nenhum guard
  observa o perímetro, e CLAUDE.md + `docs/ci/README.md` + `scripts/ci/github-settings-baseline.json`
  seguem descrevendo o mundo antigo (6 required checks, `strict=true`, 16 workflows, settings-guard).
- **D8 — `notifica-falha-main.yml` monitora nomes errados.** A lista `workflow_run.workflows` tem
  `DB Migrate` e `Types Sync`, mas os nomes reais são `DB Migrate (production)` e `types-sync`
  (match é por nome exato) — falha dos dois **nunca** notifica (comprovado: types-sync falhou às
  17:10 e não há issue). `E2E logado` e `DB Guard (offline)` (push na main) nem estão na lista.
- **D9 — Alertas órfãos e ruído**: issue #1943 (settings-guard) aberta apontando para workflow que
  não existe mais; #1946/#1915 duplicam o tema e2e-logado; `[falha-main]` comenta 1× por falha
  (vai estourar a política de >20 comentários); #1889 (kpi-actions) parado desde 05/10 porque o
  branch-hygiene ficou 97% vermelho.
- **D10 — db-migrate bloqueado por divergência ledger↔arquivo** (`20261004195051
  gmail_oauth_state_attempts`: "o statement 1 do ledger difere do arquivo") — fail-closed correto,
  mas ninguém reconciliou; o workflow do caminho oficial de DDL está 5/6 vermelho.
- **D11 — types-sync com falha intermitente de container** ("error running container: exit 1" na
  geração de candidatos via supabase CLI, 3 tentativas no mesmo run) — 68 falhas/14 dias.
- **D12 — Custo/volume de Actions**: 1.636 runs de CI + 1.633 de db-guard + 997 de CodeQL em 14
  dias; E2E logado roda em **todo** push na main sem filtro de path; db-guard roda em PRs de
  docs-only (deliberado quando era required check — com a protection removida, o motivo caiu).
- **D13 — Workflows disparando de branches com arquivo inválido**: 69 runs "failure" do
  branch-hygiene (e vários de db-guard/deploy-functions nomeados pelo path) vieram de pushes em
  branches cujo YAML estava quebrado/antigo — ruído que polui a aba Actions e as métricas.

---

## Parte 2 — As 200 etapas

### FASE 0 — Emergência: tirar a `main` do vermelho (F001–F012)

- [ ] **F001 — Regenerar `bun.lock` coerente com `package.json`.** `bun install --ignore-scripts`
  em checkout limpo da main, commit só do `bun.lock`, PR, provar `bun install --frozen-lockfile
  --ignore-scripts` verde no CI do PR. Causa D1; desbloqueia CI, types-sync, E2E e todas as PRs.
- [ ] **F002 — Regenerar `supabase/deployment-manifest.json`** (`node
  scripts/edge-deploy/generate-manifest.mjs`), no mesmo PR de F001 ou em PR irmão. Causa D2.
- [ ] **F003 — Verificar na aba Actions o run de CI do push do merge F001/F002 verde** (typecheck,
  3 shards de unit, node-scripts, build) e registrar o run_id na issue #1974.
- [ ] **F004 — [JOAQUIM] Disparar `deploy-functions.yml` pós-F002** (push na main já dispara se o
  merge tocar `supabase/functions/**`; senão `workflow_dispatch`) e aprovar o environment
  `producao-edge-functions`; confirmar digest local=remoto no Job Summary. Fecha #1977.
- [ ] **F005 — Fechar #1974 e #1977 com link dos runs verdes** (comentário-resumo, não só close).
- [ ] **F006 — Rebase/atualizar o PR #1968 (types-sync)** sobre a main corrigida e mergear, para
  catálogo/manifesto/types voltarem a bater com o banco (pré-condição do F076+).
- [ ] **F007 — Re-rodar `db-guard` na main via dispatch** e provar que o fix E27 (`0a1b039`)
  fechou o shard talkx (D6); anotar o run verde no PR/issue correspondente.
- [ ] **F008 — Smoke das PRs abertas**: re-sincronizar #1978, #1975, #1930, #1922 com a main
  corrigida (update branch) e confirmar que os checks saem do vermelho herdado do D1.
- [ ] **F009 — Guard offline anti-lockfile-quebrado**: passo no job `node-scripts` do CI que roda
  `bun install --frozen-lockfile --dry-run` **antes** de tudo e imprime diff legível quando o lock
  divergir (mensagem acionável em PT-BR apontando F001 como receita).
- [ ] **F010 — Teste unitário do cenário D2**: `scripts/ci/*.unit.mjs` cobrindo "mudou
  `supabase/functions/**` sem mudar `deployment-manifest.json` → erro claro no PR" (hoje só o
  deploy na main pega — tarde demais).
- [ ] **F011 — Runbook de merge de lote** em `docs/ci/`: checklist obrigatório da sessão
  integradora (CI verde no HEAD do PR, lockfile, manifesto de deploy, placar Talk X) — o lote
  #1976 mergeou vermelho com 2 artefatos derivados stale.
- [ ] **F012 — Post-mortem curto do incidente de 16/10** em `docs/audits/` (linha do tempo
  D1→D3, quem pegou o quê, o que o F009/F010 passam a impedir), linkado nas issues fechadas.

### FASE 1 — Limpeza de alertas e verdade documental (F013–F028)

- [ ] **F013 — Fechar #1943 (settings-guard)** com resumo: o workflow foi deletado em 16/10; a
  pendência real (divergência `default_workflow_permissions`) migra para a etapa F032.
- [ ] **F014 — Unificar #1946 dentro de #1915** (e2e-logado): fechar a duplicata com link; deixar
  uma issue única com o estado real da suíte logada.
- [ ] **F015 — Atualizar CLAUDE.md: seção "Perímetro do GitHub"** para o estado real pós-16/10
  (sem branch protection, sem settings-guard/scorecard/auto-update, CodeQL e db-live-guard
  semanais, CI mínimo) com a data e o motivo (decisão do Joaquim), substituindo a tabela canônica de 03/10.
- [ ] **F016 — Atualizar CLAUDE.md: inventário de workflows** (14 arquivos + 3 dinâmicos; a lista
  de 16 com settings-guard/supabase-sync morreu) e remover instruções que citam o
  `settings-guard` como verificador.
- [ ] **F017 — Regenerar `docs/ci/README.md`** (`scripts/ci/render-workflow-docs.mjs`) e conferir
  que o check de baseline (`ci-docs-baseline.unit.mjs`) bate com os 14 workflows atuais.
- [ ] **F018 — Revisar `scripts/ci/github-settings-baseline.json`**: ou apagar junto com os testes
  que só serviam ao settings-guard, ou convertê-lo no insumo do F032 — nunca deixá-lo mentindo.
- [ ] **F019 — Varredura de referências mortas** nos scripts/testes de CI
  (`settings-guard`, `scorecard`, `auto-update-pr-branch`, `supabase-sync`, `cleanup-artifacts`):
  `grep` em `scripts/ci/` + `docs/` e poda do que só existia para os workflows apagados.
- [ ] **F020 — Issue #1810 (branch-hygiene)**: atualizar o corpo com o estado real (workflow
  reescrito em 16/10, 69 falhas históricas explicadas por D13) e o que esperar na segunda-feira.
- [ ] **F021 — Issue #1889 (kpi-actions)**: comentar que o KPI ficou cego de 05→16/10 (fonte
  quebrada) e que a série recomeça após F037.
- [ ] **F022 — Padronizar os cabeçalhos `# docs:` dos 14 workflows** (todos têm, mas 3 estão
  desatualizados pós-CI-mínimo: db-live-guard ainda fala em "push na main", e2e-logado não cita o
  dedupe de issue, notifica-falha não lista os nomes reais) — fonte do F017.
- [ ] **F023 — Registrar a decisão "CI mínimo" como ADR** em `docs/audits/` (o que saiu do PR, o
  que roda onde agora, e quais riscos foram aceitos) — hoje ela existe só em comentários de YAML.
- [ ] **F024 — Tabela "quem avisa o quê"**: documento curto mapeando cada workflow → canal de
  falha (issue com label, Job Summary, nada) — insumo das fases 8; hoje E2E Talk X e db-guard
  falham mudos fora do PR.
- [ ] **F025 — Mapa de labels de alerta** (`falha-main`, `db-live-guard`, `settings-guard`,
  `kpi-actions`, `branch-hygiene`): criar as que faltam, descrever cor/uso, apagar as órfãs.
- [ ] **F026 — Apagar branches remotas já mergeadas/abandonadas** apontadas pelo relatório do
  branch-hygiene quando ele voltar (F177) — as 69 falhas de D13 vieram de branches velhas com
  YAML inválido recebendo push.
- [ ] **F027 — Documentar no CLAUDE.md o fluxo de lote vigente** (branch `lote/...` / `dia/...`,
  quem mergeia, gates manuais do F011) — a seção 0 atual descreve `dia/AAAA-MM-DD`, o lote de
  hoje usou `lote/2026-10-16-880-cards`; alinhar nomenclatura com o que é real.
- [ ] **F028 — Auditar `.github/` por arquivos de suporte órfãos** (templates, CODEOWNERS,
  dependabot.yml groups citando workflows mortos) e podar/atualizar.

### FASE 2 — Guard-rails de merge pós-"CI mínimo" (F029–F052)

- [ ] **F029 — [JOAQUIM] Decidir o perímetro mínimo da `main`.** Recomendação: religar branch
  protection só com `required_status_checks` = jobs do CI mínimo (TypeCheck, Unit 1-3, Build,
  Node CI Scripts) + bloqueio de force-push/deleção, **sem** strict, **sem** review obrigatório —
  impede o D3 sem recriar a fila que motivou o CI mínimo. Custo zero; risco: nenhum para o fluxo
  de lote (o lote só mergeia verde).
- [ ] **F030 — Aplicar a decisão F029 via API** (PUT completo, lendo o estado antes — lição das 3
  regressões de `strict` documentadas no CLAUDE.md) e registrar o JSON aplicado em `docs/audits/`.
- [ ] **F031 — Proteger contra force-push/deleção mesmo se F029 ficar "sem required checks"**:
  ruleset de `deletion` + `non_fast_forward` (rulesets funcionam na conta — testado em 25/09).
- [ ] **F032 — Guard leve de perímetro (substituto do settings-guard)**: job semanal (dentro do
  branch-hygiene-audit, para não criar workflow novo) que compara 6 campos estáveis
  (`allow_auto_merge`, `delete_branch_on_merge`, squash-only, protection on/off, allowed_actions,
  default_workflow_permissions) com um baseline enxuto e **comenta** na issue de KPI — sem
  restaurar nada automaticamente (o restore automático foi o que mascarou as regressões de strict).
- [ ] **F033 — [JOAQUIM] Decidir destino do Scorecard**: ou aceitar a remoção (registrar no ADR
  F023) ou religar como semanal-only. Não recriar por padrão.
- [ ] **F034 — Autovalidação de YAML dos workflows no CI** (`actionlint` pinado por SHA ou parser
  simples em `node --test`): impede o D13 (arquivo inválido chega à main e vira run "failure"
  sem job).
- [ ] **F035 — Teste de contrato dos nomes de workflow**: unit test que lê `name:` de cada YAML e
  compara com a lista usada em `notifica-falha-main.yml` (pega o D8 em PR, para sempre).
- [ ] **F036 — Checklist de merge sem protection**: enquanto F029 não estiver aplicado, o runbook
  F011 vira gate manual obrigatório; adicionar lembrete automático (comentário de bot) em PR com
  check vermelho há >30min usando o próprio `notifica-falha-main` estendido — só aviso, sem bloquear.
- [ ] **F037 — Consertar a cadeia do KPI**: garantir que `actions-kpi.mjs` roda no
  branch-hygiene novo (F177) e volta a alimentar #1889 semanalmente (série quebrada desde 05/10).
- [ ] **F038 — `concurrency` em `talkx-status-regen.yml`**: hoje roda em todo push na main sem
  grupo de concorrência (443 runs/14d); cancelar run anterior em pushes consecutivos.
- [ ] **F039 — `concurrency` em `e2e-logado.yml` com `cancel-in-progress: true`** para pushes
  consecutivos na main (hoje enfileira 15min×3 jobs por push).
- [ ] **F040 — Revisar `cancel-in-progress` do CI na main**: push na main não cancela o anterior
  (só PR cancela); em sequência de merges de lote isso é desperdício controlado — documentar ou
  ligar cancelamento, decidir no PR.
- [ ] **F041 — Filtro de paths no `e2e-logado.yml`** (src/, e2e/, playwright.config, bun.lock,
  workflows) — docs-only push na main não precisa de Playwright logado.
- [ ] **F042 — Filtro de paths no `db-guard` para push na main** (supabase/, scripts/db-audit/,
  src/ que toca banco): o motivo do "sem filtro" era o required check por PR; na main pós-merge o
  nome do check não importa. Manter PR sem filtro **se** F029 tornar o db-guard required de novo;
  senão, filtrar também o PR — decidir no PR com o dado de 1.633 runs/14d.
- [ ] **F043 — Garantir 1 fonte para versão do Bun**: `bun-version: '1.4.0'` está literal em N
  workflows; extrair para `.bun-version` (setup-bun lê arquivo) — evita drift entre workflows
  (local já está em 1.4.2).
- [ ] **F044 — Mesmo para `SUPABASE_CLI_VERSION: 2.116.0`** (aparece em types-sync,
  deploy-functions, db-migrate, db-live-guard): um único lugar (vars do repo ou arquivo versionado
  lido por step) + teste de paridade.
- [ ] **F045 — Cache do Bun: chave por `bun.lock` + fallback `bun-`** está ok, mas o restore de
  207MB leva ~5s e o install 1s — medir se o cache ainda compensa pós-CI-mínimo e remover se não
  (menos um ponto de falha).
- [ ] **F046 — Auditar `permissions:` de todos os 14 workflows** (topo `contents: read` ou `{}`,
  write só no job que precisa — padrão E79 já usado no branch-hygiene; conferir os 13 restantes).
- [ ] **F047 — Auditar pins por SHA** (`check-workflow-pins.mjs` ainda existe? rodar e corrigir
  qualquer action não pinada que entrou na reescrita de 16/10).
- [ ] **F048 — Revalidar `sha_pinning_required` no repo** (a tabela antiga dizia `true`; medir ao
  vivo pós-mudanças e registrar no F015).
- [ ] **F049 — Dependabot para `github_actions` continua?** Conferir `.github/dependabot.yml`
  pós-deleções (grupos que citam workflows mortos geram PRs vazias — ex.: scorecard-action bump
  #1959 mergeado 1 dia antes de deletarem o scorecard).
- [ ] **F050 — Teste de invariantes de triggers**: unit test afirmando que nenhum workflow tem
  `pull_request` + segredo de produção no mesmo job (princípio do db-live-guard), que `push:
  branches` só contém `main`, e que todo `schedule` está fora do minuto 0.
- [ ] **F051 — Padronizar `timeout-minutes` em todos os jobs** (deploy-functions tem 100 — ok,
  justificado; mas conferir jobs sem timeout nos workflows reescritos em 16/10).
- [ ] **F052 — Fixar `runs-on: ubuntu-24.04`** (já padrão) e documentar a política de upgrade de
  imagem no README de CI (upgrade de runner já quebrou pipelines em outros repos; decisão única).

### FASE 3 — E2E logado: recuperar a suíte (F053–F074)

- [ ] **F053 — Reproduzir localmente os 17 testes vermelhos** do run 38889636384 (projetos
  chromium-e2e-core etc.) contra o alvo que o workflow usa, e classificar: regressão de UI real ×
  seletor morto × fixture de banco ausente.
- [ ] **F054 — Bissecar o commit que quebrou a suíte** (verde→vermelho em ~12/10; a issue #1915
  abriu 12/10): identificar o PR causador e registrar na issue.
- [ ] **F055 — Corrigir a causa-raiz do grupo 1 de specs** (`toHaveCount` — provavelmente lista/
  contagem de conversas): fix de código ou de spec, PR dedicado com o run verde anexado.
- [ ] **F056 — Corrigir os grupos restantes de specs** (1 PR por causa-raiz distinta, não um
  PR-ônibus); fechar #1915 só com a suíte 100% verde em 2 runs consecutivos na main.
- [ ] **F057 — Issue #1946 (login E2E falhou)**: verificar se o login real (storage state) voltou
  a funcionar pós-F001; se o secret/conta de teste expirou, **[JOAQUIM]** rotacionar a credencial.
- [ ] **F058 — Specs que fixam o projeto oficial** (`e2e/catalog.spec.ts`,
  `e2e/fixtures/talkx-demo.ts`, `e2e/fixtures/mapa-mocks.ts` — pendência conhecida da seção 0 do
  CLAUDE.md): adaptar para `E2E_SUPABASE_URL_OVERRIDE`, fechando o gap banco-local.
- [ ] **F059 — Guard dos fixtures E2E de produção**: step read-only no e2e-logado que confere a
  existência do contato `04dff4dc...` e da conexão `e2e0e2e0...` **antes** da suíte e falha com
  mensagem "fixture sumiu do banco" — hoje a suíte quebra com erro opaco se alguém apagar.
- [ ] **F060 — Separar "suíte falhou" de "infra falhou"** no e2e-logado: quando `test-results/`
  não existe (caso do comentário atual da #1915), o comentário da issue já diferencia; estender
  para o Job Summary e para um `outcome` distinto (infra-failure não deve contar como regressão).
- [ ] **F061 — Dedupe por causa na issue #1915 funciona** (marcador `<!-- e2e-logado-specs:... -->`);
  adicionar fechamento automático: run verde na main fecha a issue com link (hoje fecha ninguém).
- [ ] **F062 — Artefatos Playwright**: conferir `retention-days` e upload só em falha (trace,
  screenshot, video) — 444 runs/14d × artefatos pesados é custo de storage.
- [ ] **F063 — Repensar a matriz de 3 jobs** (authenticated / deslogado-principal /
  deslogado-secundario): medir duração real pós-F041 e fundir se os deslogados couberem num job.
- [ ] **F064 — `fail-fast` e retries do Playwright**: conferir `retries` no config para CI (1
  retry em CI é padrão razoável; zero vira flake-ruído, >1 esconde regressão) e documentar.
- [ ] **F065 — Padronizar os projetos Playwright citados nos workflows** com
  `ci-e2e-projects.unit.mjs` (o teste existe; garantir que cobre a lista nova pós-16/10).
- [ ] **F066 — Login real: timeout e retry do passo de auth** (passo 12 "login real"): erro de
  auth do Supabase não deve virar "17 failed" — curto-circuito com mensagem própria.
- [ ] **F067 — Rodar a suíte logada também por dispatch com filtro de spec** (input `grep`):
  debugging hoje exige rodar os 15min inteiros.
- [ ] **F068 — E2E Talk X: validar que os 4 failures/14d são só herança de lockfile/fixture** e
  nenhum spec Talk X está de fato quebrado; registrar na issue do placar se houver pendência real.
- [ ] **F069 — `e2e-talkx.yml` paths**: conferir que `bun.lock`/`package.json` estão nos paths
  (mudança de dependência pode quebrar o Talk X sem disparar o workflow — hoje não dispara).
- [ ] **F070 — Unificar fixtures E2E** (`e2e/fixtures/e2e-contact.ts`, `talkx-demo`, segmento E2E)
  num README único em `e2e/` com os UUIDs canônicos e a regra "não apagar do banco".
- [ ] **F071 — Medir flakiness**: script que varre os últimos 50 runs do e2e-logado e lista specs
  que alternaram verde/vermelho no mesmo SHA — candidatos a quarentena explícita (anotada, nunca
  silenciosa).
- [ ] **F072 — Política de quarentena**: doc curto — spec flaky entra em `test.fixme` com issue
  aberta e prazo; nunca `test.skip` sem issue (regra já implícita; torná-la verificável por grep
  no CI).
- [ ] **F073 — Smoke pós-deploy**: hoje o e2e-logado roda por push (código), não pós-deploy
  (Vercel). Avaliar gatilho `deployment_status` da Vercel para rodar a suíte contra o deploy real
  — fecha o gap "merge verde, produção quebrada".
- [ ] **F074 — Baseline visual Talk X** (`talkx-visual.spec.ts`): conferir atualização de
  screenshots pós-lote de 880 cartões (mudanças de UI do lote podem ter invalidado baselines).

### FASE 4 — db-live-guard e o modelo de lote (F075–F100)

- [ ] **F075 — Separar transporte de drift no veredito.** Timeout de pooler/EAUTHQUERY (issue
  #1965) não pode abrir "contrato quebrado": classificar os 11 passos em
  `infra-indisponivel` × `drift-real` no `consolidar-veredito.mjs` e usar títulos de issue
  distintos. (A assinatura já aparece no log; é parsing, não heurística.)
- [ ] **F076 — Elevar retry de transporte do job para 3 tentativas com backoff** (hoje
  `PSQL_CONNECT_RETRIES=2`; o run 38883466075 esgotou) **mantendo a regra de 1 camada só** (regex
  em sincronia — lição dos PRs #704/#707 documentada no CLAUDE.md).
- [ ] **F077 — Janela de drift esperada do lote**: no modelo "merge hoje, apply no fim do lote",
  migration mergeada e não aplicada é estado legítimo. O guard deve distinguir "arquivo no repo à
  frente do ledger" (**pendente de apply** — aviso amarelo) de "ledger à frente do repo" (**DDL
  fora do Git** — vermelho). Hoje ambos são falha.
- [ ] **F078 — Gatilho pós-apply**: `db-migrate.yml` com `apply=true` verde dispara o
  db-live-guard via `workflow_dispatch` (ou `workflow_run`) — o guard roda exatamente quando o
  estado deveria convergir, em vez de só segunda-feira.
- [ ] **F079 — [JOAQUIM] Validar a cadência semanal** do guard vivo: com lote diário, 7 dias de
  cegueira entre applies é muito; recomendação: diário fora de horário (ex.: `13 6 * * *` como
  era) **depois** de F075/F077 matarem os falsos positivos — senão volta o ruído de 87%.
- [ ] **F080 — Issue #1965: fechar/reabrir limpa** após F075 (está contaminada com causas
  misturadas; política de >20 comentários se aplica).
- [ ] **F081 — Reconciliar o drift real apontado hoje** (passos: migrations×ledger, catálogo,
  manifesto, types, paridade tripla) com o procedimento canônico do CLAUDE.md (regras de
  migration 1–9) — 1 PR de reconciliação com evidência `pg_get_functiondef`/ledger.
- [ ] **F082 — `types.ts` frescor**: o passo falha se types estiver velho, mas quem conserta é o
  types-sync — linkar na mensagem de erro o dispatch direto do types-sync (ação, não só sintoma).
- [ ] **F083 — Evidência consultável**: o artifact `db-live-evidence-*` existe; adicionar no Job
  Summary a tabela dos 11 vereditos (hoje só a issue tem; o Summary está vazio nesse ponto).
- [ ] **F084 — Testar `LEDGER_RETRY_DELAYS_MS=""`** continua respeitado (o parsing `Number("")`
  é armadilha documentada; virar unit test se ainda não for).
- [ ] **F085 — Medir duração do guard** (25min de timeout para quê hoje?) e cortar passos
  redundantes com o db-guard offline (paridade de arquivos não precisa do banco).
- [ ] **F086 — Segredo `DESTINO_URL`**: confirmar escopo (repo secret? environment?) e registrar
  no F015; o guard roda sem environment gate — avaliar movê-lo para environment `db-ledger-evidence`
  (read-only) para auditabilidade.
- [ ] **F087 — Pooler: avaliar conexão direta (porta 5432 do pooler em session mode vs transaction
  mode)** para os SELECTs do guard — os timeouts EAUTHQUERY são típicos de auth_query no pooler
  sob carga; conexão direta ao primary (se IP permitido) elimina a classe. **[JOAQUIM]** se exigir
  mudança de rede/allowlist no Supabase.
- [ ] **F088 — Alarme de "guard mudo"**: se o db-live-guard não rodar por >8 dias (schedule
  falhou/desligado), o branch-hygiene semanal avisa — guard que não roda é pior que guard vermelho.
- [ ] **F089 — Reavaliar os 11 `continue-on-error`**: cada passo precisa de `id` + entrada na
  tabela de veredito (o comentário no YAML já conta um caso em que a falha não entrava na tabela);
  unit test que conta passos `continue-on-error` == entradas do consolidador.
- [ ] **F090 — db-migrate: reconciliar `20261004195051`** (gmail_oauth_state_attempts): comparar
  statement do ledger × arquivo, corrigir o lado errado pelo procedimento das regras 2/7, e
  provar `Validar registro no ledger` verde num dry-run.
- [ ] **F091 — db-migrate: dry-run semanal automático** (schedule) com a última migration
  mergeada: pega divergência ledger↔arquivo dias antes de alguém precisar do apply (hoje 5/6
  dispatches morrem nisso).
- [ ] **F092 — db-migrate: mensagem de erro com receita** ("statement N difere: ledger tem X,
  arquivo tem Y, rode register-migration.mjs --diff") — hoje só diz que difere.
- [ ] **F093 — db-migrate: suportar bundle do lote** (aplicar N migrations do dia em ordem num
  único dispatch com um hash do conjunto) — o modelo de lote aplica várias por dia e o workflow é
  1-por-dispatch; **[JOAQUIM]** aprova o desenho antes (mexe no caminho de produção).
- [ ] **F094 — Prova pós-apply**: depois do apply verde, comentar automaticamente na PR do lote o
  version range aplicado + SHA do run (rastreabilidade merge→apply que hoje é manual).
- [ ] **F095 — `reserve_migration_version`**: conferir que a função existe em produção e está
  documentada no fluxo do lote (CLAUDE.md cita; validar ao vivo via SELECT read-only).
- [ ] **F096 — Paridade arquivos↔ledger como teste de PR** (offline, contra o snapshot do
  catálogo): o db-guard já roda partes; garantir que detecta arquivo novo sem `.sql` válido e
  versão fora do padrão 14 dígitos.
- [ ] **F097 — `_superseded/`/`_foreign/`**: o fix E27 (0a1b039) criou fallback de replay; cobrir
  com teste o contrato "mover para _superseded não quebra replay" (o D6 custou ~12 runs).
- [ ] **F098 — Replay local (`replay-local.sh`)**: validar as 2 travas anti-produção (hosts +
  `cron.launch_active_jobs=off`) com teste que falha se alguém remover as linhas — é a barreira
  que impede banco local de POSTar nas edges reais.
- [ ] **F099 — `replay-known-failures.json` (21 falhas esperadas)**: revisar se o número ainda é
  21 pós-lote de 880 cartões; divergência silenciosa aqui vira vermelho misterioso no replay.
- [ ] **F100 — Painel de drift**: script read-only que imprime em 1 tabela o estado
  main×ledger×catálogo×types (verde/pendente-apply/drift) — vira o primeiro comando de qualquer
  sessão que mexa com banco.

### FASE 5 — db-guard offline (F101–F118)

- [ ] **F101 — Confirmar verde do shard talkx pós-0a1b039** (dispatch na main) e fechar o ciclo
  E27 com link na PR do fix (sem isso o D6 fica "provavelmente resolvido").
- [ ] **F102 — Tempo por shard**: medir core × talkx × multiplix e rebalancear os testes entre os
  3 shards (o relatório de falha mostra desequilíbrio; shard talkx é o gargalo e o mais frágil).
- [ ] **F103 — Logs de DROP ROLE no teardown**: o log do run 38900038080 termina com dezenas de
  `cannot drop role pg_*` — teardown barulhento que polui o diagnóstico; silenciar os DROPs de
  roles de sistema no script de replay (filtro, não `2>/dev/null` global).
- [ ] **F104 — Nome do check**: runs antigos aparecem como `.github/workflows/db-guard.yml` (sem
  name) vindos de branches velhas — F034 (lint de YAML) + F026 (podar branches) fecham; validar.
- [ ] **F105 — Mensagem de falha por shard**: "Um ou mais shards falharam (talkx=failure)" não diz
  o teste; agregar no Job Summary o nome do teste vermelho de cada shard (já está no log — subir
  para o Summary).
- [ ] **F106 — docker-shim: inventário dos `SKIP_DOCKER_SHIM`** (hoje 83 ocorrências no arquivo;
  CLAUDE.md lista 11 passos): regenerar a lista real e atualizar o CLAUDE.md — divergência aqui
  já causou passo novo quebrado.
- [ ] **F107 — Teste do shim offline** (`docker-shim.test.sh` existe — W56): garantir que roda no
  próprio db-guard e cobre o caso "passo novo esqueceu SKIP_DOCKER_SHIM e usa docker logs".
- [ ] **F108 — Cache de imagem postgres:17-alpine**: conferir se o services container usa pull por
  digest pinado (reprodutibilidade + rate limit do Docker Hub).
- [ ] **F109 — `merge_group` trigger**: segue inerte (fila impossível em conta User — documentado);
  manter ou remover? Decidir e registrar — custo zero, mas confunde leitura. Recomendação: manter
  com comentário apontando a explicação.
- [ ] **F110 — Rodar db-guard em push na main só com paths relevantes** (decidido em F042;
  implementar aqui).
- [ ] **F111 — Guard "Rejeitar edição de migration já existente"**: validar que o fluxo
  delete+create em commits separados (regra 3 da alocação de versão) está testado — renames do
  lote de hoje passaram por isso.
- [ ] **F112 — Tempo total do db-guard** (20min timeout): perfilar os passos mais lentos e mover
  os puramente estáticos (lint de SQL, paridade de arquivos) para o início (fail fast).
- [ ] **F113 — `fail-fast` entre shards**: hoje um shard vermelho não cancela os outros — correto
  para diagnóstico; documentar a escolha e garantir `fail-fast: false` explícito.
- [ ] **F114 — Artefato de evidência do replay** só em falha, com retenção curta (7d) — conferir.
- [ ] **F115 — Testes de RLS offline**: conferir cobertura das policies criadas pelo lote de 880
  cartões (as fases 1+2 tocaram banco; se não há teste novo, abrir issue de cobertura).
- [ ] **F116 — Padronizar bootstrap do postgres descartável** (a onda de 02/10 teve falha de
  "bootstrap espera o container" — commit `37070236152` era disso): extrair a espera de readiness
  para função única usada por todos os `*.test.sh`.
- [ ] **F117 — Limite de concorrência do db-guard em PRs** (grupo por PR já existe via
  `concurrency`): conferir que `cancel-in-progress` está ligado para PR e desligado para main.
- [ ] **F118 — Saída "novas: 0" do `supabase-usage-guard.mjs`** como check de PR visível (hoje
  roda dentro do db-guard; dar nome de passo estável e linha no Summary).

### FASE 6 — types-sync (F119–F136)

- [ ] **F119 — Causa do `error running container: exit 1`** na geração de candidatos (3× no run
  38883465867): capturar o stderr real do supabase CLI (rodar com `--debug` quando falha) e abrir
  fix dedicado — é a falha intermitente nº1 do workflow (68/178).
- [ ] **F120 — Retry com backoff na geração de candidatos** (já tenta 3×? conferir se as 3
  execuções do log eram retry deliberado ou matriz) — retry burro em cima de falha determinística
  só gasta minutos.
- [ ] **F121 — Fallback de geração**: se `supabase gen types` via container falhar, tentar via
  `npx supabase` nativo (sem docker) — elimina a classe de erro de container no runner.
- [ ] **F122 — Pós-F001: provar o types-sync verde ponta-a-ponta** (dispatch → PR automático →
  checks destravados → merge) e fechar a lacuna do #1968.
- [ ] **F123 — Auto-merge do PR de sync**: o repo tem `allow_auto_merge=true`; ligar auto-merge
  (squash) no PR criado pelo workflow quando os checks passarem — hoje o PR espera humano/sessão.
- [ ] **F124 — Dedupe de issue do types-sync (E20 pendente)**: aplicar o mesmo marcador de causa
  do db-live-guard na issue de falha do types-sync.
- [ ] **F125 — Debounce (preflight) cobre dispatch?** O job `preflight` evita PR duplicado por
  push; conferir que dispatch manual também passa pelo debounce (18 falhas por dispatch em 14d).
- [ ] **F126 — `DESTINO_URL` no types-sync**: mesmo tratamento de transporte do F075/F076 (o
  secret é o mesmo pooler; timeouts idênticos vão acontecer).
- [ ] **F127 — PR de sync órfão**: se a main avançar e o PR de sync conflitar
  (`automation/types-sync` fixa), o workflow deve recriar o branch do zero — conferir
  comportamento com conflito real (aconteceu na história do #703/#717).
- [ ] **F128 — Paridade grants-baseline**: a exclusão de path
  `!scripts/db-audit/grants-baseline.json` evita loop; teste de que o PR de sync só com grants não
  redispara (anti-loop é invariante crítica).
- [ ] **F129 — `types.ts` <100KB aborta** (guard de identidade do banco): bom; adicionar o project
  ref esperado na mensagem (confusão de banco é o risco nº1 do CLAUDE.md seção 1).
- [ ] **F130 — Rotina para `schema-catalog.json`/`schema-manifest.json` gigantes**: diff legível
  no PR de sync (resumo por objeto no corpo do PR em vez de 10k linhas de JSON silencioso).
- [ ] **F131 — Agendar types-sync pós-apply do lote** (mesmo gatilho do F078): o momento certo de
  regenerar artefatos é logo após o apply, não segunda de manhã.
- [ ] **F132 — Verificar `can_approve_pull_request_reviews` segue ligado** (lição do CLAUDE.md: o
  toggle governa criação de PR por Actions; se alguém desligar, o types-sync morre na hora) — e
  cobrir com o guard F032.
- [ ] **F133 — Destravar checks (`actions:write`)**: conferir que o passo pós-anti-loop ainda
  funciona no mundo CI-mínimo (os checks que nascem `action_required` mudaram de nome).
- [ ] **F134 — Expirar PRs de sync velhos**: PR `automation/types-sync` com >7 dias sem merge =
  fechar e recriar fresco (artefato velho é pior que nenhum).
- [ ] **F135 — Logs sem segredo**: `DESTINO_URL: ***` ok; varrer o workflow por echo de conexão em
  erro do psql (o log da #1965 imprime IPs do pooler — aceitável, mas validar que user/senha nunca
  aparecem).
- [ ] **F136 — Medir duração**: 30min de timeout; se a geração via CLI ficar estável (F119–F121),
  cortar para 15 — falha rápida barata.

### FASE 7 — deploy-functions e o caminho de produção (F137–F158)

- [ ] **F137 — Validação do manifesto em PR** (gêmeo do F010, lado workflow): job leve no db-guard
  (ou no CI) que roda `generate-manifest.mjs --check` quando o PR toca `supabase/functions/**` —
  o erro de hoje teria aparecido no PR do lote, não no deploy.
- [ ] **F138 — Hook local**: adicionar o `--check` do manifesto ao gate local do lote
  (`zapp-verify`/runbook F011) — documentado para a máquina do Joaquim.
- [ ] **F139 — Deploy pós-F004: auditar digest local×remoto de TODAS as functions** (o workflow já
  compara; exportar a tabela de skip/update no Summary e guardar como evidência do lote).
- [ ] **F140 — Mapear os 7 failures de dispatch** (--help, revoke-auth-sessions, auth-login,
  get-call-recording, crm-integration, multiplix-audience, all): são usos manuais que morreram em
  validação? Se "--help" vira run failure, falta um modo de ajuda barato — avaliar input `help`
  explícito ou documentar que não existe.
- [ ] **F141 — `rollback_to_last_success` (W66)**: testar de verdade (dry_run) — nunca foi
  exercitado em produção; rollback que não funciona só aparece na emergência.
- [ ] **F142 — Environment `producao-edge-functions` sem revisor** (medição de 03/10): decidir
  **[JOAQUIM]** se o push automático na main deve mesmo pausar em Waiting (hoje pausa?) ou se o
  gate caiu junto com a decisão de 07/10 de deploy automático — alinhar workflow × environment e
  documentar no F015.
- [ ] **F143 — Notificação de edge fora do ar**: a issue #1977 abriu (bom); adicionar à mensagem o
  nome das functions afetadas (diff do manifesto) para o triage não precisar abrir o log.
- [ ] **F144 — Deploy atômico por função com config.toml**: mudança só de `config.toml` dispara
  deploy de TODAS — conferir se é o desejado (custo ~100min de timeout) ou se cabe escopo por diff.
- [ ] **F145 — `REDIGIR_LOG_BASE`/redação de segredos no deploy**: validar que o redator (W06)
  cobre os logs novos do CLI 2.116 (formatos mudam entre versões do CLI).
- [ ] **F146 — Evidência pública do deploy**: o warning "No files were found ... evidence-public"
  do run de hoje indica que a evidência não é gerada quando o job falha cedo — gerar sempre
  (mesmo no abort) para o post-mortem ter material.
- [ ] **F147 — Teste do gerador de manifesto**: unit test com fixture de função nova/removida/
  renomeada (o gerador é o single point do F137).
- [ ] **F148 — Supabase CLI pinado por SHA do binário** (hoje por versão): avaliar checksum para
  reprodutibilidade de deploy (cadeia de suprimento do caminho de produção).
- [ ] **F149 — Ordem lote: migrations → edges**: documentar no runbook F011 a ordem apply-DDL
  antes/depois do deploy de edges conforme dependência (a regra 6 de migrations fala do código;
  edges têm a mesma armadilha).
- [ ] **F150 — Health-check pós-deploy**: step opcional que chama `functions_ping`/healthcheck das
  functions críticas (evolution-api, auth-login) após publicar — deploy verde ≠ função viva.
- [ ] **F151 — Secrets das edges**: `rotate_secrets` existe; documentar inventário de secrets por
  função (sem valores) em `docs/ci/` para rotação não depender de memória.
- [ ] **F152 — Logs de deploy com retenção 14d**: conferir que a evidência pública não contém URL
  assinada/token (repo público).
- [ ] **F153 — Alinhar nome no notifica-falha**: `Deploy Edge Functions` casa com o `name:` real —
  manter teste F035 cobrindo.
- [ ] **F154 — Branch de dispatch**: o deploy só roda de `refs/heads/main` (guard já existe —
  visto no log); teste unitário do guard (não regressão).
- [ ] **F155 — Concurrency do deploy**: grupo mantém 1 em espera; documentar o comportamento para
  dispatches em rajada (lote + hotfix no mesmo minuto).
- [ ] **F156 — `db-migrate` + `deploy-functions` no mesmo lote**: runbook de ordem e quem aprova o
  quê (environments distintos), com exemplo real do lote de 16/10.
- [ ] **F157 — Dry-run obrigatório antes de apply** já é regra; adicionar validação de que o
  `confirm_runtime_sha256` veio do dry-run **do mesmo dia** (timestamp no hash evita replay de
  hash velho).
- [ ] **F158 — Targeted Ledger Evidence**: sem falhas recentes; validar que a chave pública por
  input continua o único caminho e registrar o workflow no F024 (quem usa, quando).

### FASE 8 — Alertas e observabilidade (F159–F176)

- [ ] **F159 — Corrigir os nomes no `notifica-falha-main.yml`**: `DB Migrate (production)` e
  `types-sync` (match exato) — D8; é o fix de maior alavancagem da fase (2 linhas).
- [ ] **F160 — Adicionar `E2E logado` e `DB Guard (offline)`** à lista de monitorados do
  notifica-falha (falham na main hoje sem issue própria).
- [ ] **F161 — Dedupe no notifica-falha**: comentar só quando a causa (workflow+head_sha) mudar —
  padrão do e2e-logado; evita a issue `falha-main` virar flood (política >20 comentários).
- [ ] **F162 — Auto-fechamento**: run verde do mesmo workflow na main fecha a issue `[falha-main]`
  correspondente com link (hoje fecha ninguém — #1974/#1977 dependem de humano).
- [ ] **F163 — Padronizar o corpo das issues de alerta** (template único: workflow, SHA, run,
  causa extraída, receita de correção) entre notifica-falha, db-live-guard, e2e-logado e
  types-sync — 4 formatos diferentes hoje.
- [ ] **F164 — Rotação de issues >20 comentários** (política E51): automatizar — o próprio bot
  fecha com resumo e abre a nova linkada quando passar de 20.
- [ ] **F165 — KPI semanal de falhas por workflow** no actions-kpi (taxa de falha e top causas da
  semana, tabela como a da Parte 1 deste plano) — transforma esta auditoria em rotina.
- [ ] **F166 — Alerta de "main vermelha há >1h"**: escalonamento — se a issue `[falha-main]` de CI
  ficar aberta >1h em horário útil, menção explícita (@adm01-debug) num comentário único.
- [ ] **F167 — Telemetria de duração**: gravar duração por job (dados que o actions-kpi já coleta)
  numa série consultável (artifact JSON semanal versionado em branch `kpi-data` ou no próprio
  issue body) para tendência, não fotografia.
- [ ] **F168 — Watchdog de schedules**: job no branch-hygiene que confere "todo workflow com
  schedule rodou na última janela esperada" (pega cron silenciosamente desativado pelo GitHub após
  60 dias sem commit — risco real em repo que estabilizar).
- [ ] **F169 — Normalizar `[e2e-logado]` sem label**: as issues #1915/#1946 não têm label; criar
  label `e2e-logado` e aplicar (filtros e automação dependem disso).
- [ ] **F170 — Página única de status**: gerar `docs/ci/STATUS.md` (ou Job Summary agregado
  semanal) com o semáforo dos 14 workflows + issues de alerta abertas — visão que hoje exige abrir
  a aba Actions com 6 filtros.
- [ ] **F171 — Integração com o canal real do Joaquim**: **[JOAQUIM]** decidir destino de alerta
  humano (WhatsApp via Evolution? e-mail?) para `falha-main` crítica; issue do GitHub não acorda
  ninguém.
- [ ] **F172 — Silenciar runs skipped em massa**: e2e-logado por `workflow_run` gerou dezenas de
  runs skipped (poluição) — o gatilho mudou em 16/10; conferir que não restam gatilhos que criam
  run skipped a cada push.
- [ ] **F173 — Documentar `notifica-falha-main` no F024** e cobri-lo com o teste F035 (nomes) +
  teste de payload (issue nova × comentário).
- [ ] **F174 — Guard de labels**: criação automática das labels usadas pelos bots se não
  existirem (issue criada com label inexistente falha o passo — classe de erro já vista no
  placar regen de 02/10).
- [ ] **F175 — Causa-raiz do placar regen de 02-03/10** ("Abrir ou atualizar PR do placar", 66
  falhas): post-mortem curto — já está verde, mas sem registro do que foi; documentar para não
  reintroduzir (suspeita: permissão de criação de PR/branch do placar).
- [ ] **F176 — Métricas de MTTR**: medir tempo issue-aberta→issue-fechada das `falha-main` no KPI
  (o dado de 16/10: CI vermelho às 09:52, segunda onda 17:10 — ninguém fechou o ciclo no dia).

### FASE 9 — Higiene, custo e agendamentos (F177–F192)

- [ ] **F177 — Provar o branch-hygiene-audit novo** (dispatch manual antes de segunda): relatório
  + issue `[branch-hygiene]` + KPI atualizados — 97% de falha histórica significa que a versão
  atual nunca rodou inteira.
- [ ] **F178 — Poda das branches patch-equivalentes** listadas pelo F177 — **[JOAQUIM]** aprovar a
  lista antes da deleção em massa (são deleções remotas).
- [ ] **F179 — Auto-delete de branch pós-merge**: `delete_branch_on_merge=true` consta na config —
  validar ao vivo e investigar por que sobram branches (bots? forks? merges manuais).
- [ ] **F180 — Mapa de schedules pós-16/10**: types-sync `49 5 * * 1`, db-live-guard `13 6 * * 1`,
  branch-hygiene `56 7 * * 1`, codeql `30 9 * * 1` — todos na segunda. Espalhar pela semana
  (livre de colisão ≠ tudo no mesmo dia; uma segunda ruim cega a semana inteira).
- [ ] **F181 — Minutos de Actions por workflow** (KPI F165): baseline de custo pós-CI-mínimo e
  meta por workflow (ex.: CI ≤6min p95; db-guard ≤15min p95) — sem meta, o inchaço volta.
- [ ] **F182 — Cache hit-rate**: medir restore hit do cache bun nos últimos 50 runs; fallback
  `bun-` restaura 207MB mesmo com lock divergente (foi o caso de hoje: hit em chave velha) —
  avaliar remover o restore-key parcial para falhar mais rápido em lock novo.
- [ ] **F183 — Artefatos: retenção global** (o repo sobe evidence/report/playwright-report):
  inventário de artefatos por workflow e retenção mínima viável (repo público, storage pago).
- [ ] **F184 — `actions/cache` v6 e demais versões major**: revisar bumps do dependabot pendentes
  pós-deleção de workflows (grupo actions-misc #1958 mergeado; conferir sobras).
- [ ] **F185 — Remover `crm-sync-worker` do limbo ou reativar**: o schedule está comentado há
  >1 mês com `vars.CRM_SYNC_WORKER_ENABLED` nunca ligada — **[JOAQUIM]** decidir: reativar com a
  var, ou mover o workflow para `docs/` como referência e tirar da pasta ativa.
- [ ] **F186 — `targeted-ledger-evidence`**: idem — uso raro por dispatch; manter, mas adicionar
  ao F024 e conferir permissões mínimas.
- [ ] **F187 — Runner árvore única (reuso de árvore do #1949)**: medir se o desenho "fila serial"
  pós-CI-mínimo ainda existe em algum workflow e se vale manter (o auto-update-pr-branch morreu;
  a fila BEHIND não existe sem strict).
- [ ] **F188 — Workflows dinâmicos**: Dependabot Updates + Dependency Graph + Copilot reviewer —
  conferir que o Copilot reviewer ainda é desejado em PRs de agente (custo/ruído de review bot)
  — **[JOAQUIM]**.
- [ ] **F189 — `.env.production` lido pelo bun install** (log: `[0.04ms] ".env.production"`):
  conferir que não há segredo nesse arquivo versionado (repo público!) e que o bun lê por design.
- [ ] **F190 — Higiene da aba Actions**: deletar runs antigos dos workflows apagados
  (settings-guard/scorecard/supabase-sync/auto-update/cleanup-artifacts) — a API permite
  `DELETE /actions/runs/{id}`; reduz ruído do filtro is:failure (hoje 2.500 falhas acumuladas).
- [ ] **F191 — Proteção do diretório `.github/workflows` no fluxo de agente**: regra no CLAUDE.md
  — mudança de workflow sai sempre em PR dedicado (nunca dentro de lote de 880 cartões), porque
  rollback de workflow misturado com feature é impossível de isolar.
- [ ] **F192 — Backup do perímetro**: exportar JSON das configs do repo (protection, environments,
  secrets names, variables) para `docs/audits/perimetro-YYYY-MM-DD.json` a cada mudança — a
  história das 3 regressões de `strict` não teria levado semanas com snapshot versionado.

### FASE 10 — Verificação final e metas (F193–F200)

- [ ] **F193 — Re-medir a tabela da Parte 1** (mesma janela de 14 dias) após Fases 0–2 e publicar
  comparativo no KPI: meta global ≤5% de taxa de falha por workflow, zero workflow >20%.
- [ ] **F194 — Main verde por 7 dias corridos**: nenhum run failure de CI/types-sync/deploy na
  main por uma semana — critério de saída da Fase 0 ser considerada estável.
- [ ] **F195 — db-live-guard: 4 execuções consecutivas sem falso positivo de transporte** (pós
  F075-F087) e drift real zerado (pós F081) — só então reavaliar a cadência (F079).
- [ ] **F196 — Suíte E2E logada verde 5 runs seguidos na main** e #1915 fechada com evidência.
- [ ] **F197 — Simulação de regressão**: PR de teste com lockfile quebrado de propósito → provar
  que F009+F029 bloqueiam o merge e o alerta certo dispara; reverter o PR de teste.
- [ ] **F198 — Simulação de edge stale**: PR de teste tocando function sem manifesto → provar que
  F137 reprova no PR; reverter.
- [ ] **F199 — Atualizar este plano com status real por etapa** (✅/❌/adiado + link do PR de cada
  F) — plano sem placar vira ficção; o placar entra em `docs/audits/` junto deste arquivo.
- [ ] **F200 — Revisão final com o Joaquim**: 30min sobre o comparativo F193, decisões abertas
  ([JOAQUIM]: F004, F029, F033, F057, F079, F087, F093, F142, F171, F178, F185, F188) e o que
  vira rotina permanente (KPI F165, watchdog F168, snapshot F192).

---

## Ordem de execução recomendada

1. **Hoje:** F001–F008 (main verde de novo; é pré-requisito de tudo).
2. **Esta semana:** F009–F012, F159–F162 (guard-rails do incidente + alertas que funcionam),
   F013–F021 (verdade documental), F029–F030 **[JOAQUIM]**.
3. **Semana seguinte:** Fases 3 e 4 (E2E logado e db-live-guard — os dois vermelhões crônicos).
4. **Depois:** Fases 5–9 em paralelo por workflow (1 etapa = 1 PR), Fase 10 fecha.

*Gerado em 2026-10-16 a partir de: 1.000 runs de falha analisados (02–16/10), sumários de falha de
14 runs representativos, logs de 7 jobs, estado ao vivo de branch protection/environments/issues/PRs
e leitura dos 14 arquivos de `.github/workflows/` no commit `9c0a82c`.*
