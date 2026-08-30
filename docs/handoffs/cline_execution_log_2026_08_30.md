# Diário de Execução — Programa de 100 Etapas (Cline)

> **Branch de trabalho:** `chore/excellence-wave-01`
> **Base:** `origin/main` @ `19b0f6448910bcb29ccd9ddd964f99a303a823b0`
> **Data de início:** 2026-08-30 (America/Sao_Paulo)
> **Executor:** Cline — Full Stack Sênior
> **Handoff de origem:** `docs/handoffs/handoff_cline_100_etapas_2026_08_30.md`
> **Estados:** NOT_STARTED | IN_PROGRESS | BLOCKED | VERIFIED | SKIPPED_WITH_EVIDENCE | ROLLED_BACK
> **Auditoria corretiva:** Codex, 2026-08-30. O diário original divergia do handoff em 94/100 títulos; a tabela abaixo foi reconciliada diretamente com os headings canônicos do handoff.

---

## 1. Ambiente de ferramentas (Etapa 003)

| Ferramenta | Observado | Esperado (CI/handoff) | Status |
|---|---|---|---|
| SO | Linux 6.18.33.2-microsoft-standard-WSL2 (WSL2) | Linux | MATCH |
| Arquitetura | x86_64 | x86_64 | MATCH |
| Node | v24.19.0 | 24 (ci.yml) | MATCH |
| Bun | 1.4.0 | 1.4.0 (ci.yml) | MATCH |
| git | 2.43.0 | — | registrado |
| psql | ausente | — | registrado (não necessário nesta onda) |
| `.nvmrc` | `20` | 24 | DIVERGENTE → tratar na etapa 014 |

Instalação congelada: `bun install --frozen-lockfile` → exit 0, "Checked 903 installs across 987 packages (no changes)"; `git status --porcelain bun.lock` vazio → **bun.lock intacto**.

## 2. Verificação de identidades (Etapa 005)

| Alvo | Esperado | Observado | Status |
|---|---|---|---|
| GitHub repo | `adm01-debug/zapp-web-v2`, default `main` | `adm01-debug/Zapp_Web_V2` (match case-insensitive), `default_branch=main`, permissões admin/push, `pushed_at` 2026-08-30T16:05:54Z | **MATCH** |
| Supabase oficial | project `tnnnlkbymytvtqngbbqh`, PostgreSQL 17.6, Supabase Cloud | (a) MCP self-hosted da sessão Cline → PG 15.8 (MISMATCH, proibido); (b) tentativa do MCP do Codex → `401 Unauthorized`; (c) MCP HTTP dedicado `supabase-zapp-web-v2-mcp` v1.1.2 (Cloudflare Workers; conector documentado em `docs/migration/HANDOFF.md`), fornecido pelo usuário em 2026-08-30 → PG **17.6**, db `postgres`, amostras de migrations correspondem ao repo, mas a paridade falha (§5.5.1) | **MATCH alegado pelo Cline via (c), não reproduzido pelo Codex** — leituras permitidas apenas após handshake da sessão; mutações = Classe D e exigem aprovação explícita |
| Vercel | conta/projeto `juca1/zapp-web-v2`, project id `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp` | GET público retornou 200 e o repo contém SPA rewrite; conta e project id não foram consultados na API | **PARTIAL** — superfície disponível, identidade do projeto não comprovada |
| Evolution GO | host público, VPS Hostinger e projeto `evolution-go-rxj2` documentados no handoff | GET `/` retornou 404; não havia MCP Hostinger para confirmar VPS, projeto, containers ou portas | **PARTIAL** — host respondeu, identidade interna não comprovada |

Evidência adicional Supabase: `scripts/db-audit/database-identity.json` exige `server_major=17` e `connection_provider=supabase-cloud` — o MCP self-hosted da sessão (15.8, IP privado) falha nos dois critérios; o MCP dedicado da §5.5.1 (PG 17.6, perfil Cloud) satisfaz ambos.

## 3. Decisões pendentes

