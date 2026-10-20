# Módulo: Contatos, CRM 360° e SalesView

- Documento de módulo (`docs/design/MODULO_*.md`), 07/10/2026.
- Base conferida: branch local `dia/2026-10-07` no commit `af189d0c5`.
- Método: leitura direta do código atual (`src/components/contacts`, `src/hooks/crm`,
  `src/components/inbox/tabs/Crm360Tab.tsx`, `src/components/inbox/tabs/SalesViewTab.tsx`),
  nomes de tabelas/colunas/RPC conferidos em `supabase/schema-catalog.json`, policies conferidas nas
  migrations em `supabase/migrations`. O que não foi possível provar está marcado **NÃO VERIFICADO**.
- Regras permanentes do produto respeitadas por este módulo: nenhuma informação sai do sistema
  (não existe exportar/baixar/imprimir/compartilhar novos) e não se indica canal/origem do contato.

---

## 1. O que é e para quem

O módulo cobre três superfícies que compartilham a mesma base:

1. **Contatos** — cadastro e operação da base de contatos (clientes, fornecedores, transportadoras,
   colaboradores, prestadores de serviço e parceiros). Tem busca, filtros, seis visões, ações em massa,
   ficha do contato e permissão por contato.
2. **CRM 360°** — aba dentro da conversa (Inbox) que consolida a visão comercial do contato: empresa,
   etapa do funil, últimas compras, propostas em aberto, ticket médio, produtos de interesse,
   próxima melhor ação (IA) e últimas interações comerciais.
3. **SalesView** — aba dentro da conversa com o resumo comercial, as compras (com cadastro de compra) e
   as propostas em aberto do contato.

Há ainda uma **integração opcional com um CRM externo** (banco separado), ligada pela flag
`useCRMIntegrationEnabled` — quando desligada, os componentes externos não são montados
(`src/components/contacts/ContactsView.tsx`, `ContactCRMDialog` só aparece com a flag ligada).

Para quem:

- **Atendente/agente**: usa Contatos no dia a dia (buscar, abrir conversa, editar, notas) e as abas
  CRM 360° e SalesView dentro da conversa.
- **Supervisor/admin**: ações restritas — excluir em massa contatos fora do próprio alcance,
  alterar tipo em massa e mesclar contatos (esta última só admin/supervisor).
- **Comercial/gestão**: consome o funil e o ticket médio que aparecem no CRM 360°.

---

## 2. Telas e fluxos principais

### 2.1 Rota e montagem da tela de Contatos

- Rota `contacts` → `src/pages/ViewRouter.tsx:50` (`'contacts': Views.ContactsView`), carregada por
  `src/pages/lazyViews.ts:10`. Há prefetch em `src/components/performance/Prefetcher.tsx:10` e
  `src/components/performance/LazyRoutes.tsx:8`.
- `src/components/contacts/ContactsView.tsx` compõe a tela: título semântico `sr-only` "Contatos",
  `ContactDialogs` (criar/editar/excluir + confirmação), `ContactMergeDialog` (só quando
  `canMerge`), `ContactCompareDialog`, `ContactBulkTagDialog`, `ContactStatsCards`,
  `ContactTypeTabs`, `ContactToolbar`, `ContactResultsSummary`, `ContactContentArea`,
  `ContactDetailPanel` (painel lateral quando um contato é clicado), `ContactCRMDialog`
  (integrado ao CRM externo, quando ligado) e `BulkActionsBar` (barra flutuante de ações em massa).
- `MotionConfig reducedMotion="user"` envolve a tela
  (`ContactsView.tsx:101`), ou seja, as animações respeitam `prefers-reduced-motion`.

### 2.2 Blocos da tela

| Bloco | Arquivo | O que faz |
|---|---|---|
| KPIs | `ContactStatsCards.tsx` | Cartões "Total de Contatos", "Novos (30 dias)", "Empresas", "Fornecedores" (`ContactKpiCard`) |
| Abas por tipo | `ContactTypeTabs.tsx`, `contactTypeConfig.tsx`, `contactTypeOrder.ts` | Abas por tipo canônico; contagens de `contactCountByType` |
| Barra de ferramentas | `ContactToolbar.tsx`, `FilterPresets.tsx`, `ContactAdvancedFilters.tsx` | Busca, ordenação, mostrar legados, filtros (empresa/cargo/tag/período), presets salvos, agrupar por empresa, ações em massa, seletor de visão, botão do CRM 360° |
| Resumo/paginação | `ContactResultsSummary.tsx` | Total, filtrados, selecionados, selecionar todos, página anterior/próxima |
| Área de conteúdo | `ContactContentArea.tsx` | Esqueleto, estado vazio e a visão escolhida |
| Ações em massa | `BulkActionsBar.tsx` | Tag, Atribuir, Tipo, Excluir |

### 2.3 Visões (`ContactViewSwitcher.tsx`)

- Primárias: **Cards** (`grid`), **Lista** (`list`), **Tabela** (`table`).
- Secundárias (menu "Mais visualizações"): **Pipeline** (`kanban`), **Mapa** (`map`),
  **Analytics** (`analytics`).
- Colunas do grid: 3 a 6 (`ContactContentArea.tsx:16-21`), padrão 4
  (`useContactsViewState.ts:17`).
