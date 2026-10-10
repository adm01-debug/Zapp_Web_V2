# AUDITORIA TÉCNICA EXAUSTIVA — ZAPP WEB V2
**Data:** 2026-09-02 · **Executor:** Claude (Arquiteto Sênior + QA) · **Branch auditada:** `main` (HEAD `17436eb`)  
**Nota geral ponderada: 6.6/10**

---

## FASE 0 — INVENTÁRIO DO SISTEMA

| Item | Valor |
|---|---|
| Repositório | `adm01-debug/Zapp_Web_V2`, branch `main` |
| Stack frontend | React 19 + TypeScript 5.8 + Vite 8 + TailwindCSS 3 |
| Backend | Supabase Cloud (`tnnnlkbymytvtqngbbqh`) — PostgreSQL 17.6 |
| Edge Functions | 62 Supabase Edge Functions (Deno) |
| WhatsApp | Evolution GO (`evoapicloud/evolution-go`) na VPS Hostinger |
| Integrações | Bitrix24, Gmail OAuth2, ElevenLabs, OpenAI/Anthropic/Groq, Mapbox, SIP/VoIP |
| Automações | N8N (workflows externos não auditados aqui) |
| Deploy frontend | Vercel (auto em push `main`) |
| Arquivos `.ts` + `.tsx` (src) | 450 + 760 = 1.210 |
| Tabelas no banco | **126** (todas com RLS habilitado) |
| Políticas RLS | **372** |
| Migrations versionadas | **329** arquivos (+ 1 versão duplicada G-03) |
| Testes passando | **2.493 unitários + 160 contratos** (0 falhas, CI 16s) |
| Último deploy | 2026-09-02 (commit `17436eb`) |

---

## FASE 1 — AS 22 DIMENSÕES

---

### 1. ARQUITETURA — **7/10**

**Evidências positivas:**
- Estrutura feature-based bem definida: `src/components/`, `src/services/`, `src/hooks/`, `src/types/`, `src/providers/`, `src/adapters/`
- Services layer presente: `auth.service.ts`, `chat.service.ts`, `contact.service.ts`, `role.service.ts`, `queue.service.ts`, `realtime.service.ts`
- ADRs documentados: 6 em `docs/decisions/`, 3 em `docs/adr/`
- Adapters em `src/adapters/` para isolamento de integrações externas
- Shared modules em `supabase/functions/_shared/` (19 módulos reutilizáveis)

**Gaps para 10/10:**
- `src/components/` concentra 760 arquivos TSX sem subdivisão de domínio clara — mistura UI pura com lógica de negócio
- Componentes acessam Supabase diretamente (`supabase.from()` espalhado) em vez de passar sempre pelo service layer
- Sem inversão de dependência consistente — componentes React importam Supabase client diretamente
- Boundary de domínio não explícito: sem módulos/packages isolados entre `inbox`, `contacts`, `admin`, etc.
- ADRs não cobrem decisões de stack recentes (Vercel, Evolution GO migration)

**Ações corretivas:**
- Adicionar regra ESLint `no-restricted-imports` bloqueando `import supabase from '@/integrations/supabase/client'` fora de `src/services/` e `src/hooks/`
- Criar `src/domains/{inbox,contacts,admin}/` com exports explícitos (barrel files)

---

### 2. AUTENTICAÇÃO — **7.5/10**

**Evidências positivas:**
- Supabase Auth com JWT + Supabase SDK cuida de refresh automático
- `ProtectedRoute.tsx` robusto: timeout de segurança de 7s, escape hatch de logout, reset de estado ao trocar usuário (BUG-8 fix)
- Edge function `webauthn/` implementada (passkey)
- Edge function `approve-password-reset/` para fluxo de reset aprovado
- MFA: componente `src/components/mfa/MFABackupCodes` presente
- Tabela `login_attempts` para rastrear tentativas de login

**Gaps para 10/10:**
- Rate limiting no endpoint de auth não evidente no frontend (depende do Supabase Auth rate limiting padrão)
- Brute force: tabela `login_attempts` existe mas policy de bloqueio automático (lockout) não confirmada nas migrations
- MFA: apenas backup codes confirmados — TOTP configurável? UI de ativação não auditada end-to-end
- Safety timeout de 7s no ProtectedRoute é sintoma: indica que `useAuth` ou `useUserRole` podem ser lentos

**Ações corretivas:**
- Verificar/criar RPC `check_login_lockout` consultando `login_attempts` antes de permitir tentativa
- Documentar estado atual do MFA (se TOTP está habilitado em prod ou apenas como feature)

---

### 3. AUTORIZAÇÃO — **8/10**

**Evidências positivas:**
- **RLS habilitado em 100% das 126 tabelas** (confirmado via `pg_class.relrowsecurity`) — zero exceções
- **372 políticas RLS** — cobertura densa com políticas por operação (SELECT/INSERT/UPDATE/DELETE)
- `ProtectedRoute.tsx` com `requiredRoles` + `requiredPermission` no frontend
- `RoleService.checkPermission()` chamado server-side antes de renderização
- Tabela `audit_logs` com índices compostos para rastreabilidade de ações

**Gaps para 10/10:**
- Testes automatizados de RLS ausentes (nenhum teste que prove "user role X não acessa tabela Y")
- Privilege escalation: sem teste que confirme usuário não pode alterar próprio role
- Field-level security: colunas sensíveis (tokens, chaves) restritas apenas por RLS de tabela, não por view/function
- `agent_visibility_grants` e permissões de agente: lógica complexa, sem testes de boundary