- **[VERIFICADO PELO CLINE; NÃO REPRODUZIDO PELO CODEX EM 2026-08-30]** O Cline relatou identidade oficial via MCP HTTP dedicado `supabase-zapp-web-v2-mcp` (PG 17.6; §5.5.1). O MCP disponível ao Codex retornou 401, portanto a auditoria independente mantém esta evidência como parcial. Regras: leituras pelo conector só são Classe A após handshake da própria sessão; **mutações (DDL/DML, `db_apply_migration`, escritas em auth/storage/functions) são Classe D e exigem aprovação explícita**. O URL (com token) é segredo e não foi registrado neste repo (etapa 006). O MCP self-hosted da sessão (PG 15.8) e o endpoint que retornou `401` ao Codex permanecem proibidos. Porções remotas das etapas 010, 061–070, 084 e 095–099: **escrita bloqueada sem aprovação**.
- **[DRIFT PRELIMINAR]** `db_migrations` remoto lista 17 versões `20260830010000`–`20260830161547`; o repo tem arquivo local apenas para `20260830153000` → **16 versões remotas sem arquivo local** (`_superseded/` e `_foreign/` não as contêm). Classificação formal (PARITY / EXPECTED_DIFFERENCE / DRIFT_BLOCKING) pertence à etapa 010 — nenhuma ação tomada.
- **[BLOQUEIO PARCIAL]** MCP Hostinger ausente na sessão: verificação interna da Evolution GO (containers, portas) pendente; somente verificação de superfície (HTTP) foi feita.
- **[BLOQUEIO PARCIAL]** Vercel respondeu publicamente, mas conta e project id não foram provados por API/CLI autenticada; nenhuma ação externa Vercel está autorizada.
- **[DECISÃO PENDENTE — SEGURANÇA]** Uma credencial Vercel foi publicada em chat (flagrada pela auditoria Codex) e aguarda decisão independente do proprietário: rotação/revogação (Classe D) ou aceite formal de risco com prazo. Não foi copiada para este repositório. Enquanto pendente, a etapa 006 permanece IN_PROGRESS.
- **[DIVERGÊNCIA]** `.nvmrc` declara Node 20 enquanto a CI fixa Node 24 e a máquina local roda 24.19.0 — alinhar na etapa 014, depois de reproduzir e revisar o impacto.
- **[DOC]** `AGENTS.md` raiz não existe (apenas `.codex/AGENTS.md`, que o referencia como baseline); `graphify-out/` ausente apesar da seção graphify em `CLAUDE.md` — ambos previstos para tratamento nas etapas 039/040/094.
- **[SEGURANÇA]** A etapa 006 canônica trata o URL autenticado do MCP como credencial exposta; ela não autoriza alteração de workflows nem rotação sem aprovação Classe D.
- Nenhuma ação Classe C ou D foi executada. As mudanças documentais locais são Classe B.

## 4. Tabela de estados das 100 etapas

