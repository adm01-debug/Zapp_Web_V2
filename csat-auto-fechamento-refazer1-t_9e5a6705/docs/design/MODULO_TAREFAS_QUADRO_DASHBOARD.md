# MÓDULO — TAREFAS, QUADRO, DASHBOARD E ANALYTICS

> **Data:** 2026-10-07 · **Base:** branch do dia (`dia/2026-10-07`) do Zapp Web V2
> **Escopo deste documento:** descrição do **código atual** dos quatro assuntos do título.
> **Método:** leitura direta dos arquivos citados na seção 8; nomes de tabelas, colunas, constraints, RPCs e triggers conferidos em `supabase/schema-catalog.json` e nas migrations citadas na seção 3. Tudo o que não pôde ser provado no código (ou que depende de produção, que os agentes não acessam — regra R1) está marcado **NÃO VERIFICADO**.
> **Este documento não repete** o histórico das etapas nem a auditoria da fusão: para isso valem `docs/design/TAREFAS_QUADRO_STATUS.md` (ledger do plano de 150/100 etapas e das fases A–K), `docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md` (auditoria da fusão Tarefas+Lembretes+Quadro, com a lista de bugs encontrados) e `docs/tasks/README.md` (README operacional do módulo).

---

## 1. O que é e para quem

### 1.1 Tarefas e Quadro — um só componente, duas portas de entrada

Tarefas é o **workspace pessoal de trabalho do atendente**: transforma conversa em tarefa com prazo, prioridade, estado e alarme. O Quadro é a **visão de colunas desse mesmo módulo** (não é um módulo separado): o mesmo componente `TasksModule` desenha os três modos — Lista, Quadro e Agenda (`src/components/tasks/TasksModule.tsx`, `src/components/tasks/shared/ModeSwitcher.tsx`).

Duas entradas de menu apontam para o mesmo componente hoje:

| View | Item de menu | Atalho | Props da rota | Comportamento |
|---|---|---|---|---|
| `tasks` | "Tarefas" | `Alt+K` | nenhuma | Abre no último modo salvo (ou Lista) |
| `pipeline` | "Quadro" | `Alt+P` | `{ defaultMode: 'board', forceMode: true }` | Abre **sempre** no Quadro |

Fonte: `src/services/navigation.service.ts` (nav primária), `src/pages/ViewRouter.tsx` (`SPECIAL_VIEWS.pipeline`) e `src/pages/viewRouteProps.ts` (`TASKS_ROUTE_PROPS`). Com `forceMode` o modo da rota vence o modo salvo, e a preferência do usuário (`localStorage['tasks-mode']`) **não** é reescrita por visitar a rota — só trocar de modo pelo botão grava (`TasksModule.tsx`).

**Estado da fusão "Quadro → Tarefas" nesta base (verificado):** os dois itens de menu, a rota `pipeline` e o contrato `forceMode` **ainda existem** no código de hoje. O plano `docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md` prevê removê-los no cartão atômico **E14** (que também apaga `src/pages/viewRouteProps.ts`); nessa mesma base, `CHANGELOG.md` não tem entrada sobre a fusão e `docs/tasks/README.md` ainda traz o atalho `Alt+T` na abertura do texto (a correção é o cartão **E28** daquele plano). Ou seja: **o texto deste documento descreve o estado de dois itens de menu, que é o estado do código hoje.**

O módulo também é usado **dentro do chat**: a aba "Tarefas" da conversa (`src/components/inbox/tabs/TasksTab.tsx`) instancia `useMyWorkItems({ contactId })` e mostra um mini-quadro colapsável por coluna; a aba CRM 360° (`src/components/inbox/tabs/Crm360Tab.tsx`) e a próxima melhor ação (`src/hooks/chat/useNextBestAction.ts`) leem `conversation_tasks` para contar tarefas abertas do contato.

### 1.2 Dashboard e Analytics — o painel da operação

Dashboard é o painel de leitura da operação (`?view=dashboard`, `Alt+R`). O componente `src/components/dashboard/DashboardView.tsx` monta **9 abas**: Visão Geral, Analytics, Metas, Inteligência Artificial, Métricas SLA, Equipe, Satisfação, Sentimento e Relatórios.

O público é **staff** (admin/supervisor). Para `agent`/`special_agent` a barra de abas é reduzida a três — Visão Geral, Metas e Satisfação (`AGENT_TAB_VALUES` em `DashboardView.tsx`) —, os cards de gestão (saúde das filas, destaque da equipe, gamificação) não são renderizados, e a função `goToTab` **bloqueia a navegação por clique** para abas fora desse conjunto (impede o vazamento que a barra de abas sozinha não cobriria).

"Analytics" aqui tem dois sentidos que o código separa:

- **Aba Analytics do Dashboard:** previsão de demanda (`DemandPrediction.tsx`), mapa de calor de conversas (`ConversationHeatmap.tsx`) e de atividade (`ActivityHeatmap.tsx`).
- **Camada de hooks de métricas:** `src/hooks/analytics/**` (IA, metas, performance, sentimento, realtime do painel) e `src/hooks/dashboard/**` (KPIs, contagens, fila, volume, eventos recentes, relatórios agendados).

---

## 2. Telas e fluxos principais

### 2.1 Tarefas — cabeçalho, KPIs e captura

