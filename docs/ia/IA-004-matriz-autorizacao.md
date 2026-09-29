# IA-004 — Matriz de autorização

**Etapa do plano:** `IA-004` — formalizar a matriz de autorização: capacidades por perfil, fila,
departamento, conexão e organização; separar **leitura**, **sugestão**, **alteração** e **envio**.
**Aceite:** a matriz contém cenários **permitidos E negados**, sem presumir multi-tenancy inexistente.

## 0. Método, referências e códigos de célula

Levantamento **somente leitura**; nada foi executado contra o banco, `git`, `supabase` CLI ou rede na
produção. Duas cópias do repositório foram lidas, porque divergem:

| Cópia | Caminho | Commit | Uso aqui |
|---|---|---|---|
| Read-only indicada na tarefa | `/home/joaquim_ataides/projetos/Zapp_Web_V2` | `cbe75963` | evidência de schema, RLS e Edge Functions |
| Workspace da tarefa | `.../hermes-workspaces/Zapp_Web_V2/ia-bloco-01-preparacao-26092914200da6` | `0ab84095` (HEAD do Bloco 01) | evidência de contatos/RLS pós-#1198 e manifesto de funções |

`diff -rq` das duas cópias: **as Edge Functions de IA/voz/chatbot e todos os arquivos de permissão do
front são byte-idênticos** (`ai-*`, `voice-copilot-action`, `usePermissions.ts`, `useUserRole.ts`,
`role.service.ts`, `ProtectedRoute.tsx`, `useDownloadPermission.ts`). Divergem apenas `talkx-*`,
`evolution-api/index.ts`, `_shared/schemas.ts` e as funções `sicoob-bridge*` (que existem só na cópia
antiga). Logo os `arquivo:linha` abaixo valem no HEAD, exceto quando indicado.

**Códigos de célula**

| Código | Significado |
|---|---|
| **PERM** | Permitido no servidor (RLS/RPC/ACL ou guard explícito na function). |
| **NEG** | Negado no servidor (rejeitado por RLS, ACL, trigger ou guard). |
| **LACUNA** | A regra existe **só no cliente** (a UI esconde) ou **não existe** em nenhum lugar → o servidor permite. |
| **N/A** | O perfil não existe no schema; a coluna é hipotética. |
| **N/V** | Não verificado nesta etapa. |

Convenção de caminhos: relativos à raiz do repositório. `NNNN_arq.sql` = `supabase/migrations/NNNN_arq.sql`.

---

## 1. Modelo de identidade (o que existe de fato)

### 1.1 Papéis e tabelas

| Elemento | Definição | Evidência |
|---|---|---|
| Enum de papéis | `app_role = ('admin','supervisor','agent')`; `'special_agent'` adicionado depois | `20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql:2`; `supabase-export/BLOCO_01_schema_completo.sql:47` |
| `user_roles` | `(id, user_id → auth.users, role, created_at)`, `UNIQUE(user_id, role)`; **papel vive aqui, não em `profiles.role`** | `20251215025014_….sql:5-11` |
| `profiles` | `(id, user_id, name, email, avatar_url, role text, max_chats, is_active, department text, department_id uuid, can_download, created_at…)` | `20251215024517_….sql:2-12`; `20251215030017_627aa7cb-….sql:4,6`; `20260902120001_add_department_id_columns.sql:1` |
| `permissions` / `role_permissions` | matriz RBAC granular (`name` texto, `role app_role`) | `20251231115910_4da9c2d9-….sql:82-97` |
| `queues` / `queue_members` | fila e vínculo `(queue_id, profile_id, is_active)` | `20251220130243_14f0f8fe-….sql:2-22` |
| `whatsapp_connections` | conexão por número + `instance_id`, `instance_token_secret_id → vault` | `20251215024517_….sql:34-45`; `20260925190000_whatsapp_connections_instance_token_vault.sql:7-12` |
| `agent_visibility_grants` | carteira estendida do `special_agent`: `(agent_id, can_see_agent_id)` | `20260329175910_f55d2541-….sql:2`; `20260909200000_harden_inbox_contact_authorization.sql:36-47` |
| `departments` | `(id, name, is_active, whatsapp_mode, whatsapp_api_key, whatsapp_instance_id)` | `20260902120000_team_chat_v3_parity_reactions_status_departments.sql:16-25` |
| `departments(api_key)` em claro | coluna de credencial em texto puro, mitigada por privilégio de coluna | `20260902210000_revoke_departments_secrets_from_authenticated.sql:1-25` |

`profiles.role` (texto) existe desde a primeira migration, mas quem decide permissão é
`user_roles.role` via `has_role()`/`is_admin()`/`is_admin_or_supervisor()`.

### 1.2 Helpers de autorização no banco