| ID | Título | Estado | Evidência | Commit | Notas |
|---|---|---|---|---|---|
| 001 | Ler as regras e declarar entendimento | VERIFIED | log §5.1 + auditoria Codex | 1a47bb44 + correção Codex | Classes A–D reconciliadas com o handoff |
| 002 | Sincronizar a base de trabalho sem destruir alterações | VERIFIED | log §5.2 + Git | 1a47bb44 | HEAD-base == origin/main 19b0f644; nenhuma mudança descartada |
| 003 | Fixar e registrar o ambiente de ferramentas | VERIFIED | log §5.3 | 1a47bb44 | install frozen OK; bun.lock intacto; `.nvmrc` pendente na 014 |
| 004 | Criar o diário de execução e a matriz de decisões | VERIFIED | log §5.4.1 + auditoria Codex | correção Codex | 100 IDs/títulos canônicos reconciliados |
| 005 | Verificar identidades de todos os alvos sem mutação | BLOCKED | log §5.5 + §5.5.1 + auditoria Codex | 1a47bb44 + correção Codex | Supabase MATCH relatado pelo Cline, mas não reproduzido pelo Codex; Vercel/Evolution ainda parciais |
| 006 | Tratar o URL autenticado do MCP como credencial exposta | IN_PROGRESS | log §5.6 + auditoria Codex | 6cab178a | MCP: ACCEPTED_TEMPORARY_RISK (adm01, até 2026-09-06); credencial Vercel: decisão independente pendente |
| 007 | Inventariar superfícies de segredo e dados sensíveis | NOT_STARTED | — | — |  |
| 008 | Capturar o baseline completo da revisão atual | NOT_STARTED | — | — |  |
| 009 | Capturar baseline de UX, bundle e rede | NOT_STARTED | — | — |  |
| 010 | Reconciliar migrations do repositório e do banco em modo leitura | NOT_STARTED | — | — | leitura remota liberada (§5.5.1); drift preliminar: 16 versões remotas sem arquivo local |
| 011 | Transformar o audit de dependências em backlog verificável | NOT_STARTED | — | — |  |
| 012 | Corrigir vulnerabilidades diretas em lotes pequenos | NOT_STARTED | — | — |  |
| 013 | Isolar ou substituir a cadeia de planilhas vulnerável | NOT_STARTED | — | — |  |
| 014 | Fixar a toolchain de forma explícita | NOT_STARTED | — | — | inclui reconciliar `.nvmrc` 20 vs CI 24 |
| 015 | Habilitar coverage de fato | NOT_STARTED | — | — |  |
| 016 | Criar ratchet bloqueante para vulnerabilidades | NOT_STARTED | — | — |  |
| 017 | Substituir o grep de secrets por scanner fail-closed | NOT_STARTED | — | — |  |
| 018 | Tornar budgets de bundle executáveis | NOT_STARTED | — | — |  |
| 019 | Otimizar a CI sem reduzir os gates | NOT_STARTED | — | — |  |
| 020 | Formalizar checks obrigatórios e proteção da main | NOT_STARTED | — | — |  |
| 021 | Definir a taxonomia e os contratos da suíte | NOT_STARTED | — | — |  |
| 022 | Eliminar avisos React `act(...)` pela causa raiz | NOT_STARTED | — | — |  |
| 023 | Padronizar mocks Supabase e contratos de erro | NOT_STARTED | — | — |  |
| 024 | Medir coverage por risco, não apenas média global | NOT_STARTED | — | — |  |
| 025 | Implantar coverage ratchet incremental | NOT_STARTED | — | — |  |
| 026 | Cobrir autenticação, sessão, RBAC e troca de usuário | NOT_STARTED | — | — |  |
| 027 | Expandir testes de contrato das Edge Functions | NOT_STARTED | — | — |  |
| 028 | Criar testes locais de migrations, RLS e grants | NOT_STARTED | — | — |  |
| 029 | Implantar Playwright nos fluxos críticos | NOT_STARTED | — | — |  |
| 030 | Automatizar smoke de acessibilidade | NOT_STARTED | — | — |  |
| 031 | Produzir mapa do débito TypeScript estrito | NOT_STARTED | — | — |  |
| 032 | Criar ilhas estritas e ratchet de TypeScript | NOT_STARTED | — | — |  |
| 033 | Sincronizar e confiar nos tipos gerados do Supabase | NOT_STARTED | — | — |  |
| 034 | Remover `any` de fronteiras P0 | NOT_STARTED | — | — |  |
| 035 | Endurecer nullability e acesso a coleções | NOT_STARTED | — | — |  |
| 036 | Classificar a dívida ESLint e limpar configuração | NOT_STARTED | — | — |  |
| 037 | Reduzir lint por ondas sem churn | NOT_STARTED | — | — |  |
| 038 | Mapear ciclos, god modules e dependências cruzadas | NOT_STARTED | — | — |  |
| 039 | Formalizar arquitetura modular orientada a features | NOT_STARTED | — | — |  |
| 040 | Corrigir governança de ADRs e documentação conflitante | NOT_STARTED | — | — |  |
| 041 | Gerar mapa de bundle por rota e dependência | NOT_STARTED | — | — |  |
| 042 | Reduzir JavaScript realmente inicial | NOT_STARTED | — | — |  |
| 043 | Reduzir CSS inicial e duplicação de estilos | NOT_STARTED | — | — |  |
| 044 | Carregar Mapbox, PDF, charts e planilhas apenas sob demanda | NOT_STARTED | — | — |  |
| 045 | Otimizar ícones, UI e renderização de listas | NOT_STARTED | — | — |  |
| 046 | Resolver estratégia de source maps e Sentry | NOT_STARTED | — | — |  |
| 047 | Substituir Web Vitals manual por telemetria correta | NOT_STARTED | — | — |  |
| 048 | Auditar React Query, chamadas redundantes e cache | NOT_STARTED | — | — |  |
| 049 | Executar auditoria manual WCAG 2.2 AA | NOT_STARTED | — | — |  |
| 050 | Instituir gate Lighthouse e matriz responsiva | NOT_STARTED | — | — |  |
| 051 | Inventariar APIs, consumidores e trust boundaries | NOT_STARTED | — | — |  |
| 052 | Auditar toda exceção `verify_jwt = false` | NOT_STARTED | — | — |  |
| 053 | Endurecer o webhook Evolution contra spoofing e replay | NOT_STARTED | — | — |  |
| 054 | Endurecer Gmail, ElevenLabs, cron e public API | NOT_STARTED | — | — |  |
| 055 | Implementar rate limiting distribuído | NOT_STARTED | — | — |  |
| 056 | Validar payloads e normalizar erros em todas as fronteiras | NOT_STARTED | — | — |  |
| 057 | Restringir CORS e métodos por endpoint | NOT_STARTED | — | — |  |
| 058 | Fechar SSRF, redirects e processamento de URLs | NOT_STARTED | — | — |  |
| 059 | Reduzir privilégios e sanitizar logs | NOT_STARTED | — | — |  |
| 060 | Aplicar headers de segurança e CSP por etapas | NOT_STARTED | — | — |  |
| 061 | Resolver qualquer drift de migrations | NOT_STARTED | — | — | leitura remota liberada (§5.5.1); escrita exige aprovação |
| 062 | Automatizar paridade de schema, catálogo e tipos | NOT_STARTED | — | — |  |
| 063 | Construir matriz RLS multi-tenant com testes negativos | NOT_STARTED | — | — |  |
| 064 | Auditar `SECURITY DEFINER`, grants e `search_path` | NOT_STARTED | — | — |  |
| 065 | Medir queries reais com `pg_stat_statements` | NOT_STARTED | — | — | leitura remota liberada (§5.5.1); escrita exige aprovação |
| 066 | Corrigir a tempestade em `whatsapp_connections` | NOT_STARTED | — | — |  |
| 067 | Otimizar queries e índices com planos comprovados | NOT_STARTED | — | — |  |
| 068 | Auditar Realtime, replica identity e lifecycle de subscriptions | NOT_STARTED | — | — |  |
| 069 | Implementar retenção, minimização e limpeza LGPD | NOT_STARTED | — | — |  |
| 070 | Provar backup, restore e RPO/RTO do banco | NOT_STARTED | — | — |  |
| 071 | Definir arquitetura de observabilidade e taxonomia | NOT_STARTED | — | — |  |
| 072 | Padronizar correlation e causation IDs | NOT_STARTED | — | — |  |
| 073 | Instrumentar erros e releases do frontend | NOT_STARTED | — | — |  |
| 074 | Instrumentar Edge Functions e dependências externas | NOT_STARTED | — | — |  |
| 075 | Monitorar Evolution GO e a VPS Hostinger | NOT_STARTED | — | — |  |
| 076 | Consolidar idempotência, DLQ e replay de webhooks | NOT_STARTED | — | — |  |
| 077 | Definir SLOs, SLIs e alertas acionáveis | NOT_STARTED | — | — |  |
| 078 | Atualizar runbooks por sintoma e decisão | NOT_STARTED | — | — |  |
| 079 | Executar game days controlados | NOT_STARTED | — | — |  |
| 080 | Instituir post-mortem sem culpa e métricas DORA | NOT_STARTED | — | — |  |
| 081 | Formalizar ambientes e identity guards | NOT_STARTED | — | — |  |
| 082 | Criar preview seguro e dados determinísticos | NOT_STARTED | — | — |  |
| 083 | Endurecer deploy e rollback Vercel | NOT_STARTED | — | — |  |
| 084 | Endurecer deploy de Edge Functions e migrations | NOT_STARTED | — | — |  |
| 085 | Governar Evolution GO como serviço crítico | NOT_STARTED | — | — |  |
| 086 | Instituir ciclo de vida de secrets | NOT_STARTED | — | — |  |
| 087 | Criar orçamento e observabilidade de custos | NOT_STARTED | — | — |  |
| 088 | Reconciliar documentação técnica com o sistema atual | NOT_STARTED | — | — |  |
| 089 | Definir ownership, ADR/RFC e review baseado em risco | NOT_STARTED | — | — |  |
| 090 | Tornar onboarding e ambiente local reproduzíveis | NOT_STARTED | — | — |  |
| 091 | Decidir e concluir a estratégia PWA | NOT_STARTED | — | — |  |
| 092 | Fechar matriz de browsers, dispositivos e conectividade | NOT_STARTED | — | — |  |
| 093 | Ratificar modular monolith vs microsserviços | NOT_STARTED | — | — |  |
| 094 | Definir versionamento e compatibilidade de contratos | NOT_STARTED | — | — |  |
| 095 | Executar exercício completo de disaster recovery | NOT_STARTED | — | — |  |
| 096 | Rodar auditoria da release candidata | NOT_STARTED | — | — |  |
| 097 | Fechar P0/P1 e consolidar o registro de dívida | NOT_STARTED | — | — |  |
| 098 | Congelar o candidato e obter aprovação de release | NOT_STARTED | — | — |  |
| 099 | Fazer canary, promover e observar | NOT_STARTED | — | — | Classe D; depende de aprovação explícita |
| 100 | Publicar relatório final e iniciar ciclo contínuo | NOT_STARTED | — | — |  |

