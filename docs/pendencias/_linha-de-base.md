# Linha de Base — Zapp Web V2 (gerado na Fase 0 do GOAL 2026-11-20)

> Base de regressão: o que FUNCIONA hoje na `main`, medido com evidência. Qualquer mudança
> posterior que não preserve este comportamento é regressão.

## Identidade
- Repo: adm01-debug/Zapp_Web_V2 · Deploy automático (merge = produção)
- HEAD main: `b267f6b2efb567f1ae7bdb44ee121c0645d76f0c` (2026-11-19, feat pairing-code #3290)
- Stack: Vite + React + TS; Supabase; bun (lock: `bun.lock`, Node >= 24, bun >= 1.3)

## CI na main (evidência 2026-11-20)
- **Push na main = VERDE**: run `44616171327` em `b267f6b2ef` — todos os jobs success:
  Node CI Scripts, E2E, TypeCheck, Workflow lint, Edge contracts, Unit Tests (1-3/3),
  Security Audit, Build, CI Gate. Bonus: `44608962107`, `44594578218`, `44582626694` verdes.
- **Dispatch manual (mesmo SHA)**: E2E falhou (`44626008469`, step "visual do Firefox, 1 worker") —
  **HERDADO**, não introduzido por mudança nossa; E2E em PR não-bloqueante.
- Workflows ativos: 22 (`ci.yml`, `db-migrate.yml`, `db-live-guard.yml`, `deploy-functions.yml`,
  `e2e-logado.yml`, `front-release-targets.yml`, `types-sync.yml`, contexto 10min, notifica-falha-main, ...).
  Desabilitados: branch-hygiene, check-talkx-pr-body, e2e-logado-isolado, e2e-talkx,
  inventario-estado-semanal, talkx-status-regen.

## Escopo do código (contagens do baseline gerado em `docs/contexto/codigo/baseline.json` @ 35d701970e)
12692 arquivos · 5835 código · 1.128.870 linhas · 147 módulos · 1054 componentes · 599 hooks ·
92 edge functions · 221 tabelas · 1145 migrations · **28 cron jobs** · 3196 testes · 22 workflows ·
451 scripts · 2730 docs.

> ⚠️ Discrepância registrada: `docs/contexto/supabase/README.md` informa `cron jobs = 0` e "pgmq não
> instalada"; `baseline.json` do código informa 28 cron jobs e o handoff cita 229 falhas
> "job startup timeout" em 35 min. O valor do código (28) é considerado correto; o snapshot supabase
> teve falha de coleta. Verificação ao vivo pendente (pg_cron).

## Front — rotas e navegação
- 18 URLs de tela protegidas em `src/routes/AppRoutes.tsx` (Index `/`, NotFound, Auth, 2FA,
  ForgotPassword, ResetPassword, VerifyEmail, SSOCallback, AccessDenied, Install, ChatPopup,
  QueueDetails, QueuesComparison, SLADashboard, SLAHistory, RateLimitDashboard, RolesPage, multiplix).
- 55 vistas por id; navegação por menu via `src/services/navigation.service.ts` (61 itens, 154 lazy).
  Menu principal (rotulo -> destino -> resolução): Dashboard, Chat(inbox), Contatos, Campanhas(talkx),
  Filas, Equipe(agents), Gmail, Email(email-chat), CRM 360°, Catálogo, Carteira, Configurações,
  Conexões, Chatbot, Automações, Agendamentos, Base de Conhecimento, Telefonia, Multiplix, Tarefas,
  Mapa, Grupos, Conquistas, Auditoria, Documentação, Consumo IA, Diagnóstico, Gmail Webhook,
  Classificador IA, Canais Omnichannel, Google Calendar, Calendário.
- Roles por item de menu resolvidas em navigation.service.ts (admin/supervisor/agent).

## Banco Supabase (projeto `tnnnlkbymytvtqngbbqh`) — fotografia
- 223 tabelas (221 no código), 507 functions, 177 triggers, 555 policies, 13 views, 782 índices,
  9 enums, 1145 migrations (17 recentes de TalkX/Multiplix/Copilot até `20261119010000_talkx_set_campaign_ab`).
- Modo de escrita de DDL: `docs/agentes/banco.md` (arquivo → PR → merge → deploy → apply). Migrations
  aditivas permitidas; destrutivas proibidas sem o dono.
- Banco é single-tenant; RLS = papel (admin/supervisor/agent) + propriedade. `company_id` é resíduo
  (só `multiplix_recipients`, 0 policies) — não propagar.

## 92 edge functions (nomes de env, sem valores)
EVOLUTION_API_URL/KEY/INSTANCE_NAME/INSTANCE_TOKEN/FLAVOR; SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY;
SUPABASE_PUBLISHABLE_KEY; RESEND_API_KEY; MULTIPLIX_SCOPE_HMAC_SECRET, MULTIPLIX_BATCH_SIZE;
TALKX_BATCH_SIZE, TALKX_BATCH_BUDGET_MS, TALKX_CONVERT_SECRET, TALKX_LINK_BASE_URL;
CRON_SECRET; BITRIX_WEBHOOK_URL; WEBHOOK_SECRET; GMAIL_OIDC_*; ELEVENLABS_WEBHOOK_SECRET;
WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN; SIP_PASSWORD; INTERNAL_ALERT_SECRET; ZAPP_BUILD_ID;
PROMOGIFTS_SUPABASE_URL/SERVICE_ROLE_KEY; EVOLUTION_VPS_SUPABASE_URL/ANON_KEY; TRUSTED_EMAIL_DOMAINS;
EVOLUTION_WEBHOOK_SECRET/ENFORCE; TZ, NODE_ENV, VITE_APP_VERSION etc.

## Erros herdados de produção (baseline — não introduzidos por nós)
- Conexão WhatsApp `PRINCIPAL` desconectada desde 07/10 (PRONTO_PRODUCAO.md): sem recebimento/envio real.
- E2E "visual do Firefox, 1 worker" falha em dispatch manual (não-bloqueante no push).
- Riscos RLS conhecidos (10-ACESSO-E-SEGURANCA ~L963): `ai_jobs`, `gmail_oauth_states`,
  `link_preview_cache`, `talkx_test_send_claims` sem policy (só service_role); `messages` DELETE,
  `query_telemetry` SELECT, `whisper_messages` UPDATE, `email_threads` INSERT sem policy p/ front.
- LGPD: sem purga definitiva de contato (soft-delete só oculta); sem expurgo de atendimento.
- `stopwatch`: nenhum cron job de retenção em dados de atendimento.