| Helper | Semântica | Evidência | Onde é chamado |
|---|---|---|---|
| `has_role(_user_id, _role)` | `EXISTS(user_roles)` — SECURITY DEFINER | `20251215025014_….sql:17-28` | policies de `ai_providers` INSERT/UPDATE/DELETE; `channel_connections` SELECT supervisor |
| `is_admin_or_supervisor(_user_id)` | `role IN ('admin','supervisor')` | `20251215025014_….sql:31-42` | `contacts`, `messages`, `conversation_analyses`, `queues`, `audit_logs`, `ai_providers` SELECT, `search_contacts`, `delete_contact(s)`, `is_contact_visible_to_user` |
| `is_admin(_user_id)` | `role = 'admin'` | `20260830080000_fn_is_admin_and_fix_permissions_rls.sql:8-19` | policies de write de `permissions`, `role_permissions`, `blocked_ips`, `global_settings`, `rate_limit_configs`, `webhook_rate_limits`, `whatsapp_connection_queues` (`20260830150000_gate16_admin_only_write_policies.sql:14-75`); `get_team_profiles` (máscara de PII) |
| `user_has_permission(_user_id, _permission_name)` | cruza `user_roles→role_permissions→permissions` | `20251231115910_….sql:204-217` | RPC chamada pelo front (`src/services/role.service.ts:37`, `src/hooks/system/usePermissions.ts:99`); default de papéis semeado em `20251231115910_….sql:245-262` |
| `get_profile_id_for_user(_user_id)` | caller-bound: só devolve o profile se `_user_id = auth.uid()` | `20260909200000_….sql:6-18` | `enqueue_outbound_message`, triggers de hijack, `contact_notes`, RPC de badges |
| `get_visible_agent_ids(_user_id)` | self ∪ `agent_visibility_grants` (se `special_agent`) | `20260909200000_….sql:25-48` | `contacts`/`messages` policies, `is_contact_visible_to_user` |
| `is_contact_visible_to_user(_contact_id, _user_id)` | **predicado canônico de visibilidade de conversa**: admin/supervisor ∪ carteira visível ∪ membro ativo da fila; e exige `_user_id = auth.uid()` | `20260909200000_….sql:55-84` | `get_conversation_tab_counts` (:99-103), `enqueue_outbound_message` (`20260909250000_….sql:98-100`), policy de INSERT de `conversation_tasks` (`20260923175500_….sql:6`) |
| `can_edit_contact(assigned_to, queue_id)` | **predicado único pós-#1198** para ver/editar/excluir contato (mesma união, porém centralizada) | `20260929770000_contacts_can_edit_contact_helper.sql:29-46` | policies SELECT e UPDATE de `contacts`, `search_contacts`, `delete_contact(s)` — `20260929780000_contacts_single_permission_predicate.sql:24-34,69,100,130` |
| `get_conversation_tab_counts(contact_id)` | RPC de badges que **levanta exceção** se o contato não é visível | `20260909200000_….sql:91-124` | front (badges da aba da conversa) |

Produtores/gravadores de visibilidade:

- `prevent_contact_queue_hijack()` — BEFORE UPDATE em `contacts`, só quando `queue_id` muda: exige
  admin/supervisor ou membro ativo da fila de destino; **não se aplica a `service_role`**
  (`20260929790000_contacts_hijack_guards_only_on_change.sql:80-112`).
- `prevent_contact_assignee_hijack()` — BEFORE UPDATE em `contacts`, só quando `assigned_to` muda:
  com fila, destino precisa ser `profiles.is_active` + `user_roles.role IN ('agent','supervisor','admin')`;
  sem fila, só reivindicar para si (`20260929790000_….sql:31-78`).
- `prevent_profile_privilege_escalation()` — bloqueia mudança de `role/permissions/access_level` sem
  `is_admin()` (`20260830080000_….sql:40-57`).
- `guard_message_delivery_internal_fields()` — proíbe cliente escrever `client_message_id`/campos de
  lease; `postgres` e `service_role` passam (`20260909220000_….sql:72-104`).
- `audit_user_role_changes()` + `admin_set_role()` — única via de troca de papel com autoria;
  `admin_set_role` exige JWT de admin real (`20260924120000_role_change_audit_attribution.sql:33-131`).

### 1.3 Onde os helpers são chamados (resumo por superfície)

| Superfície | Papel do helper |
|---|---|
| `public.contacts` SELECT/UPDATE | `can_edit_contact(assigned_to, queue_id)` (`20260929780000_….sql:27,34`) — **mesmo predicado para ler e escrever** |
| `public.messages` SELECT | `is_admin_or_supervisor` ∪ carteira ∪ fila ativa (`20260902023200_consolidate_rls_select_messages_contacts.sql:21-36`) |
| `public.messages` INSERT | idem + `agent_id` = próprio profile (`20260925120000_fix_messages_insert_rls_contact_visibility.sql:20-41`) |
| `public.messages` UPDATE | idem (`20260925223000_messages_update_policy_queue_parity.sql:9-23`) |
| `public.contact_notes` | 4 policies + trigger de identidade imutável (`20260909200000_….sql:154-214`) |
| `public.conversation_analyses` | SELECT restrito; INSERT por `analyzed_by` (`20260318121039_….sql:27-38`; `20260317222757_….sql:30-37`) |
| `public.conversation_tasks` INSERT | `is_contact_visible_to_user` (`20260923175500_….sql:3-8`) |
| `public.ai_conversation_tags` SELECT | carteira ∪ admin/supervisor (`20260318121108_….sql:29-39`) |
| `public.ai_providers` | SELECT admin/supervisor; write `has_role(admin)` (`20260408194438_….sql:34-52`) |
| `public.ai_usage_logs` | SELECT admin/supervisor ∪ próprio; INSERT só `service_role` (`20260406201803_….sql:30-45`) |
| `public.whatsapp_connections` | SELECT admin/supervisor (`20260401001811_….sql:14-17`); write admin/supervisor (`20260319134839_….sql:13-23`); agentes leem pela view `whatsapp_connections_safe` (`20260411111648_….sql:17`) |
| `public.departments` | SELECT liberado + **GRANT por coluna** escondendo `whatsapp_api_key`/`whatsapp_instance_id` (`20260902210000_….sql:21-25`) |
| Vault | `get_instance_token`/`set_instance_token` só `service_role` (`20260925190000_….sql:28-30,60-62,48,85`) |

---

## 2. Como o frontend esconde/mostra ações

| Mecanismo | Evidência | Natureza |
|---|---|---|
| `useUserRole()` — lê `user_roles` do usuário e deriva `isAdmin`, `isSupervisor` (= supervisor **ou** admin), `isSpecialAgent`, `hasRole` | `src/hooks/system/useUserRole.ts:15-36` | cliente |
| `ProtectedRoute` — `requiredRoles` por `hasRole`; `requiredPermission` por RPC `user_has_permission` | `src/components/auth/ProtectedRoute.tsx:117-139`; `:61` | cliente (a checagem de permissão **é servidor**, o gate de rota é cliente) |
| Rotas admin-only | `src/routes/AppRoutes.tsx:101,109` (`requiredRoles={["admin"]}`) | cliente |
| `usePermissions()` — `hasPermission` compara com um array buscado no cliente; existe `checkPermissionServer` (RPC) **mas não é o usado por `hasPermission`** | `src/hooks/system/usePermissions.ts:62-109` vs `:97-105` | cliente (o RPC existe e é server) |
| Edição da matriz RBAC (tela) | `src/components/permissions/PermissionMatrix.tsx:32-134`; `src/pages/admin/RolesPage.tsx:24,32` | cliente + RLS (`is_admin`) no servidor |
| `useDownloadPermission()` — lê `profiles.can_download`; **único split ler/não-ler encontrado** (gate de exportação) | `src/hooks/system/useDownloadPermission.ts:8-22`; uso em `src/components/ExportDropdown.tsx:20` | cliente (o valor vem do banco) |
| Gates de UI por papel espalhados | `AdminView.tsx:112`; `AdminUsersTable.tsx:41,71,96`; `SecurityView.tsx:52,77,127`; `DepartmentWhatsAppView.tsx:63,70,122`; `DepartmentMembersView.tsx:69,87`; `DashboardView.tsx:66`; `InboxFilters.tsx:78`; `WhisperMode.tsx:121,175`; `SalesPipelineView.tsx:22`; `TasksView.tsx:31`; `SettingsView.tsx:43` | cliente |