---

## 5. Log detalhado por etapa

### 5.1 — Etapa 001: Ler as regras e declarar entendimento

- **Estado:** VERIFIED
- **Fontes lidas integralmente:** `CLAUDE.md`; `.codex/AGENTS.md` (o `AGENTS.md` raiz referenciado não existe — registrado em Decisões pendentes); `.agents/skills/zapp-web-v2/SKILL.md` (skill `zapp-web-v2-conventions` também invocada); `docs/handoffs/handoff_cline_100_etapas_2026_08_30.md` (1292 linhas, 10 ondas, 100 etapas, gates e seções 6–8).
- **Entendimento declarado:**
  - **Alvos:** repo `adm01-debug/Zapp_Web_V2` @ `origin/main` (`19b0f644…`); Supabase Cloud `tnnnlkbymytvtqngbbqh` (PG 17.6) — único banco oficial; Vercel (front `zapp-web-v2.vercel.app`); Evolution GO na Hostinger `srv1481814` (projeto `evolution-go-rxj2`).
  - **Classes de ação:** A = leitura; B = escrita reversível local; C = escrita remota reversível; D = produção/sensível. Ações C e D exigem a aprovação definida no handoff. Nenhuma classe adicional foi criada.
  - **Método de prova:** comandos + outputs registrados neste diário; estado VERIFIED só com evidência completa; SKIPPED_WITH_EVIDENCE quando já resolvido.
  - **Sequência:** 10 ondas de 10 etapas com gate ao final de cada onda; dependências respeitadas; nenhuma etapa pulada silenciosamente.
  - **Restrições de segurança:** nunca expor segredos/URLs autenticadas; nunca usar outro projeto Supabase; preservar mudanças preexistentes (sem reset --hard, clean -fd, checkout destrutivo ou force push).

