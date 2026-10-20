# Módulo: Catálogo, Filas, SLA e War Room

> **Documento de módulo** · cartão **Y22** do plano `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md` · 07/10/2026
>
> **Como este documento foi feito (método).** Tudo aqui foi lido no **código da branch do dia** (`dia/2026-10-07`, commit base `af189d0c5`): os componentes de `src/components/catalog`, `src/components/queues`, `src/hooks/sla` e `src/hooks/business/useWarRoomAlerts.ts`, os hooks de dados que eles consomem (`src/hooks/integrations/use*Catalog*`, `src/hooks/business/useQueues*.ts`, `src/hooks/business/useWarRoomData.ts`), a Edge Function `supabase/functions/promogifts-catalog` e as migrations de `supabase/migrations`. Nomes de tabela e coluna foram conferidos em `supabase/schema-catalog.json` (gerado em 2026-10-04), em `src/integrations/supabase/types.ts` e no SQL das migrations.
>
> **Regra do "NÃO VERIFICADO".** O que não pôde ser provado no código desta branch está marcado com **NÃO VERIFICADO** — nunca preenchido por dedução. O maior bloco de NÃO VERIFICADO é o **estado efetivo das policies RLS no banco canônico**: `supabase/schema-catalog.json` **não** exporta policies, então o que está aqui é o que as migrations impõem e o que o dump `supabase-export/BLOCO_09_rls_policies.sql` mostra; a última palavra é do banco, e nenhum agente acessa produção (regra R1).
>
> **Regras permanentes do produto que valem para estes módulos:** nenhuma informação sai do sistema; nada de selo de canal/origem de arquivo ou mensagem; só as cores dos tokens do sistema; efeitos sutis só com `motion-safe:` e respeitando `prefers-reduced-motion`.

---

## 1. O que é e para quem

Este documento cobre quatro áreas que se cruzam em um fluxo comum — **o atendimento tem prazo, e o prazo precisa ser visto**:

| Área | O que é | Entrada principal | Público |
|---|---|---|---|
| **Catálogo** | Vitrine de produtos do parceiro **PromoGifts** (banco Supabase externo) dentro do sistema: buscar, ver detalhe, favoritar e **enviar produto por mensagem** para um contato | view `catalog` (atalho **Alt+A**), `src/components/catalog/ExternalProductManagement.tsx` | Qualquer usuário autenticado — é a única das quatro entradas na navegação **primária sem exigir papel** (`src/services/navigation.service.ts:55`) |
| **Filas** | Cadastro e operação das filas de atendimento: membros, metas, alertas e comparação entre filas | view `queues`, rota `/queue/:id`, rota `/queues/comparison` — `src/components/queues/QueuesView.tsx` | **staff** (`admin`, `supervisor`) |
| **SLA** | Prazos de primeira resposta e de resolução, com métricas, histórico e configuração | view `sla`, rotas `/sla` e `/sla/history` — `src/components/queues/SLADashboard.tsx` | **staff** |
| **War Room** | Sala de situação em tela cheia: agentes, filas, alertas em tempo real com som e notificação de área de trabalho | view `warroom` — `src/components/dashboard/WarRoomDashboard.tsx` | **staff** |

Notas de público e de fronteira:

- `STAFF_ROLES = ['admin', 'supervisor']` é definido em `src/services/navigation.service.ts:34` e é o gate das três últimas áreas na navegação. O Catálogo **não** tem `roles` na entrada primária.
- O **Catálogo não é só uma tela**: o mesmo diálogo (`ExternalProductCatalog`) é embutido no painel do contato (`src/components/contacts/ContactDetailPanel.tsx:304`) e no chat do inbox (`src/components/inbox/chat/ChatInputToolbars.tsx:142`, `ChatDialogs.tsx:65`). Quem documenta Contatos/Inbox precisa saber que este módulo aparece lá.
- O **War Room não é o dono dos alertas**: ele consome `warroom_alerts` e o monitor de SLA que vive em `src/hooks/business/useWarRoomAlerts.ts` — o mesmo hook usado pelo painel. O alerta de violação de SLA é criado por esse monitor, não por uma Edge Function.
- **Nenhuma informação sai do sistema por estes módulos além do envio de mensagem** (que é a função do Catálogo: mandar o produto ao contato). Não há aqui caminho novo de exportar/compartilhar — ver §6 para os dois caminhos de **download** que já existiam e que a revisão de saídas de informação (cartão Y29) precisa mapear.

---

## 2. Telas e fluxos principais

### 2.1 Catálogo

**Tela principal** — view `catalog` (`ExternalProductManagement`, 1.272 linhas) montada a partir de `src/pages/lazyViews.ts:15`. Componentes:

- `ExternalProductCatalog.tsx` — o catálogo apresentável em diálogo (grid/lista, virtualização por `@tanstack/react-virtual`, favoritos, seleção múltipla). Tem **duas casas**: a própria view e os diálogos embutidos de Contatos e Inbox.
- `CatalogRail.tsx` — rail direito (banner, gráfico mensal, contagens, "enviados recentemente", "mais enviados (30 dias)"). A copy do banner é uma constante isolada (`CATALOG_RAIL_COPY`).
- `CatalogAdvancedFilters.tsx` — painel de filtros avançados (marca, categoria, preço, estoque, personalização, prazo, tags).
- `CatalogFavoritesTab.tsx` — aba de favoritos; consome `useCatalogFavorites()` e **não** chama a API do catálogo (o preço/estoque não está na cópia salva do favorito).
- `ProductDetailDialog.tsx` — detalhe do produto em **Sheet** lateral (galeria, zoom, contador N/M, navegação ‹ ›, variantes agrupadas por cor, copiar SKU, meta-tiles).
- `CatalogHelpSheet.tsx` — "Como usar o catálogo" em 5 passos + tour de 1ª visita; ao concluir/pular grava `catalog.tourDone` no `localStorage`. Os passos são **texto, sem prints** (os prints reais não existem no repositório — a própria nota do arquivo diz isso).
- `WhatsAppTemplatesManager.tsx` — gestor de templates de mensagem (view `wa-templates`), usado pelo fluxo de envio.
- `CatalogBulkBar.tsx` + `CatalogBulkSendDialog.tsx` — barra e diálogo de **envio em massa** (um contato por vez, progresso, um único toast de resumo).