- Cards/Lista/Tabela usam `ContactCard`, `ContactListItem`, `ContactGroupedList` (agrupar por
  empresa) e `ContactsTable`; **Pipeline** é `ContactKanbanView` (colunas = os tipos canônicos,
  `KANBAN_COLUMNS` a partir de `ORDERED_CONTACT_TYPE_CONFIGS`, com arrastar-e-soltar fazendo
  `update({ contact_type })` em `contacts`, com atualização otimista e confirmação por token de drag);
  **Mapa** é `ContactMapView` + `ContactRegionMap` (Mapbox, token obtido em
  `src/lib/mapboxToken.ts` via Edge `get-mapbox-token`; as regiões saem do DDD do telefone
  (`getRegionFromPhone.ts`) e viram coordenadas por região em `contactRegionGeo.ts` — a bolha leva só
  quem não tem coordenada própria); **Analytics** é `ContactAnalyticsDashboard`
  ("Analytics de Contatos", crescimento diário a partir dos contatos carregados).
- Atalhos de teclado (`useContactsViewState.ts:52-68`): `Ctrl/Cmd+N` abre novo contato;
  `Ctrl/Cmd+A` seleciona todos (fora de input/textarea); `Esc` fecha o detalhe, depois limpa a
  seleção e depois a busca (respeitando diálogos Radix abertos).

### 2.4 Fluxo: buscar e paginar

`useContactsSearch` (`src/hooks/crm/useContactsSearch.ts`):

- Chama a RPC `search_contacts` via `ContactService.searchContacts`
  (`src/services/contact.service.ts:37`), página de 50 (`PAGE_SIZE = 50`).
- Busca com debounce de 400 ms; trocar qualquer filtro volta para a página 0.
- Filtros: tipo (`contact_type_filter`), empresa, cargo, tag, período (`date_from` — hoje/semana/
  mês/trimestre/ano) e ordenação (`name`/`created_at`/`updated_at`, asc/desc).
- "Mostrar legados" (`showLegacy`) vai como `include_legacy` e é persistido
  (`readShowLegacyPreference`/`writeShowLegacyPreference` em `contactsAggregates.ts`).
- Consultas auxiliares por página: contadores por tipo (`contacts_count_by_type`), data da última
  mensagem (`get_last_message_dates`) e permissão de exclusão por contato (`can_delete_contacts`,
  que preenche `contact.can_delete`).
- `CONTACTS_AGGREGATE_QUERY_OPTIONS` (`refetchOnMount: 'always'`) faz lista, total e contadores
  revalidarem juntos ao abrir a tela.

### 2.5 Fluxos de escrita (contato)

`src/components/contacts/useContactsCRUD.ts`:

- **Criar**: `handleAddContact` exige nome e telefone; grava em `contacts` com telefone só em dígitos
  e `assigned_to` = perfil logado. Telefone duplicado (código `23505`) vira a mensagem "Já existe um
  contato cadastrado com este número de telefone." No sucesso, gera protocolo
  `CT-AAAAMMDD-XXXXXX` (`secureRandomChars`) e o mostra em `showSuccess`.
- **Editar**: `openEditDialog` carrega a linha completa (`ContactService.getById`, `select('*')`).
  Se o carregamento falhar, abre com a linha resumida da lista, remove os campos de endereço e avisa
  "Endereço não carregado — os campos de endereço não serão alterados." O UPDATE só inclui campos
  presentes na linha carregada (`ADDRESS_FIELDS`, `latitude`, `longitude`). UPDATE sob RLS que afete
  0 linhas é falha explícita ("Nenhum contato foi atualizado. Verifique se você tem permissão." —
  R2-AUTH-013). Telefone duplicado vira "Já existe outro contato com este número de telefone.".
- **Excluir (um)**: RPC `delete_contact` (soft delete auditado por `deleted_at`); `null`/erro é falha.
- **Excluir (lote)**: `BulkActionsBar` chama a RPC `delete_contacts` e usa a contagem devolvida;
  quando o total excluído é menor que o selecionado, o aviso é parcial
  ("N de M contatos removidos").
- **Ações em massa**: Tag (`applyContactTagChange`), Atribuir (`applyContactFieldUpdate` com
  `assigned_to`), Tipo (`applyContactFieldUpdate` com `contact_type`) e Excluir
  (`src/services/contact-bulk.service.ts`). Contatos recusados pelo banco permanecem selecionados
  (`onPartialComplete`).
- **Mesclar** (`ContactMergeDialog`) é oferecido só quando `canMerge` =
  `useCRMAdminAccess()` (`is_admin_or_supervisor`) não é `false`; **Comparar**
  (`ContactCompareDialog`) não tem restrição de papel própria.
- **Abrir conversa**: `openContactChat` navega para a view `inbox` e dispara o evento
  `open-contact-chat` (até 15 tentativas de 200 ms).

### 2.6 Ficha do contato (`ContactDetailPanel.tsx`)

Painel lateral com dados básicos (telefone, e-mail, empresa, cargo, criado em), tipo do contato
(`CONTACT_TYPE_CONFIG`), `ContactEngagementScore`, timeline de atividade
(`ContactActivityTimeline`, com estado de carregando e de falha), `ContactNotes`,
`ContactPurchaseHistory`, catálogo de produtos externo (`ExternalProductCatalog`) e histórico de
envios de catálogo (`useCatalogSendHistory`).

### 2.7 Fluxo: abas CRM 360° e SalesView dentro da conversa

