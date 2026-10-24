# AUDITORIA TÉCNICA EXAUSTIVA v2 — ZAPP WEB V2 (re-auditoria)

**Data:** 2026-09-02 (noite) · **Executor:** Claude (Arquiteto Sênior + QA) · **Branch auditada:** `main` (HEAD `0cbf30d`)
**Baseline comparada:** auditoria de 2026-09-02 manhã em `17436eb` (nota 6.6/10 — `AUDITORIA_TECNICA_22_DIMENSOES_2026-09-02.md`)

# **Nota geral ponderada: 7.0/10** (▲ +0.4)

Fontes de evidência desta re-auditoria (tudo verificado nesta sessão, não herdado do relatório anterior):
- Código em `main@0cbf30d` (clone fresco) + execução local real de: guards de CI, lint-ratchet, typecheck-ratchet, vitest (unit + contratos), build de produção, `bun audit`
- Banco de produção `tnnnlkbymytvtqngbbqh` via MCP (`pg_class`, `pg_policies`, `pg_proc`, `pg_stat_statements`, `cron.job`, `supabase_migrations`)
- GitHub API (branch protection, 1.837 workflow runs, PRs abertos)
- Vercel API (deployments do projeto `zapp_web_v2`, team `juca1`)
- Hostinger API (VPS `srv1481814`, firewalls)

---

## FASE 0 — INVENTÁRIO DO SISTEMA

| Item | Valor |
|---|---|
| Repositório | `adm01-debug/zapp-web-v2`, branch `main`, público |
| Stack frontend | React 19.2 + TypeScript 5.8 + Vite 8.2 (Rolldown) + Tailwind 3 + shadcn/Radix + TanStack Query 5 |
| Backend | Supabase Cloud `tnnnlkbymytvtqngbbqh` — PostgreSQL **17.6**, 48 MB |
| Edge Functions | **61** no manifest (`generate-manifest.mjs`: 61 functions, 79 source files) |
| WhatsApp | Evolution GO na VPS Hostinger `srv1481814` (KVM 4: 4 vCPU/16 GB, Ubuntu 24.04 + Docker + Traefik) |
| Arquivos `.ts/.tsx` | 1.304 (src: 174.702 LOC; edges: 13.284 LOC) |
| Tabelas no banco | **130** — RLS habilitado em **130 (100%)** |
| Políticas RLS | **378** · Funções public: 70 · Realtime: 20 tabelas · pg_cron: 5 jobs ativos |
| Migrations | **339 arquivos** no repo / **341 registradas** no banco → **drift de 2** (ver Dim. 4) |
| Testes | **2.519 unit passed + 32 skipped** (160 arquivos) + **167 contratos** — CI verde na `main` |
| CI | 7 workflows, 100% actions SHA-pinned (verificado por `check-workflow-pins.mjs`) |
| Último deploy prod | Vercel READY em `0cbf30d` (auto-deploy `main` + preview por PR) — verificado via API |
| Estado operacional | 6 PRs abertos (4 de sessões Claude paralelas) · **DB Live Guard VERMELHO na `main`** (2 últimas runs) |

---

## FASE 1 — AS 22 DIMENSÕES

### 1. ARQUITETURA — **7/10** (=)

**Evidências:**
- Estrutura feature-based consolidada: `src/{components,services,hooks,adapters,providers,types,integrations,routes}` + `supabase/functions/_shared/` com 19 módulos reutilizáveis
- 9+ ADRs (`docs/adr/`, `docs/decisions/`)
- **116 componentes** em `src/components/` importam `@/integrations/supabase/client` diretamente (grep) — service layer existe mas não é enforced
- Dead code real detectado: `src/hooks/system/useImportData.ts` (único consumidor de `xlsx`) está **fora do grafo do bundle** — o build de produção passou com o pacote `xlsx` fisicamente ausente do node_modules, prova de que nenhuma rota alcança o hook. A feature "Importação CSV/Excel" não está ligada a nenhuma view.

**Gaps para 10/10:** enforcement de camadas (ESLint `no-restricted-imports` p/ client Supabase fora de services/hooks); domains isolados; remover/ligar `useImportData`.

**Ações:** regra ESLint no ratchet + decisão sobre a feature de importação (ligar na UI ou remover hook+dep).

---

### 2. AUTENTICAÇÃO — **8/10** (▲ de 7.5)