**Fluxo de envio de um produto** (`SendProductDialog.tsx`, 749 linhas + `useSendProduct.ts`):

1. buscar/escolher produto e variação (cor);
2. escolher as fotos a enviar;
3. escolher/editar o modelo de mensagem (`sendProductUtils.buildMessage`);
4. escolher o contato (`ContactSelectionStep.tsx`, com "envios recentes" como atalho, mínimo de 2 caracteres — `CONTACT_SEARCH_MIN_CHARS`);
5. checagem pré-envio (`useCatalogSendReadiness`): existe conexão de WhatsApp `connected` e o contato **não** está suprimido em `talkx_blacklist`;
6. enviar via `sendOutboundMessage` (`src/services/outbound-message.service.ts`) e gravar o evento em `catalog_send_events` (`logCatalogSendEvent`).

Estados de classificação do envio (R2-MOD-007, `CatalogBulkSendDialog.tsx`): **`sent` / `partial` / `failed`** contados pelas **tentativas efetivas**; item que não concluiu continua selecionado para reenvio.

Deep link de categoria: `?view=catalog&cat=<uuid>` (`catalogCategoryRoute.ts`) — valor malformado ou duplicado é rejeitado (`null`) em vez de coagir; a normalização usa `replaceState` (não cria entrada no histórico).

Exportação: **CSV do filtro atual** (`catalogExport.ts`) — ver §6, é um ponto de atenção.

### 2.2 Filas

- **`/` view `queues`** (`QueuesView.tsx`): cabeçalho com atalhos para Dashboard SLA e "Comparar Filas"; faixa de **Alertas Ativos** (dispensáveis na sessão) e grade de `QueueCard` + o card tracejado "Adicionar Nova Fila".
- **`/queue/:id`** (`src/pages/QueueDetails.tsx`): métricas da fila (`queue-details/queueMetrics.ts`), gráficos (`QueueCharts`), membros, contatos da fila (`QueueContactsTable`), botão "Configurar" (`EditQueueDialog`).
- **`/queues/comparison`** (`QueuesComparisonDashboard.tsx`): tabela + gráficos comparando filas no período (`PeriodSelector`: hoje/7/30 dias/personalizado).
- **Metas e alertas**: `QueueGoalsDialog.tsx` grava `queue_goals` (limites de contatos em espera, tempo médio de espera, taxa de atribuição, mensagens pendentes e `alerts_enabled`). Os alertas de fila (`QueueAlert`) são **calculados no cliente** em `QueuesView.tsx:33-60` a partir da fila + da meta; severidade `warning`/`critical`; dispensar é estado local (`dismissedAlerts`), **não** persistido.
- **Criação/edição/exclusão** de fila e gestão de membros: `CreateQueueDialog`, `EditQueueDialog`, `AddMemberDialog`, com exclusão confirmada por `AlertDialog`.

### 2.3 SLA

- **`/sla`** (`src/pages/SLADashboard.tsx` → `src/components/queues/SLADashboard.tsx`): cartões de métrica (`SLAMetricCards`, com sparklines dos últimos 7 dias de `useSLAHistory`), tabela por agente (`SLAAgentTable`), "Visão Geral do SLA" (barra de taxa + no prazo/atrasados) e "Resumo de Violações". Atalhos de teclado: **1**=Hoje, **2**=Semana, **3**=Mês, **4**=Todos, **H**=Histórico (ignorados quando o foco está em input/textarea).
- Abas ao pé da tela: **Configuração Global** (`src/components/settings/SLAConfigurationManager.tsx` → `sla_configurations`) e **Regras Granulares** (`src/components/settings/SLARulesManager.tsx` → `sla_rules`, por fila/contato/empresa/cargo/agente/prioridade).
- **`/sla/history`** (`src/pages/SLAHistory.tsx` → `src/components/sla/SLAHistoryDashboard.tsx`, períodos 7/14/30/90 dias).
- Hooks do módulo (`src/hooks/sla/`, barrel em `index.ts`): `useSLAConfigurations`, `useSLARules`, `useSLAMetrics`, `useSLAHistory`, `useSLACalculation` (cronômetro no cliente: `ok`/`warning`/`breached`), `useApplicableSLA` (qual regra vale para o contato) e `useSLANotifications` (aviso de violação em tempo real).

### 2.4 War Room

`WarRoomDashboard.tsx` (view `warroom`): métricas globais (`useWarRoomMetrics`), lista de filas (`WarRoomQueueRow`), grade de agentes (`WarRoomAgentCard`, com painel de redistribuição `AgentReassignmentPanel`) e a lista de alertas (`WarRoomAlertRow`). Recursos: tela cheia, auto-refresh (selo de "última atualização" a cada 30 s) e mudo do som pelo botão do painel.

**Fluxo do alerta de SLA ponta a ponta** (é o ponto mais delicado do módulo):

