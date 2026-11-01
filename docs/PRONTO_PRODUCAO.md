# Pronto para produção — fluxos críticos do Zapp Web V2

Lista fechada. O sistema está "pronto" quando **todos** os fluxos abaixo estiverem **OK**.
Tudo o que não está aqui fica para depois (ver `.claude/CLAUDE.md`, congelamento de features).

Regra para marcar OK: prova em produção (query, request ou log real, com data e hora) **e** E2E do fluxo
passando na `main`. Quem marcar OK cola a prova na linha.

## Estado em 2026-11-01 (levantamento de 01/11, ~23:30 UTC)

| # | Fluxo | Estado | Prova |
|---|---|---|---|
| 1 | Login, sessão e papéis (agente/supervisor/admin) | NÃO VERIFICADO | edge `auth-login` responde; 2 logins nos últimos 7 dias (último 01/11 22:01 UTC). Suíte E2E logada nunca termina na `main` (ver nota) |
| 2 | Conectar número WhatsApp (QR / instância Evolution) | **QUEBRADO** | conexão padrão "Promo Brindes WhatsApp" (instância `PRINCIPAL`) com `status=disconnected`; 284 checagens "desconectado" em 24 h; reconexão automática ligada e sem efeito |
| 3 | Receber mensagem (webhook → banco → inbox) | **QUEBRADO** | última mensagem recebida de cliente: 2026-10-07 20:36 UTC. Zero desde então. Edge `evolution-webhook` responde |
| 4 | Enviar mensagem (texto e mídia) | **QUEBRADO** | último envio confirmado: 2026-10-11 14:21 UTC. 4 envios da última semana presos em `sending` (último 01/11 23:01 UTC). Edge `message-delivery` responde |
| 5 | Inbox: lista, atribuição, transferência, fechamento | NÃO VERIFICADO | sem tráfego desde 07/10; sem E2E de transferência |
| 6 | Contatos (criar, editar, buscar, mesclar, excluir) | NÃO VERIFICADO | E2E existe (`e2e/contacts-*`), depende da suíte logada |
| 7 | Admin de usuários (criar, editar, desativar, papéis) | NÃO VERIFICADO | sem E2E funcional (só acessibilidade) |
| 8 | Filas e roteamento (Talk-me, SLA) | NÃO VERIFICADO | `e2e/talk-me.spec.ts` depende da suíte logada |
| 9 | Saúde da conexão (monitor e alerta de queda) | PARCIAL | monitor detecta a queda (checagem a cada ~5 min), mas não reconecta |

Front em produção: Vercel `zapp_web_v2` publicado no commit `1252bb5` (= `main`), estado READY, zero erros
de execução nas últimas 24 h.

**Nota — E2E logado:** o grupo `authenticated` de `.github/workflows/e2e-logado.yml` (login real, inbox,
contatos, filas) é cortado pelo limite de 15 min e termina `CANCELLED` em todos os commits recentes da
`main` (ex.: `3b5f8a9`, rodou 20:07:15 → 20:22:32 UTC). Na prática, nenhum fluxo logado é testado na `main`.

## Onde está o código de cada fluxo

| # | Telas | Código principal | Edge functions | Tabelas / RPCs |
|---|---|---|---|---|
| 1 | `/auth`, `/2fa`, `/forgot-password`, `/reset-password`, `/auth/callback` | `src/services/auth.service.ts`, `src/hooks/auth/useAuthForm.ts`, `src/hooks/system/useUserRole.ts`, `src/components/auth/ProtectedRoute.tsx` | `auth-login`, `webauthn`, `approve-password-reset`, `revoke-auth-sessions` | `user_roles`, `profiles`, `user_has_permission`, `consume_login_gate` |
| 2 | view `connections` | `src/components/connections/ConnectionsView.tsx`, `src/hooks/inbox/useConnectionsManager.ts` | `evolution-api`, `evolution-sync`, `connection-health-check` | `whatsapp_connections`, `set_instance_token` |
| 3 | view `inbox` (tempo real) | `src/hooks/chat/useRealtimeMessages.ts`, `src/hooks/chat/useMessages.ts` | `evolution-webhook` (+ `_shared/evolution-webhook-messages.ts`), `whatsapp-webhook` | `messages`, `contact_identity_map`, `ingest_inbound_message` |
| 4 | chat da inbox | `src/services/outbound-message.service.ts`, `src/components/inbox/chat/useChatPanelHandlers.ts` | `message-delivery` | `enqueue_outbound_message`, `claim_outbound_message`, `complete_outbound_message`, `fail_outbound_message` |
| 5 | view `inbox` | `src/components/inbox/RealtimeInboxView.tsx`, `src/hooks/inbox/useRealtimeInbox.ts`, `src/hooks/chat/useConversationActions.ts` | `auto-close-conversations`, `chatbot-l1` | `transfer_conversation`, `close_conversation_atomic`, `reopen_conversation` |
| 6 | view `contacts` | `src/components/contacts/ContactsView.tsx`, `src/services/contact.service.ts` | `batch-fetch-avatars` | `contacts`, `search_contacts`, `merge_contacts_atomic`, `delete_contacts` |
| 7 | views `admin`, `agents`; `/admin/roles` | `src/components/admin/useAdminData.ts`, `src/components/agents/InviteAgentDialog.tsx` | `create-user`, `invite-user`, `revoke-auth-sessions` | `profiles`, `user_roles`, `admin_set_role` |
| 8 | `/queue/:id`, `/sla`, view `queues` | telas Talk-me e Supervisão | — | `talk_me_claim`, `talk_me_list_queues` |
| 9 | view `evolution-monitor` | `src/components/alerts/EvolutionDisconnectBanner.tsx` | `connection-health-check`, `health`, `status` | `connection_health_logs`, `reconnection_logs` |

## Ordem de ataque
1. Fluxo 2 (reconectar o número) — sem ele, 3 e 4 não têm como funcionar.
2. Fluxos 3 e 4 (receber e enviar), verificados com mensagem real.
3. E2E logado terminando na `main` (destrava a prova de 1, 5, 6, 7 e 8).
4. Fluxos 1, 5, 6, 7 e 8.