**Evidências (upgrades confirmados nesta re-auditoria):**
- Supabase Auth com `flowType: 'pkce'`, `autoRefreshToken`, `detectSessionInUrl` (`src/integrations/supabase/client.ts:24-31`)
- **MFA TOTP completo**: `MFAEnroll.tsx`, `MFAVerify.tsx`, `MFASettings.tsx`, `useMFA.ts` + teste — não é só backup codes
- **Brute force server-side implementado**: funções `record_failed_login`, `get_own_lockout_status`, `clear_login_attempts` no banco (confirmado via `pg_proc`) + `src/lib/loginAttempts.ts` no front com teste
- Checagem de senha vazada via HIBP: `api.pwnedpasswords.com` presente no CSP `connect-src` (`vercel.json`)
- WebAuthn/passkey: edge function `webauthn/` + fluxo `approve-password-reset/` + `detect-new-device/`

**Gaps para 10/10:** password policy do GoTrue não auditável por SQL (conferir no dashboard: min length ≥ 12); rate limit nativo do Supabase Auth não instrumentado com alerta.

**Ações:** documentar config de Auth do dashboard em `docs/DB-SECURITY.md` (política de senha, expiração de OTP, rate limits) para tornar auditável.

---

### 3. AUTORIZAÇÃO — **8/10** (=)