```
mensagem do atendente com status válido
  -> trigger trg_messages_sla_first_response em public.messages
     -> register_first_response_internal() grava/atualiza public.conversation_sla
        (first_message_at, first_response_at, first_response_breached)
  -> useWarRoomAlerts: lê TODAS as conversas com first_response_breached = true
     (paginado), calcula a identidade do incidente e faz INSERT em warroom_alerts
     com dedupe_key = 'sla-monitor:v1:<hash do conjunto>'
  -> realtime (INSERT em warroom_alerts) -> som + notificação, se permitido
```

---

## 3. Dados (tabelas, colunas, RPC, Edge Functions)

### 3.1 Tabelas locais (projeto canônico)

**Catálogo**

| Tabela | Colunas | Observações |
|---|---|---|
| `catalog_favorites` (`supabase/migrations/20260913013153_catalog_favorites.sql`) | `id`, `user_id` (FK `auth.users`, cascade), `product_id` uuid **sem FK** (é o id no banco externo), `product_name`, `product_sku`, `primary_image_url`, `created_at`; `unique(user_id, product_id)` | Favorito por **usuário do auth**. Grants endurecidos em `20260929650000` |
| `catalog_send_events` (`20260913122557_catalog_send_events.sql`) | `id`, `product_id`, `product_name`, `product_sku`, `variant_label`, `contact_id` (FK `contacts`, cascade), `agent_id` (FK `profiles`, set null), `template` ∈ {`formal`,`informal`,`promo`,`custom`}, `images_count`, `message_length`, `status` ∈ {`sent`,`partial`,`failed`}, `message_ids` jsonb, `created_at` | **Log append-only** (E28): o cliente `authenticated` tem só `SELECT`+`INSERT` (CT-02, `20260929650000`) |
| `catalog_rate_limits` / `catalog_rate_limit_hits` (`20261002681230`, `20261003122707`) | contador por (usuário, ação) e histórico de batidas | Base do rate limit da edge; `hits` é append-only |
| `whatsapp_templates` | texto do template, categoria, idioma, botões, variáveis, `status`, `whatsapp_connection_id`, `created_by` | Usada pelo `WhatsAppTemplatesManager` (view `wa-templates`) |
| view `catalog_send_stats` (`20260930740000_catalogo_send_stats.sql`) | `grao` (`dia`/`agente`/`produto`), `chave`, `rotulo`, `total`, `enviados`, `parciais`, `falhas` | `with (security_invoker = on)`: a RLS de quem consulta é aplicada — agente comum vê só os próprios envios; janela de 30 dias |

**Filas**

| Tabela | Colunas |
|---|---|
| `queues` | `id`, `name`, `description`, `color`, `priority`, `max_wait_time_minutes`, `is_active`, `created_at`, `updated_at` |
| `queue_members` | `id`, `queue_id`, `profile_id`, `is_active`, `created_at` |
| `queue_goals` | `id`, `queue_id`, `max_waiting_contacts`, `max_avg_wait_minutes`, `min_assignment_rate`, `max_messages_pending`, `alerts_enabled`, `created_at`, `updated_at` |
| `queue_positions` | `id`, `queue_id`, `contact_id`, `position`, `entered_at`, `estimated_wait_minutes`, `notified`, `created_at` — **existe no banco, mas não há consumidor em `src/components/queues`** (a espera exibida vem de `contacts`) |
| `queue_skill_requirements` | `id`, `queue_id`, `skill_name`, `min_level` — idem: **sem consumidor no módulo de Filas** |

**SLA e War Room**

| Tabela | Colunas |
|---|---|
| `conversation_sla` | `id`, `contact_id`, `sla_configuration_id`, `first_message_at`, `first_response_at`, `first_response_breached`, `resolution_breached`, `resolved_at`, `created_at`, `updated_at` |
| `sla_configurations` | `id`, `name`, `priority`, `first_response_minutes`, `resolution_minutes`, `is_default`, `is_active`, `created_at`, `updated_at` |
| `sla_rules` | `id`, `name`, `priority`, `first_response_minutes`, `resolution_minutes`, `is_active`, `queue_id`, `contact_id`, `contact_type`, `company`, `job_title`, `agent_id`, `metadata` jsonb, `created_at`, `updated_at` |
| `warroom_alerts` | `id`, `alert_type`, `title`, `message`, `source`, `is_read`, `created_at`, `dismissed_by`, **`dedupe_key`** |
| `agent_stats` | `profile_id`, `messages_sent`, `conversations_resolved`, `avg_response_time_seconds`, `customer_satisfaction_score` — fonte dos números por agente do War Room |

**A coluna `dedupe_key` (pedida explicitamente no cartão).**

- Criada em `supabase/migrations/20261006155408_warroom_alerts_dedupe_key_sla_monitor.sql` (R2-MOD-074): `alter table public.warroom_alerts add column if not exists dedupe_key text;` + índice **único parcial** `ux_warroom_alerts_dedupe_key on public.warroom_alerts (dedupe_key) where dedupe_key is not null;`
- É **nullable** e o índice é **parcial** de propósito: todo o histórico antigo (chave nula) fica fora da constraint, então a migration é aditiva e não colide com o legado.
- O valor gravado é `'sla-monitor:v1:<hash FNV-1a de 64 bits, duas passadas, sobre o conjunto ORDENADO dos ids das conversas violadas>'` (`slaIncidentKey()` em `src/hooks/business/useWarRoomAlerts.ts:41-54`). **A identidade do incidente é o conjunto das conversas**, não a contagem.
- Consequência de negócio: o mesmo incidente só gera **um** alerta. Reexecução, refetch, realtime ou um segundo cliente admin recebem **`23505`** e não criam linha — logo não disparam som nem push. **Alerta dispensado continua ocupando a chave** (`is_read = true` não libera o `dedupe_key`): incidente encerrado pelo operador não volta a alertar.
- ⚠️ `supabase/schema-catalog.json` **não lista** `warroom_alerts.dedupe_key` (o catálogo é de 2026-10-04, anterior à migration de 2026-10-06). A coluna aparece em `src/integrations/supabase/types.ts` e no SQL da migration. **NÃO VERIFICADO** o estado da coluna no banco canônico.