**Ações corretivas:**
- Criar suite `src/__tests__/rls-boundary.test.ts` usando Supabase client com JWT de cada role, validando que SELECT/INSERT retorna 0 rows ou 403 onde esperado
- Adicionar check constraint impedindo `UPDATE profiles SET role = 'admin'` por usuários não-admin via trigger

---

### 4. BANCO DE DADOS — **8/10**

**Evidências positivas:**
- 329 migrations versionadas com procedimento documentado (CLAUDE.md) ✓
- Indexes abundantes e compostos: `idx_audit_logs_user_created (user_id, created_at DESC)`, composto em messages, etc.
- Constraints UNIQUE em campos críticos (`agent_skills_profile_id_skill_name_key`, etc.)
- FK com referential integrity em todas as relações mapeadas nos types.ts
- DB guard automatizado (`scripts/db-audit/supabase-usage-guard.mjs`) — acoplamento código↔banco 100% íntegro
- `known-violations.json` zerado — zero mortos

**Gaps para 10/10:**
- **G-03**: 1 versão de migration duplicada (`20260829100000_`) — dois arquivos com mesmo prefixo
- **G-04**: 12 arquivos com `SECURITY DEFINER` sem `search_path` literal nas migrations (risco de hijack via search_path)
- Verificar uso de `FLOAT` para valores monetários vs `NUMERIC` — não auditado completamente
- Migrations sem DOWN scripts — rollback de schema não possível sem DDL manual
- Connection pooler Supabase: não confirmado se Transaction Mode ou Session Mode está ativo

**Ações corretivas:**
- Renomear `20260829100000_get_team_profiles...sql` para `20260829100100_...sql` (G-03)
- Para cada função SECURITY DEFINER: `ALTER FUNCTION nome SET search_path = public, pg_temp;` (G-04)
- Confirmar `SUPABASE_DB_POOL_MODE=transaction` no Vercel/edges

---

### 5. CI/CD — **8.5/10**

**Evidências positivas:**
- Pipeline com 5 jobs: Lint+TypeCheck → Unit Tests → Build → Security Audit → Audit Report
- Todas as GitHub Actions com hash SHA pinnado (verificado por `check-workflow-pins.mjs`)
- Branch protection: 3 checks obrigatórios, `strict=true`, `enforce_admins=true`
- Lint ratchet (`lint-ratchet.mjs`) controla dívida sem bloquear CI — inteligente
- Dependabot configurado semanalmente para `bun` e `github-actions`
- Deploy automático na Vercel + Edge Functions automáticas ✓
- `bun audit --audit-level=high` no pipeline (security job) ✓
- 62 edge functions com smoke test via `generate-manifest.mjs --check`

**Gaps para 10/10:**
- **G-01**: Dependabot alerts desabilitados na API GitHub (403) — não recebe alertas de CVEs em deps
- **G-02**: CodeQL/SAST ausente — sem análise estática de segurança automática
- Sem environment de staging Supabase (banco separado para testar antes de prod)
- Deploy automático em `main` sem approval gate — qualquer merge vai direto para prod

**Ações corretivas:**
- Habilitar Dependabot alerts em Settings → Security → Dependabot alerts
- Adicionar workflow CodeQL: `actions/setup-codeql@v3` com análise de JS/TS
- Criar Supabase projeto `tnnnlkbymytvtqngbbqh-staging` e environment `staging` no Vercel

---

### 6. DATA INTEGRITY — **6.5/10**

**Evidências positivas:**
- Idempotência nos handlers de mensagem: `upsert` com `ignoreDuplicates` (commit `8ae2554`)
- UNIQUE constraint `ux_messages_dedup` não-parcial para deduplicação (migration `20260901100002`)
- FK com referential integrity garantida pelo banco
- `sanitizeString()` em edge functions remove control chars

**Gaps para 10/10:**
- **Sem transações atômicas nas edge functions**: operações multi-tabela (ex: criar mensagem + atualizar contato + criar evento) executam como writes separados sem `BEGIN/COMMIT` — falha parcial deixa estado inconsistente
- Soft delete: sem política universal — algumas tabelas têm `deleted_at`, outras fazem hard delete
- Optimistic locking: ausente — sem `version` ou `updated_at` check nas mutations
- Validação server-side não universal: edge functions usam `schemas.ts` mas vários endpoints (ex: `bitrix-api`) não validam schema de entrada com Zod
- `DOMPurify` presente mas cobertura em campos rich-text não confirmada universalmente

**Ações corretivas:**
- Criar helper `runAtomically(supabase, async (tx) => {...})` que usa `db_query` com `BEGIN/COMMIT` explícito nos handlers de webhook críticos
- Definir e documentar política global: soft delete em entidades de negócio, hard delete em logs/temporários
- Adicionar `optimistic_lock_version` em tabelas de alta concorrência (contacts, conversations)

---

### 7. DOCUMENTAÇÃO — **8.5/10**

**Evidências positivas:**
- `CLAUDE.md` exemplar — fonte de verdade para banco, Evolution GO, regras de migration
- `docs/` extremamente rico: runbooks, ADRs, auditoria histórica, LGPD, webhooks, migrations, troubleshooting
- ADRs: 9 documentos cobrindo decisões de React Query, RLS, CSS, lazy loading, Evolution webhook, etc.
- Audit trail da própria documentação: `docs/audits/` com 7 relatórios datados de 2026-08
- Template de post-mortem em `docs/runbooks/deploy.md` ✓
- CHANGELOG.md mantido ✓