**Consequência estrutural:** toda decisão de UI é *cosmética* — o array `userPermissions` do
`usePermissions` é montado no cliente a partir de `user_roles`/`role_permissions`, e nenhuma policy do
banco consulta `user_has_permission` (as policies chamam `is_admin*`/`can_edit_contact`). Esconder um
botão via `hasPermission` **não bloqueia** a operação equivalente.

---

## 3. Como as Edge Functions checam permissão

| Mecanismo | Definição | Evidência |
|---|---|---|
| Gate de plataforma | Todas as funções de IA/voz têm `verify_jwt = true` no manifesto → request sem JWT morre antes do código | `supabase/deployment-manifest.json` (`ai-*`, `voice-*`, `chatbot-l1` = `verify_jwt: true`; resumo `67/57/10`); exceções em `supabase/config.toml:8-57` |
| `requireAuth(req)` | Exige `Authorization: Bearer`, valida em `auth.getUser()`, devolve `{userId}` ou 401 | `supabase/functions/_shared/validation.ts:281-302` |
| `createAuthedClient(req)` | Client com `anon key` + JWT do chamador → **RLS real do banco decide** | `_shared/validation.ts:304-313` |
| `enforceAiGuards({functionName,userId})` | 401 se `userId` nulo; rate limit por usuário/min; cota diária por `ai_usage_logs` | `_shared/ai-guards.ts:24-26,29-33,35-55` |
| Padrão “service_role + checagem de visibilidade” | Grava com `SERVICE_ROLE_KEY` (bypassa RLS) mas **antes** confirma `contacts` com `createAuthedClient` | `ai-conversation-analysis/index.ts:30-47`; `ai-suggest-reply/index.ts:36-67`; `ai-conversation-summary/index.ts:36-43`; `ai-auto-tag/index.ts:38-54`; `voice-copilot-action/index.ts:19-24,93-101,133-141` |
| `rpc('is_admin_or_supervisor')` explícito | usada onde o `service_role` gravaria algo sensível | `ai-auto-tag/index.ts:171-192` (roteamento de fila); `evolution-api/index.ts:124-140` (admin-only) |
| `save`/segredos | provider lê chave do **environment do Deno** por nome (`api_key_secret_name`), nunca do banco | `ai-proxy/index.ts:90-106` |
| Cliente autenticado = RLS | `ai-classify-tickets` só lê com `callerClient` (anon+JWT) | `ai-classify-tickets/index.ts:21-35` |

### 3.1 Funções de IA — detalhe

| Função | Auth | Checagem de escopo | Efeitos |
|---|---|---|---|
| `ai-suggest-reply` | `requireAuth` + guards (`:10-14`) | contato visível via RLS (`:52-67`); lê `contact_notes`/`contact_custom_fields` (`:70-88`) | nenhum write |
| `ai-conversation-analysis` | idem (`:10-14`) | contato visível (`:36-47`) | INSERT em `conversation_analyses` + UPDATE `contacts.ai_sentiment/ai_priority` com `service_role` (`:232-275`) |
| `ai-conversation-summary` | idem (`:10`) | contato visível (`:36-43`) | leitura |
| `ai-auto-tag` | idem (`:14-18`) | contato visível (`:40-54`); **fila só se admin/supervisor ou membro ativo** (`:166-197`); notifica admin/supervisor (`:203-220`) | DELETE+INSERT `ai_conversation_tags`, UPDATE `contacts` (`:145-201`) |
| `ai-enhance-message` | idem (`:20-23`) | **não recebe `contactId`** (só `message`/`tone`/`contactName`) | nenhum write |
| `ai-proxy` | idem (`:116-120`) | não toca contato; escolhe provedor configurado | chamada ao provedor + `ai_usage_logs` |
| `ai-classify-tickets` | JWT via `callerClient` (`:18-27`) | RLS de `ai_conversation_tags` | leitura |
| `ai-churn-analysis` | usuário (`:37-46`) | lista de contatos visíveis via cliente do chamador | leitura (+ alertas) |
| `ai-transcribe-audio` | **bypass explícito** quando `token === SUPABASE_SERVICE_ROLE_KEY` (webhook); senão `requireAuth`+guards | bucket de áudio **whitelisted** (`whatsapp-media`, `audio-messages`, `audio-memes`) via `parseApprovedStorageUrl` | download com `service_role` (`:31-61,67-84`) |
| `voice-copilot-action` | `requireAuth` (`:8-10`) | leituras por `authedClient` (`:24,40-58,181-186`); `assign_conversation` e `create_note` checam visibilidade (`:93-101,133-141`); `list_agents` usa `service_role` de propósito (`:165-178`) | UPDATE `contacts.assigned_to` com `service_role` (`:117-120`); INSERT `contact_notes` (`:145-161`) |

### 3.2 Envio de mensagem

| Caminho | Autorização |
|---|---|
| `enqueue_outbound_message` (RPC, o único caminho do navegador) | exige `auth.role()='authenticated'` + `auth.uid()` (`20260909250000_….sql:36-38`), profile ativo (`:90-97`), `is_contact_visible_to_user` (`:98-100`), conexão `connected` com `instance_id` (`:63-89`); EXECUTE só para `authenticated` — **revogado de `service_role`** (`:148-153`) |
| `message-delivery` (Edge) | `verify_jwt=true`; `requireAuth` + rate limit (`message-delivery/index.ts:184-187`); profile `is_active` (`:212-219`); `claim_outbound_message(p_agent_id = profile do caller)` (`:221-226`); se a claim falha e o `agent_id` não é do caller → 404 (`:232-241`) |
| Ingestão inbound | `ingest_inbound_message` só `service_role` (`20260905050000_ingest_inbound_message_tx.sql:121-123`) |