### 3.2 Funções, RPC e gatilhos (projeto canônico)

| Objeto | Assinatura / papel | Onde |
|---|---|---|
| `catalog_rate_limit_hit` | `(p_user uuid, p_action text, p_limit integer, p_window_ms integer) -> boolean` | Cota atômica por usuário **e por ação**. Falha **aberta** de propósito: se o contador cair, o catálogo continua servindo (`markDegraded('rate_limit_store_unavailable')`) |
| `register_first_response_internal` | `(p_contact_id uuid, p_responded_at timestamptz, p_before_created_at timestamptz) -> void`, `SECURITY DEFINER` | Só o trigger chama (`REVOKE ... FROM PUBLIC, anon, authenticated`). Serializa por contato com `pg_advisory_xact_lock`. Base do cronômetro = 1ª mensagem do cliente **ainda sem resposta efetiva**; só conta resposta com status `sent`/`delivered`/`read` |
| `mark_first_response` | `(p_contact_id uuid) -> void`, `EXECUTE` para `authenticated` | Continua exposta com grant. **NÃO VERIFICADO** se há consumidor no front — não encontrei chamada em `src` nesta branch |
| `messages_sla_first_response_trigger` | trigger function de `trg_messages_sla_first_response` em `public.messages` | É o que efetivamente carimba o SLA. `EXECUTE` revogado de `anon`/`authenticated` (`20260904300000`, `20260904310000`) |
| `update_updated_at_column` | trigger `update_conversation_sla_updated_at` em `conversation_sla` | Só mantém `updated_at` |

Nomes conferidos em `supabase/schema-catalog.json` (`function_signatures`, `trigger_functions`).

### 3.3 Edge Function e banco externo (Catálogo)

- **`supabase/functions/promogifts-catalog`** é a **única** porta para o catálogo externo. Ações aceitas (`ActionSchema`): `list_products`, `get_product`, `list_categories`, `list_suppliers`, `bootstrap`, `catalog_stats`.
- **Autenticação**: exige `Authorization: Bearer <jwt>` e valida com `auth.getUser()`; sem isso → `401`. Depois do corpo validado, cobra a cota por ação: `list_products` **120/min**; as outras cinco **60/min** (`RATE_LIMIT`, janela de 60 s).
- **Credencial externa**: `PROMOGIFTS_SUPABASE_URL` e `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY` (secrets da Edge). Sem elas → `503` com código **`CATALOG_NOT_CONFIGURED`**. Os valores **não** estão no repositório e não devem estar.
- **Banco externo (projeto PromoGifts)**: tabelas lidas pela edge — `products`, `product_variants`, `categories`, `suppliers`; RPC **`zapp_catalog_stats`** (roda no projeto externo; **não** existe no canônico — o `schema-catalog.json` local não a lista). O `catalog_favorites.product_id` é o id do produto nesse banco, por isso **sem FK**.
- O log append-only do catálogo (`catalog_send_events`) é do projeto canônico — o envio sempre sai pela fila de mensagens do sistema (`sendOutboundMessage`).

### 3.4 Realtime

- `warroom_alerts` — assinatura de `INSERT` em `useWarRoomAlerts.ts:126-158` (canal `warroom-alerts-realtime`); o mesmo hook faz `refetch` a cada 30 s e o monitor de SLA roda a cada **60 s**.
- `conversation_sla` — `useSLANotifications` escuta a mudança de `first_response_breached` para disparar toast/som/notificação.
- `queues`/`queue_members`/`contacts` — via `useSupabaseRealtime` em `useQueues`/`useQueueGoals`.
- **NÃO VERIFICADO** se todos esses objetos estão na publicação `supabase_realtime` hoje (as migrations `20260828190000`/`20260828230000` mexem na publicação, mas não confirmei a lista final no banco).

---

## 4. Permissões e regras de acesso

### 4.1 Navegação (cliente)

| Área | Gate |
|---|---|
| Catálogo | sem `roles` na entrada primária (`navigation.service.ts:55`) |
| Filas | `roles: STAFF_ROLES` (`:72`) → `admin`, `supervisor` |
| War Room | `roles: STAFF_ROLES` (`:97`) |
| SLA | `roles: STAFF_ROLES` (`:100`) |

`filterNavItems` nega por padrão qualquer id não mapeado (nunca autoriza por omissão). As rotas de página usam `ProtectedRoute` (`src/routes/AppRoutes.tsx`): `/queue/:id`, `/queues/comparison`, `/sla` e `/sla/history` exigem usuário autenticado; `/admin/*` exigem papel `admin`.

### 4.2 RLS (o que as migrations impõem)

`is_admin_or_supervisor(auth.uid())` é o predicado central. Políticas (migrations de origem):