**Gaps para 10/10:**
- Diagrama ER (Entity-Relationship) atualizado ausente — 126 tabelas sem mapa visual
- Runbook de deploy aponta para **Lovable** (desatualizado — deploy agora é Vercel/GitHub-first)
- Onboarding guide explícito para novo dev ausente (está fragmentado entre CLAUDE.md e docs/)
- Dicionário de dados formal ausente (campos críticos sem descrição de domínio)

**Ações corretivas:**
- Atualizar `docs/runbooks/deploy.md` seção 1.1 para fluxo atual: Git commit → CI pipeline → Vercel auto-deploy
- Gerar diagrama ER via `\d+ tablename` para tabelas críticas e exportar como PNG em `docs/architecture/`
- Criar `docs/ONBOARDING.md` consolidando setup local em < 10 passos

---

### 8. INFRAESTRUTURA / DEVOPS — **6/10**

**Evidências positivas:**
- Vercel (CDN, Edge network, HTTPS automático) para frontend ✓
- Supabase Cloud (PostgreSQL gerenciado, backup automático, SSL) para DB ✓
- Evolution GO em VPS Hostinger com Docker Compose ✓
- Secrets gerenciados via Supabase dashboard e Vercel env vars — não hardcoded ✓
- `.env.production` comitado intencionalmente com apenas VITE_* (anon keys — públicas por design) ✓

**Gaps para 10/10:**
- **Sem IaC** — nenhum Terraform/Pulumi; infraestrutura criada manualmente, não reproduzível automaticamente
- **Sem staging Supabase** — uma falha de migration vai direto para prod
- **Disaster Recovery**: não documentado e não testado (apenas backup automático do Supabase Cloud)
- Evolution GO VPS: sem health check externo documentado, sem alertas de container crash
- `tmp/` não está no `.gitignore` — arquivo com API key rastreado acidentalmente (G-05)
- Network segmentation: DB Supabase Cloud não é público (bom), mas Evolution GO VPS tem porta 32783 exposta

**Ações corretivas:**
- Adicionar `tmp/` ao `.gitignore` e `git rm --cached tmp/` (G-05)
- Documentar DR: "Em caso de falha total, como restaurar em < 4 horas" — Supabase backup + Vercel redeploy
- Criar `infrastructure/README.md` com diagrama de componentes e procedimento de criação manual

---

### 9. LOGGING / MONITORING — **6/10**

**Evidências positivas:**
- Edge functions: `Logger` estruturado com `{level, fn, rid, ms, msg}` — formato JSON, correlação por `requestId` ✓
- Frontend: `src/lib/logger.ts` com correlação de sessão (`sessionId`) e módulo ✓
- `audit_logs` table com índices compostos — audit trail de ações críticas ✓
- `connection_health_logs` table — health histórico de conexões WhatsApp ✓
- `vite.config.ts`: `console.log/debug/info/trace` marcados como `pure` em prod (tree-shaken) ✓

**Gaps para 10/10:**
- **Sentry não inicializado** — existe apenas `SentryIntegrationView.tsx` (UI de configuração), mas `@sentry/react` não está nas dependências e não há `Sentry.init()` em `src/main.tsx`. Em produção, erros de JS silenciam.
- Logger frontend desativa `debug` e `info` em prod — sem telemetria de erros reais em produção
- Logs de edge functions acessíveis apenas via dashboard Supabase (sem pipeline para ferramenta externa)
- Uptime monitoring externo: não documentado (Uptime Robot, Better Stack, etc.)
- Alertas automáticos: não configurados para error rate, latência, container crash

**Ações corretivas:**
- Instalar `@sentry/react` + inicializar em `src/main.tsx` com `VITE_SENTRY_DSN` (já no `.env.example`)
- Configurar Sentry source maps via plugin Vite no CI
- Criar alerta de uptime externo para `https://tnnnlkbymytvtqngbbqh.supabase.co/rest/v1/` e URL da Vercel

---

### 10. OBSERVABILIDADE — **4.5/10**

**Evidências positivas:**
- Web Vitals monitorados via `src/lib/web-vitals.ts` (LCP, INP, CLS) ✓
- `ErrorBoundary` com fallback UI e seção de retry ✓
- `PerformanceMonitor` component + testes ✓
- Tabelas de log: `ai_usage_logs`, `rate_limit_logs`, `audit_logs` — métricas parciais de negócio

**Gaps para 10/10:**
- **Os 3 pilares ausentes**: sem Metrics (só Web Vitals locais), sem Traces (zero distributed tracing), sem centralização de Logs
- Sem distributed tracing: uma requisição que passa por React → Edge Function → Evolution GO não tem trace ID propagado
- Error tracking: erros de JS em prod silenciam (Sentry não inicializado)
- SLOs/SLIs: não definidos formalmente
- Métricas RED (Rate, Errors, Duration) por endpoint: não instrumentadas
- Nenhuma ferramenta de APM (Datadog, New Relic, Grafana) conectada
- Runbooks não linkados a alertas (alertas não existem)

**Ações corretivas:**
- Configurar Sentry com `tracesSampleRate: 0.1` e `integrations: [browserTracingIntegration()]` para traces básicos
- Definir SLOs mínimos: uptime > 99.5%, LCP < 2.5s, error rate < 1%
- Criar dashboard de métricas de negócio no Supabase (query em `ai_usage_logs`, `audit_logs` por dia)