Abas da conversa (`src/components/inbox/chat/ConversationTabs.tsx:10`):
`chat | files | ia | crm | orders | history | tasks | notes`. As duas deste módulo são
**`crm` = "CRM 360°"** e **`orders` = "SalesView"**, montadas por
`src/components/inbox/chat/ConversationTabContent.tsx` (linhas 95-104, via `lazy`).

**CRM 360° (`src/components/inbox/tabs/Crm360Tab.tsx`)** — todos os dados vêm de
`useContactCrm360(contactId)`:

- Cabeçalho `KpiStrip`: Cliente desde, Lead score (Alto potencial ≥ 80 / Médio ≥ 50 / Baixo),
  Última interação (do último `message.timestamp`), Status da conversa.
- Seções: **Empresa** (abre `EditContactDialog` com `buildEditContactShape`, esperando o dado
  enriquecido; em erro abre com o básico), **Etapa no funil** (trilha de estágios + "Avançar etapa →"
  → `useAdvanceDealStage`, ou "Nenhuma negociação aberta" com botão "Criar negociação"),
  **Últimas compras** (3 primeiras; pílulas de status `pending/approved/completed/cancelled`;
  "Ver no SalesView →" muda para a aba `orders`), **Propostas em aberto** (`OpenDealsList limit=3`),
  **Ticket médio** (com variação % — verde/vermelho), **Produtos de interesse** (até 3 tags,
  "Nenhum interesse marcado"), **Próxima melhor ação** (`useNextBestAction`; "Criar tarefa →" usa
  `useMyWorkItems.create` com chave idempotente `clientTaskId` — dois cliques na mesma sugestão não
  criam duas tarefas), **Pipeline comercial** (barra proporcional propostas/negociação/ganhos,
  "Ver pipeline →" navega para a view `pipeline`), **Últimas interações comerciais** (4 mais recentes;
  "Ver na Journey →" muda para a aba `history`).

**SalesView (`src/components/inbox/tabs/SalesViewTab.tsx`)**:

- `CommercialSummaryStrip`: Compras (valor e quantidade), Ticket médio, Propostas, Em aberto.
- `ContactPurchasesPanel` (compras e propostas, com "+ Novo" gravando em `contact_purchases` e
  `created_by` = `profileId`).
- "Propostas em aberto" com `OpenDealsList` completo (sem `limit`), com esqueleto `animate-pulse`
  enquanto carrega.

Não existe aba chamada "Propostas": as propostas aparecem nas seções de `OpenDealsList` das duas abas
acima (verificado em `ConversationTabs.tsx` e em `ConversationTabContent.tsx`).

### 2.8 Agregação comercial (`src/hooks/crm/useContactCrm360.ts`)

`useContactCrm360` lê `contact_purchases`, `sales_deals`, `sales_pipeline_stages` (ordenado por
`position`) e `contacts.tags`; depois `deal_activities` dos deals do contato e `conversation_events`
(`transfer|close|reopen`, 20 mais recentes). `staleTime` de 60 s. A conta é feita na função pura
`aggregateCrm360` (testável com dados sintéticos):

- Deals abertos = `status = 'open'`; **deal atual** = o aberto mais recente por `updated_at`;
  **estágio atual** = o estágio do deal atual.
- Compras concluídas = `status` em `['completed','approved']`; **ticket médio** sobre as concluídas;
  **variação %** só quando há compras concluídas nas duas janelas de 6 meses.
- **Interesses** = 3 primeiras tags (`contacts.tags`).
- **Pipeline**: "propostas" = deals abertos cujo estágio tem "propost" no nome; "negociação" = os
  demais abertos; "ganhos" = `status = 'won'`.
- **Interações** = atividades de deal + compras + eventos de conversa, ordenadas por data, 4 primeiras.

`useContactLeadScore` lê `lead_score`/`risk_score` de `contacts`. `useAdvanceDealStage` faz
`update` de `sales_deals.stage_id` e insere uma linha em `deal_activities`
(`activity_type: 'stage_change'`, descrição "Movido para <etapa>"), invalidando o cache do CRM 360.

---

## 3. Dados (tabelas, colunas, RPC, Edge Functions)

### 3.1 Tabelas locais (conferidas em `supabase/schema-catalog.json`)

**`contacts`** (RLS ligada) — colunas: `id`, `name`*, `phone`*, `email`, `avatar_url`, `assigned_to`,
`whatsapp_connection_id`, `tags` (`text[]`), `notes`, `created_at`, `updated_at`, `nickname`,
`surname`, `job_title`, `company`, `queue_id`, `contact_type`, `ai_priority`, `ai_sentiment`,
`channel_type`, `channel_connection_id`, `group_category`, `lead_score`, `risk_score`, `lead_origin`,
`consent_status`, `avatar_fetch_attempted_at`, `conversation_status`*, `conversation_status_changed_at`,
`is_lid_legacy`*, `postal_code`, `address`, `address_number`, `neighborhood`, `city`, `state`,
`latitude` (`double precision`), `longitude`, `deleted_at` (soft delete), `ai_projection_updated_at`,
`ai_projection_analysis_id`. (* = not-null)

**`sales_deals`** (RLS ligada) — `id`*, `title`*, `value` `numeric(12,2)`, `currency`, `stage_id`,
`contact_id`, `assigned_to`, `priority`, `expected_close_date` (`date`), `notes`, `tags`, `status`,
`won_at`, `lost_at`, `lost_reason`, `created_at`, `updated_at`.