| Tabela | SELECT | Escrita |
|---|---|---|
| `queues`, `queue_goals`, `queue_members` | `true` para `authenticated` | `FOR ALL` com `is_admin_or_supervisor` |
| `queue_positions` | restrito: só posições de contatos do próprio agente **ou** admin/supervisor (`20260318121647:15-19`) | `FOR ALL` com `is_admin_or_supervisor` |
| `queue_members` (SELECT, versão posterior) | "Queue members visible to admins or self" (`20260410103359:61`) — admin/supervisor **ou** o próprio membro | — |
| `sla_configurations` | `true` para `authenticated` | `FOR ALL` com `is_admin_or_supervisor` |
| `sla_rules` | **só admin/supervisor** ("SLA rules visible to admins only", `20260410103359:21`) | `INSERT`/`UPDATE`/`DELETE` com `is_admin_or_supervisor` |
| `conversation_sla` | "Authenticated users can view SLA data" — dono do contato (`contacts.assigned_to` → `profiles.user_id = auth.uid()`) **ou** admin/supervisor | `INSERT`/`UPDATE` só admin/supervisor |
| `warroom_alerts` | `SELECT`/`INSERT`/`UPDATE`/`DELETE` todos com `is_admin_or_supervisor` | idem |
| `catalog_favorites` | `FOR ALL TO authenticated USING (user_id = auth.uid())` — só o dono | idem |
| `catalog_send_events` | `SELECT` para `authenticated` com `agent_id IN (meus profiles)` **ou** admin/supervisor; `INSERT` com o mesmo critério | sem `UPDATE`/`DELETE` (append-only) |
| `whatsapp_templates` | `true` para `authenticated` | `is_admin_or_supervisor` |

Dois detalhes de **grants** que importam:

- `catalog_favorites` e `catalog_send_events` tiveram os grants endurecidos em `20260929650000_catalog_grants_append_only.sql`: `anon` perdeu tudo (nos dois níveis, tabela **e** coluna) e `authenticated` ficou com `SELECT/INSERT/UPDATE/DELETE` em favoritos e `SELECT/INSERT` no log.
- O comentário da migration registra que `TRUNCATE`/`REFERENCES`/`TRIGGER` **não** são cobertos por RLS — era por aí que uma sessão `authenticated` podia esvaziar o log antes do CT-01/CT-02.

⚠️ **NÃO VERIFICADO**: `supabase/schema-catalog.json` não exporta policies. A tabela acima reflete as migrations (inclusive as que substituem policies anteriores) e o dump `supabase-export/BLOCO_09_rls_policies.sql`; o **estado efetivo** no banco canônico não foi consultado (nenhum agente acessa produção — regra R1).

### 4.3 Permissão de download

Existe a permissão nomeada **`profiles.can_download`**, exposta pelo hook `useDownloadPermission()` (`src/hooks/system/useDownloadPermission.ts`) — consulta `profiles.can_download` e devolve `canDownload` (default `false`). Ela é usada hoje em `src/components/inbox/ImagePreview.tsx` e `MediaPreview.tsx`.

**NÃO VERIFICADO** que os downloads do Catálogo passem por essa permissão — pelo contrário: os dois caminhos que encontrei (CSV e fotos) **não** consultam `can_download` (ver §6).

### 4.4 Segredos e dados de cliente

- As credenciais do catálogo vivem **só** nos secrets da Edge Function (variáveis nomeadas em §3.3); nada no repositório.
- Dados de contato (nome, telefone) aparecem nas telas do módulo — são dado de cliente, não saem da infraestrutura. Em teste, usar amostra sintética.
- O fluxo do Catálogo **envia mensagem para pessoa real**: os testes do módulo dublam o canal (ver §7) e nunca disparam envio de verdade.

---

## 5. Estados de erro e vazio

**Catálogo**

- `CatalogErrorState` (`catalogShared.tsx:652`) decide pelo **código** do erro:
  - `CATALOG_UPSTREAM_ERROR` → `TalkXDataUnavailableState` ("O catálogo PromoGifts…") + botão "Tentar de novo";
  - `CATALOG_NOT_CONFIGURED` / `CATALOG_CREDENTIALS_INVALID` → `AlertCard` vermelho "Catálogo PromoGifts indisponível para os agentes" com o **código visível** (o agente não resolve credencial; o aviso é para admin);
  - qualquer outra falha → mensagem crua + retry.
- **429**: `useRateLimitCooldown` dispara o toast "Muitas requisições, aguarde 1 min" e desabilita os botões de ação por 10 s (a cota da edge libera em 60 s).
- Vazios: "Nenhum produto encontrado" / "Nenhum produto com esses filtros" / "Nenhum produto sincronizado ainda" (`ExternalProductManagement`), "Nenhum contato encontrado" ou "Busque por nome ou telefone" (`ContactSelectionStep`), "Nenhum template encontrado", "Nenhum produto enviado ainda." no histórico de envios.
- Exportação: em erro **não baixa nada** (nunca arquivo parcial) e troca o toast de loading pelo de erro; filtro sem produto → "Nenhum produto no filtro atual — nada para exportar.".
- Envio: falha integral → toast de erro ("Nenhuma mensagem chegou a …"); parcial → "N entregues, M falharam"; o item que falhou continua selecionado. Copiar para a área de transferência que falha → toast "Erro ao copiar".
- Fallbacks silenciosos já previstos: `localStorage`/`sessionStorage` indisponíveis (modo restrito/quota) não quebram a ajuda nem o rail.

**Filas**

- Carregando: skeletons (`QueuesView.tsx:54`, `QueueCharts.tsx:29`, `QueuesComparisonDashboard.tsx:86`).
- Sem filas: a grade fica só com o card tracejado "Adicionar Nova Fila" — **esse é o vazio de fato**; não há um estado vazio dedicado.
- Erro de fetch: `useQueues` guarda `error` e dispara toast destrutivo ("Erro ao criar fila", etc.); a criação/edição/exclusão falha com toast e a lista é recarregada.
- Alertas de fila: só aparecem se `queue_goals.alerts_enabled` estiver ligado; dispensar é **local da sessão** (some ao recarregar a página).