---

## 4. Escopo por fila, departamento e conexão

| Eixo | Como uma conversa é atribuída | Quem pode agir nela | Evidência |
|---|---|---|---|
| **Fila** | `contacts.queue_id`; auto-atribuição ao agente menos ocupado da fila no INSERT/UPDATE de `queue_id` (`auto_assign_to_queue_agent`) | admin/supervisor; agente **membro ativo** da fila; agente com o contato na carteira visível | `20251220130243_14f0f8fe-….sql:52-88`; `20260909200000_….sql:75-81` |
| **Carteira** | `contacts.assigned_to` → `profiles.id`; regra automática em `client_wallet_rules` | `assigned_to ∈ get_visible_agent_ids(auth.uid())`; `special_agent` vê a carteira estendida | `20251215024517_….sql:78,124-179`; `20260909200000_….sql:36-47` |
| **Conexão** | `contacts.whatsapp_connection_id`; escolha explícita validada em `p_whatsapp_connection_id` | ver/editar conexão: admin/supervisor (tabela) ou view `whatsapp_connections_safe` (agente); **escolher qualquer conexão `connected` no envio: qualquer agente que enxergue o contato** | `20260909250000_….sql:63-86`; `20260401001811_….sql:14-17`; `20260411111648_….sql:12-17` |
| **Departamento** | `departments` + `profiles.department_id` + `team_conversations.department_id` + `department_invites`/`invitations` | **não há politica de conversa por departamento** — RLS de `departments`/`department_*` é `USING(true)` para SELECT e `is_admin_or_supervisor` para escrita; departamento **não** participa de `contacts`/`messages`/`queues` | `20260902120000_….sql:16-56`; `20260927520000_add_department_rls_policies.sql:1-14`; `20260902120001_add_department_id_columns.sql:1-2`; ausência confirmada por `grep -rn department` sobre migrations: nenhuma policy de `contacts`/`messages` referencia `department` |

---

## 5. Multi-organização / tenant

**Não existe multi-organização/tenant no schema.** Nenhuma tabela possui `tenant_id`, `organization_id`,
`org_id` ou `workspace_id`; não existe tabela de organizações. A única menção à palavra no repositório
inteiro é um comentário sobre o endpoint legado (`20260909180000_disable_legacy_public_api_token.sql:4`,
"vinculadas a tenant/escopos"), e o projeto é single-tenant por `project_ref`
(`supabase/deployment-manifest.json` → `project_ref: tnnnlkbymytvtqngbbqh`; `supabase/config.toml:1`).

Toda a autorização é, portanto: **1 organização × N perfis × N filas × N conexões**. Qualquer capacidade
"por organização" nesta matriz seria invenção — está marcada como **N/A** abaixo.

---

## 6. Matriz de autorização

Perfis avaliados:

| Perfil | Como se identifica no sistema |
|---|---|
| `admin` | `user_roles.role = 'admin'` |
| `supervisor` | `user_roles.role = 'supervisor'` |
| `atendente` (`agent`) | `user_roles.role = 'agent'` (com fila e/ou carteira) — `special_agent` quando indicado |
| `somente-leitura` | **não existe** no schema (ver §6.6) |
| `cron/serviço` | `service_role` / `postgres` (Edge Functions com service key, `pg_cron`) |
| `webhook` | chamadas externas às 10 funções `verify_jwt=false` (§3, `deployment-manifest.json`) |
| `anônimo` | JWT `anon`/sem JWT |

### 6.1 Leitura

| Capacidade | admin | supervisor | atendente | somente-leitura | cron/serviço | webhook | anônimo | Evidência |
|---|---|---|---|---|---|---|---|---|
| Ler conversa (`contacts` + `messages`) | **PERM** | **PERM** | **PERM** se carteira/fila ativa; **NEG** fora dela | **N/A** (perfil inexistente) | **PERM** (bypass RLS) | **PERM** (service key dentro da function) | **NEG** | `20260929780000_….sql:34`; `20260902023200_….sql:21-36`; `20260909200000_….sql:55-84` |
| Ler análise de conversa (`conversation_analyses`) | **PERM** | **PERM** | **PERM** se carteira; **LACUNA-NEG** p/ fila (policy não tem branch de fila) | **N/A** | **PERM** | **PERM** | **NEG** | `20260318121039_….sql:27-38` |
| Ler etiquetas de IA (`ai_conversation_tags`) | **PERM** | **PERM** | **PERM** se carteira; **LACUNA-NEG** p/ fila | **N/A** | **PERM** | **PERM** | **NEG** | `20260318121108_….sql:29-39` |
| Ler áudio/arquivo do contato | **PERM** via bucket/policies de object storage (não verificado linha a linha) | idem | **N/V** | **N/A** | **PERM** via `service_role` (`ai-transcribe-audio`) | **PERM** | **NEG** | `20251215025014_….sql:110-118`; restrição de bucket em `ai-transcribe-audio/index.ts:21-61` |

### 6.2 Sugestão (gera conteúdo, não persiste)