**`deal_activities`** (RLS ligada) — `id`*, `deal_id`*, `activity_type`*, `description`,
`performed_by`, `created_at`.

**`contact_purchases`** (RLS ligada) — `id`*, `contact_id`*, `title`*, `description`, `amount`
`numeric(12,2)`, `currency`, `status`, `purchase_type`, `deal_id`, `created_by`, `purchased_at`,
`created_at`*, `updated_at`*.

**`sales_pipeline_stages`** (RLS ligada) — `id`*, `name`*, `color`*, `position`* (int), `is_active`,
`created_at`, `updated_at`.

**`conversation_events`** — usada só em leitura pelo CRM 360°: `id`, `contact_id`, `event_type`,
`from_agent_id`, `to_agent_id`, `from_queue_id`, `to_queue_id`, `metadata`, `performed_by`,
`created_at`, `closure_id`.

**Outras tabelas tocadas pela ficha/notas** (via `ContactService`): `contact_notes`
(com `category`, `is_done`, `due_date`), `contact_custom_fields` (campos personalizados),
`ai_conversation_tags` (tags de IA), `conversation_sla`, `messages`, `csat_surveys` (estatísticas do
contato), `profiles` (autoria das notas).

**Auditoria**: `contact_deletion_audit` e os triggers `trg_audit_contact_deletion_change` e
`trg_audit_contact_purge` (migration `supabase/migrations/20260930170000_contacts_deleted_at_audit.sql`),
além do trigger de auditoria de endereço (`audit_contact_address_change`, conforme catálogo de
trigger functions).

### 3.2 RPCs usadas (assinaturas do catálogo local)

| RPC | Assinatura (catálogo) | Uso no módulo |
|---|---|---|
| `search_contacts` | `(search_term, contact_type_filter, company_filter, job_title_filter, tag_filter, date_from, sort_field, sort_direction, page_size, page_offset, include_legacy)` → 23 colunas + `total_count` | Lista/paginação de Contatos |
| `contacts_count_by_type` | `(include_legacy boolean)` → `(contact_type, count)` | Contadores das abas e dos KPIs |
| `get_last_message_dates` | `(contact_ids uuid[])` → `(contact_id, last_message_at)` | Data da última mensagem por contato da página |
| `can_delete_contacts` | `(p_ids uuid[])` → `(contact_id, can_delete)` | Habilita/desabilita "Excluir" por contato |
| `can_edit_contact` | `(assigned_to, queue_id)` → boolean; variante de 5 parâmetros `(assigned_to, queue_id, visible_agent_ids, profile_id, is_admin)` | Predicado único de permissão (policies, `search_contacts`, `can_delete_contacts`, exclusões); as policies usam a variante de 5 |
| `delete_contact` | `(p_id uuid)` → uuid | Exclusão individual (soft delete) |
| `delete_contacts` | `(p_ids uuid[])` → integer | Exclusão em massa (devolve quantos saíram) |
| `merge_contacts_atomic` | `(p_primary_id, p_secondary_ids, p_merged_fields)` → jsonb | Mesclar contatos |
| `is_admin_or_supervisor` | `(_user_id uuid)` → boolean | Gate de admin/supervisor no front (`useCRMAdminAccess`) |
| `is_contact_visible_to_user` | `(_contact_id, _user_id)` → boolean | Predicado das policies de `contact_purchases`, `conversation_events` e outras |
| `require_contact_edit_permission` | `(p_contact_id)` | Guarda de permissão de edição (catálogo) |
| `delete_contact`/`delete_contacts` (SECURITY DEFINER) | — | Exigem `auth.uid()` e `can_edit_contact`; sem permissão, `insufficient_privilege` |

### 3.3 Edge Functions

- **`crm-integration`** (`supabase/functions/crm-integration/index.ts`) — proxy autenticado para o
  banco do CRM externo. Ações tratadas: `rpc`, `select`, `mutate`, `contactLookup`,
  `contactLookupBatch`, `emailContactContext`, `linkEmailContactCompany`, `enqueueSync`,
  `processOutbox`, `health`. Usa allowlist de tabelas e validação de RPC/mutação
  (`_shared/crm-integration-contract.ts`), limites de 12 s de timeout, 64 KB de requisição,
  512 KB de resposta e lote máximo de 10; traduz o sentimento canônico pt-BR
  (`positivo/neutro/negativo/critico`) para o vocabulário do CRM (inglês) **só na fronteira de saída**.
  O front chama por `src/lib/crmIntegration.ts` (`callCRMIntegration`).
- **`get-mapbox-token`** — token do mapa; chamado por `src/lib/mapboxToken.ts:87` e usado pelo
  formulário de endereço (`ContactForm.tsx`) e pelo mapa por região (`ContactRegionMap.tsx`).
- **NÃO VERIFICADO**: quais outras Edge Functions escrevem em `contacts`; a busca por referências
  encontra várias (`batch-fetch-avatars`, `ai-auto-tag`, `evolution-api`, `gmail-webhook`,
  `chatbot-l1`, `bitrix-api`, `external-db-bridge`/`external-db-proxy` etc.), mas isso pertence a
  outros módulos e não foi conferido neste cartão.

### 3.4 Banco do CRM externo (integração opcional)

