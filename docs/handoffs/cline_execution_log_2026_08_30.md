# Diário de Execução — Programa de 100 Etapas (Cline)

> **Branch de trabalho:** `chore/excellence-wave-01`
> **Base:** `origin/main` @ `19b0f6448910bcb29ccd9ddd964f99a303a823b0`
> **Data de início:** 2026-08-30 (America/Sao_Paulo)
> **Executor:** Cline — Full Stack Sênior
> **Handoff de origem:** `docs/handoffs/handoff_cline_100_etapas_2026_08_30.md`
> **Estados:** NOT_STARTED | IN_PROGRESS | BLOCKED | VERIFIED | SKIPPED_WITH_EVIDENCE

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
| `.nvmrc` | `20` | 24 | DIVERGENTE → corrigir na etapa 007 ou 094 |

Instalação congelada: `bun install --frozen-lockfile` → exit 0, "Checked 903 installs across 987 packages (no changes)"; `git status --porcelain bun.lock` vazio → **bun.lock intacto**.

## 2. Verificação de identidades (Etapa 005)

| Alvo | Esperado | Observado | Status |
|---|---|---|---|
| GitHub repo | `adm01-debug/zapp-web-v2`, default `main` | `adm01-debug/Zapp_Web_V2` (match case-insensitive), `default_branch=main`, permissões admin/push, `pushed_at` 2026-08-30T16:05:54Z | **MATCH** |
| Supabase oficial | project `tnnnlkbymytvtqngbbqh`, PostgreSQL 17.6, Supabase Cloud | MCP da sessão = `SUPABASE SELF HOSTED - MCP` → `10.0.1.132:5432`, db `postgres`, PostgreSQL **15.8**, SSL off | **MISMATCH** — este MCP NÃO será usado para SQL oficial (ver Decisões pendentes) |
| Vercel | front do projeto, homepage `https://zapp-web-v2.vercel.app` | GET `/` → HTTP 200; `homepage` do repo confere; `vercel.json` = SPA rewrites | **MATCH** (superfície; sem token de API na sessão) |
| Evolution GO | `https://evolution-go-rxj2.srv1481814.hstgr.cloud`, VPS Hostinger `srv1481814`, projeto `evolution-go-rxj2` | GET `/` → HTTP 404 sem credenciais (serviço no ar; rotas reais exigem auth). Sem MCP HOSTINGER na sessão → hostname/porta de container não verificáveis | **MATCH** de superfície / verificação interna pendente |

Evidência adicional Supabase: `scripts/db-audit/database-identity.json` exige `server_major=17` e `connection_provider=supabase-cloud` — o MCP da sessão (15.8, IP privado) falha nos dois critérios.

## 3. Decisões pendentes

- **[BLOQUEIO PARCIAL]** O MCP Supabase desta sessão aponta para um Postgres self-hosted (10.0.1.132, PG 15.8) que **não é** o projeto oficial `tnnnlkbymytvtqngbbqh` (PG 17.6, Cloud). Toda etapa que exigir SQL/verificação no banco oficial (ex.: 011, 020, 025–030, 091) fica **bloqueada na porção de banco** até que um MCP confirmadamente ligado a `tnnnlkbymytvtqngbbqh` esteja disponível, ou que o usuário autorize outro caminho verificado.
- **[BLOQUEIO PARCIAL]** MCP Hostinger ausente na sessão: verificação interna da Evolution GO (containers, portas) pendente; somente verificação de superfície (HTTP) foi feita.
- **[DIVERGÊNCIA]** `.nvmrc` declara Node 20 enquanto a CI fixa Node 24 e a máquina local roda 24.19.0 — alinhar na etapa 007 (workflows) ou 094 (docs).
- **[DOC]** `AGENTS.md` raiz não existe (apenas `.codex/AGENTS.md`, que o referencia como baseline); `graphify-out/` ausente apesar da seção graphify em `CLAUDE.md` — ambos previstos para tratamento nas etapas 039/040/094.
- Nenhuma aprovação de Classe B externa solicitada até aqui: todas as ações desta onda foram leituras, testes e alterações locais reversíveis.

## 4. Tabela de estados das 100 etapas

