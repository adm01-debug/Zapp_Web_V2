# RESGATE-ANALISE-261031.md
> Análise exaustiva do estado do repositório Zapp_Web_V2 — gerada em 2026-10-31
> Gerada por agente de análise (Copilot). **Somente leitura — nenhuma ação destrutiva foi tomada.**

---

## 0. ATUALIZAÇÃO 2026-11-07 — Delta desde o relatório original

> Re-análise read-only em 07/11. O repo evoluiu muito desde 31/10: **27 branches novas**, `main` local agora **182 commits atrás** de `origin/main`, e **219 arquivos modificados** no working tree.

### 0.1 Estado do GitHub (origin/main)

- `origin/main` avançou para `5b62b9338e` (últimos merges: #2758 Vercel Cleanup fail-closed, #2756 DB Live Guard, #2753 esm.sh→npm, #2757 plano sintético, #2754 vault e2e, #2707 drain cron, #2752 inventário B10, #2750 provisionamento IA, #2749/#2748/#2744/#2747/#2741).
- `main` local parado em `239f6d8ca7` — **182 commits atrás** do origin (era 13 em 31/10). Ninguém fez pull/fast-forward no principal desde então.
- **CI do main: verde** (último run 31/10 17:39Z, segundo a triagem de PRs).

### 0.2 Branches novas desde 01/11 (27) — risco de perda

| Data | Branch | Tracking | Commits únicos vs origin/main |
|---|---|---|---|
| 07/11 | `claude/chore-instrucoes-enxutas-261107-1030` | origin (própria) | 2 (`a176f8e268`, `b21053427f` — AGENTS.md único) |
| 07/11 | `claude/chore-ci-local-261107-1103` | origin/main | 0 (já na main) |
| 07/11 | `Github_Copilotinfra-edge-npm` | **SEM-REMOTE** | 1 (`9149c1ceee5` — deployment-manifest LF) |
| 07/11 | `Github_Copilotliterate-pancake` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotstunning-giggle` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotvalidacao-esm-npm` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotfix-e2e-vault-guard-06111807` | origin (gone) | 1 (`898d3ae3816`) |
| 06/11 | `Github_Copilotcurly-pancake` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotfuzzy-telegram` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotglowing-pancake` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotshiny-sniffle` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotsuper-bassoon` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `pr2753` | **SEM-REMOTE** | 1 (`31c4d3c0b2` — esm.sh→npm, **já squashado na main como #2753**) |
| 06/11 | `Github_Copilotvigilant-dollop` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotfix-paleta-unica-stale-closure-keyboard` | origin (gone) | 1 (`b9d0dfe464b`) |
| 06/11 | `Github_Copilotliterate-spork` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotprobable-eureka` | **SEM-REMOTE** | 0 (já na main) |
| 06/11 | `Github_Copilotupgraded-adventure` | **SEM-REMOTE** | 0 (já na main) |
| 01/11 | `claude/fix-talkx-segmentos-regressao-261101-1944` | origin (própria) | 1 (`d8eb518aa1` — restaura X111/X112/X116 do C011) |
| 01/11 | `claude/feat-incidentes-pausa-investigados-261024-1640` | origin (própria) | 5 (C121 IP2-A/B — migration + aba Pausas) |
| 01/11 | `claude/feat-message-delivery-post-iniciado-261101-1937` | origin (própria) | 4 (PD-79 fail-closed + classifyUnclaimedCause) |
| 01/11 | `claude/feat-metas-seletor-periodo-261101-1208` | origin (própria) | 2 (C130 — seletor Hoje/Semana/Mês) |
| 01/11 | `claude/chore-mapa-resgate-pos-24-10-261101-1415` | origin (própria) | 1 (`34c717da12` — mapa do delta pós-24/10) |
| 01/11 | `codex/fix-lint-phone-settings-20261101` | origin (própria) | 2 (`36760d7e7e`, `e90cc15753`) |
| 01/11 | `codex/fix-typecheck-baseline-20261101` | origin/main | 1 (`4555f3ca4d` — JSX + filtro inbox) |
| 01/11 | `codex/consolidacao-baseline-pr-20261101` | origin (própria) | 1 (`3ab810b4d8`) |
| 01/11 | `codex/consolidacao-baseline-20261101` | **SEM-REMOTE** | 2 (`41cb12a85a`, `20b276dc36`) |

**Leitura:** a maioria das `Github_Copilot*` de 06/11 são branches locais de PRs **já mergeadas** (commits iguais aos da main — sem risco). As que importam: `claude/chore-instrucoes-enxutas` (2 commits únicos), `Github_Copilotinfra-edge-npm` (1), `codex/consolidacao-baseline-20261101` (2), `pr2753` (1, já na main como squash), e as 6 branches `claude/*`/`codex/*` de 01/11 com tracking próprio (trabalho de C121/C130/C011/PD-79 — **verificar se as PRs correspondentes foram mergeadas**).

### 0.3 Branches à frente do origin (atualizado 07/11)

13 branches com commits não publicados (era 11 em 31/10):

| Branch | À frente | Atrás | Observação |
|---|---|---|---|
| `codex/diagnostico-e2e-mapa-20261028` | 8 | 245 | Diagnóstico E2E mapa |
| `claude_juca/practical-rubin-8xnw0u` | 4 | 79 | merge main; mock do main |
| `claude/fix-ga-fase23-edge-e2e-261020-2200` | 3 | 290 | fix lint worktrees |
| `codex/teamchat-audit-action-contract-20261030` | 2 | 26 | Team chat audit |
| `hermes/robustez-primitivos-ui-...` | 2 | 378 | UI primitivos |
| `claude/fix-ga-fase1-lote-banco-261020-2200` | 1 | 309 | GA19/GA18 |
| `claude/fix-ga-fase78-perimetro-custo-261020-2200` | 1 | 309 | GA75-95 |
| `claude/fix-ga-resto-dbmigrate-20261021-0729` | 1 | 309 | GA13-17 |
| `claude/fix-ga-resto-sonar-contracts-20261021-0726` | 1 | 309 | GA86/99/100 |
| `codex/consolida-docs-deploy-ga98` | 1 | 243 | docs deploy |
| `codex/fix-typecheck-baseline-20261101` | 1 | 140 | JSX + filtro inbox |
| `hermes/telefonia-fase8-motion-a11y-...` | 1 | 430 | motion a11y T75 |
| `local/fase0-banco-local` | 7 | 400 | fase 0 banco local |

### 0.4 Working tree sujo (219 arquivos) — NOVO risco

O working tree do principal tem **219 arquivos modificados**, mas a análise mostra que **196 são apenas mudança de modo** (`100644 → 100755`, chmod +x) e **14 são deleções** (11 `.merge_file_*` + 3 `.Zone.Identifier` de protótipos). **Nenhuma mudança real de conteúdo** — o diff de conteúdo é 0 linhas. Ou seja: o working tree está "sujo" por um `chmod +x` em massa (provavelmente de um `git config core.fileMode` desligado + checkout) e por artefatos de merge parcial antigos. **Limpeza segura:** `git config core.fileMode false` + `git checkout -- .` (ou commit do chmod se for intencional).

Untracked novos: `AUDIT-A-PROCESSAR-261031.md`, `TRIAGEM-PRS-GITHUB-261031.md`, `resgate-online/` (relatório de resgate dos clusters C007–C303, 01/11), e um arquivo estranho chamado `=` (possível erro de redirecionamento).

### 0.5 Novos artefatos de resgate (01/11) — já existem!

Outras sessões já fizeram trabalho de resgate em 01/11 que **complementa** este relatório:

- **`resgate-online/RELATORIO_RESGATE.md`** — resgate dos clusters C007 C019 C098 C097 C121 C297 C303 C110 C130 C011. Veredito: 6 JÁ IMPLEMENTADAS (#2223 #2224 #2231 #2234 #2236 #2240 mergeadas), 4 ABERTAS (C121 #2471/#2469, C297 #2480, C110 #2466/#2238, C130 #2484). Achado crítico: **#2239 (C130) entrou na main como squash VAZIO (0 arquivos)** — a feature nunca chegou.
- **`resgate-online/progresso.json`** — estado por cluster com PRs e contagem de commits próprios.
- **`resgate-online/dossies/`** — 10 dossiês (C007, C011, C019, C097, C098, C110, C121, C130, C297, C303).
- **`AUDIT-A-PROCESSAR-261031.md`** — auditoria de `_a-processar/ZAPP_WEB_V2_LOCAL`: 12.559 commits vs origin/main, mas **só 2 arquivos não commitados em risco** (recomenda commit + push e depois pode remover a cópia).
- **`TRIAGEM-PRS-GITHUB-261031.md`** — triagem de 99 PRs abertas: 81 ready, 18 draft, 40 mergeable, 59 conflitantes, 39 CI verde. **Aviso: mega-branch #2445 e PR #2265 CRITICAL-1 (segurança).**

### 0.6 Conclusão do delta

O trabalho de resgate **já está em andamento por outras sessões** (clusters C007–C303, triagem de PRs, auditoria do `_a-processar`). O que este relatório adiciona de novo: (a) o mapa completo de branches locais sem push, (b) a descoberta de que o working tree sujo é só chmod + deleções (limpeza trivial), (c) as 27 branches novas de 01–07/11 com seus commits únicos, (d) a confirmação de que `main` local está 182 commits atrás. **Próxima ação recomendada:** fast-forward do `main` local + push das branches com commits únicos ainda não mergeados (verificar PRs de C121/C130/C011/PD-79).

---

## 1. Auditorias e Handoffs Anteriores Encontrados

### Arquivos-chave localizados (por relevância)

| Arquivo | O que contém |
|---|---|
| `docs/handoffs/HANDOFF_ARQUITETURA_AGENTES_2026-10-11.md` | **Crítico.** Documenta a arquitetura completa do sistema Hermes: 14+ perfis, kanban SQLite, dispatcher, integrador, convenção de branches, worktrees. 32 cards V3→V2 ativos em 11/10. |
| `docs/handoffs/HANDOFF_MULTIPLIX_2026-10-08.md` | Módulo Multiplix: 61/100 checkboxes feitos, 39 abertos, 15 não implementados. |
| `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md` | Plano ativo TalkX V4 (200 etapas X001–X200). |
| `docs/talkx/v4/STATUS.md` | Status corrente do TalkX V4. |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | Auditoria de 15 workflows (+3 dinâmicos), meta CI score 10/10. |
| `docs/audits/PLANO_CORRECOES_50_ETAPAS_2026-09-16.md` | Auditoria local↔GitHub↔banco de 16/09. |
| `_resgate-wsl-20261021/` | Diretório de resgate de 21/10: contém `arquivo-zapp/`, `prototipos_redesign/`, `backups-bins/`, `configs-logs/`, `zapp-importar-20261020/`. |
| `/home/joaquim_ataides/_arquivo/LEIAME.md` | Inventário de tudo movido para `~/_arquivo/` em 29/10/2026: `fabrica-hermes/`, `resgate/`, `temporarios/`, `instaladores/`, `diversos/`. |
| `/home/joaquim_ataides/arquitetura-v2/` | Documentação da fábrica multi-agentes: `FABRICA_V2_DOCUMENTACAO.md`, `LOTE_AUTOMATICO.md`, `LOTE_PENDENTE.md`, `PLANO_MELHORIAS_ARQUITETURA_MULTIAGENTES_100_ETAPAS.md`. Subdirs: `auditor/`, `auditoria/`, `balanceador/`, `ci-main/`, `contatos-redesign/`, `devin-docs/` etc. |
| `/home/joaquim_ataides/hermes-reset/reset-20261031-104907.log` | Reset do Hermes em 31/10 às 10:49 — **CANCELADO** (app reaberto durante a carência de 120s). Backup feito em `C:\Users\Joaquim Ataides\AppData\Local\hermes\_reset-20261031-104907` (4.0 GB). |

### Resumo do que os handoffs dizem

- **Hermes** é o orquestrador central. Agents (worker, coordenador, integrador, designer, iris, hugo, edgar, vera, workersql, workerauth, workeria, workermensageria, workertestes) trabalham em worktrees locais. Só o Joaquim faz push/PR — os agents trabalham localmente.
- **Integrador** mescla o trabalho dos agents na branch diária `dia/YYYY-MM-DD`.
- **Multiplix** (módulo de conexões múltiplas WhatsApp): 61/100 done, 15 never implemented — trabalho inacabado.
- **TalkX V4**: 200 etapas atribuídas X001–X200. Planos anteriores (V1, V2, V3) marcados como SUBSTITUÍDOS.
- **V3 aposentada**: usada como referência de paridade — commits já integrados ou descartados.

---

## 2. Estado do Cherry-pick (e Merge/Rebase)

**Não há cherry-pick, merge nem rebase em andamento.**

```
CHERRY_PICK_HEAD → não existe
MERGE_HEAD → não existe
REBASE_HEAD → não existe
```

**O que existe no working tree:**

- Branch atual: `dia/2026-10-23`
- HEAD: `3024ca92c7` (`fix tests: tipa importOriginal nos mocks de framer-motion`)
- Status git: **tree limpa para commits**, mas com artefatos no índice:
  - `.merge_file_*` (status AD — adicionado depois apagado): sobra de operação parcial de merge anterior, já sem impacto
  - `.husky/post-commit` e `.husky/post-checkout` (status MM): hooks do graphify com mudanças não-staged
  - `.cursor/mcp.json` (status A): arquivo adicionado mas não commitado

Esses artefatos não bloqueiam nada — são limpeza cosmética, não work-in-progress.

---

## 3. Branches Locais sem Push (4.110 branches)

### Totais

| Tipo | Quantidade |
|---|---|
| Branches locais totais | 4.259 |
| **Sem remote tracking (nunca deram push)** | **4.110** |
| Com tracking (já no GitHub) | 149 |

### Branches mais recentes (últimas 48h — maior risco de perda)

| Data | Branch | Tipo |
|---|---|---|
| 2026-10-31 | `codex/db-migrate-db-url-20261031` | Codex |
| 2026-10-30 | `main` | — |
| 2026-10-30 | `codex/replay-image-ghcr-20261030` | Codex |
| 2026-10-30 | `codex/tcm-insert-member-a2-20261030` | Codex |
| 2026-10-30 | `codex/revoke-public-truncate-grants-20261030` | Codex |
| 2026-10-30 | `codex/teamchat-audit-action-contract-20261030` | Codex |
| 2026-10-30 | `codex/fix-invoke-edge-types-20261030` | Codex |
| 2026-10-30 | `claude/radar-motor-copilot-live-301030` | Claude |
| 2026-10-30 | `claude/radar-telas-fases-4-6-301030` | Claude |
| 2026-10-30 | `codex/reconcile-wave-ci-edge-settings-20261030` | Codex |
| 2026-10-30 | `codex/reconcile-live-migration-sources-20261029` | Codex |
| 2026-10-30 | `claude/radar-remove-hooks-duplicados-301030` | Claude |
| 2026-10-30 | `claude_juca/practical-rubin-8xnw0u` | Claude manual |
| 2026-10-30 | `claude/docs-p053-regressao-261021-0827` | Claude |
| 2026-10-30 | `claude/fix-ci-reativar-suites-261016-1530` | Claude |
| 2026-10-30 | `claude/w39-w49-w50-ci-cleanup` | Claude |
| 2026-10-29 | `codex/talkme-e2e-assertion-20261029` | Codex |
| 2026-10-29 | `codex/inventario-fase1-20261029` | Codex |
| 2026-10-29 | `codex/consolida-p053-ledger-20261029` | Codex |
| 2026-10-29 | `integra/dia-2026-10-23` | Integrador |
| 2026-10-28–29 | `codex/consolida-*` (11 branches) | Consolidações Codex |
| 2026-10-29 | `importado/orfas/*` (4 branches) | Resgate anterior |
| 2026-10-29 | `importado/local/*` (3 branches) | Resgate local |

### Categorias de branches locais (amostra dos padrões)

| Padrão | Significado |
|---|---|
| `dia/YYYY-MM-DD` | Branch de integração diária (Hermes integrador) |
| `codex/*` | Work do Codex (OpenAI) — worktrees em `~/zapp-worktrees/` |
| `claude/*` | Work do Claude (Anthropic) |
| `claude_juca/*` | Claude acionado manualmente pelo Joaquim |
| `integra/*` | Branches de integração geradas pelo integrador Hermes |
| `importado/*` | Branches importadas/resgatadas de outras fontes |
| `importado/orfas/*` | Branches "órfãs" resgatadas de worktrees abandonadas |
| `importado/local/*` | Branches importadas de repos locais (quarentena, _a-processar) |
| `ft-N` | Feature branches numeradas (era pré-Hermes) |
| `hermes/*` | Branches do Hermes agent (setembro/outubro) |

---

## 4. Branches Exclusivas da Quarentena (2.314 branches)

### Contexto

O clone em `/home/joaquim_ataides/quarentena-zapp-2026-10-24/clone-55GB-A-PROCESSAR` tem **2.324 branches**, mesmo remote (`adm01-debug/Zapp_Web_V2`). **2.314 dessas branches NÃO existem no repositório principal.**

### Período

Branches mais recentes da quarentena: **Out 9–10, 2026** (commit mais recente: `v2/n-007-storage-avatar-private-261009153000`). Todas anteriores a 10/10.

### Padrões predominantes

- `v2/t-XXXX-YYYYMMDD*` — branches de tarefas geradas por Devin/Cursor (era Out 5-9)
- `v2/n-NNN-slug-YYYY*` — features numeradas da era Devin
- `v2/tl-NNN-slug-*` — TalkX features da mesma era
- Nomes com hashes de commit curtos no sufixo (identificador único por session)

### Subdirs da quarentena

| Subdir | O que é |
|---|---|
| `clone-55GB-A-PROCESSAR/` | Clone principal — 2.324 branches, mesmo remote |
| `cursor-worktrees/` | 3 worktrees: `dia__2026-10-23-1`, `dia__2026-10-23-1-1`, `dia__2026-10-23-1-1-1` |
| `wt-fase78/` | Repo git ligado ao Zapp_Web_V2 (tem `HANDOFF_MISSION_10-10.md`, `ESTADO.md`) |
| `cursor-anxm/` | Repo git ligado ao Zapp_Web_V2 (mesmos arquivos de topo) |
| `Zapp_fase456/` | Vazio |
| `zapp-worktrees-aninhado/` | Worktrees: `_base`, `preview`, `tc-medir`, `teste-real` |

### Risco de perda

As 2.314 branches exclusivas da quarentena representam trabalho feito por agentes Devin/Cursor entre 5–10 de outubro. A maioria provavelmente foi **superada** pelo trabalho posterior nos patterns `v2/*` que foram processados via lote/integra no repositório principal, mas não há certeza sem análise individual.

---

## 5. Branches à Frente do Origin (trabalho pronto para subir)

11 branches identificadas com commits que **não estão no GitHub**:

| Branch | À frente | Atrás | Observação |
|---|---|---|---|
| `codex/diagnostico-e2e-mapa-20261028` | 8 commits | 80 | Diagnóstico E2E mapa |
| `codex/teamchat-audit-action-contract-20261030` | 2 commits | 26 | Team chat audit (tem tracking próprio) |
| `claude/fix-ga-*` (vários) | 1 commit cada | 144 | Fix GA — muito atrás do main |
| `local/fase0-banco-local` | 7 commits | 235 | Fase 0 banco local |

**Observação crítica:** Todas essas branches estão **muito atrás do origin/main** (78 a 265 commits atrás). O trabalho nelas pode já ter sido incorporado por outras branches ou pode ser conflitante com o estado atual.

---

## 6. Zapp_Web_V3

| Campo | Valor |
|---|---|
| Repo GitHub | `adm01-debug/Zapp_Web_V3` (repo **separado**) |
| Branches locais | 28 |
| Branch atual | `main` |
| Commits únicos em V3 (não em V2/main) | **ZERO** |
| Status | **"V3 aposentada"** — usada como referência de paridade |

### Branches locais V3 (notáveis)

```
backup/stash-plano100-mfa-deploy-20260905
backup/wip-mfa-handoff-20260905
fix/deps-audit-critical-20261029
hermes/audit-ratchet-pr1566-20260925
hermes/conv-closures-insert-policy
hermes/fix-migration-tests-ci
hermes/hardening-rpc-credenciais
hermes/invariante-rls-100
hermes/matviews-exposicao
hermes/realtime-restore
hermes/rls-prospeccao
pr1618-wip, pr1620-wip, pr1621-wip, pr1642-wip ... pr1652-wip
```

As branches `pr*-wip` sugerem que o V3 ainda tem trabalho WIP vinculado a PRs específicas — mas como os commits já estão em V2/main, o risco de perda é baixo. As branches `hermes/*` do V3 parecem cópias das mesmas branches que existem no V2.

### Também relevante: `_a-processar/`

Em `/home/joaquim_ataides/projetos/_a-processar/` há:
- `ZAPP_WEB_V2_LOCAL/` — clone local com histórico próprio (5 commits identificados: fixes de testes `c098`, `editarFixar`)
- `ZAPP_WEB_V3_LOCAL/` — clone local do V3

O `ZAPP_WEB_V2_LOCAL` tem commits que podem não estar no repositório principal — **precisa de verificação**.

---

## 7. Infraestrutura de Worktrees e Agentes

| Localização | Conteúdo |
|---|---|
| `~/zapp-worktrees/` | 41 worktrees ativas do Codex (Out 28–31) |
| `~/hermes-workspaces/` | Worktrees do Hermes + `.integra/*` ligadas ao principal |
| `~/projetos/_worktrees/` | 113 worktrees de projetos variados |
| `~/arquitetura-v2/` | Documentação da fábrica multi-agentes (scripts, auditorias, badges) |
| `~/codex-workspaces/` | Workspaces do Codex (graphify, p1-09120905-acl-rpcs-admin etc.) |

O Hermes foi tentado de ser resetado em 31/10/2026 às 10:49 mas o reset foi **CANCELADO** porque o app foi reaberto durante a carência de 120s. O backup de 4.0 GB foi feito em `C:\Users\Joaquim Ataides\AppData\Local\hermes\_reset-20261031-104907`.

---

## 8. Linha do Tempo Estimada

```
Set 2026 (início do período)
│
├── Set 16: Auditoria local↔GitHub↔banco (PLANO_CORRECOES_50_ETAPAS)
├── Set 25: Auditoria workflows (PLANO_GITHUB_ACTIONS_100_ETAPAS baseline)
├── Set 29: Auditoria TalkX V4 (auditoria_plano_talkx_2026-09-29)
│
Out 1-4: TalkX V4 planado (200 etapas X001–X200)
│
Out 5-9: Era Devin/Cursor
│   ├── Centenas de branches v2/t-*, v2/n-*, v2/tl-* criadas por Devin
│   ├── Clone de 55GB criado (quarentena) com 2.324 branches
│   └── Trabalho em lotes (lote/*), branches hermes/*
│
Out 8: HANDOFF_MULTIPLIX_2026-10-08 (61/100 done)
Out 10-11: HANDOFF_ARQUITETURA_AGENTES (32 cards V3→V2 ativos)
│
Out 11-20: Consolidação via Hermes integrador
│   ├── Integração diária (branches dia/YYYY-MM-DD)
│   ├── Hermes processa worktrees → integra/* → dia/*
│   └── V3 aposentada, V2 vira repositório canônico
│
Out 21: Resgate WSL (_resgate-wsl-20261021/)
│   └── Importação de arquivos avulsos, protótipos redesign
│
Out 23: Branch de integração dia/2026-10-23 (HEAD atual)
│
Out 24: Clone 55GB movido para quarentena
│
Out 28-29: Era Codex intensiva
│   ├── 41 worktrees em ~/zapp-worktrees/
│   └── Branches codex/consolida-*, codex/inventario-fase1, etc.
│
Out 29: Importação de branches órfãs (importado/orfas/*, importado/local/*)
│
Out 30: Trabalho Claude + Codex intenso (radar-*, reconcile-*, audit-*)
Out 31: codex/db-migrate-db-url-20261031 (branch mais recente)
Out 31 10:49: Reset do Hermes tentado → CANCELADO
```

---

## 9. Diagnóstico: O que Está em Risco

### Risco ALTO (trabalho que pode se perder)

1. **4.110 branches sem remote tracking** — se o disco WSL falhar, esse trabalho desaparece. Não existe backup no GitHub.
2. **`_a-processar/ZAPP_WEB_V2_LOCAL`** — clone com commits próprios (fixes de testes) que podem não estar no principal.
3. **2.314 branches exclusivas da quarentena** — trabalho de Out 5-9 que nunca foi integrado ao principal (ou foi, via lotes/integra — incerto).
4. **`wt-fase78/`, `cursor-anxm/`** — worktrees com código em estado desconhecido.

### Risco MÉDIO

5. **11 branches à frente do origin** — têm commits prontos mas estão muito atrás do main (serão conflitantes).
6. **Local main 13 commits atrás** — nenhum impacto de perda, mas a branch local `main` está desatualizada.
7. **Branches V3 `pr*-wip`** — PRs WIP no V3 que podem ter trabalho não integrado.

### Risco BAIXO

8. **Artefatos no índice** (`.merge_file_*`, `.husky/*`) — limpeza cosmética, sem risco real.
9. **Reset do Hermes cancelado** — o backup de 4.0 GB foi feito; o estado do Hermes está preservado no Windows.

---

## 10. Recomendação de Plano de Resgate

### PASSO 1 — Snapshot imediato (AGORA, antes de tudo)
**Objetivo: garantir que nada se perde antes de qualquer operação.**

```bash
# Fazer um bundle de TODAS as branches locais do principal
cd /home/joaquim_ataides/projetos/Zapp_Web_V2
git bundle create ~/backups/zapp-v2-bundle-20261031.bundle --all

# Fazer o mesmo da quarentena
cd /home/joaquim_ataides/quarentena-zapp-2026-10-24/clone-55GB-A-PROCESSAR
git bundle create ~/backups/quarentena-bundle-20261031.bundle --all
```

O bundle é um arquivo Git portátil completo — pode ser restaurado em qualquer lugar.

### PASSO 2 — Sincronizar local main com origin (simples)
```bash
cd /home/joaquim_ataides/projetos/Zapp_Web_V2
git checkout main
git pull origin main
```
Sem risco: main local está apenas atrás, não divergiu.

### PASSO 3 — Push das 11 branches à frente do origin
Para cada branch com commits locais não publicados, criar uma PR (ou ao menos fazer push para backup):
```bash
# Exemplo para cada branch ahead of origin:
git push origin codex/diagnostico-e2e-mapa-20261028
git push origin local/fase0-banco-local
# etc.
```
Mesmo que estejam desatualizadas, o push as preserva no GitHub.

### PASSO 4 — Auditar `_a-processar/ZAPP_WEB_V2_LOCAL`
```bash
cd /home/joaquim_ataides/projetos/_a-processar/ZAPP_WEB_V2_LOCAL/Zapp_Web_V2
git log --oneline --not --remotes
```
Se houver commits únicos, criar branch importada e push.

### PASSO 5 — Decisão sobre as 2.314 branches da quarentena
Duas opções (decisão de Joaquim):

**5A — Push seletivo**: Rodar `git log <branch> --not origin/main --oneline` em cada branch e empurrar só as que têm commits não integrados. Processo lento mas preciso.

**5B — Push em bloco**: Fazer push de TODAS para um remote de arquivo separado (ou um fork) e marcar como "arquivo". Depois auditar no GitHub. Mais rápido, cria 2.314 branches remotas.

Recomendação: **5B** com remote separado ou tag de arquivo, para não poluir o repo principal.

### PASSO 6 — Limpar artefatos do índice
```bash
cd /home/joaquim_ataides/projetos/Zapp_Web_V2
git rm --cached '.merge_file_*' 2>/dev/null
git add .husky/post-commit .husky/post-checkout
git add .cursor/mcp.json
git commit -m "chore: limpar artefatos de merge parcial e atualizar hooks"
```

### PASSO 7 — Retomar o Hermes (se desejado)
O reset foi cancelado em 31/10. O backup existe em Windows. Se quiser resetar de verdade: reabrir o Hermes e tentar novamente com a carência de 120s sem reabrir o app.

### PASSO 8 — Auditoria das branches `wt-fase78` e `cursor-anxm`
```bash
git -C /home/joaquim_ataides/quarentena-zapp-2026-10-24/wt-fase78 log --oneline --not origin/main | head -20
git -C /home/joaquim_ataides/quarentena-zapp-2026-10-24/cursor-anxm log --oneline --not origin/main | head -20
```
Se tiverem commits únicos, importar como branches no principal.

---

## Apêndice: Inventário de Repositórios/Clones Locais

| Caminho | Tipo | Branches | Remote | Período |
|---|---|---|---|---|
| `~/projetos/Zapp_Web_V2` | Repo principal | 4.259 | adm01-debug/Zapp_Web_V2 | Set–Out 2026 |
| `~/quarentena-zapp-2026-10-24/clone-55GB-A-PROCESSAR` | Clone quarentena | 2.324 | idem | Out 5-10 |
| `~/projetos/Zapp_Web_V3` | Repo separado | 28 | adm01-debug/Zapp_Web_V3 | Ago–Set 2026 |
| `~/projetos/_a-processar/ZAPP_WEB_V2_LOCAL/Zapp_Web_V2` | Clone local | 2 | idem | — |
| `~/quarentena.../wt-fase78` | Worktree | ? | adm01-debug/Zapp_Web_V2 | Out 2026 |
| `~/quarentena.../cursor-anxm` | Worktree | ? | adm01-debug/Zapp_Web_V2 | Out 2026 |
| `~/quarentena.../cursor-worktrees/*` (3) | Worktrees | — | — | Out 23 |
| `~/zapp-worktrees/` (41) | Worktrees Codex | — | adm01-debug/Zapp_Web_V2 | Out 28-31 |
| `~/hermes-workspaces/.integra/*` | Worktrees Hermes | — | adm01-debug/Zapp_Web_V2 | Out 2026 |

---

*Relatório gerado por análise read-only. Nenhuma branch foi deletada, mergeada ou modificada.*
*Para executar o plano de resgate, aprovar os passos e comunicar ao agente executor.*