- **Cabeçalho** (`PageHeader`): título "Tarefas" e subtítulo com **números reais**, não filtrados — `"{abertas} abertas · {n} para hoje"`, com separador de milhar `pt-BR` e singular correto (1 aberta).
- **KPIs** (`TasksKpiStrip`): 5 cards (Atrasadas, Para hoje, Fazendo `n/3`, Concluídas 7d, Tempo médio em dias). O card "Fazendo" usa a contagem **real** da lista completa, não o recorte do filtro.
- **QuickAdd** (`shared/QuickAdd.tsx`): campo único + chips `Hoje`, `Amanhã`, `Próx. semana`, `Data` (calendário `ptBR` + hora opcional), `Lembrar` (1 h · Amanhã 9h · Próx. seg 9h + data/hora livre; horário no passado é bloqueado e marcado em vermelho), `@ Contato` (busca por 2+ letras; oculto quando o contato é fixo do chat) e `! Prioridade` (4 opções, padrão Média). Fora da Agenda; a Agenda tem o seu, pré-preenchido com o dia selecionado (23:59 local). No modo compacto os chips vivem dentro do menu `⋯` (`QuickAddCompacto`).
- **Barra de filtros** (`TasksFilterBar`): busca com debounce de 200 ms (`SEARCH_DEBOUNCE_MS`), prioridade, contato, interruptores "Com alarme" e "Mostrar concluídas", e "Limpar". O estado vive num `useReducer` e é **espelhado na URL** por `replaceState` — parâmetros `q`, `prio`, `contact`, `alarm=1` e a exceção `done=0` (`src/hooks/tasks/useTasksFilters.ts`, `src/hooks/tasks/workItemFilters.ts`). "Limpar" também cancela o debounce pendente.

### 2.2 Os três modos

- **Lista** (`list/TasksListMode.tsx`): seções recolhíveis **Atrasadas** (vermelho), **Hoje** (amarelo), **Amanhã**, **Próximas** (com subcabeçalho por dia), **Sem prazo** (nasce recolhida com mais de 10) e **Concluídas (7 dias)** com o rodapé "ver mais (30 dias)" que revela as concluídas de 8 a 30 dias. A animação de entrada dos cards só acontece na primeira montagem.
- **Quadro** (`board/TasksBoardMode.tsx` + `BoardColumn.tsx`): colunas Caixa de entrada, A fazer, Fazendo, Aguardando e Concluído (`KANBAN_COLUMNS`). Arrastar e soltar (dnd de `@hello-pangea/dnd`) tem três resultados: reordenar dentro da coluna (`onReorder`), mover de coluna (`onMove`), ou **pedir o motivo** quando o destino é Aguardando sem motivo — nesse caso nada é escrito e o Sheet abre com o campo do motivo em foco. Em tela estreita a faixa tem setas ‹ › e 5 marcadores de página; com **ponteiro grosso** (touch) o arrasto é desligado e o menu "Mover para" do card assume (`shared/pointerMedia.ts`, `board/MoveToMenu.tsx`).
- **Agenda** (`agenda/TasksAgendaMode.tsx`): faixa de 7 dias (hoje + 6), cada dia com até 3 pontos (prazo `primary`, alarme `warning`, atrasada `destructive`); bloco **Atrasadas** expansível (nasce recolhido com mais de 3); o dia selecionado aparece em três grupos — **Alarmes** (com a hora à esquerda), **Prazos** (com hora) e **Sem hora**. Um item com prazo e alarme no mesmo dia aparece nos dois grupos (não é deduplicado).

### 2.3 Sheet de edição (`shared/WorkItemSheet.tsx`)

Abre ao clicar no card, e **também** por deep link `?task=<id>` (lido no primeiro render, consumido ao fechar; fechar limpa o parâmetro da URL). Campos: Título, **Estado** (select com as 5 colunas; a opção "Fazendo" fica desabilitada com 3/3 e mostra "Fazendo está cheio (n/3)"), **Motivo de espera** (obrigatório quando o estado é Aguardando — sem ele "Salvar" mostra "Diga por que parou" e não grava), Prioridade, Contato, Prazo (dia + hora), **Alarme** (dia + hora, "Adiar" com 15 min / 1 hora / Amanhã 9h, "Remover alarme", e o registro "Avisado em" quando o alarme já disparou) e Descrição (colapsada). Rodapé: Concluir, Cancelar tarefa (soft delete) e Salvar (desabilitado sem mudança; `Ctrl+Enter` salva). Em viewport estreito o Sheet desce para a base. Abrir por arrasto/menu para Aguardando ou por "Lembrar-me → Escolher…" já foca o campo certo.

### 2.4 Ações do card

Cada card (`shared/WorkItemCard.tsx`) traz: checkbox de concluir/reabrir, chip de contato (clique abre a conversa no inbox pelo evento `open-contact-chat`), chip de prazo, chip de alarme, chip de prioridade e menu `⋯` (kebab) com os cinco grupos **Abrir · Concluir/Reabrir · Lembrar-me ▸ (15 min · 1 h · Amanhã 9h · Escolher… · Remover alarme) · Mover para ▸ · Cancelar**. O contrato das ações é `shared/cardActions.ts` — todas as props são opcionais de propósito, para os testes de tela montarem os modos sem elas.

### 2.5 Região viva, atalhos e narração

O módulo mantém **uma** região viva `sr-only` (`role="status"`, `aria-live="polite"`, `data-testid="tasks-live"`) que narra criar, concluir, desfazer e mover — inclusive "Movida para {coluna} ({n} de {limite})". Os **sete atalhos** do módulo vivem no registry global (`src/hooks/shortcuts/defaultShortcuts.ts`, escopo `tasks`/`pipeline`) e chegam ao componente pelo evento `tasks-shortcut`: `N` (nova tarefa), `1/2/3` (modos), `/` (busca), `E` (abrir Sheet), `X` (concluir), `Delete` (cancelar) e `?` (ajuda). O atalho `Alt+T` (`open-tasks-tab`) é outro: abre a **aba Tarefas da conversa**.