### 5.2 — Etapa 002: Sincronizar a base de trabalho sem destruir alterações

- **Estado:** VERIFIED
- **Comandos:** `git status -sb` → `## main...origin/main [behind 1]` + 1 untracked (o próprio handoff, preservado); `git fetch origin --prune`; `git rev-parse origin/main` → `19b0f6448910bcb29ccd9ddd964f99a303a823b0` (idêntico à base declarada no handoff); `git switch -c chore/excellence-wave-01 origin/main`.
- **Prova:** `HEAD == origin/main` → MATCH (`19b0f644…`); `git status -sb` final → `## chore/excellence-wave-01...origin/main` + handoff untracked intacto.
- **Nota:** o arquivo `docs/handoffs/handoff_cline_100_etapas_2026_08_30.md` (untracked, mudança preexistente do usuário) foi preservado pelo Cline. O Codex o incluiu no commit corretivo para tornar a branch autocontida, sem alterar seu conteúdo.

### 5.3 — Etapa 003: Fixar e registrar o ambiente de ferramentas

- **Estado:** VERIFIED
- **Comandos e outputs:** `uname -srmo` → Linux 6.18.33.2-microsoft-standard-WSL2 x86_64 GNU/Linux; `node --version` → v24.19.0; `bun --version` → 1.4.0; `git --version` → 2.43.0; `psql --version` → ausente; `.nvmrc` → 20 (divergente da CI=24, registrado).
- **CI confere:** `ci.yml` usa `actions/setup-node` node-version 24 e `oven-sh/setup-bun` bun-version 1.4.0 em todos os jobs (5 ocorrências); `supabase-sync.yml` idem; `types-sync.yml` usa bun 1.4.0.
- **Instalação congelada:** `bun install --frozen-lockfile` → exit 0, 903 installs/987 packages, no changes; `git status --porcelain bun.lock` → vazio.
- **Rollback:** nenhuma alteração versionada; `node_modules/` apenas sincronizado. A divergência `.nvmrc` 20 vs CI 24 pertence à etapa 014.