`docs/CRM360_TECHNICAL_DOCS.md` descreve o banco externo (projeto separado) e as RPCs
`get_contact_360_by_phone`, `search_contacts_advanced`, `get_companies_by_phones_batch`,
`sync_interaction_from_zapp`, `get_contact_intelligence_by_phone` e `recalculate_rfm_for_company`.
Nenhuma delas aparece em `supabase/schema-catalog.json` (que cobre o banco local) —
**NÃO VERIFICADO** neste repositório. O que é verificável no código local:

- `useAdvancedContactSearch` (`src/hooks/crm/useAdvancedContactSearch.ts:45`) chama o Edge
  `crm-integration` com `action: 'rpc'` e `rpc: 'search_contacts_advanced'`, usado por
  `AdvancedCRMSearch.tsx` (busca avançada exibida pelo `ContactCRMDialog`, que também importa o
  contato para `contacts`).
- `useExternalContact360Batch` (`src/hooks/crm/useExternalContact360Batch.ts`) chama
  `action: 'contactLookupBatch'` via `ExternalCRMService.getContact360Batch`
  (`src/services/crm/external-crm.service.ts`), com lotes de 100 ids e 3 workers; devolve
  `Map<phone, {company_name, logo_url, vendedor_nome, cliente_ativado, total_pedidos,
  valor_total_compras, rfm_segment, rfm_score}>`. Falha em **todos** os lotes é erro explícito.

---

## 4. Permissões e regras de acesso

### 4.1 Contatos

- RLS ligada em `contacts` (`supabase/migrations/20251215024517_...sql:87`, reforçada em
  `20260930460000_harden_talk_me_client_table_privileges.sql:17`).
- **SELECT e UPDATE** usam hoje o mesmo predicado, a função `public.can_edit_contact`: admin/supervisor,
  ou o contato atribuído a um agente visível, ou membro ativo da fila do contato
  (`20260906140000_fix_contacts_update_policy_queue_members.sql` documenta a inclusão de membros de
  fila). A migration `20260929780000_contacts_single_permission_predicate.sql` unificou a regra em um
  único lugar (policies + `search_contacts` + `delete_contact`/`delete_contacts`), e
  `20260929810000_contacts_can_edit_contact_hoisted_params.sql` fez as policies chamarem a variante
  de **5 parâmetros** — `can_edit_contact(assigned_to, queue_id, agentes visíveis, profile do usuário,
  is_admin)` — com os valores preparados uma vez por consulta (a versão de 2 parâmetros virou
  embrulho para a de 5, para não pagar o custo por linha). `can_delete_contacts` foi alinhada à mesma
  forma em `20260929820000_contacts_can_delete_contacts_hoisted_params.sql`. Ou seja: mudar a regra
  passa a ser mudar **uma** função.
- **INSERT**: policy "Users can insert contacts" (`20260318121154_...sql`).
- **DELETE**: não existe policy de DELETE em `contacts`. A exclusão é exclusivamente pelas RPCs
  `delete_contact`/`delete_contacts` (SECURITY DEFINER), que exigem `auth.uid()` e
  `can_edit_contact`, fazem **soft delete** (`deleted_at = now()`) e recusam com
  `insufficient_privilege` quando nada foi afetado.
- **Mesclar**: `merge_contacts_atomic` recusa com `42501` quem não é admin/supervisor
  (`is_admin_or_supervisor`), e o merge faz **DELETE físico** dos contatos secundários
  (`contactPermissions.ts:46-68`).
- **No front** (`src/components/contacts/contactPermissions.ts`): a regra não é reimplementada no
  cliente. `can_delete` chega do banco por contato (`can_delete_contacts`); `canMerge` vem de
  `is_admin_or_supervisor` via `useCRMAdminAccess`. Semântica única: `undefined`/`null` (RPC ainda não
  respondeu, ou contato selecionado que não está na página carregada) **não bloqueia** — só esconde
  quando o servidor diz que não. O botão "Alterar tipo em massa" reusa o mesmo dado do servidor
  (`canChangeSelectedContactsType`), com gate de papel adicional (`useUserRole().isSupervisor`).

### 4.2 CRM 360° / SalesView (deals, atividades, compras)

- **`sales_deals`**: RLS ligada (`20260315203210_...sql:121`). SELECT = policy "Users can view assigned
  or admin deals" (`20260401001811_...sql`: `is_admin_or_supervisor(auth.uid())` OU
  `assigned_to` do usuário). UPDATE = "Users can update assigned deals" (dono do deal ou
  admin/supervisor). DELETE = apenas admin/supervisor. INSERT: existem **duas** policies —
  "Users can insert deals" (`20260317222757_...sql:59-62`, com `WITH CHECK` condicional) e
  "Authenticated can insert deals" (`20260317222442_...sql:82-84`, com `WITH CHECK (true)`); como
  policies permissivas se somam, o efeito prático é permitir INSERT a qualquer usuário autenticado.
- **`deal_activities`**: RLS ligada (`20260315203210_...sql:122`). SELECT = "Admins can view deal
  activities" (admin/supervisor) **ou** "Agents can view activities on their deals" (quem registrou —
  `performed_by` do usuário — ou atividades de deals atribuídos a ele). INSERT = "Authenticated can
  insert deal activities" (`performed_by` = perfil do usuário ou admin/supervisor). **Não há policy de
  UPDATE nem de DELETE** (verificado nas migrations que tocam a tabela).