### 2.6 Alarme (lembrete)

O cron `tasks-notify-due` (a cada minuto) chama `notify_due_tasks()`, que cria uma linha em `notifications` com `type = 'reminder_due'` e `metadata = { task_id, contact_id }` e carimba `notified_at` (idempotência: não notifica duas vezes a mesma tarefa). No front, `useWorkItemNotifications` converte essa notificação em 5 ações: abrir a tarefa (`?view=tasks&task=<id>`), abrir a conversa do contato, adiar (15 min / 1 h / Amanhã 9h, rearmando `remind_at` e zerando `notified_at`), concluir (mesmo efeito do trigger do banco) e marcar como lida. As quatro ações de fluxo marcam a notificação como lida ao terminar.

### 2.7 Dashboard

- **Topo:** faixa com mensagens não lidas do realtime (`DashboardTopBar`) e cabeçalho com filtros de período, fila e agente + botão de atualizar (só para staff os filtros de equipe aparecem).
- **Filtros na URL** (`useDashboardUrlFilters`): `?period=` (today padrão, yesterday, week, month, custom com `from`/`to`), `?queue=`, `?agent=`. F5 ou link compartilhado preserva o recorte.
- **Visão Geral:** saudação, faixa de KPIs, gráfico de volume, painel "Agora", metas do dia, tabela de saúde das filas (staff), atividade recente, destaque da equipe (staff), ferramentas de IA, CSAT, tendência de sentimento e a seção de gamificação.
- **Aviso de honestidade do período:** quando o período do filtro não é "hoje", a faixa de KPIs mostra o aviso de que "Resolvidas hoje", "tempo de resposta" e "SLA" são **sempre do dia atual** (vêm de `dashboard_kpi`, com hoje/ontem fixos no servidor) — o período afeta "Conversas Abertas" e o gráfico de volume, não esses três.
- **Atualizar** (`handleRefresh`): espera as três leituras de `useDashboardStats` e invalida as chaves `dashboard-kpi`, `recent-conversation-events` e `today-hourly-volume`.

---

## 3. Dados (tabelas, colunas, RPCs, Edge Functions)

### 3.1 `conversation_tasks` — a tabela do módulo de Tarefas

19 colunas (catálogo + `supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql` + `20261002411230_ia047_idempotencia_de_efeitos.sql`):

`id` (uuid, PK) · `contact_id` (uuid, nulo; FK para `contacts`) · `title` (text, NOT NULL) · `description` (text) · `assigned_to` (uuid) · `created_by` (uuid, NOT NULL) · `due_date` (timestamptz) · `priority` (text, NOT NULL) · `status` (text, NOT NULL) · `completed_at` (timestamptz) · `created_at` (timestamptz, NOT NULL) · `updated_at` (timestamptz, NOT NULL) · `remind_at` (timestamptz) · `notified_at` (timestamptz) · `waiting_reason` (text) · `position` (integer, NOT NULL, default 0) · `started_at` (timestamptz) · `status_changed_at` (timestamptz, NOT NULL) · `client_task_id` (uuid, nulo).

Constraints (catálogo): `conversation_tasks_status_check` (`status ∈ backlog | todo | doing | waiting | done | cancelled`, default `backlog`) e `conversation_tasks_waiting_reason_check` (`status <> 'waiting' OR waiting_reason IS NOT NULL`).

Índices: `idx_tasks_owner_status_due (created_by, status, due_date)`, `idx_tasks_owner_remind_pending (created_by, remind_at)` parcial (só com alarme pendente e status fora de done/cancelled) e o índice único **parcial** `ux_conversation_tasks_creator_client_key (created_by, client_task_id)`.

Triggers: `trg_task_state_change` (`conversation_task_state_trigger()`: carimba `status_changed_at`, grava `started_at` na primeira entrada em `doing` e, ao entrar em `done`/`cancelled`, grava `completed_at` e limpa `remind_at`/`notified_at`); `trg_task_set_assignee` (`conversation_task_set_assignee()`: `assigned_to := created_by` no INSERT); `trg_prevent_conversation_task_field_forgery` (`prevent_conversation_task_field_forgery()`, migration `20260924110946`). A tabela está na publicação de realtime (`REPLICA IDENTITY FULL`) — migrations `20260928140000`, `20260928200000`, `20260928210000`.

Legado: a tabela `reminders` continua existindo, com `migrated_task_id` apontando para a tarefa que a substituiu (migration `20260928140000`). `docs/tasks/README.md` registra que ela está sem uso; a coluna `reminders_pending` da RPC da aba já foi removida (`20260925170000`, `20261001301230`).

### 3.2 Como o front lê e escreve