---

### 11. LÓGICA DE NEGÓCIO — **6.5/10**

**Evidências positivas:**
- Services layer encapsula lógica: `RoleService`, `ChatService`, `ContactService`, `QueueService`
- Edge functions isolam lógica de integração (não exposta ao frontend)
- `chatbot-l1` como camada L1 de atendimento automatizado
- SLA configuration com `sla_rules`, `sla_violations` — regras configuráveis ✓
- Gamification isolada em `agent_achievements`, `agent_stats` ✓

**Gaps para 10/10:**
- State machines para conversas não são explícitas: status (`open`, `closed`, `pending`) gerenciado sem FSM — transições permitidas não documentadas
- Muitas regras espalhadas em componentes React em vez de services (ex: validação de permissão de download em `adminDownloadPermission.test.ts`)
- Feature flags apenas build-time (VITE_ENABLE_*) — não dinâmicos em runtime
- Regras de assignment de fila (`auto_assign_to_queue_agent`) em trigger SQL — difícil testar unitariamente
- Timezone: `date-fns` presente mas política de timezone (UTC no banco, local no UI?) não documentada

**Ações corretivas:**
- Documentar FSM de conversas: estados permitidos e transições válidas em `docs/decisions/ADR-007-conversation-state-machine.md`
- Mover validações de negócio de componentes para `src/services/`
- Implementar feature flags dinâmicas via tabela `feature_flags` no Supabase (já tem RLS)

---

### 12. MANUTENIBILIDADE — **6.5/10**

**Evidências positivas:**
- Lint ratchet (`scripts/ci/lint-ratchet.mjs`) controla dívida sem bloquear CI — solução elegante ✓
- `known-violations.json` zerado — zero acoplamentos mortos ✓
- Commits semânticos evidentes em todos os 20 commits recentes (`fix(`, `feat(`, `chore(`, `docs(`)
- Dependabot configurado semanalmente ✓
- Prettier configurado com `.prettierrc` ✓
- `noUnusedLocals: false` + ratchet é trade-off aceitável documentado

**Gaps para 10/10:**
- **891 erros de lint pré-existentes** (87% `no-explicit-any`) — dívida técnica grande mas rastreada
- `tsconfig`: `strict: false`, `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false` — TypeScript permissivo demais
- Pre-commit hooks ausentes: `husky` não está em `package.json` — nada previne push de código sem lint local
- Arquivos com 300-400 linhas (EvolutionMonitoringDashboard 346 linhas, ContactIntelligencePanel 343 linhas) — no limiar
- ESLint `@typescript-eslint/no-unused-vars: off` — vars mortas não são capturadas

**Ações corretivas:**
- Adicionar `husky` + `lint-staged` ao `package.json`: `"pre-commit": "bun run typecheck && lint-staged"`
- Habilitar `noUnusedLocals: true` e `noUnusedParameters: true` no tsconfig gradualmente via ratchet

---

### 13. OPERACIONALIDADE — **6/10**

**Evidências positivas:**
- Vercel rolling deploys com rollback imediato via dashboard ✓
- Runbook de incidentes em `docs/INCIDENT-RUNBOOK.md` + `docs/runbooks/deploy.md` ✓
- Template de post-mortem existe ✓
- PWA com `public/manifest.json` e ícones ✓
- ErrorBoundary em múltiplos níveis (global, seção, retry) ✓

**Gaps para 10/10:**
- **Rollback não documentado**: "Vercel tem rollback" mas procedimento passo a passo ausente no runbook
- **Circuit breakers ausentes**: se Evolution GO cair, o sistema não degrada graciosamente — sem fallback explícito
- **Migrations sem DOWN**: rollback de schema = DDL manual de emergência
- Feature flags apenas build-time — impossível desligar feature em prod sem redeploy
- On-call rotation: não definida (equipe de 1, aceitável, mas não documentado)
- Zero-downtime para migrations: `CREATE INDEX` (não CONCURRENTLY) pode bloquear em tabelas grandes

**Ações corretivas:**
- Adicionar ao runbook: "Rollback Vercel: acesse dashboard → Deployments → Revert to [hash]"
- Implementar `try/catch` com fallback em `useEvolutionApi` retornando estado degradado em vez de erro fatal
- Documentar em `docs/runbooks/` procedimento de rollback de migration por DDL manual

---

### 14. PERFORMANCE — **7.5/10**

**Evidências positivas:**
- Lazy loading de todas as rotas principais via `src/components/performance/LazyRoutes.tsx` ✓
- Manual chunk splitting sofisticado no `vite.config.ts` (8 vendor chunks: core, icons, data, ui, utils, charts, pdf, xlsx, maps)
- `@tanstack/react-virtual` para listas longas ✓
- `console.log/debug/info` marcados como `pure` em prod (tree-shaken pelo esbuild) ✓
- Web Vitals monitorados (LCP, INP, CLS) ✓
- `optimizeDeps.include` com pre-bundle de react, framer-motion, lucide-react ✓
- Paginação server-side em listagens ✓