**SLA**

- Carregando: skeletons. Sem dado (`!data`): "Nenhum dado de SLA encontrado" + orientação para configurar na aba de configuração.
- Cores de taxa: ≥ 90 % sucesso, ≥ 70 % warning, abaixo disso destructive (tokens do sistema, nunca hex).

**War Room**

- Alertas: lista vazia quando não há alerta não lido (`is_read = false`, 50 mais recentes na **consulta de apresentação**).
- Onde a medida não existe, o valor sai **`null`** e não zero: `WarRoomQueue.avgWaitTime` e `.slaWarnings` são `null` = "não calculado" (não é "zero minutos" nem "risco zero"). Presença `online/busy` vem de `agent_presence`, **não** de `profiles.is_active`; ocupação conta só contato com `conversation_status = 'open'`.
- Leitura de violação que falha **não** vira alerta: o ciclo é abandonado e o próximo intervalo tenta de novo (nada é gravado a partir de dado parcial).
- Erro de gravação que **não** seja `23505` é registrado em console (não engolido) e o próximo ciclo tenta de novo.

---

## 6. Limites e riscos conhecidos

1. **A consulta de apresentação dos alertas é um recorte de 50** (`useWarRoomAlerts.ts:110-123`: `is_read = false`, `limit(50)`). Ela serve à tela; **não** serve para decidir incidente — foi exatamente esse erro (decidir pela contagem de uma página de apresentação) que causou o R2-MOD-074. Quem for mexer aqui não pode reintroduzir o acoplamento página→decisão.
2. **A leitura de violações pagina em blocos de 1.000** (`SLA_BREACH_PAGE`). Uma leitura truncada seria um conjunto parcial — e conjunto parcial geraria uma `dedupe_key` diferente, ou seja, um alerta novo para o mesmo incidente. O paginador existe por isso; não o simplifique.
3. **Alerta dispensado não libera a chave.** É a decisão intencional de não reabrir incidente encerrado. O efeito colateral é que, se o mesmo conjunto de conversas voltar a violar depois, **não** haverá novo alerta até que o conjunto mude (entra ou sai uma conversa). Documentado aqui para quem for avaliar "alerta que não apareceu".
4. **O monitor de SLA depende do cliente.** Ele roda **no navegador** (a cada 60 s) e grava `warroom_alerts` com o JWT do usuário logado — as policies de `warroom_alerts` exigem `is_admin_or_supervisor`. Se nenhum admin/supervisor estiver com o painel aberto, **ninguém** cria o alerta. **NÃO VERIFICADO** se existe um job no servidor que faça esse monitoramento.
5. **Cota de catálogo é fail-open.** Se `catalog_rate_limit_hit` falhar, a requisição passa (proteção, não caminho crítico) e a resposta leva o cabeçalho `x-degraded` com o motivo. O modo degradado **não** é erro visível ao usuário.
6. **Dois caminhos de download do Catálogo não passam por `downloadPermission`** — e o cartão deste documento pediu atenção explícita a isso:
   - **CSV do filtro atual** (`catalogExport.ts:219-233`): monta `Blob`, cria `<a download>` e clica; **até 1.000 produtos**, 100 por página; nome `catalogo_<filtro>_<yyyymmdd>.csv`; o arquivo leva SKU, nome, marca, fornecedor, categoria, preço, preço sugerido, estoque, cores, personalização, prazo, quantidade mínima e **URL pública no PromoGifts** (`https://promogifts.com.br/<slug>`). É uma **saída de informação** do sistema que a revisão do cartão **Y29** (mapa de saídas) precisa cobrir.
   - **Download de fotos do produto** (`SendProductDialog.tsx:336-351` → `downloadImageAsBlob` em `sendProductUtils.ts`): baixa cada foto como Blob.
   - Nenhum dos dois consulta `profiles.can_download`. **NÃO VERIFICADO** se isso é intencional (a permissão pode cobrir só mídia do inbox) — não alterei nada; registro para decisão.
7. **A prévia da mensagem** (`PhonePreview` em `catalogShared.tsx:718+`) desenha um aparelho no formato de conversa antes do envio. É uma prévia de conteúdo, **não** um selo de canal/origem: a regra permanente do produto proíbe indicar canal/origem do arquivo ou da mensagem, e nenhum componente destes quatro módulos carimba canal.
8. **Ajuda do Catálogo não tem prints.** O plano pedia 5 passos "com prints reais"; os prints não existem no repositório e os passos são texto (a própria nota de `CatalogHelpSheet.tsx` registra o aceite parcial).
9. **Alertas de Filas não são persistidos e só dois dos quatro tipos são produzidos.** `dismissedAlerts` é estado local — recarregar a página traz os alertas de volta, e não há tabela de alerta de fila. Além disso, o tipo `QueueAlert` declara quatro naturezas (`waiting_contacts`, `wait_time`, `assignment_rate`, `messages_pending`), mas `QueuesView.tsx:33-50` só levanta **`waiting_contacts`** e **`assignment_rate`**: `wait_time` (`queues.max_wait_time_minutes`) e `messages_pending` não são calculados em lugar nenhum desta branch. Quem for usar meta de tempo de espera ou de mensagens pendentes precisa saber que a UI não alerta por elas.
10. **`queue_positions` e `queue_skill_requirements` existem sem consumidor** neste módulo. Se alguém contar com posição de fila na tela, ela não é usada hoje.
11. **`catalog_send_events` é append-only para o cliente**: corrigir ou apagar um evento exige `service_role`. É desenho, não defeito — mas explica por que o histórico do rail não pode ser "limpo".
12. **`e2e/catalog.spec.ts` tem achado aberto e não corrigido**: o comentário do próprio spec registra que `e2e/fixtures/e2e-contact.ts:7` e `e2e/fixtures/contacts-page.ts:5` ainda guardam o literal da anon key. Não toquei (fora do escopo deste cartão) — fica registrado para o cartão de correção.