| ID | Título | Estado | Evidência | Commit | Notas |
|---|---|---|---|---|---|
| 001 | Ler regras e declarar entendimento | VERIFIED | log §5.1 | 1a47bb44 | 4 fontes lidas integralmente |
| 002 | Sincronizar base de trabalho sem destruir mudanças | VERIFIED | log §5.2 | 1a47bb44 | HEAD == origin/main 19b0f644 |
| 003 | Corrigir e registrar ambiente de ferramentas | VERIFIED | log §5.3 | 1a47bb44 | install frozen OK; bun.lock intacto |
| 004 | Criar diário de execução e rastreabilidade | VERIFIED | log §5.4.1 | 1a47bb44 | 100 linhas, IDs 001–100 únicos em ordem |
| 005 | Verificar identidades de todos os alvos sem mutação | VERIFIED | log §5.5 | 1a47bb44 | Supabase MCP da sessão = MISMATCH |
| 006 | Corrigir gatilhos da CI para todo PR e pushes na main | NOT_STARTED | — | — |  |
| 007 | Fixar Node 24 e Bun 1.4.0 em todos os workflows | NOT_STARTED | — | — |  |
| 008 | Tornar o gate de segurança estrito | NOT_STARTED | — | — |  |
| 009 | Unificar pipeline de verificação | NOT_STARTED | — | — |  |
| 010 | Separar workflows agendados de código e de banco ao vivo | NOT_STARTED | — | — |  |
| 011 | Corrigir credenciais e migrações do Supabase | NOT_STARTED | — | — |  |
| 012 | Blindar deploy-functions e fluxos destrutivos | NOT_STARTED | — | — |  |
| 013 | Padronizar sincronização de tipos com PR auditável | NOT_STARTED | — | — |  |
| 014 | Rodar auditoria de vulnerabilidades com gate por severidade | NOT_STARTED | — | — |  |
| 015 | Estabelecer política de exceções de segurança | NOT_STARTED | — | — |  |
| 016 | Aplicar updates automatizados seguros | NOT_STARTED | — | — |  |
| 017 | Criar inventário de dependências e licenças | NOT_STARTED | — | — |  |
| 018 | Definir budgets de performance aprovados | NOT_STARTED | — | — |  |
| 019 | Adotar ratchets para dívida técnica | NOT_STARTED | — | — |  |
| 020 | Tornar guardas de banco bloqueantes em PR | NOT_STARTED | — | — |  |
| 021 | Fechar verificação JWT nas Edge Functions | NOT_STARTED | — | — |  |
| 022 | Adicionar autenticação alternativa nas funções verify_jwt=false | NOT_STARTED | — | — |  |
| 023 | Padronizar validação com zod em function-elog | NOT_STARTED | — | — |  |
| 024 | Implementar rate limiting e proteção contra replay | NOT_STARTED | — | — |  |
| 025 | Classificar dados e revisar políticas RLS | NOT_STARTED | — | — |  |
| 026 | Testar políticas RLS com papéis reais | NOT_STARTED | — | — |  |
| 027 | Corrigir ACL do executor de RPCs | NOT_STARTED | — | — |  |
| 028 | Sincronizar migrations, catálogo e ledger | NOT_STARTED | — | — |  |
| 029 | Monitorar drift do banco ao vivo | NOT_STARTED | — | — |  |
| 030 | Inventariar políticas de Storage e retenção de logs | NOT_STARTED | — | — |  |
| 031 | Instrumentar frontend com Web Vitals reais | NOT_STARTED | — | — |  |
| 032 | Adicionar tracing estruturado nas Edge Functions | NOT_STARTED | — | — |  |
| 033 | Criar smoke test pós-deploy | NOT_STARTED | — | — |  |
| 034 | Criar runbook operacional | NOT_STARTED | — | — |  |
| 035 | Definir orçamento operacional | NOT_STARTED | — | — |  |
| 036 | Fixar TypeScript com baseline de erros | NOT_STARTED | — | — |  |
| 037 | Ativar ESLint flat config completa com ratchet | NOT_STARTED | — | — |  |
| 038 | Mapear dependências internas e hotspots de acoplamento | NOT_STARTED | — | — |  |
| 039 | Formalizar arquitetura modular orientada a features | NOT_STARTED | — | — |  |
| 040 | Corrigir governança de ADRs e documentação conflitante | NOT_STARTED | — | — |  |
| 041 | Gerar mapa de bundle por rota e dependência | NOT_STARTED | — | — |  |
| 042 | Reduzir JavaScript realmente inicial | NOT_STARTED | — | — |  |
| 043 | Reduzir CSS inicial e duplicação de estilos | NOT_STARTED | — | — |  |
| 044 | Otimizar imagens, fontes e mídia | NOT_STARTED | — | — |  |
| 045 | Reduzir re-renderizações em rotas críticas | NOT_STARTED | — | — |  |
| 046 | Virtualizar listas longas e otimizar filtros | NOT_STARTED | — | — |  |
| 047 | Corrigir cache de server state e invalidações | NOT_STARTED | — | — |  |
| 048 | Aplicar code splitting nas dependências pesadas | NOT_STARTED | — | — |  |
| 049 | Executar baseline WCAG 2.2 AA com axe | NOT_STARTED | — | — |  |
| 050 | Corrigir fluxo por teclado, foco e alvos de toque | NOT_STARTED | — | — |  |
| 051 | Adicionar CI visual e de acessibilidade | NOT_STARTED | — | — |  |
| 052 | Medir cobertura real por risco | NOT_STARTED | — | — |  |
| 053 | Testar helpers críticos com propriedades e mutação seletiva | NOT_STARTED | — | — |  |
| 054 | Testar hooks críticos com contratos explícitos | NOT_STARTED | — | — |  |
| 055 | Cobrir componentes críticos com testes de acessibilidade | NOT_STARTED | — | — |  |
| 056 | Criar testes de integração frontend + Supabase | NOT_STARTED | — | — |  |
| 057 | Criar testes de integração das Edge Functions | NOT_STARTED | — | — |  |
| 058 | Criar suite E2E dos fluxos críticos | NOT_STARTED | — | — |  |
| 059 | Estabilizar E2E com seeds e massa de dados | NOT_STARTED | — | — |  |
| 060 | Rodar E2E multi-navegador com relatório rico | NOT_STARTED | — | — |  |
| 061 | Testar contrato de toda Edge Function | NOT_STARTED | — | — |  |
| 062 | Testar contrato de leitura dos bancos externos | NOT_STARTED | — | — |  |
| 063 | Testar compatibilidade do fluxo Evolution GO | NOT_STARTED | — | — |  |
| 064 | Criar verificação de tipos gerados | NOT_STARTED | — | — |  |
| 065 | Introduzir contract review obrigatória em PR | NOT_STARTED | — | — |  |
| 066 | Criar linters de naming e convenções | NOT_STARTED | — | — |  |
| 067 | Adotar Conventional Commits e Changesets | NOT_STARTED | — | — |  |
| 068 | Automatizar release notes e changelog | NOT_STARTED | — | — |  |
| 069 | Configurar Dependabot ou Renovate com política | NOT_STARTED | — | — |  |
| 070 | Criar triagem semanal de issues e PRs | NOT_STARTED | — | — |  |
| 071 | Medir cobertura por módulo com floor incremental | NOT_STARTED | — | — |  |
| 072 | Rodar análise estática de segurança em PR | NOT_STARTED | — | — |  |
| 073 | Criar threat model vivo | NOT_STARTED | — | — |  |
| 074 | Testar backup e restauração | NOT_STARTED | — | — |  |
| 075 | Definir retenção de logs e lifecycle de storage | NOT_STARTED | — | — |  |
| 076 | Definir SLOs e alertas operacionais | NOT_STARTED | — | — |  |
| 077 | Criar dashboard único de saúde | NOT_STARTED | — | — |  |
| 078 | Configurar alertas com severidade e ação | NOT_STARTED | — | — |  |
| 079 | Rodar game day de incidente | NOT_STARTED | — | — |  |
| 080 | Criar revisão semanal de confiabilidade | NOT_STARTED | — | — |  |
| 081 | Revisar lifecycle completo de segredos | NOT_STARTED | — | — |  |
| 082 | Eliminar segredos versionados e adicionar canários | NOT_STARTED | — | — |  |
| 083 | Criar runbook de rotação de credenciais | NOT_STARTED | — | — |  |
| 084 | Endurecer Vercel com headers e políticas | NOT_STARTED | — | — |  |
| 085 | Revisar domínios, DNS e exposições | NOT_STARTED | — | — |  |
| 086 | Auditar rede, portas e TLS da Evolution GO | NOT_STARTED | — | — |  |
| 087 | Definir governança de MCPs e ferramentas externas | NOT_STARTED | — | — |  |
| 088 | Criar política de logging sem dados sensíveis | NOT_STARTED | — | — |  |
| 089 | Revisar permissões e acessos | NOT_STARTED | — | — |  |
| 090 | Conduzir exercício de resposta a incidente | NOT_STARTED | — | — |  |
| 091 | Validar E35 dead-letter e webhooks | NOT_STARTED | — | — |  |
| 092 | Concluir consolidação de clients de bancos externos | NOT_STARTED | — | — |  |
| 093 | Completar migração Evolution GO | NOT_STARTED | — | — |  |
| 094 | Sincronizar README, CLAUDE.md e docs com a realidade | NOT_STARTED | — | — |  |
| 095 | Corrigir .env.example e onboarding | NOT_STARTED | — | — |  |
| 096 | Publicar ADRs das decisões de agosto de 2026 | NOT_STARTED | — | — |  |
| 097 | Preparar release v1.0.0 com evidência de gates | NOT_STARTED | — | — |  |
| 098 | Ensaiar rollback de release | NOT_STARTED | — | — |  |
| 099 | Fechar governança final e auditoria de evidências | NOT_STARTED | — | — |  |
| 100 | Concluir o programa com excelência verificável | NOT_STARTED | — | — |  |