### 5.4 — Etapa 004: Criar o diário de execução e a matriz de decisões

- **Estado:** IN_PROGRESS no artefato do Cline → VERIFIED após a reconciliação corretiva e a prova em §5.4.1.
- **Artefato:** este arquivo, `docs/handoffs/cline_execution_log_2026_08_30.md`, com tabela de 100 etapas (seção 4), Decisões pendentes (seção 3) e log detalhado (seção 5).
- **Causa raiz da correção:** o script temporário do Cline comprovou somente quantidade/ordem de IDs, mas o conteúdo salvo divergia do handoff em 94/100 títulos. O Codex reconciliou a tabela diretamente com os 100 headings canônicos do handoff e adicionou comparação exata de títulos ao gate.

#### 5.4.1 — Prova da etapa 004

Comandos executados em 2026-08-30 sobre o arquivo gerado:

| Verificação | Resultado |
|---|---|
| Títulos esperados extraídos de `^### (\d{3}) — (.+)$` | **100** |
| Linhas de etapa no diário | **100** |
| IDs ausentes / duplicados / fora de ordem | **0 / 0 / 0** |
| Divergências exatas de título handoff↔diário | **0** após correção; eram **94** no artefato do Cline |
| Seção `## 3. Decisões pendentes` presente | **1** ocorrência |
| Estados iniciais 001–005 | 001=VERIFIED, 002=VERIFIED, 003=VERIFIED, 004=VERIFIED, 005=BLOCKED |

Critério de aceite da etapa 004 (100 linhas + IDs/títulos canônicos únicos e ordenados + Decisões pendentes) **cumprido após correção do Codex**.

### 5.5 — Etapa 005: Verificar identidades de todos os alvos sem mutação

- **Estado:** BLOCKED
- **GitHub:** `github_get_repo(adm01-debug/zapp-web-v2)` → `adm01-debug/Zapp_Web_V2`, público, `default_branch=main`, permissões admin/push, secret scanning + push protection ativos. **MATCH.**
- **Supabase:** `supabase/config.toml` → `project_id = tnnnlkbymytvtqngbbqh`; `database-identity.json` → supabase-cloud, PG 17. MCP da sessão → 10.0.1.132, PG 15.8 → **MISMATCH declarado**; nenhum SQL oficial será executado por este MCP. Nenhuma escrita foi feita.
- **Vercel:** `homepage` do repo e GET público retornaram 200, mas conta e project id não foram consultados em fonte autenticada. **PARTIAL.**
- **Evolution GO:** GET no host documentado retornou 404 sem credenciais, mas VPS/projeto/containers/portas não foram consultados. **PARTIAL.**
- **Supabase — auditoria Codex:** a tentativa read-only pelo MCP disponível terminou em `401 Unauthorized` antes da query; ela não comprova o projeto oficial e não autoriza fallback para outro banco.
- **Critério de aceite:** **não cumprido integralmente**. GitHub está confirmado; Supabase está bloqueado; Vercel e Evolution têm apenas evidência superficial. Toda ação externa relacionada continua proibida.

### 5.5.1 — Re-verificação Supabase via MCP dedicado (2026-08-30, Cline)