**Gaps para 10/10:**
- **Chunk > 500KB**: aviso de build (G-08) — um chunk ultrapassa o limite, provavelmente `vendor-ui` ou `vendor-charts`
- Bundle total 34 MB (dist não gzipada) — aceitável mas não medido o JS inicial gzipado
- `reportCompressedSize: false` em build — não há baseline do tamanho gzipado no CI
- Queries N+1: não auditadas com EXPLAIN ANALYZE (sem `pg_stat_statements` configurado)
- Images: sem estratégia WebP/AVIF explícita
- `mapbox-gl` no bundle mesmo sendo raramente usado — precisa de lazy import sob demanda

**Ações corretivas:**
- Mover `mapbox-gl` para import dinâmico: `const mapbox = await import('mapbox-gl')` apenas quando mapa for renderizado
- Habilitar `reportCompressedSize: true` e adicionar step no CI comparando com baseline
- Executar `EXPLAIN ANALYZE` nas top 5 queries via Supabase Dashboard e documentar em `docs/adr/`

---

### 15. QUALIDADE DE CÓDIGO — **7/10**

**Evidências positivas:**
- ESLint com `tseslint.configs.recommended` ✓
- Prettier com config compartilhado ✓
- `no-console: ["warn", { allow: ["warn", "error"] }]` — apenas warn/error em prod ✓
- Commits semânticos consistentes (conventional commits) ✓
- PR template com checklist ✓
- Vite remove `console.log/debug/info` em prod via `pure: [...]` ✓
- `CODEOWNERS` configurado ✓

**Gaps para 10/10:**
- **Pre-commit hooks ausentes** — `husky` não está nas deps
- **891 erros de lint pré-existentes** (dívida rastreada mas não reduzida ativamente)
- `@typescript-eslint/no-unused-vars: "off"` — dead vars não capturadas
- 115 instâncias de `: any` no código fonte (excluindo testes) — muitas em componentes de produção
- `TODO/FIXME`: não auditado sistematicamente
- SOLID: parcialmente aplicado — alguns componentes têm múltiplas responsabilidades

**Ações corretivas:**
- Adicionar `husky` + `lint-staged` com `bun run lint` no pre-commit
- Habilitar `@typescript-eslint/no-unused-vars: "warn"` e adicionar ao ratchet
- Criar ticket de dívida para zerar `no-explicit-any` aos poucos via ratchet (meta: -50 por sprint)

---

### 16. SEGURANÇA — **7/10**

**Evidências positivas:**
- CORS restritivo com allowlist de domínios exatos + regex para previews Vercel (`getCorsHeaders()`) ✓
- Security headers completos: HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, Referrer-Policy ✓
- HMAC-SHA256 implementado com constant-time comparison (`hmac-validation.ts`) ✓
- `DOMPurify` para sanitização de HTML ✓
- RLS em 100% das tabelas ✓
- Sem secrets hardcoded no src/ (gitleaks confirmado) ✓
- `requireEnv()` + `requireAuth()` nos edge functions ✓
- `sanitizeString()` com remoção de control chars ✓

**Gaps para 10/10:**
- **F-01/F-02**: API key Evolution GO presente em `docs/TROUBLESHOOTING.md` e `docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` — chave deve ser rotacionada
- **G-01**: Dependabot alerts desabilitados — CVEs em deps não são notificados automaticamente
- **G-02**: CodeQL/SAST ausente
- **HMAC não enforced no evolution-webhook**: `WebhookSecurityService` implementada mas o endpoint `evolution-webhook/index.ts` não a usa — webhooks são aceitos sem validação de assinatura
- `strictMode: false` no `WebhookSecurityService` (default) — sem assinatura = aceito
- **G-05**: `tmp/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` rastreado no git (cópia com API key)
- LGPD: documentação presente mas implementação de "direito ao esquecimento" (data deletion) não auditada no código

**Ações corretivas (ordenadas por criticidade):**

1. **Rotar API key Evolution GO imediatamente** (F-01/F-02): nova key no dashboard Hostinger → atualizar Supabase Secrets → remover linhas dos docs
2. **Enforçar HMAC no evolution-webhook**: adicionar no início do handler:
   ```typescript
   const secret = requireEnv('EVOLUTION_WEBHOOK_SECRET');
   const validation = await new WebhookSecurityService(secret, true).validateRequest(req);
   if (!validation.valid) return new Response('Unauthorized', { status: 401 });
   ```
3. Habilitar Dependabot alerts no GitHub (G-01)
4. `git rm --cached tmp/` + adicionar `tmp/` ao `.gitignore` (G-05)

---

### 17. TESTES — **7/10**

**Evidências positivas:**
- **2.493 testes unitários** passando, 0 falhas, 152 arquivos de teste ✓
- **160 testes de contrato** em `vitest.contracts.config.ts` ✓
- Testes de segurança específicos: `security-and-performance.test.ts`, `voip-security-gaps.test.ts`, `team-chat-security-gaps.test.ts`
- Mocks adequados com `globalThis.__extMockRpc` para isolation ✓
- CI executa em 16s — excelente velocidade ✓
- Testes de auditoria em `team-chat-exhaustive-audit.test.ts` ✓
- Guards de DB testados: `scripts/db-audit/*.test.mjs` ✓

**Gaps para 10/10:**
- **Sem testes E2E** (Playwright/Cypress ausente) — happy paths críticos não testados end-to-end no browser
- **Sem testes de carga** (k6/Artillery) — comportamento sob stress desconhecido
- **Sem testes específicos de RLS** — nenhum teste que use JWT de cada role e verifique acesso/negação
- Cobertura: não medida (sem `--coverage` forçado no CI, apenas upload se existir)
- 32 testes skipped — razão não auditada
- Testes de integração com banco real: ausentes (todos mockam Supabase)