---

## 5. Log detalhado por etapa

### 5.1 — Etapa 001: Ler regras e declarar entendimento

- **Estado:** VERIFIED
- **Fontes lidas integralmente:** `CLAUDE.md`; `.codex/AGENTS.md` (o `AGENTS.md` raiz referenciado não existe — registrado em Decisões pendentes); `.agents/skills/zapp-web-v2/SKILL.md` (skill `zapp-web-v2-conventions` também invocada); `docs/handoffs/handoff_cline_100_etapas_2026_08_30.md` (1292 linhas, 10 ondas, 100 etapas, gates e seções 6–8).
- **Entendimento declarado:**
  - **Alvos:** repo `adm01-debug/Zapp_Web_V2` @ `origin/main` (`19b0f644…`); Supabase Cloud `tnnnlkbymytvtqngbbqh` (PG 17.6) — único banco oficial; Vercel (front `zapp-web-v2.vercel.app`); Evolution GO na Hostinger `srv1481814` (projeto `evolution-go-rxj2`).
  - **Classes de ação:** A (leitura/local reversível) executável autonomamente; B externa (SQL no banco oficial, migrations ao vivo, workflows, push/merge, publicações, VPS/Evolution) **exige aprovação explícita**; F (apagar dados/arquivos materiais) sempre pede confirmação. Nesta onda 1, nenhuma ação B externa foi executada.
  - **Método de prova:** comandos + outputs registrados neste diário; estado VERIFIED só com evidência completa; SKIPPED_WITH_EVIDENCE quando já resolvido.
  - **Sequência:** 10 ondas de 10 etapas com gate ao final de cada onda; dependências respeitadas; nenhuma etapa pulada silenciosamente.
  - **Restrições de segurança:** nunca expor segredos/URLs autenticadas; nunca usar outro projeto Supabase; preservar mudanças preexistentes (sem reset --hard, clean -fd, checkout destrutivo ou force push).