| Capacidade | admin | supervisor | atendente | somente-leitura | cron/serviço | webhook | anônimo | Evidência |
|---|---|---|---|---|---|---|---|---|
| Gerar sugestão de resposta (`ai-suggest-reply`) | **PERM** | **PERM** | **PERM** (contato visível) | **N/A** | **NEG** (exige JWT de **usuário**: `auth.getUser()`) | **NEG** | **NEG** | `ai-suggest-reply/index.ts:10-14,52-67`; `_shared/validation.ts:281-302` |
| Reescrever/melhorar mensagem (`ai-enhance-message`) | **PERM** | **PERM** | **PERM** (sem escopo de contato) | **N/A** | **NEG** | **NEG** | **NEG** | `ai-enhance-message/index.ts:20-23` |
| Gerar resumo/insight de conversa (`ai-conversation-summary`, `-analysis` sem persistir) | **PERM** | **PERM** | **PERM** (contato visível) | **N/A** | **NEG** | **NEG** | **NEG** | `ai-conversation-summary/index.ts:10,36-43` |
| Classificar/etiquetar por IA (`ai-auto-tag`) | **PERM** | **PERM** | **PERM**, **mas** só roteia fila se membro ativo | **N/A** | **NEG** | **NEG** | **NEG** | `ai-auto-tag/index.ts:14-18,166-197` |
| Proxy de modelo configurado (`ai-proxy`) | **PERM** | **PERM** | **PERM** | **N/A** | **NEG** | **NEG** | **NEG** | `ai-proxy/index.ts:116-120` |
| Previsão de churn / classificação em lote | **PERM** | **PERM** | **PERM** (escopo = contatos visíveis) | **N/A** | **NEG** | **NEG** | **NEG** | `ai-churn-analysis/index.ts:37-46`; `ai-classify-tickets/index.ts:18-27` |
| Transcrever/baixar áudio (`ai-transcribe-audio`) | **PERM** | **PERM** | **PERM** (não valida visibilidade do contato da mensagem; `messageId` é apenas ecoado) — **LACUNA** | **N/A** | **PERM** por bypass explícito da service key (webhook de auto-transcrição) | **PERM** via esse bypass | **NEG** | `ai-transcribe-audio/index.ts:67-84` (bypass), `:99-119` (sem checagem de contato), `:21-61` (bucket whitelisted) |
| Ação de copiloto por voz (`voice-copilot-action`) | **PERM** | **PERM** | **PERM** para `search_contacts`/`get_conversation_summary`/`get_queue_status`/`create_note`/`assign_conversation` (escopo por visibilidade); **PERM** `list_agents` (diretório de staff via `service_role` por desenho) | **N/A** | **NEG** (exige JWT de usuário) | **NEG** | **NEG** | `voice-copilot-action/index.ts:8-10,30-48,50-61,165-178,180-186` |

### 6.3 Alteração

| Capacidade | admin | supervisor | atendente | somente-leitura | cron/serviço | webhook | anônimo | Evidência |
|---|---|---|---|---|---|---|---|---|
| Editar contato (campos gerais) | **PERM** | **PERM** | **PERM** se carteira/fila ativa | **N/A** | **PERM** | **PERM** | **NEG** | `20260929780000_….sql:24-27` |
| Gravar análise (`conversation_analyses` INSERT) | **PERM** | **PERM** | **PERM**, inclusive em contato **fora do escopo** — **LACUNA** | **N/A** | **PERM** | **PERM** | **NEG** | `20260317222757_….sql:30-37` (`analyzed_by IS NULL` satisfaz o WITH CHECK) |
| Gravar análise pela Edge (`ai-conversation-analysis` persistindo) | **PERM** | **PERM** | **PERM** (só contato visível) | **N/A** | — | — | **NEG** | `ai-conversation-analysis/index.ts:36-47,232-275` |
| Trocar fila (`contacts.queue_id`) | **PERM** | **PERM** | **PERM** só para fila em que é membro ativo, e só se a fila **mudar** | **N/A** | **PERM** (trigger ignora `service_role`) | **PERM** | **NEG** | `20260929790000_….sql:95-108`; roteamento por IA em `ai-auto-tag/index.ts:166-197` |
| Reatribuir responsável (`contacts.assigned_to`) | **PERM** | **PERM** | **PERM** para qualquer colega ativo **se** o contato tem fila; **PERM** só para si se não tem | **N/A** | **PERM** | **PERM** | **NEG** | `20260929790000_….sql:54-74` |
| Criar/atribuir conversa por voz (`voice-copilot-action:assign_conversation`) | **PERM** | **PERM** | **PERM** (basta ver o contato; **sem** checagem de papel) | **N/A** | **NEG** (exige JWT de usuário) | **NEG** | **NEG** | `voice-copilot-action/index.ts:8-10,86-126` |
| Mudar prioridade (`contacts.ai_priority`) | **PERM** | **PERM** | **PERM** (mesma policy de UPDATE de contato) | **N/A** | **PERM** | **PERM** | **NEG** | policy: `20260929780000_….sql:24-27`; write por IA: `ai-auto-tag/index.ts:158-201` |
| Aplicar etiqueta — fluxo padrão (tags de IA) | **PERM** | **PERM** | **PERM** (contato visível) | **N/A** | **PERM** | **PERM** | **NEG** | `ai-auto-tag/index.ts:145-156` |
| Aplicar/renomear/remover etiqueta de WhatsApp (RPCs `*_wa_tag*`) | **PERM** | **PERM** | **PERM em QUALQUER contato, inclusive em massa** — **LACUNA** | **N/A** | **PERM** | **PERM** | **NEG** (só `anon` é barrado) | `20260927530000_….sql:11-72` |
| Criar tarefa (`conversation_tasks`) | **PERM** | **PERM** | **PERM** (contato visível) ou tarefa pessoal sem contato | **N/A** | **PERM** | **PERM** | **NEG** | `20260923175500_….sql:3-8` |
| Mudar status da conversa (`set_conversation_status`) | **PERM** | **PERM** | **PERM em qualquer contato** (FSM válida apenas) — **LACUNA** | **N/A** | **PERM** | **PERM** | **NEG** | `20260927330000_….sql:20-74` (o próprio arquivo registra o TODO de escopo, `:17-18`) |
| Editar/excluir contato (soft-delete) | **PERM** | **PERM** | **PERM** se `can_edit_contact` | **N/A** | **PERM** | **PERM** | **NEG** | `20260929780000_….sql:86-141` |
| Alterar papel de usuário | **PERM** via `admin_set_role` (2 admins mínimos) | **NEG** | **NEG** | **N/A** | **NEG** (exige JWT de admin real) | **NEG** | **NEG** | `20260924120000_….sql:87-131`; `20260925100657_admin_set_role_last_admin_floor.sql` |
| Editar a matriz RBAC (`permissions`/`role_permissions`) | **PERM** | **NEG** (era PERM antes do Gate 16) | **NEG** | **N/A** | **PERM** (bypass) | **N/A** | **NEG** | `20260830080000_….sql:26-36,63-71` |