- **Leitura única** (`useMyWorkItems`): um `select` em `conversation_tasks` com o contato embutido (`contact:contacts!conversation_tasks_contact_id_fkey(id,name,phone,avatar_url)`), filtro `created_by = profileId`, recorte `or(status.neq.done, completed_at.is.null, completed_at.gte.<agora-30d>)`, ordenado por `position asc, created_at desc, id asc` (o `id` é o desempate que estabiliza a paginação) e **paginado** por `fetchAllRows`. Se a leitura não cobrir tudo, o hook **lança erro** em vez de tratar o lote parcial como universo. `staleTime` de 30 s. Opções: `contactId` (aba do chat) e `includeCancelled`.
- **Chave de cache:** `['work-items', profileId, contactId|'all', 'with-cancelled'|'active']`. Sem `includeDone` de propósito: os três modos compartilham a **mesma** query, então trocar de modo não dispara request.
- **Escrita:** `create` (calcula `position = min(coluna) - 1`, manda `client_task_id` e trata o código `23505` como pedido já feito, não como erro), `update` (patch de campos; **não** muda `status`), `move` (valida na máquina de estados e grava `status`, `waiting_reason`, `completed_at`, `remind_at`, `notified_at`, `started_at`), `reorder`/`persistPositions` (upsert em lote de `id, position, title, created_by` — os dois últimos são NOT NULL sem default), `cancel` (status `cancelled` + `completed_at`, com desfazer), `complete`, `reopen`, `snooze` e `setReminder`. Todas com atualização otimista: aplica no cache, restaura no erro e invalida ao finalizar. O desfazer de cancelar/concluir reescreve `status`, `completed_at`, `remind_at` e `notified_at` do item original e **confere** a escrita (erro do PostgREST/RLS e 0 linhas contam como falha).
- **Realtime:** um canal por montagem (`work-items:<profileId>:<sufixo aleatório>`) escutando `postgres_changes` em `conversation_tasks` filtrado por `created_by`, invalidando as chaves `work-items` e `work-items-badge`. O sufixo existe porque o cliente do Realtime devolve o canal **existente** quando o tópico se repete, e `.on()` depois de `subscribe()` lança (dois consumidores na mesma página já derrubaram a aba).
- **Badge do menu** (`useMyWorkItemsBadgeInfo`): conta atrasadas (`due_date` no passado) + avisos já disparados e não tratados (`remind_at <= agora` e `notified_at` preenchido) entre as tarefas não concluídas/canceladas, também sobre leitura paginada completa; `staleTime` e `refetchInterval` de 60 s. Quem consome é a `Sidebar` (a cor do badge é vermelha quando há atrasada e amarela quando o número é só de avisos disparados).

### 3.3 RPCs e funções do banco

| Nome (assinatura) | Papel | Definida em |
|---|---|---|
| `notify_due_tasks()` → integer | Varre tarefas com `remind_at` vencido e `notified_at` nulo, cria a notificação `reminder_due` e carimba `notified_at` | `20260928140100_tasks_notify_due_cron.sql`; endurecida em `20260930141000_harden_notify_due_tasks_rpc_authorization.sql` |
| `current_profile_id()` → uuid | Perfil do usuário logado, usada nas policies de `conversation_tasks` | `20260928140000` |
| `is_admin_or_supervisor(user_id)` → boolean | Usada nas policies de `conversation_tasks` e nas travas de `p_agent` do dashboard | catálogo de funções |
| `is_privileged_contact_caller()` → boolean | Guarda interna de `notify_due_tasks()` | `20260930141000` |
| `get_conversation_tab_counts(p_contact_id)` → `(tasks_open, notes_total, files_total)` | Contagens das abas da conversa; `tasks_open` conta só as tarefas do usuário atual fora de done/cancelled | `20260907200000`, `20260928140200`, `20261003162707` |
| `dashboard_kpi(p_since, p_queue, p_agent)` → jsonb | KPIs do dia (resolvidas hoje, tempo de resposta, SLA, violações) | `20260925132706`, `20260925172511`, `20260927120000` |
| `dashboard_contact_counts(p_since, p_until, p_queue, p_agent)` → jsonb | Totais abertos/pendentes/meus + breakdown por fila | `20260925162737`, `20260930400000` |
| `dashboard_hourly_volume(p_days, p_queue, p_agent)` → table(day, hour, message_count) | Volume por hora | `20260925172511` |
| `dashboard_leaderboard(p_period, p_limit)` → jsonb | Ranking da equipe | `20260926161500` (revoga EXECUTE de anon) |
| `dashboard_sentiment_alerts(p_since)` → table | Alertas de sentimento | catálogo de funções |

Cron: `tasks-notify-due`, expressão `* * * * *`, `SELECT public.notify_due_tasks()` (migration `20260928140100`); a mesma migration desliga o cron legado `notify-due-reminders`. **Se o cron está ativo em produção hoje: NÃO VERIFICADO** (agentes não acessam produção).

### 3.4 Tabelas que o Dashboard e a camada de analytics leem

Direto do front: `profiles` (equipe, nomes), `queues` (+ `queue_members` + `profiles`), `conversation_events` (atividade recente), `contacts`, `messages`, `conversation_analyses`, `conversation_sla`, `agent_stats`, `goals_configurations`, `audit_logs` (alertas de sentimento), `ai_providers`, `ai_usage_logs`, `performance_snapshots`, `scheduled_report_configs` e `notifications`. A maior parte vem dos hooks de `src/hooks/dashboard/**` e `src/hooks/analytics/**`; as RPCs da tabela anterior concentram os agregados do painel.

### 3.5 Edge Functions

**Nenhuma Edge Function é chamada pelo módulo de Tarefas nem pelo Dashboard**: não há `functions.invoke` em `src/components/tasks`, `src/components/dashboard`, `src/hooks/tasks`, `src/hooks/dashboard` nem `src/hooks/analytics` (verificado por busca no diretório). O diretório `supabase/functions/` não tem função de tarefas; a camada de Edge do produto (IA, Evolution, e-mail, telefonia, Multiplix, Talk X) é de outros módulos. **Quem envia os relatórios agendados por e-mail: NÃO VERIFICADO** — no repositório só se encontra a interface e a persistência dos agendamentos.

---

## 4. Permissões e regras de acesso

### 4.1 Menu e rota