**Ações corretivas:**
- Adicionar `bun run test:coverage` no CI com threshold mínimo: `{ branches: 60, functions: 70 }`
- Criar `src/__tests__/rls-boundary.test.ts` com cenários: "agent NÃO vê conversas de outro agente"
- Instalar Playwright: `bun add -D @playwright/test` + criar `e2e/login.spec.ts` para happy path de auth

---

### 18. TIPAGEM / TYPE SAFETY — **5.5/10**

**Evidências positivas:**
- DB types gerados automaticamente (`src/integrations/supabase/types.ts` — 7.844 linhas) ✓
- `zod3` alias para compatibilidade de contratos legados ✓
- `strictFunctionTypes: true`, `strictBindCallApply: true`, `alwaysStrict: true` parciais ✓
- `noFallthroughCasesInSwitch: true` ✓

**Gaps para 10/10 (críticos):**
- **`strict: false`** no tsconfig — modo permissivo habilitado
- **`noImplicitAny: false`** — `any` implícito não é erro
- **`strictNullChecks: false`** — `null/undefined` não são checados — causa runtime NullPointerErrors
- **115 instâncias de `: any`** no src/ (excluindo testes) — muitas em código de produção
- Zod usado em apenas **7 arquivos** no src/ — validação runtime praticamente ausente no frontend
- `noUnusedLocals: false` + `noUnusedParameters: false` — dead code não capturado pelo compilador
- Vários `as SomeType` sem verificação de runtime (type assertions não seguras)

**Ações corretivas:**
- Habilitar `strictNullChecks: true` primeiro (menor impacto) — corrigir erros surgidos (estimado 200-400)
- Habilitar `noImplicitAny: true` via ratchet — cada PR deve ter ≤ erros que baseline
- Expandir Zod: criar schemas para todas as mutations em `src/services/` usando `z.object()` e `safeParse()`

---

### 19. VALIDAÇÃO — **6/10**

**Evidências positivas:**
- React Hook Form + Zod em formulários críticos (`useAuthForm.ts`, `ForgotPassword.tsx`, `ResetPassword.tsx`) ✓
- Edge functions com `schemas.ts` centralizado usando Zod: `EvolutionWebhookEnvelopeV1Schema`, `EvolutionWebhookEnvelopeV2Schema` ✓
- `sanitizeString()` em edge functions ✓
- `isValidUUID()` com regex para UUIDs ✓
- Formulários com React Hook Form têm validação UX imediata ✓

**Gaps para 10/10:**
- Zod em apenas 7 arquivos src/ — maioria dos formulários e mutations **não validam schema**
- Sem schema compartilhado frontend↔backend: tipos gerados do Supabase não incluem validação Zod
- Validação de formatos BR (CPF, CNPJ, CEP) não encontrada — dependência de libs não confirmada
- Mensagens de erro: muitas genéricas (`toast.error('Erro ao salvar')`)
- Validação de transição de estado (ex: fechar conversa já fechada): não evidenciada
- Upload de arquivos: validação de MIME type não auditada nas edges que aceitam upload

**Ações corretivas:**
- Criar `src/lib/schemas/` com Zod schemas para as 10 entidades principais (contact, conversation, message, profile, etc.)
- Usar `zodResolver(schema)` do `@hookform/resolvers/zod` em todos os formulários
- Adicionar `zod-validation-error` para mensagens de erro humanizadas

---

### 20. OPERAÇÕES (PROCESSOS) — **6.5/10**

**Evidências positivas:**
- Conventional commits consistentes em todo o histórico ✓
- Branch protection com review obrigatório e checks ✓
- PR template com checklist ✓
- Dependabot semanal ✓
- Lint ratchet como gestão de dívida técnica ✓
- `docs/audits/` com 7 relatórios datados — cultura de auditoria ativa ✓
- Post-mortem template documentado ✓
- CODEOWNERS configurado ✓

**Gaps para 10/10:**
- Processo de hotfix não documentado explicitamente
- On-call: "equipe de 1" não documentado — sem escalation path
- SLA de code review: não definido
- Rotina de revisão de segurança: ad-hoc (não trimestral agendado)
- Backlog técnico visível apenas via lint ratchet — sem issue tracking dedicado para dívida técnica
- Rollback de production não está no runbook passo a passo

**Ações corretivas:**
- Criar `docs/runbooks/hotfix.md`: "1. Branch de main → 2. Fix mínimo → 3. CI mandatório → 4. Deploy"
- Criar milestone `Tech Debt Sprint` no GitHub Issues para rastrear dívida técnica
- Agendar revisão trimestral de segurança como Routine no Claude Code Remote

---

## FASE 2 — CONSOLIDAÇÃO

### Scorecard Completo