### 6.4 Envio

| Capacidade | admin | supervisor | atendente | somente-leitura | cron/serviço | webhook | anônimo | Evidência |
|---|---|---|---|---|---|---|---|---|
| Enfileirar mensagem (`enqueue_outbound_message`) | **PERM** | **PERM** | **PERM** (contato visível + profile ativo) | **N/A** | **NEG** (EXECUTE revogado de `service_role`) | **N/A** | **NEG** | `20260909250000_….sql:36-38,90-100,148-153` |
| Entregar/claim e disparar no provedor (`message-delivery`) | **PERM** | **PERM** | **PERM** (só mensagens `sender='agent'` cujo `agent_id` é seu) | **N/A** | **NEG** (exige JWT de usuário) | **NEG** | **NEG** | `message-delivery/index.ts:184-187,212-241` |
| Ingerir mensagem inbound | **N/A** | **N/A** | **N/A** | **N/A** | **PERM** (`ingest_inbound_message`) | **PERM** (via `evolution-webhook`) | **NEG** | `20260905050000_….sql:121-123`; `evolution-webhook/index.ts:157-160` |
| Escolher por qual conexão enviar | **PERM** | **PERM** | **PERM** (qualquer conexão `connected`) | **N/A** | **PERM** | **PERM** | **NEG** | `20260909250000_….sql:63-71` |
| Escrever mensagem falsa direto em `messages` | **PERM** (admin/supervisor) | **PERM** | **PERM** só em contato visível; `client_message_id` **NEG** | **N/A** | **PERM** | **PERM** | **NEG** | `20260925120000_….sql:20-41`; `20260909220000_….sql:72-104` |

### 6.5 Configuração e segredos

| Capacidade | admin | supervisor | atendente | somente-leitura | cron/serviço | webhook | anônimo | Evidência |
|---|---|---|---|---|---|---|---|---|
| Configurar provedor/modelo (`ai_providers`) | **PERM** (INSERT/UPDATE/DELETE) | **PERM** leitura; **NEG** escrita | **NEG** | **N/A** | **PERM** | **N/A** | **NEG** (SELECT bloqueado por RLS; write revogado por ACL) | `20260408194438_….sql:34-52`; `20260829120000_revoke_anon_ai_providers.sql:5-7` |
| Ler o nome da chave do provedor (`api_key_secret_name`) | **PERM** | **PERM** (SELECT da linha) | **NEG** | **N/A** | **PERM** | **N/A** | **NEG** | idem |
| Criar/ler segredo de instância WhatsApp (Vault) | **NEG** pelo banco (RPC revogada de `authenticated`) | **NEG** | **NEG** | **N/A** | **PERM** (`get_instance_token`/`set_instance_token` só `service_role`) | **N/A** | **NEG** | `20260925190000_….sql:28-30,48,60-62,85` |
| Ler credencial WhatsApp do departamento | **PERM** via `get_department_whatsapp_credentials` | **PERM** (predicado `is_admin_or_supervisor`) | **NEG** (colunas revogadas por GRANT) | **N/A** | **PERM** | **N/A** | **NEG** | `20260902210000_….sql:21-25,27-45` |
| Ver/editar conexões (`whatsapp_connections`) | **PERM** ler+escrever | **PERM** ler+escrever | **PERM** ler pela view `whatsapp_connections_safe` / **NEG** escrever | **N/A** | **PERM** | **N/A** | **NEG** | `20260319134839_….sql:13-23`; `20260401001811_….sql:14-17`; `20260411111648_….sql:12-17` |
| Ver QR code de conexão | **PERM** (dono do `created_by` ou admin/supervisor) | **PERM** | **PERM** se `created_by = eu` | **N/A** | **PERM** | **N/A** | **NEG** | `20260902000500_fix_idor_get_connection_functions.sql:5` |
| Gerenciar departamentos/invites | **PERM** | **PERM** | **NEG** | **N/A** | **PERM** | **N/A** | **NEG** | `20260902120000_….sql:29-36,53-56`; `20260927520000_….sql:1-14` |

### 6.6 O perfil "somente-leitura" — não existe

Não há papel de leitura no schema: `app_role` é `admin|supervisor|agent|special_agent`, e **o mesmo
predicado** (`can_edit_contact`) governa SELECT e UPDATE de contatos
(`20260929780000_contacts_single_permission_predicate.sql:24-34`) e o mesmo par
(`is_admin_or_supervisor`/carteira/fila) governa leitura e escrita de mensagens. Os dois únicos
controles encontrados que separam ler de escrever são:

1. `profiles.can_download` — esconde a **exportação**, não os dados
   (`src/hooks/system/useDownloadPermission.ts:8-22`; `src/components/ExportDropdown.tsx:20`).
2. `profiles.is_active = false` — bloqueia **envio** (`enqueue_outbound_message`,
   `20260909250000_….sql:90-97`; `message-delivery/index.ts:212-219`), mas **não** bloqueia leitura via
   RLS (as policies não consultam `is_active`).

O mais próximo de "somente-leitura" hoje é um `authenticated` com `role='agent'` **sem** fila e **sem**
carteira: `is_contact_visible_to_user` retorna falso, logo ele lê zero conversas — é "nenhuma-leitura",
não "somente-leitura". Registrar como **lacuna de modelo** (a IA-015 depende disso).

---

## 7. Lacunas de autorização (checagem só no cliente ou inexistente)

