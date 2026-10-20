# AUDITORIA TÉCNICA EXAUSTIVA — ZAPP WEB V2 (re-auditoria 2026-09-05)

**Data:** 2026-09-05 03:30 UTC · **Executor:** Claude (Arquiteto Sênior + QA) · **Branch auditada:** `main` (HEAD `9aba2de`, 2026-09-04 17:36 UTC)
**Baseline comparada:** `AUDITORIA_TECNICA_22_DIMENSOES_2026-09-02_v2.md` (nota 7.0/10 em `0cbf30d`)

# **Nota geral ponderada: 6.8/10** (▼ −0.2)

> O template pede "22 dimensões" mas lista 20. Este relatório cobre as 20 listadas, com os pesos do template.

Fontes de evidência (tudo verificado nesta sessão; nada herdado do relatório anterior):
- Código em `main@9aba2de` + execução local real: `lint-ratchet`, `typecheck-ratchet`, `supabase-usage-guard`, `check-workflow-pins`, `generate-manifest --check`, `bun audit`, `bun run build`, `vitest` (unit + contratos)
- Banco de produção `tnnnlkbymytvtqngbbqh` via MCP `SUPABASE - ZAPP WEB V2` (`pg_class`, `pg_policies`, `pg_proc`, `information_schema`, `cron.job`, `supabase_migrations`, `storage.buckets`, `auth.*`)
- GitHub API (branch protection, PRs abertos, 40 últimas runs na `main`, CodeQL, Dependabot, secret scanning, log da run falha)
- Vercel API (projeto `zapp_web_v2`, 20 deployments mais recentes)
- `GET /auth/v1/settings` e headers HTTP de `https://zapp-web-v2.vercel.app`
- **NÃO AUDITÁVEL nesta sessão:** VPS Hostinger (MCP `HOSTINGER` não conectado) — firewall da Evolution GO não re-verificado (último estado conhecido: anexado em 2026-09-02, addendum P3)

---

## FASE 0 — INVENTÁRIO DO SISTEMA