---

## 7. Testes existentes (caminhos)

**Catálogo — `src/components/catalog/__tests__/`** (31 arquivos de teste; o 32.º da pasta é o auxiliar `catalogMocks.ts`): `ExternalProductManagement.test.tsx`, `ExternalProductCatalog.test.tsx`, `.virtualizacao.test.tsx`, `ProductDetailDialog.test.tsx`, `SendProductDialog.test.tsx`, `ContactSelectionStep.test.tsx`, `CatalogBulkSendDialog.bulkOutcome.test.tsx`, `CatalogAdvancedFilters.test.tsx`, `CatalogRail.test.tsx`, `useSendProduct.test.tsx`, `sendProductUtils.test.ts`, `catalogExport.test.ts`, `catalogShared.test.tsx`, `ExternalProductCard.variant.test.tsx`, `R2_MOD_010_selecaoPersistente.test.tsx` e os de aceite `CT25`, `CT28`, `CT30`, `CT39_downloadFotos`, `CT40_badgeTokens`, `CT55_57_management`, `CT57_historicoAlem500`, `CT61_62_65_catalogFilters`, `CT67_a11y`, `CT68_acessibilidade`, `CT69_alts`, `CT70_reducedMotion`, `CT72_imagens`, `CT74_headerSemTroca`, `CT74_kpiStripCls`, `CT83_84_helpSheet`.

**Hooks do catálogo — `src/hooks/integrations/__tests__/`**: `useCatalogContactSearch.test.ts`, `useCatalogRecentSends.test.tsx`, `useCatalogSendHistory.historicoCompleto.test.tsx`, `useCatalogSendReadiness.test.ts`; e em `src/hooks/__tests__/`: `useExternalCatalog.test.ts`, `useCatalogFavorites.test.ts`.

**Edge — `supabase/functions/promogifts-catalog/`**: `index.test.ts`, `index.actions.test.ts`, `pagination.test.ts`.

**Filas**: `src/components/queues/__tests__/` (`QueuesView.test.tsx`, `QueuesView.editar.test.tsx`, `QueueGoalsDialog.salvarMetas.test.tsx`, `PeriodSelector.test.tsx`, `QueuesComparisonCharts.radar-series.test.tsx`); `src/hooks/__tests__/` (`useQueues.test.tsx`, `useQueueGoals.test.tsx`, `useQueueAnalytics.test.tsx`, `useQueuesComparison.test.tsx`, `useQueuesComparison.race.test.tsx`); `src/pages/queue-details/__tests__/` (`QueueDetails.configurar.test.tsx`, `QueueDetails.totais.test.tsx`, `queueMetrics.test.ts`).

**SLA**: `src/hooks/sla/__tests__/` (`useApplicableSLA.test.tsx`, `useSLARules.test.tsx`); `src/hooks/__tests__/` (`useSLAMetrics.test.tsx`, `useSLAHistory.test.tsx`, `useSLACalculation.test.ts`, `useSLANotifications.behavior.test.ts`, `useApplicableSLA.test.ts`); `src/components/settings/__tests__/` (`SLAConfigurationManager.test.tsx`, `SLARulesManager.test.tsx`); `src/pages/__tests__/SLADashboard.sidebar-navegacao.test.tsx`; `src/components/inbox/__tests__/SLAIndicator.test.tsx`.

**War Room**: `src/hooks/__tests__/useWarRoomAlerts.test.tsx` (banco falso com o índice único parcial `ux_warroom_alerts_dedupe_key` e prova de que chave nula não colide), `src/hooks/__tests__/useWarRoomAlertsMute.behavior.test.tsx`, `src/hooks/business/__tests__/useWarRoomData.test.tsx`, `src/components/dashboard/__tests__/QueueHealthTable.test.tsx`.

**Ponta a ponta**: `e2e/catalog.spec.ts` (com `e2e/fixtures/catalog.ts`). **Não há** spec E2E de Filas, SLA ou War Room nesta branch. *(A auditoria de acessibilidade/celular destes quatro módulos é o cartão **Y17** do mesmo plano.)*

---

## 8. Arquivos-chave com caminhos

**Catálogo — telas e fluxo**

- `src/components/catalog/ExternalProductManagement.tsx` — tela principal (view `catalog`)
- `src/components/catalog/ExternalProductCatalog.tsx` — catálogo em diálogo (view + Contatos + Inbox)
- `src/components/catalog/ProductDetailDialog.tsx` — detalhe (Sheet)
- `src/components/catalog/SendProductDialog.tsx` + `useSendProduct.ts` + `sendProductUtils.ts` — envio de um produto
- `src/components/catalog/CatalogBulkSendDialog.tsx` + `CatalogBulkBar.tsx` — envio em massa
- `src/components/catalog/ContactSelectionStep.tsx` — escolha de contato
- `src/components/catalog/CatalogRail.tsx`, `CatalogFavoritesTab.tsx`, `CatalogAdvancedFilters.tsx`, `CatalogHelpSheet.tsx`
- `src/components/catalog/catalogShared.tsx` — primitivos, `CatalogErrorState`, `useRateLimitCooldown`, `PhonePreview`
- `src/components/catalog/catalogExport.ts` — **CSV (saída de informação; ver §6.6)**
- `src/components/catalog/catalogCategoryRoute.ts`, `catalogCategoryIcons.ts`
- `src/components/catalog/WhatsAppTemplatesManager.tsx` — templates (view `wa-templates`)