```
╔══════════════════════════════════╦═══════╦══════╦═══════════════════════════════════════════════╗
║ DIMENSÃO                         ║ NOTA  ║ PESO ║ GAP PRINCIPAL PARA 10/10                      ║
╠══════════════════════════════════╬═══════╬══════╬═══════════════════════════════════════════════╣
║ 1.  Arquitetura                  ║  7/10 ║  ×2  ║ Supabase direto em componentes; sem domains   ║
║ 2.  Autenticação                 ║  7.5  ║  ×3  ║ Rate limiting/brute force não auditado        ║
║ 3.  Autorização                  ║  8/10 ║  ×3  ║ Sem testes automatizados de RLS               ║
║ 4.  Banco de Dados               ║  8/10 ║  ×2  ║ G-03 (versão dupla), G-04 (SECURITY DEFINER)  ║
║ 5.  CI/CD                        ║  8.5  ║  ×1  ║ Dependabot alerts off; CodeQL ausente          ║
║ 6.  Data Integrity               ║  6.5  ║  ×3  ║ Sem transações atômicas nas edge functions     ║
║ 7.  Documentação                 ║  8.5  ║  ×1  ║ Diagrama ER ausente; runbook desatualizado     ║
║ 8.  Infraestrutura / DevOps      ║  6/10 ║  ×1  ║ Sem IaC; sem staging Supabase; tmp/ no git    ║
║ 9.  Logging / Monitoring         ║  6/10 ║  ×1  ║ Sentry não inicializado; sem uptime monitoring ║
║ 10. Observabilidade              ║  4.5  ║  ×1  ║ Zero APM, tracing ou métricas RED/USE         ║
║ 11. Lógica de Negócio            ║  6.5  ║  ×1  ║ FSM de conversas não explícita; flags runtime  ║
║ 12. Manutenibilidade             ║  6.5  ║  ×1  ║ 891 erros de lint; sem pre-commit hooks       ║
║ 13. Operacionalidade             ║  6/10 ║  ×1  ║ Sem circuit breakers; rollback não documentado ║
║ 14. Performance                  ║  7.5  ║  ×2  ║ Chunk >500KB; mapbox-gl não lazy; sem N+1 audit║
║ 15. Qualidade de Código          ║  7/10 ║  ×1  ║ Sem pre-commit hooks; 115 `any`; 891 erros    ║
║ 16. Segurança                    ║  7/10 ║  ×3  ║ HMAC não enforced; API key em docs; G-01/G-02 ║
║ 17. Testes                       ║  7/10 ║  ×2  ║ Sem E2E; sem testes de RLS; cobertura unknown ║
║ 18. Tipagem / Type Safety        ║  5.5  ║  ×2  ║ strict:false; strictNullChecks:false; 115 any  ║
║ 19. Validação                    ║  6/10 ║  ×2  ║ Zod em 7/~200 formulários; sem schemas BR     ║
║ 20. Operações (Processos)        ║  6.5  ║  ×1  ║ Hotfix não documentado; sem SLA de review     ║
╠══════════════════════════════════╬═══════╬══════╬═══════════════════════════════════════════════╣
║ NOTA GERAL PONDERADA             ║  6.6  ║      ║ Sólido, porém com gaps críticos operacionais  ║
╚══════════════════════════════════╩═══════╩══════╩═══════════════════════════════════════════════╝
```

**Cálculo:** Soma ponderada = 224,5 / total pesos (34) = **6,6/10**

---

## TOP 10 AÇÕES DE MAIOR IMPACTO (ROI = Impacto ÷ Esforço)

```
[P1] [SEGURANÇA] Enforçar HMAC no evolution-webhook
├── Impacto: CRÍTICO — qualquer pessoa pode enviar webhooks falsos hoje
├── Esforço: Baixo (5 linhas de código)
├── Tipo: Código
├── Arquivo: supabase/functions/evolution-webhook/index.ts (início do handler)
└── Critério: webhook sem assinatura retorna 401; evolution GO configurado com EVOLUTION_WEBHOOK_SECRET

[P2] [SEGURANÇA] Rotar API key Evolution GO + remover dos docs
├── Impacto: Alto — chave exposta no histórico Git e nos docs
├── Esforço: Baixo (rotação no dashboard + sed nos arquivos)
├── Tipo: Config + Documentação
├── Arquivos: docs/TROUBLESHOOTING.md L72/L89, docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md L75
└── Critério: gitleaks dir-scan retorna 0 findings para a nova chave

[P3] [TIPAGEM] Habilitar strictNullChecks:true
├── Impacto: Alto — elimina classe inteira de runtime NullPointerErrors
├── Esforço: Médio (corrigir ~300 erros estimados)
├── Tipo: Config + Código
├── Arquivo: tsconfig.app.json → "strictNullChecks": true
└── Critério: bun run typecheck retorna 0 erros

[P4] [OBSERVABILIDADE] Inicializar Sentry no app
├── Impacto: Alto — erros de prod atualmente silenciam
├── Esforço: Baixo (instalar @sentry/react + 10 linhas em main.tsx)
├── Tipo: Código
├── Arquivo: src/main.tsx + package.json
└── Critério: erro capturado aparece no dashboard Sentry; DSN configurado via VITE_SENTRY_DSN

[P5] [DATA INTEGRITY] Transações atômicas nas edge functions críticas
├── Impacto: Alto — inconsistência de dados em falhas parciais de webhook
├── Esforço: Médio (criar helper + refatorar handlers)
├── Tipo: Código
├── Arquivos: supabase/functions/_shared/evolution-webhook-handlers.ts + messages
└── Critério: falha simulada em meio a uma operação não deixa estado parcial

[P6] [TESTES] Testes de RLS boundary
├── Impacto: Alto — autorização não tem cobertura de teste
├── Esforço: Médio (criar suite com Supabase client multi-role)
├── Tipo: Código
├── Arquivo: src/__tests__/rls-boundary.test.ts
└── Critério: cada role tem ≥ 2 testes positivos + ≥ 2 negativos; suite passa no CI

[P7] [SEGURANÇA] Habilitar Dependabot alerts + CodeQL
├── Impacto: Alto — CVEs em dependências não são notificados
├── Esforço: Baixo (2 cliques no GitHub Settings)
├── Tipo: Config
└── Critério: repo mostra badge "Dependabot enabled"; CodeQL workflow existindo

[P8] [INFRAESTRUTURA] Remover tmp/ do git + fix .gitignore
├── Impacto: Médio — arquivo com API key rastreado
├── Esforço: Baixo (2 comandos git + 1 linha no .gitignore)
├── Tipo: Config
└── Critério: `git ls-files tmp/` retorna vazio

[P9] [VALIDAÇÃO] Zod em mutations críticas do frontend
├── Impacto: Médio — dados inválidos podem chegar ao banco
├── Esforço: Médio (schemas + hookform resolver em 10 formulários prioritários)
├── Tipo: Código
├── Arquivo: src/lib/schemas/ (novo diretório)
└── Critério: 10 formulários críticos com zodResolver; safeParse em mutations

[P10] [MANUTENIBILIDADE] Pre-commit hooks com Husky
├── Impacto: Médio — lint/typecheck falham apenas no CI, não localmente
├── Esforço: Baixo (bun add -D husky lint-staged + config)
├── Tipo: Config
└── Critério: commit com `any` ou erro de TS falha localmente antes do push
```