- **Fonte:** o usuário forneceu o URL do MCP HTTP dedicado `supabase-zapp-web-v2-mcp` **v1.1.2** (Cloudflare Workers; protocolo MCP 2024-11-05, JSON-RPC stateless). O URL contém token e **não é reproduzido neste repositório** (tratado na etapa 006). É o mesmo conector documentado em `docs/migration/HANDOFF.md` ("Worker MCP do destino", 77 tools).
- **Handshake:** `initialize` OK (capabilities: `tools`); `tools/list` → **77 ferramentas** (`db_*`, `storage_*`, `auth_*`, `functions_*`).
- **Identidade (somente leitura):** `db_health` → `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`, user `postgres`; `db_connection_info` → version `17.6`, db `postgres`, `max_connections=60` (perfil Supabase Cloud). Satisfaz `scripts/db-audit/database-identity.json` (`server_major=17`, `connection_provider=supabase-cloud`).
- **Cross-check de migrations:** `db_migrations` lista `20260830153000 webhook_failures_dead_letter`, `20260829120000 revoke_anon_ai_providers`, `20260829110000 gmail_incremental_sync_cron` etc., conferindo com `supabase/migrations/` do repo → **confirmado: é o banco do projeto oficial `tnnnlkbymytvtqngbbqh`**.
- **Drift preliminar:** 17 versões remotas `20260830010000`–`20260830161547`; arquivo local existe apenas para `20260830153000` → **16 versões remotas sem arquivo local**. Classificação formal = etapa 010.
- **Estado:** **MATCH relatado pelo Cline** para Supabase e **não reproduzido pelo Codex**. A etapa 005 permanece BLOCKED por Vercel (conta/project id sem prova autenticada), Evolution GO (sem MCP Hostinger) e pela limitação de verificação independente. Leituras exigem handshake da sessão; mutações são Classe D com aprovação explícita.

### 5.6 — Etapa 006: Tratar o URL autenticado do MCP como credencial exposta

- **Estado:** IN_PROGRESS. URL do MCP: ausência comprovada e decisão **`ACCEPTED_TEMPORARY_RISK`** registrada abaixo (proprietário adm01, prazo 2026-09-06). Escopo ampliado pela auditoria Codex: uma credencial Vercel também foi publicada em conversa e **permanece pendente** de decisão independente (rotação/revogação ou aceite formal), sem ser copiada para este arquivo.
- **Executar (concluído):** o URL não foi copiado para nenhum artefato. Busca de persistência por fragmento não secreto (8 chars) e pelo domínio:
  - Working tree (exceto `.git`/`node_modules`): fragmento do token **ausente**; `workers.dev` ocorre apenas em `docs/migration/HANDOFF.md` (placeholder `<MCP_TOKEN>`), `docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` e `tmp/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` (host `evolution-mcp`, sem token) — nenhum segredo real.
  - Histórico Git (todos os refs, 6.980 commits): `git log -S<fragmento> --all` → **0 ocorrências**; pickaxe do domínio mostra apenas commits documentais com placeholder.
- **Verificar (concluído):** ausência comprovada no repositório e nos arquivos locais versionáveis, sem imprimir a credencial.
- **Procedimento de rotação (preparado, NÃO executado — rotação é Classe D):**
  1. Gerar novo token aleatório (≥ 32 hex) fora deste chat.
  2. Atualizar o segredo/rota do Worker `supabase-zapp-web-v2-mcp` na Cloudflare e redeploy conforme `docs/migration/HANDOFF.md` (`cf_worker_deploy`).
  3. Atualizar os conectores clientes (conector Claude "SUPABASE - ZAPP WEB V2 - MCP"; sessões Cline/Codex) com o novo URL.
  4. Confirmar que o path antigo retorna 401/404 e revogá-lo.
  5. Registrar aqui apenas data/executor — jamais valores antigo/novo.
- **Decisão registrada:** **`ACCEPTED_TEMPORARY_RISK`** — proprietário: usuário (adm01), 2026-08-30. **Prazo:** até **2026-09-06** ou imediatamente antes de qualquer ação Classe C/D em banco — o que ocorrer primeiro. O procedimento de rotação acima permanece preparado; ao expirar o prazo ou antes de escrita em banco, a rotação (Classe D) será requisitada ao proprietário. O Cline **para antes de executar** qualquer rotação.

<!-- Próxima etapa canônica: 007 — inventariar superfícies de segredo e dados sensíveis. Etapa 006: URL do MCP decidido (ACCEPTED_TEMPORARY_RISK, prazo 2026-09-06); credencial Vercel ainda pendente. -->