### 5.2 — Etapa 002: Sincronizar base de trabalho sem destruir mudanças

- **Estado:** VERIFIED
- **Comandos:** `git status -sb` → `## main...origin/main [behind 1]` + 1 untracked (o próprio handoff, preservado); `git fetch origin --prune`; `git rev-parse origin/main` → `19b0f6448910bcb29ccd9ddd964f99a303a823b0` (idêntico à base declarada no handoff); `git switch -c chore/excellence-wave-01 origin/main`.
- **Prova:** `HEAD == origin/main` → MATCH (`19b0f644…`); `git status -sb` final → `## chore/excellence-wave-01...origin/main` + handoff untracked intacto.
- **Nota:** o arquivo `docs/handoffs/handoff_cline_100_etapas_2026_08_30.md` (untracked, mudança preexistente do usuário) foi preservado e NÃO incluído em commits meus.

### 5.3 — Etapa 003: Corrigir e registrar ambiente de ferramentas

- **Estado:** VERIFIED
- **Comandos e outputs:** `uname -srmo` → Linux 6.18.33.2-microsoft-standard-WSL2 x86_64 GNU/Linux; `node --version` → v24.19.0; `bun --version` → 1.4.0; `git --version` → 2.43.0; `psql --version` → ausente; `.nvmrc` → 20 (divergente da CI=24, registrado).
- **CI confere:** `ci.yml` usa `actions/setup-node` node-version 24 e `oven-sh/setup-bun` bun-version 1.4.0 em todos os jobs (5 ocorrências); `supabase-sync.yml` idem; `types-sync.yml` usa bun 1.4.0.
- **Instalação congelada:** `bun install --frozen-lockfile` → exit 0, 903 installs/987 packages, no changes; `git status --porcelain bun.lock` → vazio.
- **Rollback:** nenhuma alteração de arquivo; node_modules apenas sincronizado.