---

## ROADMAP DE CORREÇÃO EM 3 ONDAS

### 🔴 QUICK WINS (1-3 dias)

| # | Ação | Esforço | Dimensão |
|---|---|---|---|
| QW1 | Enforçar HMAC no evolution-webhook (5 linhas) | 30 min | Segurança |
| QW2 | Rotar API key Evolution GO + limpar docs | 1 hora | Segurança |
| QW3 | `git rm --cached tmp/` + `echo "tmp/" >> .gitignore` | 10 min | Infraestrutura |
| QW4 | Habilitar Dependabot alerts no GitHub | 5 min | CI/CD |
| QW5 | Inicializar Sentry em `src/main.tsx` | 45 min | Observabilidade |
| QW6 | Atualizar runbook (Lovable → Vercel) | 20 min | Documentação |
| QW7 | Renomear migration duplicada G-03 | 10 min | Banco de Dados |

### 🟠 SPRINT 1 (1-2 semanas)

| # | Ação | Esforço | Dimensão |
|---|---|---|---|
| S1-1 | Habilitar `strictNullChecks: true` + corrigir erros | 2-3 dias | Tipagem |
| S1-2 | Criar testes de RLS boundary (10 cenários) | 1 dia | Testes |
| S1-3 | Transações atômicas nos 3 handlers de webhook críticos | 2 dias | Data Integrity |
| S1-4 | Adicionar Husky + lint-staged + pre-commit hooks | 2 horas | Manutenibilidade |
| S1-5 | Zod schemas para 10 formulários críticos do frontend | 2 dias | Validação |
| S1-6 | Corrigir 12 SECURITY DEFINER sem search_path (G-04) | 1 dia | Banco de Dados |
| S1-7 | Criar workflow CodeQL no GitHub Actions | 2 horas | CI/CD |

### 🟡 SPRINT 2 (2-4 semanas)

| # | Ação | Esforço | Dimensão |
|---|---|---|---|
| S2-1 | Lazy load mapbox-gl + auditoria de chunk >500KB | 1 dia | Performance |
| S2-2 | Testes E2E Playwright para 3 happy paths críticos | 3 dias | Testes |
| S2-3 | Documentar FSM de conversas (ADR-007) | 1 dia | Lógica de Negócio |
| S2-4 | Criar ambiente staging Supabase + pipeline de staging | 3 dias | Infraestrutura |
| S2-5 | Uptime monitoring externo (Better Stack ou Uptime Robot) | 2 horas | Logging |
| S2-6 | `noImplicitAny: true` via ratchet (reduzir -50/sprint) | ongoing | Tipagem |
| S2-7 | Regra ESLint bloqueando `supabase.from()` fora de services | 1 dia | Arquitetura |
| S2-8 | Diagrama ER das 20 tabelas principais (dbdiagram.io) | 1 dia | Documentação |

---

## NOTA FINAL

**Maturidade geral: 6.6/10 — Sistema sólido em construção, com fundações seguras mas gaps operacionais críticos.**

Os pontos fortes são reais e impressionantes para uma stack de startup em produção: RLS 100% no banco, pipeline de CI bem arquitetado com lint ratchet, 2.493 testes passando, CORS e security headers corretos, lazy loading sofisticado e documentação ricamente mantida. A base de autorização (372 políticas RLS, ProtectedRoute robusto) está acima da média do mercado.

Os gaps críticos que impedem o 8+/10 são três: (1) **observabilidade zero** — erros de JavaScript em produção silenciam sem Sentry, impossibilitando diagnóstico rápido; (2) **HMAC não enforced** no endpoint de maior risco (evolution-webhook aceita qualquer POST sem assinatura); e (3) **TypeScript permissivo** — `strictNullChecks: false` cria blindspot inteiro para null/undefined errors em runtime. Esses três corrigidos com as Quick Wins/Sprint 1 acima, o sistema salta para **~7.8/10**.

---
*Auditoria realizada em 2026-09-02. Evidências coletadas: código-fonte HEAD `17436eb`, banco ao vivo via MCP Supabase (126 tabelas, 372 policies), relatório de validação `docs/security/validation-report-2026-08-30.md`.*