- **`contact_purchases`**: SELECT, INSERT, UPDATE e DELETE pelo mesmo predicado
  `is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())`
  (`20260409222809_...sql`), substituindo a policy ampla anterior. O `created_by` é preenchido pelo
  front com o `profileId` do usuário logado (`SalesViewTab` → `ContactPurchasesPanel`).
- **`sales_pipeline_stages`**: leitura liberada para `authenticated`; escrita só admin/supervisor
  (`20260317222442_...sql`).
- **`conversation_events`**: SELECT por `is_contact_visible_to_user(contact_id, auth.uid())` ou
  admin/supervisor (`20260409222809_...sql`).
- **Etapa do funil**: "Avançar etapa →" (`useAdvanceDealStage`) grava em `sales_deals` e em
  `deal_activities` **direto do front** com o usuário logado — portanto depende das policies acima
  (não há RPC de avanço de etapa neste caminho).

---

## 5. Estados de erro e vazio

- **Carregando**: `ContactsSkeleton` respeita o modo de visão (`ContactContentArea.tsx:62-63`);
  a seção de propostas do SalesView mostra esqueleto `animate-pulse` (`SalesViewTab.tsx:38-42`).
- **Vazio da lista** (`ContactEmptyState`, `ContactContentArea.tsx:64-76`): três variantes —
  `no-results` (há busca), `filtered-empty` (há filtros) e `no-contacts`; as ações "limpar busca" e
  "limpar filtros" só aparecem quando fazem sentido, e sempre há a ação de adicionar contato.
- **Vazios das seções comerciais**: "Nenhuma negociação aberta" (+ "Criar negociação"), "Nenhuma
  compra registrada", "Nenhum interesse marcado", "Sem ações sugeridas", "Sem negociações",
  "Nenhuma interação comercial" e, no `OpenDealsList`, `EmptyState` "Nenhuma proposta em aberto".
  A ficha do contato tem estados próprios de carregando e de falha na timeline
  (`ContactDetailPanel.tsx:261` e `:273`, "Não foi possível carregar a atividade deste contato").
- **Feedback de escrita**: os fluxos de criar/editar/excluir passam por `useActionFeedback`
  (mensagens de "carregando"/sucesso/erro) e as ações em massa usam `toast` — sucesso, aviso parcial
  com contagem ("N de M contatos …") e erro, com mensagem específica de permissão quando o banco
  recusa ("Verifique se você tem permissão.").
- **Risco verificado**: a tela **não consome** o `error` de `useContactsSearch` (a `ContactsView` não
  o desestrutura e `ContactContentArea` não tem prop de erro). Uma falha da RPC de busca cai, portanto,
  no estado vazio; **NÃO VERIFICADO** se existe algum aviso global que cubra esse caso.

---

## 6. Limites e riscos conhecidos

1. **O funil não vive neste módulo.** Os atalhos "Ver funil →" e "Ver pipeline →" do CRM 360°
   navegam para a view `pipeline`, que em `src/pages/ViewRouter.tsx:104` monta
   `Views.TasksModule` com `TASKS_ROUTE_PROPS.pipeline` (`forceMode: 'board'`) — o módulo de
   Tarefas/Quadro. `sales_deals` só aparece em `OpenDealsList.tsx`, `useContactCrm360.ts`,
   `useConversationHistoryTimeline.ts` (a aba Journey, que lê os deals do contato para o histórico
   comercial), no teste dessa hook (`useConversationHistoryTimeline.janela.test.tsx`) e em
   `integrations/supabase/types.ts`; ou seja, **nenhuma tela de funil lê `sales_deals` hoje**. O botão
   cria uma expectativa que a navegação não cumpre.
2. **INSERT de `sales_deals` e de `deal_activities` é permissivo** (ver §4.2): qualquer usuário
   autenticado insere deal e atividade, inclusive em deal de outro. É regra de banco, não do front.
3. **`deal_activities` sem UPDATE/DELETE**: não há caminho para corrigir ou remover uma atividade
   registrada.
4. **Mesclar é irreversível**: `merge_contacts_atomic` apaga fisicamente os secundários; o gate é
   só admin/supervisor.
5. **Telefone único**: duplicidade é barrada pelo banco (`23505`); o front traduz para mensagem
   amigável, mas a regra (e a normalização para dígitos) é do servidor.
6. **Propostas por heurística de nome de estágio**: `aggregateCrm360` classifica como "propostas" os
   deals abertos em estágios cujo nome contém "propost" (case-insensitive). Renomear um estágio muda
   a leitura do painel.
7. **Indicadores podem ficar ausentes**: `ticketDeltaPct` só existe com compras concluídas nas duas
   janelas de 6 meses; `lead_score` pode ser nulo ("Sem score"); a variação é arredondada e calculada
   sobre janelas móveis de 180 dias.
8. **Status de compra fora da lista** cai na pílula "Pendente" (`PURCHASE_STATUS_PILL[p.status] ??
   pending`).
9. **Integração externa é condicional**: só existe com `VITE_CRM_INTEGRATION_ENABLED` ligado
   (`useCRMIntegrationEnabled`) e com o Edge `crm-integration` configurado; sem isso, o botão do
   CRM 360° e o enriquecimento por telefone não aparecem. Falha em todos os lotes de enriquecimento
   vira erro explícito (`Todos os lotes de enriquecimento CRM falharam`).