| # | Lacuna | Onde | O que o servidor faz hoje | Gravidade |
|---|---|---|---|---|
| L1 | `set_conversation_status` não checa visibilidade/atribuição do contato | `20260927330000_grant_set_conversation_status_to_authenticated.sql:17-18` (TODO explícito), `:34-37`, `:58-61`, `:72-74` | qualquer `authenticated` (inclusive `agent` sem fila/carteira) transiciona o status de **qualquer** `contact_id` que conheça | **alta** |
| L2 | RPCs de etiqueta de WhatsApp em massa, sem escopo | `20260927530000_security_revoke_anon_9rpcs_wa_tag_search_path.sql:11-72` | só barra `anon`; qualquer `authenticated` renomeia/remove etiqueta em **todos** os contatos do sistema | **alta** |
| L3 | INSERT em `conversation_analyses` aceita `analyzed_by IS NULL` e não valida visibilidade do contato | `20260317222757_41908e22-….sql:30-37` | qualquer `authenticated` grava análise/PII em contato fora do seu escopo (forja histórico de IA) | **alta** |
| L4 | `voice-copilot-action:assign_conversation` checa visibilidade mas **não o papel** | `voice-copilot-action/index.ts:86-126` | um `agent` que apenas enxerga o contato reatribui para qualquer colega ativo, via `service_role` | média |
| L5 | `connection-health-check` não tem nenhum guard interno | `supabase/functions/connection-health-check/index.ts:3,14-16` | `verify_jwt=true` no manifesto deixa **qualquer JWT válido** (inclusive `anon key`) disparar escritas com `service_role` em `whatsapp_connections` | média |
| L6 | Webhook da Evolution aceita corpo sem assinatura por padrão | `evolution-webhook/index.ts:28-31,46-47,52-58` (`strictMode=false`, modo `shadow`) | HMAC inválido é rejeitado, **ausente** é aceito; o gate real (`instanceToken`) também está em `shadow` | média (documentada) |
| L7 | `whatsapp_connections_safe`/políticas de conexão e a escolha de conexão no envio não distinguem fila/departamento | `20260411111648_….sql:17`; `20260909250000_….sql:63-86` | um agente envia pelo número de qualquer conexão `connected` | média |
| L8 | Leitura de análise e de etiquetas ignora o **branch de fila** que existe em `messages`/`contacts` | `20260318121039_….sql:27-38`; `20260318121108_….sql:29-39` | agente de fila vê a conversa mas não o resumo/etiquetas dela | média (falso negativo) |
| L9 | `hasPermission` do front é comparação de array client-side; o RPC server (`checkPermissionServer`) não é usado | `src/hooks/system/usePermissions.ts:62-109` vs `:97-105` | nenhuma policy consulta `user_has_permission`; esconder botão não bloqueia a ação | média |
| L10 | `get_conversation_tab_counts` está **GRANT**ado só a `authenticated` mas não a `service_role` | `20260909200000_….sql:121-124` | cron/Edge precisam de outro caminho para contar abas | baixa |
| L11 | `departments.whatsapp_api_key` em texto puro (mitigado por GRANT de coluna) | `20260902120000_….sql:21` + `20260902210000_….sql:21-25` | quem tiver `service_role`/DBA lê a credencial sem Vault | média (dívida) |
| L12 | `ai-transcribe-audio` aceita `SUPABASE_SERVICE_ROLE_KEY` como credencial de bypass | `ai-transcribe-audio/index.ts:67-84` | qualquer vazamento da service key transcreve qualquer áudio dos 3 buckets | média (dívida) |
| L13 | `ai-transcribe-audio` não valida se a mensagem/contato do áudio é visível ao chamador | `ai-transcribe-audio/index.ts:99-119` (só usa `messageId` como eco) + `:31-61` (download com `service_role`) | qualquer `authenticated` que conheça uma URL de storage válida dos 3 buckets transcreve o áudio (PII de voz) de contato fora do escopo | **alta** |

---

## 8. Cenários de teste negativos propostos

Cada item é uma asserção que **deve falhar** (retornar negação). Formato: ator → ação → resultado exigido.

**Leitura (negar fora do escopo)**

| # | Ator → ação | Resultado exigido |
|---|---|---|
| N1 | `agent` sem fila e sem carteira → `SELECT contacts/messages` do contato de outro agente | 0 linhas (RLS) |
| N2 | `agent` de fila A → `SELECT` de contato da fila B | 0 linhas |
| N3 | `agent` → `rpc('get_conversation_tab_counts', {contact_id de outro agente})` | erro `42501 contact is not visible to current user` |
| N4 | `agent` → `rpc('is_contact_visible_to_user', (contato alheio, outrem))` / `get_visible_agent_ids(outrem)` | `false` / 0 linhas (não pode impersonar) |
| N5 | `anon` (sem JWT) → `SELECT contacts` / `rpc('get_conversation_tab_counts', …)` / `functions.invoke('ai-suggest-reply')` | 401/403 ou 0 linhas; **nenhuma** invocação de IA |
| N6 | `agent` → `SELECT` de `conversation_analyses`/`ai_conversation_tags` de contato fora da carteira | 0 linhas |
| N7 | não-admin → `SELECT ai_providers` (esperado supervisor OK) / `SELECT profiles.email/phone` de outro usuário | 0 linhas; `get_team_profiles` devolve `email/phone = NULL` |

**Sugestão (não pode ler para sugerir fora do escopo)**

| # | Ator → ação | Resultado exigido |
|---|---|---|
| N8 | `agent` → `POST ai-suggest-reply` com `contactId` fora do escopo | 200 **sem** notas/dados do contato (o `visibleContactId` vira `null`) — provar que o conhecimento do contato não entrou no prompt |
| N9 | `agent` → `POST ai-conversation-analysis` com `contactId` fora do escopo | 200 com análise genérica e **nenhum** INSERT em `conversation_analyses` e **nenhum** UPDATE em `contacts.ai_sentiment/ai_priority` |
| N10 | `agent` → `POST ai-auto-tag` com `suggested_queue_id` de fila onde não é membro | `contacts.queue_id` inalterado |
| N11 | `anon` / `webhook` sem JWT → `POST ai-proxy` (consumo de créditos do provedor) | 401; `ai_usage_logs` sem linha nova |

**Alteração (negar onde hoje há lacuna)**