As entradas `tasks`, `pipeline` e `dashboard` em `NavigationService.getPrimaryNav()` **não** declaram `roles` nem `permission`, então `canAccess` libera para qualquer papel autenticado. Ainda assim, a view passa pelo `ViewRouter`, que nega por padrão enquanto papéis/permissões carregam e mostra a tela "Acesso restrito" quando o papel não autoriza — esconder do menu não impede `?view=` digitado à mão.

### 4.2 Tarefas — RLS e regras do banco

Policies vigentes em `conversation_tasks` (migration `20260928140000`, que substituiu as quatro anteriores):

| Policy | Operação | Regra |
|---|---|---|
| `tasks_select_own` | SELECT | `created_by = current_profile_id()` **ou** `is_admin_or_supervisor(auth.uid())` |
| `tasks_insert_own` | INSERT | `created_by = current_profile_id()` |
| `tasks_update_own` | UPDATE | dono ou admin/supervisor (no `USING` e no `WITH CHECK`) |
| `tasks_delete_own` | DELETE | dono ou admin/supervisor |

Consequências que a tela mostra: o atendente enxerga **só as próprias tarefas** (o hook reforça com `.eq('created_by', profileId)`; o RLS também filtra, sem lançar erro quando 0 linhas voltam); supervisor/admin enxergam as de todos por desenho, não por vazamento. Como o trigger de INSERT força `assigned_to := created_by`, **não existe** tarefa atribuída por outra pessoa dentro deste módulo.

Regras de negócio aplicadas na escrita, em `src/hooks/tasks/workItemMachine.ts` (função pura, usada pela UI e pelos testes):

- `done` só sai para `todo` (reabrir); `cancelled` é arquivo morto (nenhuma transição).
- Voltar para `backlog` só é permitido vindo de `todo` ou `waiting`.
- Máximo de **3** itens em `doing` (WIP duro) — a quarta entrada é recusada com `wip_full`, tanto no arrasto quanto no menu e no Sheet.
- Entrar em `waiting` **exige** motivo (`waiting_reason_required`), no arrasto, no menu e no formulário.
- Reordenar **dentro** da coluna "Fazendo" cheia é permitido (o WIP só trava a **entrada** de fora).

### 4.3 Dashboard — dois níveis de escopo

- **Front:** abas filtradas por papel e `goToTab` bloqueando clique em aba não pessoal para `agent`.
- **Servidor:** as três RPCs de leitura (`dashboard_kpi`, `dashboard_contact_counts`, `dashboard_hourly_volume`) travam `p_agent := auth.uid()` quando quem chama não é admin/supervisor (`is_admin_or_supervisor`, migration `20260925172511`) — o filtro de agente do topo é ignorado para não-staff, independentemente do que o front mandar. As RPCs do painel tiveram EXECUTE revogado de `anon`/`public` (`20260926100134`, `20260926100302`, `20260926161500`).

### 4.4 Regras permanentes do produto neste módulo

- **Nenhuma informação sai do sistema:** não há botão de exportar, baixar, imprimir ou compartilhar nos componentes de Tarefas e do Dashboard, e nenhuma chamada a download no módulo (verificado por busca por `exportar|baixar|imprimir|compartilhar|useDownloadPermission` e por `functions.invoke`). O caminho de download existente no produto (`useDownloadPermission`) é de outros módulos (por exemplo, Catálogo) e **não** é usado aqui. O comentário "Exportar" que aparece em `overview/DashboardCard.tsx` é a descrição do botão bordado genérico dos mockups (`GhostButton`), não um recurso de exportação: nenhum componente do Dashboard o usa com esse rótulo.
- **Sem selo de canal/origem:** nenhum campo ou chip do módulo indica o canal ou a origem da tarefa. O que os cards e o Sheet mostram é título, estado, prazo, alarme, prioridade e o **nome** do contato vinculado — nada de WhatsApp/telefone/e-mail de origem.
- **Só as cores do sistema:** as telas usam tokens (`primary`, `success`, `warning`, `info`, `destructive`, `muted`, `accent`, além dos tokens de painel `kpi-*` e `dash-*`, incluindo o violeta `dash-violet`). Não há cor literal (`bg-[#…]`, `text-[#…]`, `border-[#…]`) nos componentes dos dois módulos (verificado por busca).
- **Movimento:** as animações usam `useReducedMotion` do framer-motion (modos, troca de modo, lista, abas do dashboard, cards) e há teste de contrato lendo os blocos `@media (prefers-reduced-motion…)` do CSS do módulo (`src/components/tasks/__tests__/movimentoEContraste.test.tsx`).
- **Sem DDL, migration, Edge Function ou dependência nova:** este documento é só descrição; nada foi alterado no código.

---

## 5. Estados de erro e vazio

**Tarefas**

- Erro de leitura do módulo: tela central "Não foi possível carregar suas tarefas" + botão "Tentar novamente" (`hook.refetch()`).
- Leitura parcial (paginação incompleta): o hook lança `Leitura de conversation_tasks incompleta` (e variante para o badge) em vez de mostrar lote truncado.
- Lista vazia: `TasksEmptyState` com variante `all` ("Nada por aqui", dica do atalho `N`), `filter` ("Nenhuma tarefa com esse filtro" + "Limpar filtros") e `column` ("Coluna vazia" + a política da coluna). A variante de filtro é usada sempre que **qualquer** filtro está ativo, não só a busca.
- Agenda: "Nenhuma tarefa neste dia" quando o dia não tem nada.
- Esqueletos: `WorkItemCardSkeleton` (Lista e Agenda) e `BoardColumnSkeleton` (Quadro).
- Toasts de erro das mutations: criar ("Erro ao criar tarefa"), atualizar, mover, reordenar, remover, adiar, definir aviso — com mensagens específicas para os bloqueios: "Limite de Fazendo atingido (max. 3)…", "Escreva o motivo da espera antes de mover." e "O horario do aviso ja passou" (tolerância de 60 s para alarme no passado).
- Arrasto bloqueado por WIP: toast "Fazendo está cheio (máx. 3). Conclua um item antes."
- Desfazer: cancelar e concluir abrem o toast com desfazer; se a escrita de restauração falhar (erro ou 0 linhas), o desfazer não confirma.
- Notificação de alarme sem `metadata.task_id`: "Este aviso não está ligado a uma tarefa".