10. **Documentação da integração parcialmente defasada**: `docs/CRM360_TECHNICAL_DOCS.md` aponta
    caminhos antigos (ex.: `hooks/useExternalContact360.ts`), enquanto o código atual está em
    `src/hooks/crm/`. Não foi corrigido neste cartão (fora do escopo).
11. **Regra permanente respeitada — nada sai do sistema**: não há caminho de exportar/baixar/imprimir/
    compartilhar nos diretórios deste módulo (busca por `useDownloadPermission`, `csv`, `xlsx`,
    `createObjectURL` e `downloadURL` em `src/components/contacts`, `src/hooks/crm` e nas duas abas
    não devolveu nenhuma ocorrência).
12. **Regra permanente respeitada — sem selo de canal/origem**: nenhum componente deste módulo
    desenha canal/origem do contato (`channel_type` aparece só como campo lido em
    `useContactEnrichedData.ts:14` e `lead_origin` só como tipo em `ContactMapView.tsx:20`).

---

## 7. Testes existentes (caminhos)

**Unitários/integração de Contatos — `src/components/contacts/__tests__/` (30 arquivos):**
`BulkActionsBar.test.tsx`, `BulkActionsBarPermissions.test.tsx`, `BulkActionsBarTypeGate.test.tsx`,
`CT51_52_sendProduct.test.tsx`, `ContactAnalyticsDashboard.test.tsx`, `ContactBulkTagDialog.test.tsx`,
`ContactCatalogSendHistory.test.tsx`, `ContactDeleteEntryPoints.test.tsx`,
`ContactDeletePermission.test.tsx`, `ContactDetailPanel.activity.test.tsx`,
`ContactEngagementScore.test.tsx`, `ContactFormEndereco.integration.test.tsx`,
`ContactFormEndereco.test.tsx`, `ContactFormRecalculoCorrida.test.tsx`,
`ContactKanbanAggregates.test.tsx`, `ContactMapView.test.tsx`, `ContactMergePermission.test.tsx`,
`ContactNotes.excluirNota.test.tsx`, `ContactOpenChat.test.tsx`, `ContactRegionMap.test.tsx`,
`ContactStatsCards.test.tsx`, `ContactToolbar.test.tsx`, `ContactTypeTabs.test.tsx`,
`ExternalDataIntegration.test.tsx`, `FilterPresets.test.tsx`, `contactDeleteFixtures.tsx` (fixture),
`contactTypeConfig.test.ts`, `useContactFormValidation.test.ts`, `useContactsCRUD.test.tsx`,
`useContactsViewState.test.tsx`.

**Hooks de CRM — `src/hooks/crm/__tests__/` (12 arquivos):** `contactsAggregates.test.ts`,
`contactsAggregatesRefetchOnMount.test.tsx`, `useAdvancedContactSearch.filters.test.ts`,
`useAgentPresence.test.ts`, `useAgentsLite.test.tsx`, `useContactCrm360.test.ts`,
`useContactEnrichedData.test.tsx`, `useContactSidebar.test.tsx`,
`useContactsKpi.pagination.test.ts`, `useContactsKpi.query.test.tsx`, `useContactsKpi.test.ts`,
`useEmailContactContext.test.tsx`. Fora da pasta:
`src/hooks/crm/useContactNotes.error-pagination.test.tsx` e
`src/hooks/crm/useContactSummaryNote.concurrency.test.tsx`.

**Contratos — `tests/contracts/`:** `axe-contatos.contract.test.ts`,
`crm-sentiment-boundary.contract.test.ts`.

**Ponta a ponta — `e2e/`:** `contacts-view.spec.ts`, `contacts-views.spec.ts`,
`contacts-crud.spec.ts`, `contacts-detail.spec.ts`, `contacts-selection.spec.ts`,
`contacts-snapshots.spec.ts`, `contacts-tabs-geometry.spec.ts`, `contact-address.spec.ts`,
`contact-form-email-duplicate.spec.ts`, `contact-map-pin.spec.ts` e `inbox-contact-sidebar.spec.ts`;
fixtures em `e2e/fixtures/contacts-page.ts` e `e2e/fixtures/e2e-contact.ts`; capturas de referência em
`e2e/__screenshots__/contacts-*.png`.

**Banco — `supabase/tests/`:** nenhum arquivo de contatos/CRM (verificado: só existem
`dashboard_*`, `inbox_agregado_por_contato.sql`, `rls_conversation_tab_counts_files_total.sql`,
`rls_dashboard.sql`, `rls_whatsapp_media_select_via_messages.sql`).

---

## 8. Arquivos-chave com caminhos

**Tela de Contatos**

- `src/components/contacts/ContactsView.tsx` — composição da tela (rota `contacts`).
- `src/components/contacts/useContactsViewState.ts` — estado da visão, seleção, presets, atalhos.
- `src/components/contacts/useContactsCRUD.ts` — criar/editar/excluir contato e protocolo de sucesso.
- `src/components/contacts/ContactContentArea.tsx` — esqueleto, vazio e despacho das visões.
- `src/components/contacts/ContactToolbar.tsx`, `FilterPresets.tsx`, `ContactAdvancedFilters.tsx` —
  busca, filtros e presets.
- `src/components/contacts/ContactTypeTabs.tsx`, `contactTypeConfig.tsx`, `contactTypeOrder.ts` —
  tipos canônicos (cliente, fornecedor, transportadora, colaborador, prestador de serviço, parceiro).