| # | Ator → ação | Resultado exigido |
|---|---|---|
| N12 | `agent` sem fila/carteira → `rpc('set_conversation_status', (contato alheio, 'resolved'))` | **deve falhar** — hoje passa (L1) |
| N13 | `agent` → `rpc('remove_wa_label_from_all_contacts', 'x_')` / `rename_wa_label_on_all_contacts` | **deve falhar** ou afetar só contatos visíveis — hoje afeta todos (L2) |
| N14 | `agent` → `INSERT conversation_analyses (contact_id de outro, analyzed_by = NULL)` | **deve falhar** — hoje passa (L3) |
| N15 | `agent` de fila A → `UPDATE contacts SET queue_id = <fila B>` | exceção `Sem permissao para mover contato para esta fila` |
| N16 | `agent` de fila A → `UPDATE contacts SET assigned_to = <profile de cliente/inativo/uuid aleatório>` | exceção `Sem permissao para atribuir contato a este agente` |
| N17 | `agent` → `UPDATE contacts SET assigned_to = <outro agente>` em contato **sem fila** (que ele não possui) | exceção (só pode reivindicar para si) |
| N18 | `agent` → `UPDATE contacts SET deleted_at = now()` em contato sem `can_edit_contact` | exceção `Contato nao encontrado ou sem permissao para excluir.` |
| N19 | `agent` → `POST voice-copilot-action {action:'assign_conversation', contactId alheio}` | `success:false`, sem UPDATE (visibilidade); **e** (L4) reatribuição por `agent` de contato visível deve ser decisão explícita do plano |
| N20 | `agent` → `POST voice-copilot-action {action:'create_note'}` com `authorId` forjado no body | nota gravada **com** o `author_id` do próprio caller (body ignorado) |
| N21 | `supervisor` → `INSERT/UPDATE/DELETE permissions|role_permissions` | 0 linhas / erro (somente `is_admin`) |
| N22 | `supervisor`/`agent` → `rpc('admin_set_role', …)` | erro `jwt_session_required` / não-admin |
| N23 | qualquer `authenticated` → `UPDATE profiles SET role='admin'` no próprio registro | exceção `Only administrators can modify role, permissions, or access_level` |
| N24 | `anon` → `TRUNCATE contacts` (RLS não cobre TRUNCATE) | erro de ACL (`20260929560000_contacts_conversation_status_and_grants.sql:74`; SELECT de `anon` revogado em `:78`) |

**Envio**

| # | Ator → ação | Resultado exigido |
|---|---|---|
| N25 | `agent` → `rpc('enqueue_outbound_message', (contato fora do escopo, …))` | erro `message_contact_not_authorized` |
| N26 | `agent` com `profiles.is_active = false` → `enqueue_outbound_message` | erro `active_profile_not_found` |
| N27 | `anon` → `enqueue_outbound_message` / `INSERT messages` | erro `authentication_required` / 0 linhas |
| N28 | `agent` → `POST message-delivery` com `messageId` de mensagem de outro agente | 404 (não vaza existência) e nenhum envio ao provedor |
| N29 | `service_role`/`anon` → `rpc('enqueue_outbound_message', …)` | erro de permissão (`EXECUTE` revogado) |
| N30 | `agent` → `INSERT messages (contact_id fora do escopo, sender='agent')` | 0 linhas (RLS de INSERT) |
| N31 | `agent` → `INSERT/UPDATE messages` setando `client_message_id` | exceção `message_delivery_internal_fields_forbidden` |

**Configuração e segredos**

| # | Ator → ação | Resultado exigido |
|---|---|---|
| N32 | `supervisor`/`agent` → `SELECT`/`INSERT`/`UPDATE` `ai_providers` | escrita negada (`has_role(admin)`); leitura só admin/supervisor |
| N33 | `agent`/`anon` → `rpc('get_instance_token', …)` ou `set_instance_token(…)` | erro `service_role_required` / permissão negada |
| N34 | `agent` → `SELECT departments.whatsapp_api_key` | erro `permission denied for column` |
| N35 | `agent` → `rpc('get_department_whatsapp_credentials', …)` | 0 linhas (predicado `is_admin_or_supervisor`) |
| N36 | `agent` → `INSERT/UPDATE whatsapp_connections` | 0 linhas (política admin/supervisor) |
| N37 | `agent` → `rpc('get_connection_qr_code', <conexão de outro>)` | `NULL` / 0 linhas |
| N38 | qualquer um → tentar ler valor de secret pela API REST (`vault.decrypted_secrets`) | sem exposição: nenhuma das duas cópias publica segredo em `arquivo:linha` — conferir que o teste **não** imprime valor |

**Escopo de organização (provar a ausência, não presumir)**

| # | Ator → ação | Resultado exigido |
|---|---|---|
| N39 | Buscar colunas `tenant_id|org_id|organization_id|workspace_id` em `information_schema.columns` | **0 linhas** (prova que não existe multi-tenancy e que nenhuma capacidade "por organização" é válida) |
| N40 | `agent` de qualquer perfil → `SELECT` de `contacts` | o resultado é o mesmo conjunto do single-tenant (não existe filtro de organização para enfraquecer nem reforçar) |

---

## 9. Aceite da etapa

- [x] Capacidades separadas em **leitura / sugestão / alteração / envio / configuração** (§6.1–6.5).
- [x] Cenários **permitidos** e **negados** com evidência `arquivo:linha` em cada célula.
- [x] Separação por extraído **fila** (§4), **departamento** (§4: existe tabela, **não** governa conversa),
      **conexão** (§4) e **contato/carteira** (`get_visible_agent_ids`/`agent_visibility_grants`).
- [x] **Multi-organização: explicitamente inexistente** (§5), com prova por ausência de colunas.
- [x] Lacunas marcadas onde a checagem é só do cliente ou ausente (§7, com o crítico destacado).
- [x] Cenários de teste negativos propostos (§8, 40 asserções).

### Notas de honestidade

- **N/V**: políticas de leitura de object storage de áudio (`whatsapp-media`) não foram lidas linha a
  linha; a evidência de bucket restringe o **download pela função**, não a policy de `storage.objects`.
- O `supabase/deployment-manifest.json` no HEAD desta cópia traz `67 / 57 / 10`, enquanto o
  `IA-001-referencia-de-execucao.md` (§3.1) registra `69 / 59 / 10`. **Divergência não reconciliada**
  nesta etapa — registrada para não ser varrida para baixo do tapete.
- Nenhum valor de segredo foi impresso; as referências apontam apenas linhas com *nomes* de
  secret/coluna e predicados de permissão.