**Catálogo — dados**

- `src/hooks/integrations/useExternalCatalog.ts`, `useCatalogRecentSends.ts`, `useCatalogContactSearch.ts`, `useCatalogSendReadiness.ts`, `useCatalogSendHistory.ts`, `useWhatsAppTemplates.ts`
- `supabase/functions/promogifts-catalog/index.ts` — a única porta para o banco externo

**Filas**

- `src/components/queues/QueuesView.tsx`, `QueueCard.tsx`, `QueueAlertsDisplay.tsx`, `CreateQueueDialog.tsx`, `EditQueueDialog.tsx`, `AddMemberDialog.tsx`, `QueueGoalsDialog.tsx`, `PeriodSelector.tsx`, `QueueCharts.tsx`, `chartConfig.ts`
- `src/components/queues/QueuesComparisonDashboard.tsx`, `QueuesComparisonCharts.tsx`
- `src/pages/QueueDetails.tsx`, `src/pages/QueuesComparison.tsx`, `src/pages/queue-details/*`
- `src/services/queue.service.ts`, `src/hooks/business/useQueues.ts`, `useQueueGoals.ts`, `useQueueAnalytics.ts`, `useQueuesComparison.ts`

**SLA**

- `src/components/queues/SLADashboard.tsx`, `SLAMetricCards.tsx`, `SLAAgentTable.tsx`
- `src/components/sla/SLAHistoryDashboard.tsx`
- `src/components/settings/SLAConfigurationManager.tsx`, `SLARulesManager.tsx`
- `src/hooks/sla/*` (barrel em `src/hooks/sla/index.ts`)
- `src/pages/SLADashboard.tsx`, `src/pages/SLAHistory.tsx`, `src/routes/AppRoutes.tsx`

**War Room**

- `src/components/dashboard/WarRoomDashboard.tsx` + `src/components/dashboard/war-room/*`
- `src/hooks/business/useWarRoomAlerts.ts` (**monitor de SLA + `dedupe_key`**), `useWarRoomData.ts`
- `src/hooks/business/__tests__/useWarRoomData.test.tsx`, `src/hooks/__tests__/useWarRoomAlerts.test.tsx`

**Navegação, rotas e schema**

- `src/services/navigation.service.ts` (labels, papéis, atalhos)
- `src/pages/ViewRouter.tsx`, `src/pages/lazyViews.ts`
- `src/routes/AppRoutes.tsx`
- `supabase/schema-catalog.json` (catálogo do schema local; **sem policies** e anterior a `dedupe_key`)
- `src/integrations/supabase/types.ts` (aqui `warroom_alerts.dedupe_key` já aparece)
- `supabase/migrations/20261006155408_warroom_alerts_dedupe_key_sla_monitor.sql`

**Documentação de módulo já existente (Catálogo)**: `docs/catalogo/` (`ARQUITETURA.md`, `COMPONENTES.md`, `SECURITY.md`, `PERF.md`, `ENVIO_E2E.md`, `CHANGELOG_CATALOGO.md`, `PLANO_FINALIZACAO_CATALOGO_100.md`, `PLANO_IMPLEMENTACAO_CATALOGO_100.md`). Filas, SLA e War Room não tinham documento de módulo até este.

---

## 9. Planos relacionados de 07/10

Verificado por busca nos planos datados de 07/10/2026 em `docs/plans/`:

- **`docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`** — o plano-mãe deste documento. Cartões que tocam estes módulos:
  - **Y22** (este) — documentação do módulo;
  - **Y17** — auditoria de acessibilidade e celular de **Catálogo, Filas, SLA e War Room** (relatório, sem correção no mesmo cartão);
  - **Y29** — mapa de **todas** as saídas de informação do sistema: é onde os downloads listados em §6.6 deste documento devem ser mapeados;
  - **Y05** — testes do Multiplix/Talk X/banco externo (toca o mesmo banco externo do Catálogo, o PromoGifts);
  - **Y08** — testes de sons e notificações (cobre o caminho de som/PushNotification do War Room).
- Nenhum outro plano de 07/10/2026 em `docs/plans/` toca Catálogo, Filas, SLA ou War Room (as ocorrências das palavras-chave em `PLANO_MINIATURAS_E_FIGURINHAS_ARQUIVOS_2026-10-07.md` são a "fila" de renderização de miniaturas, sem relação com o módulo de Filas).

---

## Anexo — lista de NÃO VERIFICADO (para quem for fechar o que ficou aberto)

1. Estado efetivo das **policies RLS** no banco canônico (o catálogo não exporta policies; R1 proíbe consultar produção).
2. Existência e estado atual da coluna **`warroom_alerts.dedupe_key`** no banco canônico (a migration existe; o catálogo é anterior a ela).
3. Se há **consumidor** do RPC `mark_first_response(uuid)` no front nesta branch (grant existe; chamada não localizada).
4. Se **`profiles.can_download`** deve cobrir os downloads do Catálogo (§6.6) — decisão de produto, não de código.
5. Se existe **job no servidor** que crie alertas de SLA sem um admin/supervisor com o painel aberto (§6.4).
6. Lista final de tabelas na **publicação `supabase_realtime`** hoje.
7. Se `queue_positions` / `queue_skill_requirements` são alimentadas por outro módulo ou estão mortas (§6.10).