| Item | Valor |
|---|---|
| Repositório | `adm01-debug/Zapp_Web_V2`, branch `main`, público · 50 commits nos últimos 7 dias (43 humano/CLI + 7 bot) |
| Stack | React 19.2 + TypeScript 5.8 + Vite 8.2 (Rolldown) + Tailwind 3 + shadcn/Radix + TanStack Query 5 + Zod 4 |
| Backend | Supabase Cloud `tnnnlkbymytvtqngbbqh` — PostgreSQL **17.6**, **57 MB**, 22/60 conexões, cache hit 100% |
| Extensões | pg_stat_statements 1.11, pgcrypto, pg_cron 1.6.4, pg_net, pg_trgm, supabase_vault (4 secrets) |
| Edge Functions | **62** (manifest OK, 80 arquivos, 13.351 LOC) · 7 com `verify_jwt=false` (webhooks, public-api, check-account-lock) |
| WhatsApp | Evolution GO na VPS Hostinger `srv1481814` — 1 conexão `connected` |
| Código | 1.222 arquivos `.ts/.tsx` em `src/` (176.142 LOC, dos quais `types.ts` = 7.997) · 753 componentes · 341 hooks · 12 services |
| Banco | **130 tabelas** (RLS em 130/130) · **378 policies** · 73 funções · 72 triggers · 396 índices · 179 FKs · 7 views · 20 tabelas em realtime · 5 pg_cron ativos (0 falhas em 7d) |
| Storage | 7 buckets, **todos `public=true`** (whatsapp-media 4.254 objetos, audio-messages 1.820, avatars 1.718) |
| Migrations | **370 arquivos** no repo / **375 registradas** no banco → **drift de 5** (ver Dim. 4) |
| Testes | **2.584 passed · 32 skipped · 3 todo** (163 arquivos OK, **1 suite falha local** por `xlsx`) + **167 contratos** |
| CI | 8 workflows, 100% SHA-pinned · CodeQL ativo (8 alertas abertos) · Dependabot 0 alertas · Secret scanning 0 |
| Último deploy prod | Vercel READY em `9aba2de` (2026-09-04 17:36 UTC, `isRollbackCandidate=true`) |
| Dados operacionais | 4 usuários auth (2 admin, 2 agent) · 1.512 contatos · 17.616 mensagens (14.076 nos últimos 7d, última 02:42 UTC hoje) · 0 usuários com MFA verificado |
| Estado CI na `main` | CI/CD ✅ · DB Guard offline ✅ · CodeQL ✅ · types-sync ✅ · **DB Live Guard ❌ (6 runs seguidas em 2026-09-04)** |
| PRs abertos | 4 (#213, #218, #220, #221) — dois deles (#213, #218) já aplicaram DDL em produção antes do merge |

---

## FASE 1 — AS 20 DIMENSÕES

### 1. ARQUITETURA — **7.0/10** (=)

**Evidências:**
- Estrutura feature-based estável: `src/{components,hooks,services,adapters,providers,routes,integrations,lib,types}`; hooks organizados em 26 domínios; `supabase/functions/_shared/` com 19 módulos
- 10 ADRs (`docs/adr/` + `docs/decisions/`)
- Services layer existe (`auth/chat/contact/evolution/navigation/queue/realtime/role.service.ts`) mas **não é enforced**: `@/integrations/supabase/client` importado diretamente em **151 componentes**, 120 hooks e 11 pages (grep)
- `src/hooks/system/useImportData.ts` continua dead code (único consumidor de `xlsx`; fora do grafo do bundle — build passou sem o pacote instalado) e agora **quebra o typecheck-ratchet e 1 suite de teste** quando o tarball não baixa
- Sem dependência circular detectada nas camadas top-level (vite build limpo)

**Gaps para 10/10:** enforcement de camadas (ESLint `no-restricted-imports` para o client fora de `services/`/`hooks/`); decisão sobre `useImportData` (ligar na UI ou remover hook + dep `xlsx`).

**Ações:** regra ESLint com baseline no ratchet; remover `useImportData.ts` + `useImportData.test.ts` + dep `xlsx` (elimina também o SPOF de build da Dim. 8).

---

### 2. AUTENTICAÇÃO — **6.0/10** (▼ −2.0) ⚠️ REGRESSÃO EM PRODUÇÃO

**Evidências positivas:** PKCE + autoRefresh (`client.ts:24-31`); MFA TOTP implementado (`useMFA`, `MFAEnroll/Verify/Settings`); HIBP no CSP; WebAuthn próprio (`webauthn/`); Google OAuth ativo (`/auth/v1/settings` → `google:true`); `check-account-lock` movido para edge com service_role e rate limit por IP + por email (#215).

**Gap CRÍTICO e ATIVO — contador de brute force quebrado em produção:**
- Migration `20260904380000_revoke_record_failed_login_from_anon` está **aplicada no banco** (`role_routine_grants`: `record_failed_login` → só `authenticated` e `service_role`; `proacl` confirma)
- O front em produção (`main@9aba2de`, Vercel READY) **ainda chama `supabase.rpc('record_failed_login')` como anon** em `src/lib/loginAttempts.ts:37` (pré-login, sem sessão) → PostgREST nega → o erro é engolido por `log.error` e retorna `{isLocked:false}`
- Resultado: **nenhuma tentativa falha é contabilizada desde 2026-09-04** (`login_attempts` tem 3 linhas); o lockout via `check-account-lock` nunca dispara porque o contador nunca sobe
- A correção (edge function `record-failed-login` + refactor do `loginAttempts.ts`) existe **só no PR #218, não mergeado** — o DDL foi aplicado em produção antes do código que o acompanha
- `auth.mfa_factors` verificados = **0** de 4 usuários (2 admins sem MFA)
- `passkeys_enabled=false` no GoTrue (o WebAuthn é implementação própria — OK, mas duplica superfície)

**Gaps para 10/10:** contador de lockout funcional; MFA obrigatório para admin; password policy do GoTrue não auditável por SQL (dashboard).

**Ações (ordem):** 1) mergear #218 hoje (ou restaurar `GRANT EXECUTE ON FUNCTION record_failed_login TO anon` até o merge); 2) enforçar MFA para `role=admin` (guard no `ProtectedRoute` + `aal2` no RLS de tabelas sensíveis); 3) documentar policy de senha em `docs/DB-SECURITY.md`.

---

### 3. AUTORIZAÇÃO — **8.5/10** (▲ +0.5)

**Evidências:**
- RLS em **130/130 tabelas**, 0 tabelas com RLS sem policy, **378 policies**
- **0 funções SECURITY DEFINER sem `search_path`**; `anon` tem **0 grants EXECUTE** em `public` (era 945 grants de tabela + execs; hoje 887 grants de tabela — RLS bloqueia, mas a superfície caiu)
- **Testes de RLS boundary existem agora**: `src/__tests__/rls-boundary.test.ts` (14 `it`) + `security-and-performance.test.ts` (13) — fecha o gap P7 da auditoria anterior
- Audit trail de roles: triggers `audit_role_changes` / `audit_role_permissions` (142 linhas em `audit_logs` nos últimos 7d: login=117, role_granted=5, role_revoked=4, permission_granted_to_role=7)
- Anti-escalation: `prevent_privilege_escalation` (migration `20260830161547`); `get_identity_matrix` restrito a admin/supervisor (`20260904320000`)
- Só **1 policy** menciona `anon` (`webauthn_challenges` — bloqueio explícito)

**Gaps:** 32 policies `USING (true)` — 24 são leitura de config/catálogo para `authenticated`, 8 são `service_role ALL` (design plausível, sem ADR registrado); `lid_audit_snapshot_20260902` sem PK e com policy `service_role_full_access` (tabela temporária que virou permanente); autorização em nível de campo inexistente.

**Ações:** ADR curto ratificando as 24 policies de leitura ampla; `DROP TABLE lid_audit_snapshot_20260902` (snapshot de 3 dias atrás, já auditado); `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` (887 grants) mantendo só o necessário.

---

### 4. BANCO DE DADOS — **7.0/10** (▼ −0.5)

**Evidências positivas:** PostgreSQL 17.6; tipos corretos (**0 colunas float para dinheiro**, **0 `timestamp without time zone`**); 29 CHECK + 51 UNIQUE; dedup por índice único não-parcial em `messages`; 0 dead tuples acima do limiar; pg_cron 5/5 ativos com **0 falhas em 7 dias**; `supabase-usage-guard` = 0 violações (catálogo de 2026-09-04); paridade do catálogo/manifesto verde no types-sync.

**Gap ATIVO — drift de 5 migrations (DB Live Guard vermelho em 6 runs de 2026-09-04):**

| Versão | Nome no ledger | Onde está o arquivo |
|---|---|---|
| `20260904300000` | revoke_anon_trigger_function_execute | PR #213 e #218 (não mergeados) |
| `20260904320000` | fix_critical_security_functions | PR #213 e #218 |
| `20260904330000` | revoke_unnecessary_anon_grants | PR #213 e #218 |
| `20260904370000` | fix_record_failed_login_race_and_revoke_grants | PR #218 |
| `20260904380000` | revoke_record_failed_login_from_anon | PR #218 |

Log da run 33901461641: `arquivos validos: 370 · registros: 375 · FALHA: drift de migrations detectado`. Os DDLs foram aplicados em produção por sessões paralelas a partir de branches **antes do merge** — mesma causa-raiz do drift de 2026-09-02, agora com efeito colateral funcional (Dim. 2).

**Gaps menores:**
- **143 índices com 0 scans** (stats desde 2026-09-02 02:04 UTC — só 3 dias; não dropar antes de 30d)
- 6 FKs single-column sem índice: `security_alerts.resolved_by`, `geo_blocking_settings.updated_by`, `auto_close_config.updated_by`, `warroom_alerts.dismissed_by`, `connection_health_logs.connection_id`, `ai_providers.created_by`
- 52 de 179 FKs com `ON DELETE NO ACTION` implícito (default); 100 colunas FK nullable
- **0 migrations com DOWN**; **126/130 tabelas e 59/73 funções sem `COMMENT`**
- 1 tabela sem PK (`lid_audit_snapshot_20260902`)
- Migrations com nome duplicado no ledger: `fix_reassign_absent_agents_last_seen_at` (20260829020000 e 20260829040000) e `revoke_unnecessary_anon_grants` (20260903260000 e 20260904330000) — confunde a reconciliação
- `pg_stat_statements` instalada, mas fora do `search_path` do `mcp_exec` (`relation does not exist`) — para usar: `extensions.pg_stat_statements`

**Ações:** mergear #218 (traz os 5 arquivos) → guard verde; `CREATE INDEX` nos 6 FKs; `COMMENT ON` nas 20 tabelas core; `DROP` do snapshot.

---

### 5. CI/CD — **8.5/10** (=)

**Evidências:**
- 8 workflows, **100% actions SHA-pinned** (`check-workflow-pins.mjs`: OK)
- CI: lint-ratchet (baseline 1.086 → atual **1.073, 0 novas**), typecheck-ratchet (baseline 118 → 117), guards de CI/edge testados com `node --test`, build, coverage upload, `bun audit`, secret grep, PDF de auditoria determinístico (loop do #118 encerrado)
- **CodeQL adicionado** (#203) — push + semanal
- Branch protection `main`: `strict=true`, 3 checks obrigatórios, `enforce_admins=true`, `required_conversation_resolution=true`, `dismiss_stale_reviews=true`, force-push/deleção bloqueados
- Deploy de edges **manual e evidenciado** (`workflow_dispatch` com manifesto sha256 + smoke positivo/negativo por função); `db-migrate` com dry-run, prova de identidade do banco e "exatamente 1 migration ausente"
- Últimas 40 runs na `main`: 34 sucesso / 6 falha — **todas as 6 são DB Live Guard** (drift)

**Gaps:** `required_approving_review_count = 0` (CODEOWNERS decorativo); `bun audit` com `continue-on-error: true` → **37 HIGH passam sem bloquear** (todas build-time: picomatch, browserslist); DB Live Guard vermelho não bloqueia nada (não é check obrigatório); `.nvmrc`=20 vs CI/Vercel Node 24, sem `engines`.

**Ações:** `required_approving_review_count: 1` ou ADR de exceção solo-dev; `bun audit --prod` bloqueante + dev informativo; alinhar Node (`.nvmrc` 24 + `engines`); promover "DB Live Guard" a check obrigatório **depois** de resolver o drift.

---

### 6. DATA INTEGRITY — **6.5/10** (=)

**Evidências:** dedup idempotente (`messages_unique_dedup_index` não-parcial, `email_attachments_unique_msg_att`, `unique_whatsapp_connections_instance_id`); CHECKs em tabelas high-write; `webhook_failures` dead-letter (0 linhas = nenhum evento perdido em 7d); `entity_versions` para histórico; idempotência explícita em `sicoob-bridge`, `evolution-webhook-messages`, `evolution-api-proxy`; `contact_identity_map` (E32).

**Gaps (inalterados):**
- `grep BEGIN|transaction` em `supabase/functions/` = **0**; as únicas RPCs chamadas são `store/get_gmail_tokens`, `is_admin_or_supervisor`, `is_account_locked`, `search_knowledge_base`, `cleanup_expired_challenges` — **o fluxo inbound (contato → mensagem → evento → SLA) segue sem atomicidade**
- Soft delete em **1 tabela** (`messages.deleted_at`); 0 colunas de versionamento (`version`/`row_version`) → sem optimistic locking
- 52 FKs com `ON DELETE` default

**Ações:** RPC plpgsql `process_incoming_message_tx()` chamada pelo handler; ADR de política soft/hard delete; `ON DELETE` explícito nas 52 FKs.

---

### 7. DOCUMENTAÇÃO — **8.0/10** (=)

**Evidências:** `docs/` com 100+ arquivos vivos; CLAUDE.md exemplar; **`docs/runbooks/deploy.md` reescrito para o fluxo real GitHub-first** (fecha QW5 da auditoria anterior); `INCIDENT-RUNBOOK.md` com severidades + 5 cenários + template de postmortem; `BACKUP-RECOVERY-STRATEGY.md` com procedimento de restore; `LGPD-RETENTION-POLICY.md`; 10 ADRs; `docs/security/secret-surface-inventory.md`.

**Gaps:**
- `deploy.md` diz que previews são `zapp-web-v2-<hash>-juca1.vercel.app` — **os previews reais são `zappwebv2-<hash>-juca1.vercel.app`** (projeto Vercel chama-se `zapp_web_v2`; 20 deployments confirmam) — o mesmo erro está codificado no CORS das edges (Dim. 16)
- `CHANGELOG.md` estagnado (Unreleased com itens de abril; `package.json` em 0.2.0)
- `index.html`: `<link rel="canonical" href="https://pronto-talk-suite.lovable.app/">` e `og:image` em `*.lovableproject.com` — SEO aponta para o domínio Lovable desativado
- Sem diagrama ER; 126 tabelas sem `COMMENT`

**Ações:** corrigir padrão de preview em `deploy.md` + `validation.ts`; canonical/og para `zapp-web-v2.vercel.app`; congelar CHANGELOG com nota "histórico = PRs" ou gerar via release notes.

---

### 8. INFRAESTRUTURA / DEVOPS — **5.5/10** (=)

**Evidências positivas:** Vercel (CDN, TLS, HSTS preload, rollback via `isRollbackCandidate`) + Supabase Cloud gerenciado; secrets nas edges via Supabase Secrets (nenhum no bundle além da anon key, pública por design); `pg-backup` na VPS da Evolution GO.

**Gaps:**
- **`xlsx` via tarball `cdn.sheetjs.com`**: nesta sessão `bun install --frozen-lockfile` falhou (`ConnectionClosed`) com **exit 1** — instalação incompleta, `typecheck-ratchet` FALHA e 1 suite quebra. SPOF de build fora do npm, sem audit, sem mirror
- **7/7 buckets de storage `public=true`**, incluindo `whatsapp-media` (4.254 objetos, **sem restrição de MIME**, limite 100 MB) e `audio-messages` (1.820) — mídia de clientes servida sem autenticação a quem tiver a URL (ver Dim. 16)
- VPS Hostinger **não re-auditável** nesta sessão (MCP ausente); último estado: firewall `zapp-evolution-go-rxj2` anexado em 2026-09-02
- Sem IaC, sem staging Supabase, DR documentado mas **restore nunca testado** (sem evidência em `docs/`)

**Ações:** remover `xlsx` (Dim. 1) ou vendorizar o tarball; `whatsapp-media`/`audio-messages`/`team-chat-files` → `public=false` + signed URLs (a migration `20260831150000_replace_expiring_storage_urls_with_locators` já preparou o front para locators); agendar 1 teste de restore com evidência em `docs/audits/`.

---

### 9. LOGGING / MONITORING — **6.5/10** (▲ +0.5)

**Evidências:** **error reporting de produção implementado sem serviço externo** (`src/lib/errorReporter.ts` → `audit_logs.action='client_error'` via RPC, com dedupe/fingerprint/teto por sessão; 1 erro registrado em 7d); `window.onerror` + `unhandledrejection` em `main.tsx`; logger front com `sessionId` + correlationId; `Logger` estruturado nas edges com `durationMs`; `console.log` tree-shaken em prod (`pure` no esbuild); `audit_logs` com 142 eventos/7d.

**Gaps:** sem Sentry/uptime externo/alertas; **33 `console.log` em edges** (fora do Logger estruturado); retenção de `audit_logs` não definida; `client_error` só visível para admin via SQL (sem painel).

**Ações:** uptime check externo (Vercel + Supabase REST + Evolution GO); painel `client_error` no `AdminTelemetriaPage` (já existe a página); política de retenção para `audit_logs`/`rate_limit_logs`.

---

### 10. OBSERVABILIDADE — **5.0/10** (=)

**Evidências:** Web Vitals próprios (`src/lib/web-vitals.ts`, targets em `performance-budget.json`); 12 ErrorBoundaries; `pg_stat_statements` instalada; `AdminTelemetriaPage` + `query_telemetry` no banco; `connection_health_logs`.

**Gaps:** sem tracing cross-service (React → Edge → Evolution GO: o `rid` das edges não volta no header); sem SLO/SLI; sem APM; `pg_stat_statements` não consultável pelo `mcp_exec` (search_path).

**Ações:** header `x-request-id` de resposta nas edges + log no front; SLO mínimo (p95 `evolution-webhook` < 500 ms, erro < 1%) com query semanal via `extensions.pg_stat_statements`.

---

### 11. LÓGICA DE NEGÓCIO — **7.0/10** (=)

**Evidências:** services (`RoleService`, `ChatService`, `ContactService`, `QueueService`); SLA v2 com trigger universal `messages_sla_first_response_trigger` + `mark_first_response` hardened (#183/#199); chatbot L1; `ai-guards`/`ai-usage`; `role_effective` + sync trigger (special_agent).

**Gaps:** **não existe coluna de status de conversa** (`contacts` não tem `status`; `status` só em `messages`, `campaigns`, `sales_deals`, `whatsapp_connections`) — o ciclo open/pending/closed é inferido por `conversation_events`/`conversation_closures`, sem FSM nem validação de transição; feature flags runtime = 0 (grep `featureFlag|feature_flag` em `src/` sem hits reais); regras vazando em componentes (151 acessos diretos ao banco).

**Ações:** ADR-007 com a state machine de conversa + coluna `contacts.conversation_status` com CHECK + trigger de transição válida; tabela `feature_flags` + hook `useFeatureFlag`.

---

### 12. MANUTENIBILIDADE — **7.0/10** (=)

**Evidências:** dívida rastreada e caindo — lint **1.112 → 1.073** (0 novas), typecheck **133 → 117**; `: any`/`as any` fora de testes = **77**; **1** `console.log` no src; 17 `eslint-disable`; 0 `@ts-ignore`; conventional commits 100%; Dependabot ativo (0 alertas abertos); 8 arquivos > 500 linhas (6 são testes ou dados)

**Gaps:** sem pre-commit hooks (`.husky` ausente, 0 `lint-staged`); `no-unused-vars: off`, `noUnusedLocals/Parameters: false`; `.nvmrc` 20 vs CI 24; `.prettierrc` referencia `prettier-plugin-tailwindcss` que **não está no `package.json`**; `useImportData` dead code.

**Ações:** husky + lint-staged (ratchets no pre-push); `no-unused-vars: warn` absorvido no baseline; adicionar `prettier` + plugin ao devDependencies ou remover do `.prettierrc`.

---

### 13. OPERACIONALIDADE — **5.5/10** (▼ −0.5)

**Evidências:** rollback Vercel disponível (2 candidatos hoje); runbook de deploy e incidente atualizados; deploy de edges manual com smoke; `ErrorBoundary` com auto-reload em `ChunkLoadError` (#173); `startDeploymentUpdateMonitor` (`version.json` no-store) para forçar refresh após deploy.

**Gaps (com achado concreto):**
- **O risco de sessões paralelas voltou a se materializar**: DDL de 2 PRs abertos aplicado em produção **antes do merge** → guard vermelho 6× + lockout quebrado. CLAUDE.md §3 pede "re-sync antes de editar", mas **não proíbe aplicar DDL de branch não mergeado**
- Sem circuit breaker para Evolution GO (`withRetry` existe em `src/lib/retry.ts`, mas sem estado aberto/fechado)
- 0 migrations com DOWN → rollback de schema é manual e não documentado por migration
- Hotfix não documentado (como aplicar correção urgente fora do fluxo de PR)

**Ações:** regra explícita no CLAUDE.md: "DDL só sai de arquivo já em `main` ou no mesmo PR que será mergeado em ≤1h; nunca de branch paralelo"; circuit breaker simples (contador de falhas + `open` 60 s) em `evolution-api-proxy.ts`; seção "Hotfix" no runbook.

---

### 14. PERFORMANCE — **6.5/10** (▼ −1.0)

**Evidências (build real, 7.05 s):**
- ✅ `vendor-voice` (610 KB) agora tem regra em `manualChunks` (P9 da auditoria anterior fechado)
- ✅ Lazy routes, `@tanstack/react-virtual`, 248 `useQuery/useMutation`, 5 `.range()` (paginação server-side em listagens), `dedupe` de react/framer

**Gap NOVO — carga inicial 2,8× acima do budget:**
- `dist/index.html` faz `<link rel="modulepreload">` de **`vendor-maps` (1.869 KB / 508 KB gz)** e `vendor-charts` (126 KB gz) — **JS inicial total = 968 KB gz** vs budget `initial-js: 350 KB` em `performance-budget.json`
- Causa: `mapbox-gl` importado **estaticamente** em `src/components/inbox/LocationMessage.tsx` (usado por `MessageBubble`/`ChatMessageBubble`/`VirtualMessageBubble`) e em `location-picker/useLocationPicker.ts` — entra no grafo estático do entry. `recharts` importado estaticamente em 17 arquivos
- `performance-budget.json` **não é enforced** em nenhum job (só "Report bundle size" informativo)
- 72 `.single()` no src (PR #221 aberto trata 4 casos de 406); 121 `select('*')`

**Ações:** `const mapboxgl = await import('mapbox-gl')` dentro do `useEffect` de `LocationMessage`/`useLocationPicker` (remove 508 KB gz do first paint); `React.lazy` nos 17 componentes de gráfico (dashboard já é lazy — verificar quem puxa charts no entry); job de CI que falha se `initial-js` gz > 350 KB.

---

### 15. QUALIDADE DE CÓDIGO — **7.0/10** (▼ −0.5)

**Evidências:** ESLint 9 flat + Prettier; `no-console: warn` (allow warn/error); 1 `console.log` no src; commits semânticos; PR template + CODEOWNERS; **CodeQL ativo**.

**Gaps:**
- **8 alertas CodeQL abertos desde 2026-09-03 sem tratamento** (5 com `security_severity_level: high`): `js/insecure-randomness` em `src/lib/logger.ts:15` (`Math.random` no fallback do sessionId), `js/double-escaping` em `fetch-link-preview/index.ts:114`, `js/xss-through-dom` em `TeamFileUploader.tsx:143` e `AdvancedMessageMenu.tsx:192`, `js/incomplete-url-substring-sanitization` em `evolution-webhook-messages.ts:199` (`pps.whatsapp.net` por substring), 3× `js/stack-trace-exposure` em `validation.ts:126/135` e `fetch-link-preview:264`
- 33 `console.log` em edges; `no-unused-vars: off`; sem pre-commit

**Ações:** triagem dos 8 alertas (3 são falso-positivo prováveis em `errorResponse` — dismiss com justificativa; 5 são fix de 1-5 linhas cada); `console.log` → `Logger` nas edges.

---

### 16. SEGURANÇA — **6.5/10** (▼ −0.5)

**Resolvido/confirmado desde 2026-09-02:**
- ✅ Headers de produção verificados via HTTP: HSTS `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy
- ✅ CORS allowlist exata + regex (`validation.ts:69-89`); 0 wildcard
- ✅ CodeQL, Dependabot (0 abertos), secret scanning (0)
- ✅ `anon` com 0 EXECUTE em `public`; IDOR em `get_connection_*` corrigido (`20260902000500`); `get_identity_matrix` restrito
- ✅ Gate por `instanceToken` no `evolution-webhook` (a Evolution GO não assina HMAC; o token no corpo é a única credencial)
- ✅ Sanitização de e-mail HTML endurecida (DOMPurify isolado, 131 payloads XSS testados — #219/#220)

**Gaps atuais:**
- **Lockout de brute force inoperante** (Dim. 2) — impacto direto em segurança de autenticação
- **Storage: 7/7 buckets públicos**. `whatsapp-media` (4.254 objetos de conversas de clientes, sem MIME allowlist) e `audio-messages` (1.820) são acessíveis por URL sem JWT. Com RLS em 130 tabelas, o storage é hoje o maior vazamento potencial de dados pessoais (LGPD)
- `EVOLUTION_WEBHOOK_ENFORCE` default `'shadow'` — em shadow, **POST sem `instanceToken` é aceito** (só loga). Se o secret não estiver em `'token'` no Dashboard, qualquer um pode injetar eventos (mensagens, status de conexão). **Não verificável pelo repo** — confirmar valor do secret
- CSP ainda **Report-Only** (`vercel.json`; confirmado no header de prod)
- **CORS das edges não casa com os previews reais da Vercel**: regex `zapp-web-v2-[a-z0-9]+-juca1` vs URLs reais `zappwebv2-<hash>-juca1.vercel.app` e aliases `zappwebv2-git-*-juca1` → previews de PR não conseguem chamar edges (fallback devolve a origem de prod → browser bloqueia). Efeito: ninguém testa edge functions em preview
- Edges ElevenLabs/`voice-changer`/`get-mapbox-token` (10) dependem só do JWT do gateway, sem checagem de role, com rate limit **em memória por isolate** (`checkRateLimit`, reseta a cada cold start) → qualquer usuário autenticado pode consumir cota paga sem limite efetivo
- 37 HIGH no `bun audit` (todas build-time; `react-router` já corrigido); 5 `dangerouslySetInnerHTML` (3 com DOMPurify/escape verificado: `EmailChatBubble`, `EmailThreadView`, `chart.tsx`; `MarkdownPreview.tsx:42` e `LinkPreview.tsx:102` — cobertura a confirmar)

**Ações (ordem):** 1) mergear #218; 2) `whatsapp-media`/`audio-messages`/`team-chat-files` → privados + signed URLs; 3) confirmar `EVOLUTION_WEBHOOK_ENFORCE=token` no Dashboard; 4) corrigir regex de preview no CORS; 5) rate limit persistente (`rate_limit_logs` já existe) + checagem de role nas edges de voz; 6) CSP enforce.

---

### 17. TESTES — **7.5/10** (▲ +0.5)

**Evidências (execução real):** **2.584 passed | 32 skipped | 3 todo** em 164 arquivos (75 s) + **167 contratos** (0.6 s); testes de RLS boundary e segurança (`src/__tests__/`); guards de CI/DB testados (`node --test`); testes de regressão de XSS no pipeline de e-mail.

**Gaps:**
- **1 suite falha localmente** (`useImportData.test.ts`: `Failed to resolve import "xlsx"`) — depende do tarball CDN; na CI passa quando o download funciona
- 32 skipped, **todos em `team-chat-exhaustive-audit.test.ts`** (rótulos "FIXED:", "BUG:", "GAP:" — são anotações de auditoria, não testes)
- Sem E2E (Playwright ausente); sem threshold de cobertura (`vitest.config.ts` sem `coverage.thresholds`)

**Ações:** converter os 32 `it.skip` em testes reais ou removê-los; `coverage.thresholds` em `src/lib`, `src/services`, `supabase/functions/_shared`; Playwright com 3 happy paths.

---

### 18. TIPAGEM / TYPE SAFETY — **6.5/10** (=)

**Evidências:** `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `alwaysStrict` ativos; `types.ts` gerado (7.997 linhas) com workflow `types-sync` + 3 gates; typecheck debt 117 (↓ de 133); 77 `any` fora de testes; contratos V1/V2 das edges com Zod.

**Gaps:** `strict: false`, `noImplicitAny: false`; Zod no front em 7 arquivos; `zappSchemas.ts` (contato/campanha) importado por **1** arquivo.

**Ações:** `noImplicitAny: true` com baseline no ratchet; meta −10 `any`/sprint.

---

### 19. VALIDAÇÃO — **6.0/10** (=)

**Evidências:** edges com `schemas.ts` (Zod, envelopes V1/V2, `validationErrorResponse`) em 9 arquivos; `sanitizeString`/`isValidUUID`; MIME allowlist em 6/7 buckets; CHECK constraints no banco.

**Gaps:** `zodResolver` em **0** formulários; `react-hook-form` em **1** arquivo; **185 `<Input>` e 0 com `maxLength`**; sem validador de CPF/CNPJ/CEP em `src/lib`/`src/utils`; `whatsapp-media` sem MIME allowlist; mensagens de erro genéricas.

**Ações:** `src/lib/schemas/` com 10 entidades + `zodResolver`; `maxLength` nos inputs de texto livre; MIME allowlist em `whatsapp-media`.

---

### 20. OPERAÇÕES (PROCESSOS) — **6.0/10** (▼ −0.5)

**Evidências:** fluxo GitHub-first real (20 deployments Vercel em ~7 h; previews por PR; Copilot/CodeRabbit/cubic revisando PRs); Dependabot semanal; cultura de auditoria contínua (11 relatórios em `docs/audits/`); `ops.hermes_change_log` (4 registros) como ledger operacional.

**Gaps:** **coordenação de sessões paralelas continua o processo mais frágil** — 4 PRs abertos, 2 com DDL já em produção; 43 commits/7d de uma conta + múltiplas sessões Claude com branches concorrentes (`claude/*`, `fix/hermes-*`); sem SLA de review; hotfix sem procedimento; CHANGELOG parado.

**Ações:** triagem hoje dos 4 PRs (#218 primeiro); protocolo de DDL no CLAUDE.md; SLA "PR aberto > 24 h = fechar ou mergear".

---

## FASE 2 — CONSOLIDAÇÃO

### Scorecard (Δ vs auditoria 2026-09-02 v2)

```
╔══════════════════════════════════╦═══════╦══════╦═══════╦═══════════════════════════════════════════════╗
║ DIMENSÃO                         ║ NOTA  ║  Δ   ║ PESO  ║ GAP PRINCIPAL PARA 10/10                      ║
╠══════════════════════════════════╬═══════╬══════╬═══════╬═══════════════════════════════════════════════╣
║ 1.  Arquitetura                  ║  7.0  ║  =   ║  ×2   ║ Supabase direto em 151 componentes            ║
║ 2.  Autenticação                 ║  6.0  ║ ▼2.0 ║  ×3   ║ Contador de brute force QUEBRADO em prod      ║
║ 3.  Autorização                  ║  8.5  ║ ▲0.5 ║  ×3   ║ 32 USING(true) sem ADR; 887 grants anon       ║
║ 4.  Banco de Dados               ║  7.0  ║ ▼0.5 ║  ×2   ║ DRIFT de 5 migrations (guard RED 6×)          ║
║ 5.  CI/CD                        ║  8.5  ║  =   ║  ×1   ║ approvals=0; audit não bloqueia; Node 20≠24   ║
║ 6.  Data Integrity               ║  6.5  ║  =   ║  ×3   ║ Zero transações nas edges                     ║
║ 7.  Documentação                 ║  8.0  ║  =   ║  ×1   ║ Preview URL errada; canonical → Lovable       ║
║ 8.  Infraestrutura / DevOps      ║  5.5  ║  =   ║  ×1   ║ 7/7 buckets públicos; xlsx CDN quebra install ║
║ 9.  Logging / Monitoring         ║  6.5  ║ ▲0.5 ║  ×1   ║ Sem uptime/alertas; 33 console.log em edges   ║
║ 10. Observabilidade              ║  5.0  ║  =   ║  ×1   ║ Sem tracing/SLO                               ║
║ 11. Lógica de Negócio            ║  7.0  ║  =   ║  ×1   ║ Sem coluna/FSM de status de conversa          ║
║ 12. Manutenibilidade             ║  7.0  ║  =   ║  ×1   ║ Sem husky; prettier plugin ausente            ║
║ 13. Operacionalidade             ║  5.5  ║ ▼0.5 ║  ×1   ║ DDL de branch não mergeado em prod (de novo)  ║
║ 14. Performance                  ║  6.5  ║ ▼1.0 ║  ×2   ║ 968 KB gz no first load (budget 350); mapbox  ║
║ 15. Qualidade de Código          ║  7.0  ║ ▼0.5 ║  ×1   ║ 8 alertas CodeQL abertos há 2 dias            ║
║ 16. Segurança                    ║  6.5  ║ ▼0.5 ║  ×3   ║ Storage público; webhook em shadow; CORS prev ║
║ 17. Testes                       ║  7.5  ║ ▲0.5 ║  ×2   ║ Sem E2E; 32 skips; suite xlsx quebra          ║
║ 18. Tipagem / Type Safety        ║  6.5  ║  =   ║  ×2   ║ strict:false; noImplicitAny:false             ║
║ 19. Validação                    ║  6.0  ║  =   ║  ×2   ║ zodResolver em 0 forms; 0 maxLength           ║
║ 20. Operações (Processos)        ║  6.0  ║ ▼0.5 ║  ×1   ║ 4 PRs abertos, 2 já com DDL em prod           ║
╠══════════════════════════════════╬═══════╬══════╬═══════╬═══════════════════════════════════════════════╣
║ NOTA GERAL PONDERADA             ║ 6.8   ║ ▼0.2 ║       ║ Regressão operacional, não de código          ║
╚══════════════════════════════════╩═══════╩══════╩═══════╩═══════════════════════════════════════════════╝
```

**Cálculo:** ×3 (Aut 6.0 + Autz 8.5 + DI 6.5 + Seg 6.5 = 27.5 → 82.5) + ×2 (Arq 7.0 + BD 7.0 + Perf 6.5 + Test 7.5 + Tip 6.5 + Val 6.0 = 40.5 → 81.0) + ×1 (8.5+8.0+5.5+6.5+5.0+7.0+7.0+5.5+7.0+6.0 = 66.0) = **229.5 / 34 = 6.75 ≈ 6.8**

### O que mudou desde 2026-09-02 (0cbf30d → 9aba2de)
**Fechados:** P1 drift de 2 migrations (mas reabriu com 5 novas), P2 react-router CVE, P3 firewall VPS (não re-verificado), P9 chunk vendor-voice, QW5 runbook Lovable→Vercel, P7 testes RLS boundary, P8 CodeQL, error reporting de cliente, gate instanceToken no webhook, hardening de e-mail HTML.
**Abertos novos:** lockout de brute force quebrado (DDL sem front), drift de 5 migrations, mapbox no first load (968 KB gz), 8 alertas CodeQL sem triagem, 7 buckets públicos (não visto antes), CORS ≠ previews reais, `prettier-plugin-tailwindcss` ausente.
**Persistem:** Sentry/uptime, transações em edges, zodResolver, husky, approvals=0, CSP report-only, strict:false, E2E.

---

## TOP 10 AÇÕES POR ROI

```
[P1] [AUTENTICAÇÃO+BANCO+OPS] Mergear PR #218 (ou GRANT temporário) → lockout volta a funcionar + guard verde
├── Impacto: CRÍTICO (brute force sem contador desde 2026-09-04; DB Live Guard RED 6×)
├── Esforço: Baixo (merge + deploy da edge record-failed-login via workflow_dispatch)
├── Tipo: Código + Migration (arquivos já existem no PR)
├── Arquivos: src/lib/loginAttempts.ts, supabase/functions/record-failed-login/, 5 migrations 20260904*
└── Aceite: login errado 5× → check-account-lock retorna isLocked=true; check-migration-drift.mjs exit 0

[P2] [SEGURANÇA/LGPD] Buckets whatsapp-media, audio-messages, team-chat-files → private + signed URLs
├── Impacto: Alto (6.074 objetos de clientes acessíveis sem auth) · Esforço: Médio (front já usa locators — 20260831150000)
├── Tipo: Config + Código
├── Arquivos: migration UPDATE storage.buckets SET public=false; src/lib/storage_object_reference.ts; hooks de mídia
└── Aceite: GET direto na URL pública → 400/403; app renderiza mídia via createSignedUrl

[P3] [PERFORMANCE] Import dinâmico de mapbox-gl + lazy dos gráficos → first load −634 KB gz
├── Impacto: Alto (968 → ~330 KB gz, dentro do budget) · Esforço: Baixo (2 arquivos + job de CI)
├── Arquivos: src/components/inbox/LocationMessage.tsx, location-picker/useLocationPicker.ts, ci.yml
└── Aceite: dist/index.html sem modulepreload de vendor-maps/vendor-charts; job falha se initial-js gz > 350 KB

[P4] [SEGURANÇA] Confirmar EVOLUTION_WEBHOOK_ENFORCE=token no Dashboard + corrigir regex de preview no CORS
├── Impacto: Alto (endpoint aceita POST sem token em shadow; previews não testam edges)
├── Esforço: Baixo (1 secret + 1 regex)
├── Arquivo: supabase/functions/_shared/validation.ts:79 → /^https:\/\/zappwebv2-[a-z0-9-]+-juca1\.vercel\.app$/
└── Aceite: POST sem instanceToken → 401; preview de PR chama edge com CORS OK

[P5] [OPERAÇÕES] Protocolo de DDL no CLAUDE.md: "DDL só de arquivo em main ou no PR mergeado no mesmo turno"
├── Impacto: Alto (2ª recorrência do drift em 3 dias; desta vez quebrou auth) · Esforço: Baixo (10 linhas)
├── Arquivo: CLAUDE.md §1 regras de migration
└── Aceite: regra escrita; próximo drift = violação explícita

[P6] [QUALIDADE] Triagem dos 8 alertas CodeQL (5 high)
├── Impacto: Médio · Esforço: Baixo (fixes de 1-5 linhas; 3 dismiss justificados)
├── Arquivos: src/lib/logger.ts:15 (crypto.getRandomValues), fetch-link-preview:114/264, TeamFileUploader:143, AdvancedMessageMenu:192, evolution-webhook-messages:199 (new URL().hostname)
└── Aceite: 0 alertas abertos; CodeQL verde

[P7] [ARQUITETURA+INFRA] Remover useImportData + dep xlsx (dead code que quebra install/typecheck/teste)
├── Impacto: Médio · Esforço: Baixo
├── Arquivos: src/hooks/system/useImportData.ts, src/hooks/__tests__/useImportData.test.ts, package.json, bun.lock, vite.config.ts (chunk vendor-xlsx)
└── Aceite: bun install exit 0 sem rede para cdn.sheetjs.com; typecheck-ratchet OK

[P8] [DATA INTEGRITY] RPC transacional para mensagem inbound
├── Impacto: Alto · Esforço: Médio
├── Arquivos: migration process_incoming_message_tx(); _shared/evolution-webhook-messages.ts
└── Aceite: falha simulada após INSERT em contacts não deixa mensagem órfã

[P9] [SEGURANÇA] Rate limit persistente + checagem de role nas 10 edges de voz/mapa
├── Impacto: Médio (cota ElevenLabs paga) · Esforço: Médio
├── Arquivos: _shared/validation.ts (checkRateLimit → rate_limit_logs), elevenlabs-*/index.ts
└── Aceite: 21ª chamada/min de um usuário → 429 mesmo após cold start

[P10] [CI/CD+MANUTENIBILIDADE] approvals=1, bun audit --prod bloqueante, husky, Node 24 em .nvmrc/engines
├── Impacto: Médio · Esforço: Baixo
└── Aceite: PR sem aprovação não mergeia; HIGH em dep de prod bloqueia; pre-push roda ratchets
```

---

## ROADMAP EM 3 ONDAS

### 🔴 Quick Wins (1-3 dias)
| # | Ação | Dimensão |
|---|---|---|
| QW1 | P1 — mergear #218 / restaurar lockout + guard verde | Autenticação/Banco |
| QW2 | P4 — `EVOLUTION_WEBHOOK_ENFORCE=token` + regex de preview no CORS | Segurança |
| QW3 | P3 — mapbox dinâmico + budget enforced | Performance |
| QW4 | P5 — protocolo de DDL no CLAUDE.md | Operações |
| QW5 | P6 — triagem CodeQL | Qualidade |
| QW6 | P7 — remover `useImportData` + `xlsx` | Arquitetura/Infra |
| QW7 | Canonical/og de `index.html` → Vercel; preview URL em `deploy.md` | Documentação |
| QW8 | Triagem dos 4 PRs abertos (#213 duplica os DDLs de #218 — fechar ou rebase) | Operações |

### 🟠 Sprint 1 (1-2 semanas)
| # | Ação | Dimensão |
|---|---|---|
| S1-1 | P2 — buckets privados + signed URLs | Segurança/Infra |
| S1-2 | P8 — RPC transacional inbound | Data Integrity |
| S1-3 | P9 — rate limit persistente + role nas edges de voz | Segurança |
| S1-4 | P10 — approvals=1, audit bloqueante, husky, Node 24 | CI/CD |
| S1-5 | MFA obrigatório para admin (0/2 hoje) | Autenticação |
| S1-6 | Índices nos 6 FKs + `DROP lid_audit_snapshot_20260902` | Banco |
| S1-7 | Converter/remover os 32 `it.skip` + `coverage.thresholds` | Testes |

### 🟡 Sprint 2 (2-4 semanas)
| # | Ação | Dimensão |
|---|---|---|
| S2-1 | Zod schemas + `zodResolver` + `maxLength` | Validação |
| S2-2 | `noImplicitAny: true` via ratchet | Tipagem |
| S2-3 | FSM de conversa (ADR-007 + `contacts.conversation_status` + trigger) | Lógica de Negócio |
| S2-4 | Uptime externo + SLO mínimo + `x-request-id` ponta a ponta | Logging/Observabilidade |
| S2-5 | ESLint `no-restricted-imports` (client fora de services/hooks) | Arquitetura |
| S2-6 | CSP Report-Only → enforce | Segurança |
| S2-7 | Playwright E2E (login, enviar mensagem, fechar conversa) | Testes |
| S2-8 | Teste de restore de backup com evidência | Infra |

---

## NOTA FINAL

**6.8/10 — o código melhorou, o processo regrediu.** Desde 2026-09-02 o projeto fechou 10 dos itens do plano anterior (CodeQL, testes de RLS, runbook real, chunk de voz, error reporting, gate de webhook, hardening de e-mail HTML) e os fundamentos seguem acima da média: RLS 130/130, 378 policies, 0 SECURITY DEFINER sem `search_path`, 0 EXECUTE para anon, 2.584 testes verdes, CI 100% SHA-pinned com ratchets de dívida funcionando. A queda vem de **três achados que não existiam ou não tinham sido vistos**: (1) o contador de brute force está inoperante em produção porque um `REVOKE` foi aplicado no banco a partir de um PR ainda aberto — o segundo drift de schema em três dias, desta vez com efeito funcional; (2) os 7 buckets de storage são públicos, com mais de 6 mil arquivos de conversas de clientes acessíveis por URL — o maior risco LGPD do sistema hoje, dado que o banco está blindado; (3) o first load carrega 968 KB gz de JavaScript (mapbox e recharts pré-carregados no entry), quase 3× o budget que o próprio repositório declara. Os três têm correção barata (P1, P2, P3). O risco sistêmico segue sendo o mesmo da auditoria anterior, agora com prova: **sessões paralelas aplicando DDL fora do fluxo de merge**. Enquanto essa regra não estiver escrita e obedecida, qualquer nota acima de 7 é frágil.

---
*Gerado em 2026-09-05 ~03:30 UTC. Próxima re-auditoria sugerida após Quick Wins + Sprint 1.*

---

## ADENDO — EXECUÇÃO DO PLANO (2026-09-05, PR #222)

Executado na mesma sessão da auditoria, cada item simulado contra código e banco antes de aplicar.
Os números abaixo são medidos; a nota projetada é estimativa e só vira nota após re-auditoria em `main`.

| Item | Estado | Evidência |
|---|---|---|
| P1 lockout + drift | ✅ código no PR; **apply pós-merge pendente só da 030000** | `record-failed-login` (edge) + `20260905010000_lockout_hardening` (lock vigente não estende, expirado limpa, escalonamento 2^(n-5) min); testado em prod com e-mail sintético (5ª falha → 1 min, 6ª → 2 min). Drift shim: só `20260905030000` sem registro (intencional, ver P2) |
| P2 buckets privados | ✅ código; **`UPDATE storage.buckets` roda após deploy das edges** | `evolution-api` send-media/ptv e `talkx-send` assinam URL antes de mandar para a GO; `ReplyQuote` via `useResolvedStorageUrl` |
| P3 first load | ✅ | 968 KB → **335.8 KB gz** (10 chunks); `mapbox-gl` lazy; `bundle-budget.mjs` bloqueante no CI (350 KB) |
| P4 CORS/canonical | ✅ | regex `zappwebv2-[a-z0-9-]+-juca1`; canonical/og → `zapp-web-v2.vercel.app` |
| P5 protocolo DDL | ✅ | `CLAUDE.md` regras 6 (arquivo → PR → apply) e 7 (ledger = SQL real) |
| P6 CodeQL | ✅ 8 alertas + 3 novos no PR | randomness, stack trace, double-escape, hostname check, XSS em preview (preview de figurinha removido), nome de secret fora do erro do `ai-proxy` |
| P7 xlsx/useImportData | ✅ | dep e hook removidos; `bun install --frozen-lockfile` volta a passar |
| P8 RPC inbound | ✅ | `ingest_inbound_message` (20260905050000): 1 transação, 4 cenários validados em prod (inserted / updated / variante do 9º dígito / apagada preservada). A simulação pegou ambiguidade de coluna OUT × RETURNING antes de ir para o webhook |
| P9 rate limit | ✅ | `edge_rate_limits` + `consume_rate_limit`; 10 edges de voz/mapa com `requireAuth` + cota por usuário |
| P10 CI | ✅ | `audit-prod.mjs` bloqueante (0 bloqueios, 725 pacotes), husky, Node 24, ADR-004 |
| S1 snapshot/COMMENT | ✅ | `lid_audit_snapshot_20260902` dropada; 20 tabelas core comentadas |
| S1 skips/cobertura | ✅ | 32 `it.skip` → `it.todo`; piso v8 em `src/lib`+`src/services` (36/35/43/31; medido 37.7/36.1/44.9/32.7); CI roda `test:coverage` |
| S1/S2 MFA admin | ✅ soft gate | `MfaAdminNudge` (2/2 admins sem TOTP); hard gate trancaria o mantenedor |
| S1/S2 feature flags | ✅ | tabela `feature_flags` (20260905060000) + `useFeatureFlag` |
| S1/S2 CSP | ✅ pré-requisito | edge `csp-report` + `report-uri`; enforce só depois de 1 semana sem violação legítima |
| S1/S2 ESLint camadas | ✅ | `no-restricted-imports` do client em `components`/`pages` (166 legados congelados no baseline) |
| S2 FSM / SLO | ✅ docs | ADR-005 (Proposed) e `docs/runbooks/slo.md` |

**Não executado / não verificável nesta sessão:** valor de `EVOLUTION_WEBHOOK_ENFORCE` (só no Dashboard); VPS Hostinger (sem MCP na sessão); monitor externo de uptime (não existe ainda — passo 2 do runbook de SLO).

**Nota projetada após merge + apply da 030000: ~8.0/10.** Sobe onde houve evidência mensurável (Autenticação, Segurança, Performance, CI/CD, Banco); fica onde só há proposta (Arquitetura/FSM, Observabilidade sem monitor externo). Vale o mesmo aviso da nota final: sem o protocolo de DDL obedecido, qualquer nota acima de 7 é frágil.