- `src/components/contacts/ContactViewSwitcher.tsx` — modos cards/lista/tabela/pipeline/mapa/analytics.
- `src/components/contacts/ContactsTable.tsx`, `ContactCard.tsx`, `ContactListItem.tsx`,
  `ContactGroupedList.tsx` — visões de lista.
- `src/components/contacts/ContactKanbanView.tsx` — pipeline por tipo (arrastar e soltar).
- `src/components/contacts/ContactMapView.tsx`, `ContactRegionMap.tsx`, `getRegionFromPhone.ts`,
  `contactRegionGeo.ts` — mapa por região/endereço.
- `src/components/contacts/ContactAnalyticsDashboard.tsx`, `ContactStatsCards.tsx`,
  `ContactKpiCard.tsx` — indicadores.
- `src/components/contacts/ContactDetailPanel.tsx`, `ContactActivityTimeline.tsx`,
  `ContactEngagementScore.tsx`, `ContactNotes.tsx`, `ContactPurchaseHistory.tsx` — ficha do contato.
- `src/components/contacts/ContactForm.tsx`, `ContactDialogs.tsx`, `useContactFormValidation.ts`,
  `ContactMergeDialog.tsx`, `ContactCompareDialog.tsx`, `ContactBulkTagDialog.tsx`,
  `BulkActionsBar.tsx`, `contactPermissions.ts` — formulário, diálogos, ações em massa e permissões.
- `src/components/contacts/AdvancedCRMSearch.tsx`, `ContactCRMDialog.tsx` — busca/importação no
  CRM externo (opcional).
- `src/services/contact.service.ts`, `src/services/contact-bulk.service.ts` — acesso a dados do
  módulo.

**Hooks de CRM**

- `src/hooks/crm/useContactsSearch.ts` — busca/paginação da lista.
- `src/hooks/crm/useContactCrm360.ts` — agregação do CRM 360°, lead score e avanço de etapa.
- `src/hooks/crm/useExternalContact360Batch.ts`, `useExternalContact360.ts`,
  `useContactIntelligence.ts`, `useAdvancedContactSearch.ts` — integração externa.
- `src/hooks/crm/useContactNotes.ts`, `useContactSummaryNote.ts`, `useContactCustomFields.ts`,
  `useContactEnrichedData.ts`, `useContactSidebar.ts`, `useContactStats.ts`, `useContactPurchases.ts`,
  `useContactAssignment.ts`, `useAgentReassignment.ts`, `useAgents.ts`, `useAgentsLite.ts`,
  `useVisibleAgents.ts`, `useTeamProfiles.ts`, `useAgentPresence.ts`, `useContactsKpi.ts`,
  `contactsAggregates.ts`, `useCRMAdminAccess.ts`, `index.ts` — o restante da camada de dados.
- `src/components/inbox/tabs/Crm360Tab.tsx`, `SalesViewTab.tsx`, `OpenDealsList.tsx`,
  `CommercialSummaryStrip.tsx`, `SectionCard.tsx`, `KpiStrip.tsx` — abas da conversa.
- `src/components/inbox/ContactPurchasesPanel.tsx` — compras e propostas do contato.
- `src/components/inbox/chat/ConversationTabs.tsx`, `ConversationTabContent.tsx` — onde as abas
  `crm` e `orders` são declaradas e montadas.
- `src/services/crm/external-crm.service.ts`, `src/lib/crmIntegration.ts`, `src/lib/mapboxToken.ts` —
  clientes da integração externa e do mapa.
- `supabase/functions/crm-integration/index.ts`, `supabase/functions/_shared/crm-integration-contract.ts`
  — Edge do CRM externo.

---

## 9. Planos e documentos relacionados (07/10/2026)

- `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md` — plano-mãe deste
  documento (Y20). Deste mesmo plano saem os cartões que afetam o módulo: **Y14** (auditoria de
  acessibilidade e celular de Contatos/CRM 360°/SalesView), **Y24** (segurança em leitura: regras de
  acesso de contatos, mensagens e atribuição), **Y25** (tarefas, notas, propostas, e-mail, ligações e
  analytics) e **Y29** (mapa de todas as saídas de informação do sistema).
- `docs/design/PLANO_SALESVIEW_JOURNEY_50_ETAPAS_2026-10-02.md` e as evidências em
  `docs/design/salesview-journey/` — SalesView e Journey (abas `orders` e `history`).
- `docs/design/PLANO_MELHORIAS_CONTATOS_50_ETAPAS_2026-09-27.md`,
  `docs/design/PLANO_REDESIGN_CONTATOS_NAVY_100_ETAPAS.md` e
  `docs/design/REDESIGN_CONTATOS_STATUS.md` — evolução da tela de Contatos.
- `docs/audits/AUDITORIA_MODULO_CONTATOS_2026-09-29.md` — auditoria do módulo que originou várias
  correções citadas aqui (soft delete, exclusão em massa, R2-AUTH-013).
- `docs/CRM360_TECHNICAL_DOCS.md` — integração com o banco do CRM externo (parcialmente defasado
  quanto a caminhos de arquivo).
- `docs/plans/PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS_2026-10-07.md` — aba Journey, destino do
  link "Ver na Journey →" do CRM 360°.
- `docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md` — módulo que hoje responde pela
  rota `pipeline` usada pelos atalhos "Ver funil →"/"Ver pipeline →" (ver risco 1 em §6).