**Dashboard**

- Erro: card central "Não foi possível carregar os dados do dashboard agora." + "Tentar de novo" (`data-testid="dash-error"`). Antes da correção de 24/09 uma query falhando deixava o painel preso no esqueleto sem aviso (registrado no próprio `DashboardView`).
- Carregando: `OverviewSkeleton`.
- Período diferente de "hoje": aviso fixo de que resolvidas hoje / tempo de resposta / SLA são do dia atual.
- Erro próprio de cada card e de cada aba (Metas, IA, SLA, Equipe, Satisfação, Sentimento, Relatórios) **NÃO VERIFICADO** — não foi auditado card a card neste cartão; o que se pode afirmar do código lido é que os cards recebem dados por hooks independentes e que os testes citados na seção 7 cobrem parte dos estados vazios.

---

## 6. Limites e riscos conhecidos

1. **O teto de 1000 linhas do PostgREST.** Toda leitura de `conversation_tasks` (lista e badge) passa por `fetchAllRows`; se a paginação não cobrir tudo, o hook lança erro. É o que impede a lista, os KPIs e a contagem do cabeçalho de "sumirem em silêncio" acima do teto.
2. **WIP contado globalmente, não por contato.** A trava de 3 itens em "Fazendo" vale para o conjunto do usuário, não por conversa (resíduo já registrado em `docs/tasks/README.md`).
3. **O filtro é recorte de TELA.** Cabeçalho, card "Fazendo" e a trava de WIP usam a lista completa; só as listas/colunas e a Agenda mostram o subconjunto filtrado. Sem isso a tela anunciaria "1/3" com 3 itens reais e aceitaria um arrasto que o hook recusaria.
4. **Janela de concluídas.** A query traz `done` dos últimos 30 dias; Lista e Quadro mostram 7 dias e revelam de 8 a 30 sob demanda. Tarefa concluída **sem** carimbo de `completed_at` entra na janela recente (nunca fica escondida por falta de dado).
5. **`update()` ignora `status`.** O estado só muda por `move` (máquina de estados); qualquer chamador que mandar `status` no patch não tem efeito (resíduo do README).
6. **Cancelar é soft delete.** `deleteItem` é alias de `cancel` (decisão D8); não existe remoção física pela UI.
7. **Ausência de índices** para `completed_at` e `position` (resíduo conhecido do README) — as ordenações por `position` acontecem sobre a lista carregada.
8. **Atribuição entre pessoas não existe.** `assigned_to` é sempre igual a `created_by` (trigger) e o RLS é por `created_by`; delegar tarefa para outro usuário não tem caminho no módulo hoje.
9. **Dependência do realtime por instância.** O canal usa sufixo aleatório por montagem; a invalidação só cobre as chaves do painel/lista (`work-items`, `work-items-badge`) do próprio usuário.
10. **Idempotência de criação (IA-047).** O front deduplica chamadas simultâneas com a mesma `client_task_id` em memória **e** o banco tem índice único parcial; o segundo insert cai em `23505` e é tratado como sucesso silencioso. Sem `crypto.randomUUID` no runtime a chave vai nula e a proteção não cobre a linha.
11. **Filtro de período do Dashboard não afeta três KPIs** (resolvidas hoje, tempo de resposta, SLA): eles são sempre do dia corrente. A tela avisa, mas o número não muda com o filtro.
12. **Dois pontos de UI para relatórios agendados** sobre a mesma tabela: `dashboard/ScheduledReportsManager.tsx` (aba Relatórios do Dashboard) e `src/components/reports/ScheduledReportConfigs.tsx`. Ambos existem no código; qual deles o produto usa em cada rota **NÃO VERIFICADO** neste cartão.
13. **Fusão Quadro → Tarefas ainda não integrada nesta base.** O item de menu "Quadro", a rota `pipeline`, o contrato `forceMode` e `viewRouteProps.ts` continuam no código; enquanto o cartão atômico (E14 do plano de fusão) não entrar, qualquer texto que afirme "um único item de menu" contradiz o código. Também por isso `docs/tasks/README.md` ainda cita `Alt+T` na abertura — a correção é o cartão E28 do mesmo plano.
14. **Estado em produção não foi verificado** (regra R1): cron ativo, dados reais, RLS efetiva e comportamento do painel em produção estão **NÃO VERIFICADO** neste documento.

---

## 7. Testes existentes (caminhos)

Contagens obtidas contando `it(`/`test(` em cada arquivo (`grep -c`). Não houve execução da suíte dentro deste cartão de documentação — o número é o que os arquivos declaram.

**Tarefas — 22 arquivos, 277 casos**