**Evidências:**
- RLS em **130/130 tabelas** (via `pg_class.relrowsecurity`), **378 policies**
- Fix recente de tautologia de policy: `20260902200000_fix_team_message_reactions_membership_tautology.sql` (PR #157)
- Hardening recente: `20260902210000_revoke_departments_secrets_from_authenticated.sql`
- Superfície anon mínima: **1 policy** menciona `anon` em todo o schema public
- 24 policies `USING (true)` p/ authenticated são todas de tabelas de config/catálogo (queues, tags, templates, business_hours…) — design plausível para leitura compartilhada, mas sem decisão registrada

**Gaps para 10/10 (inalterados):** zero testes automatizados de RLS boundary; 945 grants default do role `anon` em public (RLS bloqueia, mas revogar reduz superfície); autorização por campo inexistente.

**Ações:** suite `rls-boundary.test.ts` com JWTs por role (2 positivos + 2 negativos por role); `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` + `GRANT` seletivo só no necessário (1 policy anon hoje); ADR curto sobre as 24 policies de leitura ampla.

---

### 4. BANCO DE DADOS — **7.5/10** (▼ de 8)

**Evidências positivas:**
- G-03 (versão duplicada) **resolvido**: `uniq -d` nos prefixos = vazio
- G-04 **resolvido**: **0 funções SECURITY DEFINER sem `search_path`** (verificado via `pg_proc.proconfig`; migration `20260902150000`)
- Zero colunas float para dinheiro (`information_schema.columns`, padrão price/valor/amount/total)
- CHECK constraints em tabelas high-write (`20260901100300`), MIME restrictions no storage do team chat (`20260902100002`)
- Dead tuples sob controle (pior: `messages` 2.257/13.556 ≈ 14%, autovacuum dá conta; crons de VACUUM agendados)

**Gap NOVO e ATIVO — drift de migrations (causa do DB Live Guard vermelho):**
- Registradas no banco **sem arquivo no repo** e **sem pin em `migration-evidence.json`**:
  - `20260902210334_messages_external_id_unique_index`
  - `20260902220001_idx_messages_contact_media`
- As 2 últimas runs do workflow **DB Live Guard na `main` = failure** (21:08 e 20:53 UTC). São DDLs aplicados hoje por sessões paralelas via `db_transaction` sem fechar o ciclo do CLAUDE.md (arquivo + registro + catálogo).

**Gaps menores:** 6 FKs single-column sem índice; 15 índices com 0 scans (stats de ~5 dias — reavaliar em 30d antes de dropar); migrations sem DOWN.

**Ações:** criar os 2 arquivos retroativos + atualizar `schema-catalog.json` (procedimento já usado nos PRs #131/#157); depois `node scripts/db-audit/check-migration-drift.mjs` verde.

---

### 5. CI/CD — **8.5/10** (=)

**Evidências:**
- 7 workflows; **todas as actions SHA-pinned** (rodei `check-workflow-pins.mjs`: OK)
- Ratchets de dívida (lint + typecheck) com dedup por âncora de contexto (fix #163) — rodei ambos localmente
- Branch protection `main` (via API): `strict=true`, 3 checks obrigatórios, `enforce_admins=true`, `required_conversation_resolution=true`, force-push/deleção bloqueados
- Deploy: Vercel auto em `main` + preview por PR (verificado via API — 20 deployments hoje, prod READY)
- Guard de acoplamento código↔banco (`supabase-usage-guard`) + manifest de edges com sha256

**Gaps para 10/10:**
- **`required_approving_review_count = 0`** e `require_code_owner_reviews = false` — PR mergeia sem nenhuma aprovação; CODEOWNERS é decorativo
- `bun audit` roda com `continue-on-error: true` → **38 vulnerabilidades HIGH passam sem bloquear** (ver Dim. 16)
- Sem CodeQL/SAST; secret-scan do CI é um grep simples
- Job `audit-report` teve loop infinito; fix está no PR #162 **ainda não mergeado**

**Ações:** subir `required_approving_review_count` para 1 (Copilot Review já roda nos PRs) ou registrar exceção solo-dev em ADR; separar `bun audit` em: prod deps bloqueante / dev deps informativo; adicionar workflow CodeQL; mergear #162.

---

### 6. DATA INTEGRITY — **6.5/10** (=)

**Evidências:** dedup por UNIQUE não-parcial + upsert idempotente nos handlers; pre-check de dedup escopado por connection/sender (#133); CHECK constraints high-write; normalização de email vazio (#154); FKs íntegras.

**Gaps (inalterados):** `grep BEGIN|db_transaction` em `supabase/functions/` = **0** — operações multi-tabela dos webhooks continuam sem atomicidade; soft delete presente em **1 tabela** apenas (sem política global); sem optimistic locking.

**Ações:** RPC `process_incoming_message_tx()` (plpgsql, atômica) chamada pelo handler em vez de N writes; ADR de política soft vs hard delete.

---

### 7. DOCUMENTAÇÃO — **8/10** (▼ de 8.5)

**Evidências:** `docs/` com 80+ arquivos vivos (auditorias datadas, ADRs, LGPD, runbooks, migração Evolution GO); CLAUDE.md exemplar e atualizado.

**Gaps:**
- `docs/runbooks/deploy.md` **continua descrevendo o fluxo Lovable** (linhas 10-96: "clicar em Publish no painel Lovable", URLs `*.lovable.app`) — gap apontado na auditoria da manhã e ainda não corrigido, agora com agravante: é o runbook que um operador seguiria num incidente
- `CHANGELOG.md` estagnado (Unreleased com itens de abril; versão no package.json é 0.2.0)
- Sem diagrama ER

**Ações:** reescrever `deploy.md` para o fluxo real (commit → CI → Vercel/Edge deploy → rollback via dashboard Vercel, que expõe `isRollbackCandidate`); ou congelar CHANGELOG com nota "substituído pelo histórico de PRs".

---

### 8. INFRAESTRUTURA / DEVOPS — **5.5/10** (▼ de 6)

**Evidências positivas:** Vercel (CDN/TLS/rollback) + Supabase Cloud gerenciado; container `pg-backup` rodando na VPS (backup do Postgres da Evolution GO); `tmp/` removido do git e no `.gitignore` (G-05 resolvido).

**Gaps (com achado novo grave):**
- **A VPS `srv1481814` está SEM firewall anexado** — `firewall_group_id: null` na API da Hostinger. O único firewall da conta (`openclaw-promo-brindes`, abril/2026, `is_synced: false`) pertence a outro projeto e liberaria 22/80/443/54720/18789 para `0.0.0.0/0`. Hoje **todas** as portas do host estão expostas, incluindo a 32783 (Evolution API direto, fora do Traefik) e a porta do Postgres se algum compose publicar
- `xlsx` instalado de tarball `cdn.sheetjs.com`: nesta sessão o `bun install --frozen-lockfile` falhou o download (`error: ConnectionClosed`) e **mesmo assim saiu com exit 0** — instalação silenciosamente incompleta. Fora do npm: sem audit, sem mirror, single point of failure de build
- Sem IaC, sem staging Supabase, DR não testado

**Ações:** criar firewall dedicado (22 restrito a IP fixo se possível, 80, 443) e anexar à VPS — validar antes que todo tráfego da Evolution GO passa pelo Traefik 443 (front e edges usam `https://evolution-go-rxj2.srv1481814.hstgr.cloud`, então sim); vendorizar o tarball do xlsx (ex.: `vendor/xlsx-0.20.3.tgz` no repo, path no package.json) — nota: voltar ao npm não é opção, SheetJS não publica mais lá e as versões npm têm CVE conhecida (histórico no #152).

---

### 9. LOGGING / MONITORING — **6/10** (=)

**Evidências:** logger front com `sessionId` + correlationId (`src/lib/logger.ts`); Logger estruturado nas edges; `audit_logs`; `console.log` tree-shaken em prod (só 1 ocorrência no src inteiro).

**Gaps (inalterados):** **Sentry continua ausente** (`grep Sentry src/main.tsx package.json` = 0) — erro de JS em produção morre em silêncio; sem uptime monitoring externo; sem alertas.

**Ações:** `bun add @sentry/react` + init em `main.tsx` com `VITE_SENTRY_DSN` (~15 linhas); uptime check externo nas URLs Vercel + Supabase REST + Evolution GO.

---

### 10. OBSERVABILIDADE — **5/10** (▲ de 4.5)

**Evidências:** Web Vitals próprios (LCP/INP/CLS); ErrorBoundary multi-nível; tabelas de métricas (`ai_usage_logs`, `rate_limit_logs`); **`pg_stat_statements` ativo e acessível** (usei nesta auditoria — o relatório anterior dizia "não configurado", estava errado).

**Gaps:** sem error tracking (Sentry), sem tracing cross-service (React → Edge → Evolution GO sem request-id propagado ponta a ponta), sem SLOs, sem APM.

**Ações:** Sentry com `browserTracingIntegration` (resolve 2 pilares de uma vez); propagar o `rid` das edges no header de resposta e logá-lo no front.

---

### 11. LÓGICA DE NEGÓCIO — **7/10** (▲ de 6.5)

**Evidências:** services layer (`RoleService`, `ChatService`, `ContactService`, `QueueService`); SLA configurável (`sla_rules`/`sla_violations`); chatbot L1; métricas de satisfação agora **reais** (mock removido, #137); 11 bugs de domínio Evolution em correção validada (PR #165: PTT vs audio, READ vs DELIVERY_ACK, estados transitórios de conexão).

**Gaps:** FSM de conversas implícita (transições open/pending/closed sem documento nem validação de transição); feature flags runtime inexistentes (grep `feature_flags|featureFlag` no src = 0); regras ainda vazando para componentes.

**Ações:** ADR-007 com a state machine de conversas + CHECK/trigger de transição válida no banco.

---

### 12. MANUTENIBILIDADE — **7/10** (▲ de 6.5)

**Evidências:** dívida rastreada com precisão — lint ratchet: **baseline 1.123 → atual 1.112, 0 novas** (rodado localmente); typecheck baseline 133 (PR #162 reduz para 118); **0 TODO/FIXME/HACK** no src; `: any` caiu de 115 → **32**; conventional commits impecáveis; Dependabot ativo e mergeando (vite 8.2.2, framer-motion 12.43 etc.).

**Gaps:** sem pre-commit hooks (husky ausente do package.json); `noUnusedLocals/Parameters: false` + `no-unused-vars: off`; inconsistência de Node: `.nvmrc`=20, CI=24, engines ausente.

**Ações:** husky + lint-staged (`typecheck-ratchet` + `lint-ratchet` no pre-push); alinhar `.nvmrc`/CI/`engines`.

---

### 13. OPERACIONALIDADE — **6/10** (=)

**Evidências:** rollback Vercel real e disponível (API expõe `isRollbackCandidate` nos deploys de prod); ErrorBoundaries; runbook de incidente existe.

**Gaps:** runbook de deploy desatualizado (Lovable — ver Dim. 7); sem circuit breaker se a Evolution GO cair; migrations sem DOWN; **evidência concreta de risco operacional multi-sessão**: 6 PRs abertos de 4+ sessões Claude paralelas hoje, e o drift de migrations da Dim. 4 nasceu exatamente disso.

**Ações:** runbook de rollback passo a passo (Vercel + migration DDL manual); protocolo de coordenação de sessões paralelas no CLAUDE.md (ex.: DDL só com arquivo no mesmo turno, nunca só `db_transaction`).

---

### 14. PERFORMANCE — **7.5/10** (=)

**Evidências (build real desta sessão, 10.2s):**
- Chunking sofisticado; lazy routes; `@tanstack/react-virtual`; initial core enxuto (vendor-core 204 KB + vendor-data 215 KB, pré-gzip)
- Top queries do banco saudáveis; realtime poller domina o total (esperado); **pior query de app: `UPDATE messages SET is_read` — média 323 ms** (68 calls) — candidato a índice parcial `(contact_id) WHERE is_read = false` (nota: o índice recém-criado fora do git `idx_messages_contact_media` e o `20260902220001` mostram trabalho ativo aqui)
- Paginação server-side presente

**Gaps:**
- `dist-ChE825p4.js` = **610 KB**: é o `@elevenlabs/react` (bundla LiveKit) caindo no chunk default sem regra de `manualChunks` — importado por ChatPanel/Index/RealtimeTranscription
- `vendor-maps` (mapbox-gl) = **1.87 MB** — maior chunk do app
- Sem baseline de bundle no CI (`reportCompressedSize: false`, `performance-budget.json` existe mas não é enforced em job)

**Ações:** adicionar `vendor-voice` no `manualChunks` + garantir import dinâmico do ElevenLabs só nas views de voz; idem mapbox; job de CI comparando tamanho gzip com `performance-budget.json`.

---

### 15. QUALIDADE DE CÓDIGO — **7.5/10** (▲ de 7)

**Evidências:** ESLint 9 flat config + Prettier; `no-console: warn` com allow warn/error; **1** `console.log` e **0** TODOs no src inteiro; 32 `: any` (fora de testes); PR template + CODEOWNERS + issue templates; commits semânticos 100%.

**Gaps:** sem pre-commit hooks; `@typescript-eslint/no-unused-vars: off`; dívida de lint 1.112 (rastreada mas grande); ESLint em `recommended` (não `strict`).

**Ações:** ver Dim. 12 (husky); ligar `no-unused-vars: warn` e absorver no ratchet.

---

### 16. SEGURANÇA — **7/10** (=, com composição diferente)

**Resolvido desde a manhã (verificado):**
- ✅ HMAC **implementado** no `evolution-webhook` (#146/#154): assinatura inválida → 401; secret com fallback `EVOLUTION_WEBHOOK_SECRET || WEBHOOK_SECRET`
- ✅ API keys removidas dos docs (grep hex-32 nos arquivos citados = 0) e `tmp/` fora do git — **rotação da chave exposta não é verificável pelo repo; confirmar se foi feita**
- ✅ CSP Report-Only + headers completos no `vercel.json` (#132): nosniff, DENY, Referrer-Policy, Permissions-Policy
- ✅ CORS allowlist exata + regex de previews Vercel (`_shared/validation.ts:69-89`)
- ✅ Webhooks gmail/whatsapp com validação de assinatura em modo sombra (#135)

**Gaps atuais:**
- **HMAC em `strictMode = false`** (`evolution-webhook/index.ts:44`): request **sem** header de assinatura ainda é aceito — o endpoint mais crítico segue aberto a POST não assinado até virar a chave
- **38 vulnerabilidades HIGH no `bun audit`**, destaque: `@remix-run/router <= 1.23.1` (cadeia do `react-router-dom` **em produção**) — XSS via open redirect (GHSA-2w69-qvjg-hvjx); resto majoritariamente browserslist/build-time. CI não bloqueia (continue-on-error)
- CSP ainda Report-Only (planejado, mas sem data para enforce); sem CodeQL; 5 usos de `dangerouslySetInnerHTML` (DOMPurify presente no projeto, cobertura dos 5 pontos não confirmada individualmente)

**Ações (ordem):** 1) configurar secret HMAC na Evolution GO e virar `strictMode=true`; 2) `bun update react-router-dom` (patch dentro do v6) e re-audit; 3) promover CSP para enforce após 1 semana de report sem violação legítima; 4) CodeQL.

---

### 17. TESTES — **7/10** (=)

**Evidências (execução real):** **2.519 unit passed | 32 skipped** em 160 arquivos (78s) + **167 testes de contrato** (4 arquivos, 0.9s); guards de CI/DB com testes próprios (`node --test`: 0 fail). Nota de ambiente: 1 arquivo (`useImportData.test.ts`) falhou **localmente** por o download do xlsx ter sido bloqueado pelo proxy — na CI do GitHub a mesma suite está verde na `main`.

**Gaps (inalterados):** sem E2E (Playwright ausente); sem testes de RLS; cobertura sem threshold no CI; 32 skipped sem justificativa auditada.

**Ações:** suite RLS boundary (maior ROI); `test:coverage` com threshold em lógica crítica; Playwright com 3 happy paths (login, enviar mensagem, fechar conversa).

---

### 18. TIPAGEM / TYPE SAFETY — **6.5/10** (▲ de 5.5)

**Evidências:** **`strictNullChecks: true` ATIVO** no `tsconfig.app.json` (o avanço estrutural pedido como P3 na auditoria da manhã — aplicado, com 15 erros nulos corrigidos no PR #162 e ratchet segurando regressão); `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `alwaysStrict` ativos; types.ts gerado + workflow `types-sync` com gates de revisão; `: any` = 32.

**Gaps:** `strict: false` e `noImplicitAny: false` ainda; dívida typecheck 133 (→118 no #162); Zod para validação runtime quase ausente no front.

**Ações:** próxima catraca: `noImplicitAny: true` (baseline no ratchet absorve o legado); meta -10 `any`/sprint.

---

### 19. VALIDAÇÃO — **6/10** (=)

**Evidências:** edges com `schemas.ts` (360 linhas: envelopes V1/V2 Zod, `validationErrorResponse`), `sanitizeString`, `isValidUUID`; MIME restrictions no storage (migration `20260902100002`); react-hook-form nos formulários.

**Gaps:** Zod importado em **6** arquivos do src e **`zodResolver` em 0 formulários** — validação de formulário é ad-hoc; sem schemas compartilhados front↔edge; mensagens de erro genéricas.

**Ações:** `src/lib/schemas/` com 10 entidades + `zodResolver` nos formulários de contato/conversa/config; reaproveitar os schemas das edges via pasta compartilhada.

---

### 20. OPERAÇÕES (PROCESSOS) — **6.5/10** (=)

**Evidências:** fluxo GitHub-first operacional de verdade (20 deploys Vercel só hoje, previews por PR, Copilot Code Review rodando em todo PR); Dependabot semanal com PRs mergeados; cultura de auditoria contínua (9 relatórios datados em `docs/audits/`).

**Gaps:** **coordenação de sessões paralelas é o processo mais frágil hoje** — o drift de migrations e os 6 PRs simultâneos (2 deles tocando os mesmos arquivos de media-gallery: #156 e #166) evidenciam; hotfix não documentado; sem SLA de review; PR #160/#162 (correção do loop do audit-report) parados.

**Ações:** protocolo de DDL no CLAUDE.md ("nenhum DDL sem arquivo committed no mesmo turno"); triagem dos 6 PRs abertos (mergear/fechar); documentar hotfix.

---

## FASE 2 — CONSOLIDAÇÃO

### Scorecard (Δ vs auditoria 2026-09-02 manhã)

```
╔══════════════════════════════════╦═══════╦══════╦═══════╦═══════════════════════════════════════════════╗
║ DIMENSÃO                         ║ NOTA  ║  Δ   ║ PESO  ║ GAP PRINCIPAL PARA 10/10                      ║
╠══════════════════════════════════╬═══════╬══════╬═══════╬═══════════════════════════════════════════════╣
║ 1.  Arquitetura                  ║  7.0  ║  =   ║  ×2   ║ Supabase direto em 116 componentes            ║
║ 2.  Autenticação                 ║  8.0  ║ ▲0.5 ║  ×3   ║ Password policy não auditável (dashboard)     ║
║ 3.  Autorização                  ║  8.0  ║  =   ║  ×3   ║ Sem testes de RLS; 945 grants anon default    ║
║ 4.  Banco de Dados               ║  7.5  ║ ▼0.5 ║  ×2   ║ DRIFT: 2 migrations sem arquivo (guard RED)   ║
║ 5.  CI/CD                        ║  8.5  ║  =   ║  ×1   ║ 0 aprovações obrigatórias; audit não bloqueia ║
║ 6.  Data Integrity               ║  6.5  ║  =   ║  ×3   ║ Zero transações atômicas nas edges            ║
║ 7.  Documentação                 ║  8.0  ║ ▼0.5 ║  ×1   ║ Runbook de deploy ainda descreve Lovable      ║
║ 8.  Infraestrutura / DevOps      ║  5.5  ║ ▼0.5 ║  ×1   ║ VPS SEM firewall anexado; xlsx via CDN frágil ║
║ 9.  Logging / Monitoring         ║  6.0  ║  =   ║  ×1   ║ Sentry ausente — erro de prod silencia        ║
║ 10. Observabilidade              ║  5.0  ║ ▲0.5 ║  ×1   ║ Sem tracing/SLO/APM                           ║
║ 11. Lógica de Negócio            ║  7.0  ║ ▲0.5 ║  ×1   ║ FSM de conversas implícita; sem flags runtime ║
║ 12. Manutenibilidade             ║  7.0  ║ ▲0.5 ║  ×1   ║ Sem pre-commit hooks; dívida lint 1.112       ║
║ 13. Operacionalidade             ║  6.0  ║  =   ║  ×1   ║ Sem circuit breaker p/ Evolution GO           ║
║ 14. Performance                  ║  7.5  ║  =   ║  ×2   ║ elevenlabs 610KB sem chunk; mapbox 1.87MB     ║
║ 15. Qualidade de Código          ║  7.5  ║ ▲0.5 ║  ×1   ║ Hooks locais ausentes; unused-vars off        ║
║ 16. Segurança                    ║  7.0  ║  =   ║  ×3   ║ HMAC strictMode=false; react-router CVE HIGH  ║
║ 17. Testes                       ║  7.0  ║  =   ║  ×2   ║ Sem E2E nem testes de RLS                     ║
║ 18. Tipagem / Type Safety        ║  6.5  ║ ▲1.0 ║  ×2   ║ noImplicitAny:false; strict:false             ║
║ 19. Validação                    ║  6.0  ║  =   ║  ×2   ║ zodResolver em 0 formulários                  ║
║ 20. Operações (Processos)        ║  6.5  ║  =   ║  ×1   ║ Sessões paralelas sem protocolo (drift hoje)  ║
╠══════════════════════════════════╬═══════╬══════╬═══════╬═══════════════════════════════════════════════╣
║ NOTA GERAL PONDERADA             ║ 7.0   ║ ▲0.4 ║       ║ Sólido; gargalos: integridade + observab.     ║
╚══════════════════════════════════╩═══════╩══════╩═══════╩═══════════════════════════════════════════════╝
```

**Cálculo:** ×3 (Aut 8 + Autz 8 + DI 6.5 + Seg 7 = 29.5 → 88.5) + ×2 (Arq 7 + BD 7.5 + Perf 7.5 + Test 7 + Tip 6.5 + Val 6 = 41.5 → 83) + ×1 (8.5+8+5.5+6+5+7+7+6+7.5+6.5 = 67.5) = **239 / 34 = 7.03 ≈ 7.0**

### O que mudou desde a manhã (17436eb → 0cbf30d)
Fechados: G-03, G-04, G-05, F-01/F-02 (chaves nos docs), HMAC implementado (parcial), `strictNullChecks:true`, CSP+headers, xlsx npm CVE→CDN oficial, satisfação real no dashboard, ~10 bugs de inbox/Evolution.
Abertos novos: drift de 2 migrations (guard vermelho), firewall da VPS não anexado (não visto antes), CVE react-router, chunk elevenlabs.
Persistem: Sentry, transações em edges, testes RLS/E2E, zodResolver, husky, runbook Lovable, CodeQL, approvals=0.

---

## TOP 10 AÇÕES POR ROI

```
[P1] [BANCO/OPS] Regularizar drift das 2 migrations → DB Live Guard verde
├── Impacto: Alto (guard vermelho na main AGORA; quebra a fonte de verdade schema↔git)
├── Esforço: Baixo (30 min) · Tipo: Migration + Config
├── Arquivos: supabase/migrations/20260902210334_*.sql + 20260902220001_*.sql (retroativas) + schema-catalog.json
└── Aceite: run do DB Live Guard verde; check-migration-drift.mjs exit 0

[P2] [SEGURANÇA] Patch react-router-dom (GHSA-2w69-qvjg-hvjx, HIGH, prod)
├── Impacto: Alto · Esforço: Baixo (bump patch v6 + CI)
├── Arquivo: package.json / bun.lock
└── Aceite: bun audit sem HIGH em dependência de produção

[P3] [INFRA] Firewall dedicado na Hostinger anexado à VPS srv1481814
├── Impacto: Alto (hoje TODAS as portas do host expostas; 32783 = Evolution API direta)
├── Esforço: Baixo (30 min + validação de que tudo passa pelo Traefik 443)
├── Tipo: Config (API Hostinger: createNewFirewall + rules 22/80/443 + activate)
└── Aceite: firewall_group_id preenchido; https://evolution-go-rxj2... OK; porta 32783 inacessível externamente

[P4] [SEGURANÇA] HMAC strictMode=true no evolution-webhook
├── Impacto: Alto (fecha POST não assinado no endpoint mais crítico)
├── Esforço: Baixo (configurar secret na Evolution GO → flip do boolean → monitorar logs)
├── Arquivo: supabase/functions/evolution-webhook/index.ts:44
└── Aceite: request sem assinatura → 401; mensagens reais continuam fluindo

[P5] [OBSERVABILIDADE] Sentry no front
├── Impacto: Alto (erros de prod hoje silenciam) · Esforço: Baixo (45 min)
├── Arquivos: src/main.tsx + package.json + VITE_SENTRY_DSN na Vercel
└── Aceite: erro de teste aparece no dashboard Sentry

[P6] [DATA INTEGRITY] Transação atômica no fluxo de mensagem inbound
├── Impacto: Alto · Esforço: Médio (RPC plpgsql + refactor do handler)
├── Arquivos: migration nova + _shared/evolution-webhook-messages.ts
└── Aceite: falha simulada no meio do fluxo não deixa mensagem sem contato/evento

[P7] [TESTES] Suite RLS boundary
├── Impacto: Alto (378 policies sem 1 teste) · Esforço: Médio (1 dia)
├── Arquivo: src/__tests__/rls-boundary.test.ts (JWT por role, positivo+negativo)
└── Aceite: ≥10 cenários passando no CI

[P8] [CI/CD] Aprovação obrigatória (1) + audit bloqueante + CodeQL
├── Impacto: Médio · Esforço: Baixo (config GitHub + 1 workflow)
└── Aceite: PR sem aprovação não mergeia; HIGH em prod dep bloqueia; CodeQL agendado

[P9] [PERFORMANCE] Chunk vendor-voice (@elevenlabs/react 610KB) + lazy garantido
├── Impacto: Médio · Esforço: Baixo (regra manualChunks + dynamic import)
├── Arquivo: vite.config.ts
└── Aceite: chunk "dist-*" some; elevenlabs só carrega nas views de voz

[P10] [VALIDAÇÃO] zodResolver nos 10 formulários críticos
├── Impacto: Médio · Esforço: Médio
├── Arquivos: src/lib/schemas/ (novo) + formulários de contato/config
└── Aceite: 10 formulários com schema Zod; submit inválido bloqueado com mensagem específica
```

---

## ROADMAP EM 3 ONDAS

### 🔴 Quick Wins (1-3 dias)
| # | Ação | Dimensão |
|---|---|---|
| QW1 | P1 — migrations retroativas do drift (guard verde) | Banco/Ops |
| QW2 | P2 — patch react-router-dom | Segurança |
| QW3 | P3 — firewall na VPS Hostinger | Infra |
| QW4 | P5 — Sentry init | Observabilidade |
| QW5 | Runbook deploy.md: Lovable → Vercel real | Documentação |
| QW6 | Triagem dos 6 PRs abertos (#156/#160/#162/#164/#165/#166) | Operações |
| QW7 | Vendorizar tarball xlsx no repo | Infra |

### 🟠 Sprint 1 (1-2 semanas)
| # | Ação | Dimensão |
|---|---|---|
| S1-1 | P4 — HMAC strict (com config na Evolution GO) | Segurança |
| S1-2 | P6 — RPC transacional p/ mensagem inbound | Data Integrity |
| S1-3 | P7 — testes RLS boundary | Testes/Autorização |
| S1-4 | P8 — approvals=1 + audit bloqueante + CodeQL | CI/CD |
| S1-5 | Husky + lint-staged | Manutenibilidade |
| S1-6 | P9 — chunk elevenlabs + revisão mapbox lazy | Performance |
| S1-7 | Protocolo de sessões paralelas no CLAUDE.md | Operações |

### 🟡 Sprint 2 (2-4 semanas)
| # | Ação | Dimensão |
|---|---|---|
| S2-1 | P10 — Zod schemas + zodResolver | Validação |
| S2-2 | `noImplicitAny: true` via ratchet | Tipagem |
| S2-3 | Playwright E2E (3 happy paths) | Testes |
| S2-4 | Revoke grants anon + ADR das policies de leitura ampla | Autorização |
| S2-5 | ESLint no-restricted-imports (client fora de services) | Arquitetura |
| S2-6 | CSP Report-Only → enforce | Segurança |
| S2-7 | FSM de conversas (ADR-007 + constraint) | Lógica de Negócio |
| S2-8 | Uptime monitoring externo + SLOs mínimos | Logging/Obs |

---

## NOTA FINAL

**7.0/10 — o sistema atravessou a barreira do "sólido com ressalvas" e o processo de melhoria está comprovadamente funcionando: das 10 ações da auditoria da manhã, 5 já estão em produção 12 horas depois.** A fundação de segurança de dados é o ponto mais forte (RLS 100% em 130 tabelas, 378 policies, secdef 100% com search_path, MFA TOTP + lockout + HIBP), e a malha de CI (SHA-pinned, ratchets com dedup por âncora, guards de schema) é acima de qualquer padrão de equipe solo. Os três bloqueios para 8+: **(1) integridade transacional** nas edges (falha parcial de webhook ainda deixa estado inconsistente), **(2) observabilidade de produção** (sem Sentry, um erro de JS no cliente é invisível), e **(3) o flanco de infra da VPS** (sem firewall anexado — o achado mais urgente e mais barato desta re-auditoria). O risco sistêmico novo é operacional, não técnico: múltiplas sessões de IA em paralelo no mesmo banco/branch geraram hoje o primeiro drift de schema — o protocolo de coordenação vale mais que qualquer refactor.

---
*Gerado em 2026-09-02 ~21:45 UTC. Próxima re-auditoria sugerida após fechamento das ondas Quick Wins + Sprint 1.*

**Addendum (mesma sessão, ~22:00 UTC) — P1, P2 e P3 executados:**
- **P1 (drift):** migrations retroativas `20260902210334` e `20260902220001` criadas com corpo byte-idêntico ao ledger (md5 verificado) + `schema-manifest.json` re-sincronizado (2 índices novos + hash corrigido de `contacts.idx_contacts_email_trgm`, que o sync #159 capturou em estado transitório). `check-migration-drift.mjs` executado contra o ledger real de produção: exit 0, 341=341.
- **P2 (CVE react-router):** `react-router-dom` 6.30.1→6.30.6 / `@remix-run/router` 1.23.0→1.23.4 no `bun.lock` (dentro do range `^6.30.1`); GHSA-2w69-qvjg-hvjx eliminado do `bun audit` (38→37 HIGH; restantes = cadeia browserslist, build-time). Validado: install frozen, build, 2.519 testes, ratchets.
- **P3 (firewall VPS):** firewall `zapp-evolution-go-rxj2` (id 355246, TCP 22/80/443) criado e **ativado** na VPS `srv1481814` via API Hostinger (2× action `ct_firewall` = success; `firewall_group_id` preenchido). URL pública da Evolution GO validada antes e depois (Traefik 443 respondendo ~1s). Porta 32783 e demais deixam de aceitar tráfego externo.