### 5.4 — Etapa 004: Criar diário de execução e rastreabilidade

- **Estado:** IN_PROGRESS → VERIFIED após prova em §5.4.1
- **Artefato:** este arquivo, `docs/handoffs/cline_execution_log_2026_08_30.md`, com tabela de 100 etapas (seção 4), Decisões pendentes (seção 3) e log detalhado (seção 5).
- **Geração:** script determinístico `/tmp/gen_execution_log.mjs` (fora do repo) com os 100 títulos extraídos do handoff; assert interno de 100 títulos.

#### 5.4.1 — Prova da etapa 004

Comandos executados em 2026-08-30 sobre o arquivo gerado:

| Verificação | Resultado |
|---|---|
| `grep -cE '^\| [0-9]{3} \|'` (linhas de etapa) | **100** |
| IDs únicos (`sort -u \| wc -l`) | **100** |
| Ordem crescente 001→100 (`sort -c`) | **OK** (sem inversões) |
| Seção `## 3. Decisões pendentes` presente | **1** ocorrência |
| Estados iniciais 001–005 | 001=VERIFIED, 002=VERIFIED, 003=VERIFIED, 004=VERIFIED, 005=VERIFIED |

Critério de aceite da etapa 004 (100 linhas + IDs únicos em ordem crescente + Decisões pendentes) **cumprido**.

### 5.5 — Etapa 005: Verificar identidades de todos os alvos sem mutação

- **Estado:** VERIFIED
- **GitHub:** `github_get_repo(adm01-debug/zapp-web-v2)` → `adm01-debug/Zapp_Web_V2`, público, `default_branch=main`, permissões admin/push, secret scanning + push protection ativos. **MATCH.**
- **Supabase:** `supabase/config.toml` → `project_id = tnnnlkbymytvtqngbbqh`; `database-identity.json` → supabase-cloud, PG 17. MCP da sessão → 10.0.1.132, PG 15.8 → **MISMATCH declarado**; nenhum SQL oficial será executado por este MCP. Nenhuma escrita foi feita.
- **Vercel:** `homepage` do repo e GET em `https://zapp-web-v2.vercel.app/` → 200. **MATCH (superfície).**
- **Evolution GO:** GET em `https://evolution-go-rxj2.srv1481814.hstgr.cloud/` → 404 sem credenciais (host vivo; rotas `/instance/*` exigem auth). Sem MCP Hostinger → verificação interna pendente. **MATCH de superfície + pendência registrada.**
- **Critério de aceite:** tabela da seção 2 declara os quatro alvos com MATCH/MISMATCH explícito antes de qualquer uso; nenhum uso indevido ocorreu.

<!-- Próximas etapas: 006+ — anexar log detalhado aqui. -->