- `src/hooks/tasks/__tests__/`: `workItemAggregates.test.ts` (44), `useMyWorkItems.test.tsx` (20), `workItemMachine.test.ts` (16), `useTasksFilters.test.tsx` (9), `useWorkItemNotifications.test.ts` (8), `workItemFilters.test.ts` (7), `useMyWorkItems.idempotencia.test.tsx` (5), `useMyWorkItems.paginacao.test.tsx` (2).
- `src/components/tasks/__tests__/`: `TasksModule.test.tsx` (37), `taskComponents.test.tsx` (21), `WorkItemSheet.test.tsx` (15), `cardAcoes.test.tsx` (14), `TasksBoardMode.test.tsx` (13), `QuickAdd.test.tsx` (11), `WorkItemCard.test.tsx` (11), `agendaGroups.test.tsx` (11), `movimentoEContraste.test.tsx` (9), `TasksAgendaMode.test.tsx` (8), `TasksListMode.test.tsx` (8), `WorkItemSheet.fuso.test.tsx` (4), `QuickAddCompacto.test.tsx` (2), `contagensReaisVsFiltradas.test.tsx` (2).

**Dashboard + Analytics — 35 arquivos, 151 casos**

- `src/components/dashboard/__tests__/` (21 arquivos, 83 casos): `useSentimentData.test.tsx` (10), `DashboardKpiCard.test.tsx` (9), `SentimentTabContent.test.tsx` (8), `DashboardCard.test.tsx` (6), `AIQuickAccess.test.tsx` (5), `NowPanel.test.tsx` (4), `QueueHealthTable.test.tsx` (4), `VolumeChart.test.tsx` (4), `AIStatsWidget.test.tsx` (3), `CsatCard.test.tsx` (3), `DailyGoalsCard.test.tsx` (3), `DashboardFilters.fuso.test.ts` (3), `DashboardKpiRow.test.tsx` (3), `DashboardView.test.tsx` (3), `GreetingBanner.test.tsx` (3), `TeamHighlightCard.test.tsx` (3), `AIToolsCard.test.tsx` (2), `GoalsConfigDialog.test.tsx` (2), `RecentActivityCard.test.tsx` (2), `SentimentTrendCard.test.tsx` (2), `SentimentHelpers.vocabulario.test.tsx` (1).
- `src/hooks/dashboard/__tests__/` (6 arquivos, 38 casos): `useDashboardUrlFilters.test.tsx` (11), `useDashboardKpi.test.ts` (10), `useRecentConversationEvents.test.ts` (8), `useTodayHourlyVolume.test.ts` (5), `useTodayHourlyVolume.apptz.test.ts` (3), `useDashboardStats.presence.test.tsx` (1).
- `src/hooks/analytics/__tests__/` (8 arquivos, 30 casos): `useAIUsageDashboard.agregacao.test.tsx` (7), `useRealtimeDashboard.reconciliacao.test.tsx` (6), `usePerformanceSnapshots.limpeza.test.tsx` (5), `useRealtimeDashboard.escopo.test.tsx` (5), `sentiment-vocabulario.test.tsx` (3), `useAIUsageDashboard.janela.test.tsx` (2), `useDashboardData.presence.test.tsx` (1), `useRecentAnalyses.test.tsx` (1).

**Lacunas de teste que o código já revela**

- **Não existe E2E de tarefas/quadro** em `e2e/` (nenhum spec do módulo), nem de dashboard/analytics — a cobertura ponta a ponta desses fluxos é o cartão **Y10** do plano de qualidade paralela.
- `docs/tasks/README.md` registra que `e2e/reactions.spec.ts` é crônico na `main` (assunto de outro módulo).

---

## 8. Arquivos-chave com caminhos

**Tarefas (componentes)** — `src/components/tasks/TasksModule.tsx` (orquestrador dos três modos, Sheet, atalhos e região viva); `src/components/tasks/list/TasksListMode.tsx`; `src/components/tasks/board/TasksBoardMode.tsx`, `board/BoardColumn.tsx`, `board/MoveToMenu.tsx`, `board/resolveDragEnd.ts` (decisão pura do arrasto); `src/components/tasks/agenda/TasksAgendaMode.tsx`; `src/components/tasks/shared/` — `QuickAdd.tsx`, `WorkItemCard.tsx`, `WorkItemSheet.tsx`, `TasksFilterBar.tsx`, `TasksKpiStrip.tsx`, `ModeSwitcher.tsx`, `ContactChip.tsx`, `ContactCombobox.tsx`, `DueChip.tsx`, `PriorityChip.tsx`, `RemindChip.tsx`, `AgingDot.tsx`, `cardActions.ts`, `localDateTime.ts`, `pointerMedia.ts`, `WorkItemCardSkeleton.tsx`, `BoardColumnSkeleton.tsx`; `src/components/tasks/TasksEmptyState.tsx`.

**Tarefas (dados)** — `src/hooks/tasks/useMyWorkItems.ts` (query única, mutations otimistas, realtime, badge), `useMyTasks.ts` (adaptador depreciado), `useTasksFilters.ts`, `useWorkItemNotifications.ts`, `workItem.types.ts` (status, prioridades, colunas canônicas, limites de WIP), `workItemMachine.ts` (transições + WIP + motivo de espera), `workItemAggregates.ts` (buckets, recorte de filtros, KPIs, Agenda), `workItemFilters.ts` (estado/URL dos filtros), `workItemLabels.ts`.

**Pontas de entrada e navegação** — `src/pages/ViewRouter.tsx`, `src/pages/lazyViews.ts`, `src/pages/viewRouteProps.ts`, `src/services/navigation.service.ts`, `src/components/layout/Sidebar.tsx` (badge), `src/hooks/shortcuts/defaultShortcuts.ts` e `src/hooks/ui/useGlobalKeyboardShortcuts.ts`, `src/components/inbox/tabs/TasksTab.tsx`, `src/components/inbox/chat/ConversationTabs.tsx`.

**Dashboard** — `src/components/dashboard/DashboardView.tsx` (abas, papéis, filtros, erro), `dashboard/DashboardFilters.tsx`, `dashboard/overview/**` (cabeçalho, faixa de KPIs, cartões, esqueleto, abas), `dashboard/metrics/**`, `dashboard/goals/**`, `dashboard/sla/**`, e os painéis `SLAMetricsDashboard.tsx`, `GoalsDashboard.tsx`, `AIQuickAccess.tsx`, `AgentPerformancePanel.tsx`, `SatisfactionMetrics.tsx`, `SentimentTrendChart.tsx`, `ScheduledReportsManager.tsx`, `DemandPrediction.tsx`, `ConversationHeatmap.tsx`, `ActivityHeatmap.tsx`, `WarRoomDashboard.tsx`.

**Dados do dashboard/analytics** — `src/hooks/dashboard/useDashboardStats.ts`, `useDashboardKpi.ts`, `useQueueHealth.ts`, `useRecentConversationEvents.ts`, `useTodayHourlyVolume.ts`, `useScheduledReportConfigs.ts`, `useDashboardUrlFilters.ts`; `src/hooks/analytics/useDashboardData.ts`, `useRealtimeDashboard.ts`, `useDashboardWidgets.ts`, `useGoalsDashboard.ts`, `useGoalNotifications.ts`, `useAIStats.ts`, `useAIUsageDashboard.ts`, `useActiveAIProvider.ts`, `usePerformance.ts`, `usePerformanceOptimizations.ts`, `usePerformanceSnapshots.ts`, `useRecentAnalyses.ts`, `useRecentSentimentAlerts.ts`, `index.ts`.

**Banco** — `supabase/schema-catalog.json`; migrations `20260928140000_tasks_unify_reminders_kanban.sql`, `20260928140100_tasks_notify_due_cron.sql`, `20260928140200_tab_counts_tasks_own.sql`, `20260928200000_conversation_tasks_realtime_drift.sql`, `20260928210000_reconcile_conversation_tasks_realtime_publication.sql`, `20260930141000_harden_notify_due_tasks_rpc_authorization.sql`, `20261002411230_ia047_idempotencia_de_efeitos.sql`; dashboard: `20260925132706_dashboard_fase3_kpi_rpc.sql`, `20260925162737_dashboard_fase3_contact_counts_rpc.sql`, `20260925172511_dashboard_fase4_filters_e31_e32_e33.sql`, `20260926100302_dashboard_revoke_public_execute_rpcs.sql`, `20260926161500_dashboard_leaderboard_revoke_anon_execute.sql`.

**Documentação irmã** — `docs/design/TAREFAS_QUADRO_STATUS.md`, `docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md`, `docs/tasks/README.md`, `docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md`, `docs/design/PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md`, `docs/design/PLANO_REDESIGN_DASHBOARD_ABAS.md`, `docs/design/PLANO_REDESIGN_DASHBOARD_NAVY_100_ETAPAS.md`, `docs/design/REDESIGN_DASHBOARD_STATUS.md`.

---

## 9. Planos relacionados de 07/10/2026

- **`docs/plans/PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md`** — funde o módulo Quadro em Tarefas (um item de menu, o Quadro como modo). É o plano que ancora o item 6.13 deste documento: o cartão atômico **E14** remove o item `pipeline`, a rota, o contrato `forceMode` e `viewRouteProps.ts`; **E24–E29** são os cartões de documentação (status do módulo, fechamento da auditoria, nota de superação do plano antigo, G-3, `docs/tasks/README.md` e `CHANGELOG.md`). Nesta base, nenhum desses cartões está integrado (verificado no código).
- **`docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`** — cartões que tocam este módulo: **Y07** (testes de analytics, metas, relatórios agendados e gamificação), **Y10** (E2E de tarefas e quadro: criar, mover, concluir, filtros), **Y16** (auditoria de acessibilidade e celular de Tarefas, Quadro, Dashboard e Analytics), **Y21** (este documento) e **Y25** (revisão de segurança em leitura das regras de acesso de tarefas, notas, propostas, e-mail, ligações e analytics). Y29 (mapa de todas as saídas de informação) é o cartão que testa a regra "nenhuma informação sai do sistema" citada na seção 4.4.
- **`docs/plans/PLANO_CONSISTENCIA_DESIGN_SISTEMA_2026-10-07.md`** — cita Tarefas no achado D02 (reutilizar o par ícone+cor do mapa de categorias do Journey nos cabeçalhos das abas Tarefas, Notas e CRM 360°, sem mudar cor nenhuma) e no cartão **Z02**.
- **`docs/plans/AUTOMACAO_ONDAS_DOS_PLANOS_2026-10-07.md`** — lista o mesmo cartão **Z02** no encadeamento de ondas.

**Planos anteriores do módulo (histórico, em `docs/design/`):** `PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md` (fusão Tarefas+Lembretes+Quadro, com a decisão G-3 dos dois itens de menu), `PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md` (finalização do módulo), `PLANO_REDESIGN_DASHBOARD_ABAS.md` e `PLANO_REDESIGN_DASHBOARD_NAVY_100_ETAPAS.md` (redesenho do dashboard). O estado etapa por etapa desses planos está em `docs/design/TAREFAS_QUADRO_STATUS.md` e `docs/design/REDESIGN_DASHBOARD_STATUS.md` — não repetidos aqui.
