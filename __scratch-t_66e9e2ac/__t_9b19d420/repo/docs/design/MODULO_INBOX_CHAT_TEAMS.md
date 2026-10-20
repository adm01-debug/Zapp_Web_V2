# Módulo: Inbox, Chat e Teams

> **Escopo documentado:** `src/components/inbox/**`, `src/hooks/chat/**`, `src/hooks/inbox/**`,
> `src/hooks/realtime/**`, `src/services/realtime.service.ts`, `src/components/team-chat/**`,
> `src/hooks/team-chat/**`.
> **Base do código:** árvore local `dia/2026-10-07` (agentes não acessam produção — regra R1).
> **Snapshots de banco usados para conferir nomes:** `supabase/schema-catalog.json` (gerado 2026-10-04)
> e `supabase/schema-manifest.json` (gerado 2026-10-05T21:05Z, snapshot de produção).
> **Documentos que este NÃO repete:** `docs/design/INBOX_360_STATUS.md` (execução do plano Inbox 360°,
> base `249501ae`) e `docs/design/INBOX_FIDELIDADE_STATUS.md` (plano de fidelidade visual "Carvão",
> base `27c22f4d`). Aqueles são status de plano/fase; este é o desenho do módulo como ele está hoje —
> o que eles deixam em aberto está em §6.
> **Regras permanentes do produto que valem para este módulo:** nenhuma informação sai do sistema
> (nada de exportar/baixar/copiar tudo/imprimir/compartilhar novo); download de arquivo só pelo caminho
> existente `useDownloadPermission`; só cores do sistema; efeitos sutis apenas com `motion-safe:` e
> respeitando `prefers-reduced-motion`; **sem selo de canal/origem** de arquivo ou mensagem.
> O que não deu para provar no código está marcado **NÃO VERIFICADO**.

---

## 1. O que é e para quem

O módulo cobre duas superfícies separadas que compartilham pessoas (atendentes), sessão e banco:

| Superfície | É | Entrada no app |
|---|---|---|
| **Inbox + Chat** | Atendimento ao **contato externo**: lista de conversas, painel da conversa com 8 abas, detalhes do contato, busca global, nova conversa | view `inbox` → `Views.RealtimeInboxView` (`src/pages/ViewRouter.tsx:46`) |
| **Teams (Chat da Equipe)** | Conversa **interna entre perfis da equipe**: direta, grupo e canal de departamento | view `team-chat` → `Views.TeamChatView` (`src/pages/ViewRouter.tsx:88`) |

- **Para quem:** atendente/agente (linha de frente do Inbox e do Chat da Equipe), supervisor e admin
  (filtros ampliados, gestão de departamentos) e quem administra departamentos/canais de WhatsApp.
- **Como se chega:** não são rotas de URL. As duas superfícies são *views* trocadas pelo `ViewRouter`
  a partir do menu (`src/services/navigation.service.ts`). As únicas rotas reais relacionadas são
  `/chat-popup/:contactId` (`src/routes/AppRoutes.tsx:59`) e `/queue/:id` (`src/routes/AppRoutes.tsx:67`).
- **Um único listener global** de notificação do Chat da Equipe é montado na raiz do app:
  `<TeamChatNotificationsListener />` (`src/App.tsx:44-46` e `src/App.tsx:65`, em chunk lazy) — antes
  ele vivia dentro da view e o atendente não recebia alerta com o módulo fechado
  (`src/components/team-chat/TeamChatNotificationsListener.tsx:6-20`).

---

## 2. Telas e fluxos principais

### 2.1 Inbox — coluna de conversas (`ConversationListSidebar`)

Composição (`src/components/inbox/ConversationListSidebar.tsx`): cabeçalho com busca, filtros
(`InboxFilters`), chips de status (`StatusChips`, reexportado como `TicketTabs` —
`src/components/inbox/TicketTabs.tsx:1`), lista virtualizada (`VirtualizedRealtimeList`) e barra de
ações em massa (`BulkActionsToolbar`).

- **Estados de filtro:** `MainTab = 'open' | 'resolved' | 'search'`,
  `SubTab = 'attending' | 'waiting'`,
  `ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved'`
  (`src/components/inbox/conversation-list/StatusChips.tsx:6-8`). Os chips exibem contagem e usam
  `contacts.assigned_to` comparado ao **`profiles.id`** (não ao `auth.users.id`) — comentário R2-INB-056
  no mesmo arquivo, linhas 25-31.
- **Filtros:** `useInboxFilters` (`src/hooks/inbox/useInboxFilters.ts`) mantém busca, tipo de contato
  (`ContactTypeFilter` / `FILTER_OPTIONS`), fila selecionada, "mostrar todas", `chipTab/mainTab/subTab`,
  filtros salvos (`saved_filters`) e persistência em URL (`useUrlFilters`). O "mostrar todas" só existe
  para **admin/supervisor** (`src/components/inbox/InboxFilters.tsx:77-79`).
- **Adiamento (snooze):** conversas adiadas saem da lista ativa e voltam no vencimento do prazo
  (R2-INB-029) — `snoozedIds` entra no filtro (`src/hooks/inbox/useInboxFilters.ts:84-86`); os prazos
  são lidos e gravados em `conversation_snoozes` por `useConversationActions`
  (leitura em `src/hooks/chat/useConversationActions.ts:71-81`, gravação em 191-203, `snoozedIds` em
  264-267) e consumidos pela view (`src/components/inbox/RealtimeInboxView.tsx:95-101`).
- **Ações em massa:** seleção múltipla com atalhos `Ctrl/Cmd+A`, `Delete/Backspace` (arquivar),
  `Esc` (limpar) e `r` (marcar como lida) — `src/components/inbox/RealtimeInboxView.tsx:176-188`.
- **Atualizar por gesto:** pull-to-refresh no celular (`usePullToRefresh`, idem linha 116).
- **Talk Me (fila de aguardando):** botão no cabeçalho da lista, atrás da feature flag
  `inbox.talk-me` (padrão **false**) — `src/components/inbox/RealtimeInboxView.tsx:104-105, 235-245`.

### 2.2 Inbox — painel central e as 8 abas

As abas são fixas e tipadas em `src/components/inbox/chat/ConversationTabs.tsx:10,20-28`:
**Chat, Arquivos, IA, CRM 360°, SalesView, Journey, Tarefas, Notas**. Cada aba é montada por
`ConversationTabContent` (`src/components/inbox/chat/ConversationTabContent.tsx:67-125`).

- **Badges:** Arquivos/Notas/Tarefas vêm da RPC `get_conversation_tab_counts`
  (`src/hooks/chat/useConversationTabCounts.ts`); o badge do **SalesView** é calculado no cliente como
  compras + propostas em aberto (`src/components/inbox/RealtimeInboxView.tsx:143-148`).
- **Aba ativa:** derivada por `resolverAbaAtiva` (`src/components/inbox/resolveActiveTab.ts:28-34`):
  preferência restaurada do `localStorage` vale para a sessão; escolha do usuário fica ancorada no
  contato que a escolheu e volta a `chat` ao trocar de conversa.
- **Aba Chat (`ChatPanel`)** reúne: cabeçalho (`ChatPanelHeader`/`ChatHeader`), área de mensagens
  (`ChatMessagesArea` + `MessageBubble`), input (`ChatInputArea`, `ChatMessageInput`), marca d'água
  (`ChatWatermark`), busca na conversa (`ChatSearchBar`/`ChatSearchResultsList`), respostas rápidas,
  mensagens agendadas, assinatura, ferramentas de IA (melhorar/reescrever), áudio (gravador, player,
  troca de voz, velocidade), figurinhas/emoji, localização, encaminhamento, reações, edição, apagar,
  overlay de arrastar arquivo, digitando/presença (`useTypingPresence`), menções `@` (busca perfis pela
  RPC `get_team_profiles` em `src/components/inbox/chat/MentionAutocomplete.tsx`), painéis de
  ferramentas e diálogos (`ChatToolPanels`, `ChatDialogs`) — imports em `src/components/inbox/ChatPanel.tsx:1-29`.
- **Atalhos e busca:** atalho global de busca abre `GlobalSearch` (⌘K,
  `useGlobalSearchShortcut`, `src/components/inbox/RealtimeInboxView.tsx:157`), com resultados dos tipos
  `message | contact | transcription | action | crm` (linhas 40-52); `Alt+T` abre a aba Tarefas desta
  conversa e foca o QuickAdd (linhas 190-199).
- **Detalhes do contato:** painel lateral `ContactDetailsResponsive` (lazy, com `Suspense` isolado para
  não desmontar o Chat — comentário em `RealtimeInboxView.tsx:360-365`), seções em
  `src/components/inbox/contact-details/`.
- **Mobile:** esconde a lista quando há conversa aberta, botão de voltar gera mini-janela
  (`MiniChatPiP`, linhas 405-408).
- **Confirmar fechamento da conversa:** `CloseConversationDialog` chama a RPC
  `close_conversation_atomic` (`src/components/inbox/CloseConversationDialog.tsx`).

### 2.3 Teams (Chat da Equipe)

`TeamChatView` (`src/components/team-chat/TeamChatView.tsx`) = lista (320px) + painel + detalhes:

- **Lista:** `TeamConversationList` (busca por nome, ícone por tipo — direta/grupo/departamento,
  contador de não lidas, abrir gestão de departamento quando `canManageDepartments`).
  A tela publica a conversa em foco para o listener global suprimir o alerta dela (linhas 19-22).
- **Painel:** `TeamChatPanel` → `useTeamChatPanel` (`src/components/team-chat/useTeamChatPanel.ts:347-407`)
  expõe envio de texto, áudio, arquivo, figurinha, emoji e meme de áudio; responder citando, editar,
  apagar, copiar; busca interna com debounce de 400ms; carregar mensagens antigas; silenciar (`isMuted`);
  renomear; adicionar/remover membro; sair; apagar conversa; transferir
  (`TransferConversationDialog`); estatísticas (`TeamPerformancePanel`/`useParticipantStats`);
  leitura em voz alta (TTS) e reações.
- **Canal de departamento:** só entra quem tem `profile.department_id` igual ao `department_id` da
  conversa (`src/components/team-chat/TeamChatPanel.tsx:23-27`); quem não é membro recebe uma visão
  bloqueada em vez do painel (linhas 76-77).
- **Nova conversa:** `NewConversationDialog` decide pelo tipo (`direct | group | department`) com
  `canCreateTeamConversation` (`src/lib/teamChatRules.ts:13-25`): departamento exige departamento
  escolhido; grupo exige **≥ 2** membros; direta exige **≥ 1**.
- **Gestão de departamento:** `DepartmentManagementDialog` (abas Membros, Convites, WhatsApp) aberto pela
  lista; ações de escrita exigem `isAdmin` (`src/components/team-chat/department-management/*.tsx`).

---

## 3. Dados

### 3.1 Tabelas (nomes conferidos nos dois snapshots)

- **Conversa com o contato:** `contacts`, `messages`, `conversation_sla`, `conversation_events`,
  `conversation_analyses`, `conversation_tasks`, `conversation_memory`, `contact_notes`,
  `contact_purchases`, `sales_deals`, `deal_activities`, `crm_contact_links`, `products`.
  `messages` tem `sender`, `is_read`, `external_id`, `message_type`, `media_*`, `status`,
  `reply_to_id`, `transcription*`, `whatsapp_connection_id` (colunas conferidas em
  `schema-manifest.json`).
- **Organização de quem atende:** `pinned_conversations`, `favorite_contacts`, `conversation_snoozes`,
  `saved_filters`, `user_settings`, `audit_logs`.
- **Mensagens e envios especiais:** `scheduled_messages`, `whisper_messages`, `message_reactions`,
  `message_templates`, `stickers`, `whatsapp_groups`, `whatsapp_connections`, `whatsapp_connection_queues`,
  `queues`, `queue_positions`, `auto_close_config`.
- **Teams:** `team_conversations` (`type` = `direct|group|department`, `direct_member_a/b`,
  `department_id`, `name`, `avatar_url`, `created_by`),
  `team_conversation_members` (`member_role`, `is_muted`, `is_pinned`, `is_archived`, `last_read_at`),
  `team_messages` (`message_type`, `reply_to_id`, `media_url/bucket/path/type`, `is_edited`, `status`),
  `team_message_reactions`, `team_message_receipts` (`delivered_at`, `read_at`, `status`),
  `departments`, `department_invites` (`code`, `expires_at`, `created_by`), `department_audit_logs`.

### 3.2 RPCs

**Chamadas pelo código deste módulo:**

| RPC | Onde |
|---|---|
| `close_conversation_atomic` | `src/components/inbox/CloseConversationDialog.tsx` |
| `get_conversation_tab_counts` | `src/hooks/chat/useConversationTabCounts.ts` |
| `get_inbox_contact_summaries` | `src/services/realtime.service.ts:85` |
| `find_or_create_direct_conversation`, `create_team_group_conversation`, `transfer_team_conversation_ownership` | `src/hooks/team-chat/useTeamChatMutations.ts` |
| `get_team_conversation_previews`, `get_team_unread_counts` | `src/hooks/team-chat/useTeamConversations.ts` |
| `get_team_profiles` | `src/hooks/team-chat/useTeamMemberDetails.ts`, `src/components/inbox/chat/MentionAutocomplete.tsx` |
| `get_department_whatsapp_credentials`, `accept_department_invite` | `src/hooks/team-chat/useDepartmentManagement.ts` |

**Existem no banco e NÃO são chamadas por este módulo** (aparecem só em
`src/integrations/supabase/types.ts`, que é gerado): `get_team_inbox`,
`get_team_messages_page`, `search_team_messages`, `mark_team_conversation_read`,
`is_team_conversation_member`, `set_team_member_pref`, `set_team_member_role`, `toggle_team_reaction`,
`leave_team_group`, `remove_team_member`, `set_conversation_status`, `set_department_whatsapp_config`,
`transfer_team_conversation_department`. O front faz `select` direto nas tabelas nesses caminhos (ver §6).

**Divergência entre snapshots e código (conferida arquivo a arquivo):**

- `get_inbox_contact_summaries` **não consta** em `schema-catalog.json` nem em `schema-manifest.json`
  (o manifest lista todas as funções de `public` — `scripts/db-audit/manifest.sql:214-238`), mas existe
  na migration `supabase/migrations/20261005124628_inbox_agregado_por_contato.sql` e nos tipos gerados.
  O código tolera a ausência da função de propósito (segue sem o agregado, R2-INB-005 —
  `src/services/realtime.service.ts:117-124`). Se produção já recebeu a migration: **NÃO VERIFICADO**
  (agentes não acessam o banco de produção).
- `transfer_team_conversation_ownership` e `create_team_group_conversation` existem no manifest
  **e não** em `schema-catalog.json` (catálogo de 2026-10-04 é mais antigo).
- `department_whatsapp_configs`: tabela usada por
  `src/hooks/team-chat/useDepartmentManagement.ts:252-256` (`upsert`, com
  `// @ts-expect-error table not yet in generated types`) e **ausente de todas as migrations**
  (`grep -ril` em `supabase/` não encontra nada), do catálogo e do manifest.

### 3.3 Edge Functions chamadas pelo módulo

Conferidas contra `supabase/functions/` (todas existem): `ai-enhance-message`,
`classify-sticker`, `elevenlabs-scribe-token`, `ai-conversation-analysis`, `ai-suggest-reply`,
`ai-transcribe-audio`, `ai-conversation-summary`, `send-scheduled-report`, `batch-fetch-avatars`,
`ai-proxy`, `sentiment-alert`.

### 3.4 Buckets de storage

`whatsapp-media` (mídia do contato), `stickers`, `audio-memes` e `team-chat-files`
(constante `TEAM_CHAT_FILES_BUCKET`, `src/hooks/team-chat/uploadTeamMedia.ts:16`). O Chat da Equipe
limita arquivo a **10 MB** (`MAX_TEAM_CHAT_FILE_SIZE`, `src/lib/teamChatRules.ts:1-9`).

### 3.5 Realtime

Assinaturas por canal (nomes reais no código): `messages` e `contacts` (lista do Inbox),
`message_reactions`/`chat-reactions:<id>`/`reactions:<id>`, `whisper_messages` (`whisper-<contactId>`),
`message-status-<contactId>`, `transcription-<messageId>`, `sentiment-alerts`,
`whatsapp-connections-changes`; no Teams: `team-messages-<id>`, `team-typing-<id>`, `team-presence-<id>`,
`team-unread-<id>`, `team-reactions-<id>`, `team-chat-updates`, `team-chat-notifications`
(`src/hooks/chat/useTeamChatNotifications.ts:149`). No Teams a fonte dos dados é leitura da tabela
(`team_messages`, `team_message_receipts`, `team_conversation_members`) e as RPCs de preview/não lidas.

---

## 4. Permissões e regras de acesso

- **RLS ligada em todas as tabelas citadas** (campo `rls` do `schema-manifest.json`). Políticas
  existentes, por nome (contagem conferida): `messages` 3, `team_messages` 4, `team_conversations` 4,
  `team_conversation_members` 4 (`tcm_select_own`, `tcm_insert_member`, `tcm_update_own_prefs`,
  `tcm_delete_own_or_admin`), `contacts` 3, `conversation_events` 2, `whisper_messages` 3,
  `scheduled_messages` 4, `saved_filters` 5, `pinned_conversations` 4, `conversation_snoozes` 3,
  `team_message_reactions` 5. O manifest guarda política → hash, **não** o texto da política: o
  conteúdo das regras não foi lido aqui (**NÃO VERIFICADO**).
- **Papéis no front:** `useUserRole` (`src/hooks/system/useUserRole.ts`) deriva `isAdmin`,
  `isSupervisor` (inclui admin) e `isSpecialAgent`; permissões nomeadas vêm da RPC
  `user_has_permission` via `RoleService.checkPermission`. Usos no módulo: "mostrar todas" na lista
  (`InboxFilters.tsx:77-79`), escopo de supervisão na busca global
  (`src/components/inbox/useGlobalSearchData.ts:43`), `isAdmin` nas abas de departamento,
  `admin|supervisor` no modo sussurro (`src/components/inbox/WhisperMode.tsx:39`).
- **Download de arquivo:** só pelo hook existente `useDownloadPermission`, que lê
  `profiles.can_download` (`src/hooks/system/useDownloadPermission.ts:12-18`; coluna criada com
  `DEFAULT false` na migration
  `supabase/migrations/20260406200144_ba6fcee1-dcaa-4d77-9595-4d66d8db52d8.sql`). Consumido por `ImagePreview.tsx:22` e
  `MediaPreview.tsx:37`; bloqueio com a mensagem "🔒 Download bloqueado por política de segurança"
  (4 ocorrências no escopo). Nenhum caminho novo de exportar/compartilhar foi encontrado no escopo
  (regra permanente).
- **Canal de departamento:** exige `profile.department_id === conversation.department_id`
  (`src/components/team-chat/TeamChatPanel.tsx:23-27`, com visão bloqueada em 76-77); convites de
  departamento entram pela RPC `accept_department_invite`.
- **Notificação de mensagem de equipe:** `shouldNotifyTeamMessage` (`src/lib/teamChatRules.ts:27-45`)
  não notifica o próprio remetente, nem a conversa em foco (com a aba visível), nem conversa silenciada,
  e **exige vínculo de membro** (`membership !== null`) — sem vínculo, não alerta.
- **Contrato de RLS por teste:** `src/hooks/team-chat/__tests__/rls-contract.test.ts` prova que os hooks
  escrevem/lêem **somente colunas e FKs que existem** no banco (esperado lido de
  `supabase/schema-manifest.json`, atual vindo dos hooks reais — linhas 21-31, 132-191). A prova de RLS
  com papel real está marcada como pendente no próprio teste (`it.todo`, linhas 193-195):
  **NÃO VERIFICADO** por teste automatizado nesta área.

---

## 5. Estados de erro e vazio

**Erro (Inbox):**

- Falha de conexão sem cache: tela "Erro de conexão" com `WifiOff` e botão "Tentar novamente"
  (`src/components/inbox/RealtimeInboxView.tsx:208-219`). Com cache válido a tela **não** é engolida
  (R2-INB-015) e aparece a faixa "🚧 Modo offline — exibindo dados em cache"
  (`data-testid="inbox-offline-cache-banner"`, idem 391-403), com o marcador
  `inbox-offline-cache-messages` quando o recorte em cache é o das mensagens.
- Falha ao carregar **as mensagens da conversa**: bloco `role="alert"` "Erro ao carregar as mensagens"
  com retry **daquela consulta** (`inbox.refetchSelectedMessages`, idem 302-310) — existe porque
  `useMessages` termina o `loading` mesmo no erro (R2-INB-024).
- Isolamento por seção: `SectionErrorBoundary` em "Chat" e "Detalhes do Contato"
  (`RealtimeInboxView.tsx:320, 359`).
- Ações com aviso ao usuário (amostra verificada no código): "Erro ao enviar mensagem",
  "Erro ao enviar áudio. Tente novamente." (`src/hooks/inbox/useRealtimeInbox.ts:186`),
  "Selecione uma conversa primeiro" (idem 179), "Erro ao deletar mensagem", "Erro ao marcar como lida",
  "Erro ao transferir conversa", "Download bloqueado por política de segurança",
  "Ação indisponível — tente recarregar a página".
- Envio com falha **rejeita** a promessa de propósito, para o editor não limpar e não anunciar sucesso
  falso (`useRealtimeInbox.ts:160-165`); falha de *refresh* após envio confirmado é só logada
  (não sugere reenvio — evita duplicidade, linhas 167-173).

**Vazio:**

- Painel sem conversa: `InboxEmptyChat` — "Selecione uma conversa" + dicas `↑↓` / `Enter` / `⌘K`
  (`src/components/inbox/InboxEmptyChat.tsx:32-51`).
- Lista: por tipo de contato ("Nenhum chat individual encontrado", "Nenhum grupo encontrado", …) e,
  sem busca, "Sem conversas" / com busca, "Nenhuma conversa encontrada"
  (`ConversationListSidebar.tsx:238-251`).
- Abas: na de Arquivos, "Nenhum arquivo nesta conversa"
  (`src/components/inbox/tabs/FilesContent.tsx:242`) e "Nenhum arquivo deste tipo" (idem 231);
  na de Tarefas, "Nenhuma tarefa aberta com este contato"
  (`src/components/inbox/tabs/TasksTab.tsx:132-135`); na de Notas, o vazio de cada categoria é
  "Nenhum registro ainda" (`src/components/inbox/tabs/NotesTab.tsx:112`), e o cartão "Pendências"
  reaproveita a frase da aba Tarefas no resumo (`NotesTab.tsx:242-245`, `data-testid="tasks-summary"`);
  em CRM 360°, "Sem negociações" (`src/components/inbox/tabs/Crm360Tab.tsx:266`).
- Teams: "Nenhuma conversa" (`TeamConversationList.tsx:127`), tela de boas-vindas "Chat da Equipe" com
  botão "Nova conversa" (`TeamChatView.tsx:73-85`) e, no painel, "Envie a primeira mensagem!" ou
  "Nenhuma mensagem encontrada" quando há busca (`TeamChatPanel.tsx:126`).

---

## 6. Limites e riscos conhecidos

1. **FATOR X desligado por constante.** "FATOR X" é o nome que o próprio código dá ao banco externo da
   Evolution (`src/hooks/integrations/useExternalEvolution.ts:2` — "external FATOR X DB"; idem
   `src/hooks/inbox/useRealtimeInbox.ts:26`). `USE_EXTERNAL_DB = false` (`useRealtimeInbox.ts:21`):
   todo o caminho de banco externo existe no código e **nunca é exercitado**. **NÃO VERIFICADO** em runtime.
2. **Tetos de carga.** `SEEDED_CONTACT_LIMIT = 500`, `RECENT_MESSAGES_LIMIT = 1000`,
   `CONTACT_FETCH_CHUNK_SIZE`/`CONTACT_SUMMARY_CHUNK_SIZE = 200`
   (`src/services/realtime.service.ts:21-26`) e `MESSAGES_PAGE_SIZE = 1000`
   (`src/hooks/chat/useMessages.ts:18`). A amostra global é truncada por desenho; o agregado por contato
   (`get_inbox_contact_summaries`) só é consultado quando a amostra bate no teto; se a RPC não existir
   no ambiente, a lista volta ao comportamento anterior e uma conversa pode aparecer vazia
   (`realtime.service.ts:117-124`).
3. **`department_whatsapp_configs` sem lastro em migrations nem nos snapshots** (§3.2). A gravação de
   WhatsApp do departamento tende a falhar com erro de relação inexistente; há uma RPC
   `set_department_whatsapp_config` no banco que o módulo não usa. **NÃO VERIFICADO** contra o banco vivo.
4. **RPCs do banco sem uso no front** (§3.2, 13 funções) e leitura direta de `team_messages`: a mesma
   verdade (página de mensagens, busca, marcação de lida) tem caminho de tabela e caminho de RPC.
   Risco de divergência e de consulta pesada sem paginação no servidor.
5. **Chamada direta ao Supabase dentro de 21 componentes** do escopo (contra a camada de serviços em
   `src/services/`): dificulta contrato único e teste; parte está coberta por testes, parte não.
6. **RLS provada só por nome/hash do manifest e por contrato de colunas** (`rls-contract.test.ts`),
   sem execução contra Postgres com papel real (`it.todo`). **NÃO VERIFICADO** de ponta a ponta.
7. **Selo de canal/origem legado na lista.** `VirtualizedRealtimeList.tsx:54-61, 362` ainda renderiza um
   selo para `channel_type` diferente de `whatsapp` (instagram, messenger, telegram, webchat, email,
   linkedin), com cores literais fora dos tokens do sistema. Não é selo do WhatsApp e não há selo de
   origem de arquivo/mensagem — mas é um resíduo da UI multicanal antiga na contramão da regra
   permanente. Registrado, **não corrigido** (fora do escopo deste cartão).
8. **Duas verdades de status.** `StatusChips` conta "Resolvidas" por conversa **sem mensagens**
   (`conversations.filter(c => c.messages.length === 0)`, `StatusChips.tsx:41`) enquanto o status
   canônico está em `contacts.conversation_status` (coluna existente). Contagem de chip e status de
   negócio podem divergir.
9. **SLA lido de embed acumulado.** `conversation_sla` vem no `select` como lista (histórico se
   acumula no banco); pegar a linha errada mostraria "SLA violado" de atendimento já resolvido —
   comentário explícito em `VirtualizedRealtimeList.tsx:365-372`.
10. **`INBOX_360_STATUS.md` / `INBOX_FIDELIDADE_STATUS.md` divergem do código de hoje** em pontos que
    aqueles documentos já registram (ex.: plano cita `VirtualizedConversationList.tsx`; o arquivo real é
    `VirtualizedRealtimeList.tsx`; `scripts/ci/typecheck-ratchet.mjs` quebrado à parte do Inbox). Este
    documento descreve o módulo, não substitui o acompanhamento de fase.
11. **Consistência de nomes de aba:** o código usa `orders` como id da aba cujo rótulo é **SalesView**
    (`ConversationTabs.tsx:25`) e `history` para o rótulo **Journey** (linha 26); ids antigos
    (`orders-tab`) e testes antigos convivem com o rótulo novo.

---

## 7. Testes existentes (caminhos)

Total no escopo: **161 arquivos de teste**, por pasta:

| Pasta | Arquivos |
|---|---|
| `src/components/inbox/` (inclui `chat/`, `tabs/`, `contact-details/`, `location-picker/`, `media-gallery/`, `quick-replies/`, `conversation-list/`) | 115 |
| `src/hooks/chat/__tests__/` | 17 |
| `src/hooks/inbox/__tests__/` | 10 |
| `src/components/team-chat/__tests__/` | 8 |
| `src/hooks/team-chat/__tests__/` | 10 |
| `src/hooks/realtime/__tests__/` | 1 |

Representativos do que já está coberto:

- Painel/lista: `RealtimeInboxView.pagination|offline-cache|selectedMessagesError.test.tsx`,
  `ConversationListSidebar.test.tsx`, `ConversationTabs.test.tsx`,
  `VirtualizedRealtimeList.displayName|.test.tsx`, `resolveActiveTab.test.ts`.
- Chat: `ChatPanel.atalhos-busca|scheduled-media|typing-presence.test.tsx`,
  `ChatMessagesArea.loop|pagination.test.tsx`, `useChatPanelHandlers.*` (5),
  `MessageBubble.contrasteStatus|saveReceivedSticker.test.tsx`, `ChatWatermark.test.tsx`.
- Abas e arquivos: `tabs/__tests__/FilesTab.*` (~14 arquivos), `AiTab`, `Crm360Tab`, `NotesTab`,
  `TasksTab`, `SalesViewTab`, `JourneyTab`, `FileCard`, `fileDisplay`, `filesSort`.
- Hooks de dados: `useMessages.media|overlay`, `useRealtimeInbox.*` (3),
  `useInboxFilters.*` (3: dia-local, janela-global, snooze-consumo), `useContactMedia*`,
  `useConversationHistoryTimeline.*`, `messageSender.reply`.
- Equipe: `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts|exhaustive-audit.test.ts|notifications-mount.test.ts`,
  `TeamChatPanel.wiring.test.tsx`, `useTeamChatPanel.*` (4),
  `src/hooks/team-chat/__tests__/rls-contract.test.ts`, `useTeamMessages.*` (2),
  `useDepartmentManagement`, `useTeamPerformance`, `src/hooks/team-chat/__tests__/uploadTeamMedia.test.tsx`.
- **Não existe**, no escopo, e2e autenticado do Inbox/Teams nem teste de acessibilidade/celular — é o
  que os cartões Y09/Y13 do plano de 07/10 vão cobrir (§9).

---

## 8. Arquivos-chave com caminhos

**Entrada e visão geral**

- `src/pages/ViewRouter.tsx` (view `inbox` linha 46, view `team-chat` linha 88)
- `src/App.tsx` (listener global do Teams, linhas 44-46 e 65)
- `src/services/navigation.service.ts` (menu/atalhos e permissões exigidas)
- `src/components/inbox/RealtimeInboxView.tsx` (tela do Inbox; erro/offline/atalhos)
- `src/components/team-chat/TeamChatView.tsx` + `TeamChatNotificationsListener.tsx`

**Lista e filtros**

- `src/components/inbox/ConversationListSidebar.tsx`, `InboxFilters.tsx`,
  `conversation-list/StatusChips.tsx`, `TicketTabs.tsx` (reexport), `VirtualizedRealtimeList.tsx`,
  `BulkActionsToolbar.tsx`, `ContactTypeFilter.tsx`, `conversation-list/`

**Painel da conversa**

- `src/components/inbox/ChatPanel.tsx`, `src/components/inbox/chat/` (ConversationTabs,
  ConversationTabContent, ChatMessagesArea, MessageBubble, ChatInputArea, ChatSearchBar,
  useChatPanelHandlers), `src/components/inbox/tabs/` (8 abas + arquivos),
  `src/components/inbox/contact-details/`, `InboxEmptyChat.tsx`, `GlobalSearch.tsx`,
  `NewConversationModal.tsx`, `CloseConversationDialog.tsx`

**Hooks**

- `src/hooks/inbox/useRealtimeInbox.ts` (fachada do Inbox), `useInboxFilters.ts`, `useInboxUIState.ts`,
  `useInboxBulkActions.ts`
- `src/hooks/chat/useMessages.ts`, `useRealtimeMessages.ts`, `useConversationActions.ts`,
  `useTypingPresence.ts`, `useConversationTabCounts.ts`, `useChatSearch.ts`
- `src/hooks/realtime/realtimeUtils.ts`, `messageSender.ts`, `useMessageUpdateBatcher.ts`
- `src/hooks/team-chat/useTeamConversations.ts`, `useTeamMessages.ts`, `useTeamChatMutations.ts`,
  `useTeamMemberDetails.ts`, `useDepartmentManagement.ts`

**Dados e serviços**

- `src/services/realtime.service.ts` (carga inicial, agregado por contato, marcar lidas)
- `src/services/chat.service.ts`, `src/services/outbound-message.service.ts` (dependências usadas pelos
  hooks do Inbox, fora do escopo desta documentação)
- `src/hooks/chat/useTeamChat.ts` (ponte do Teams), `src/lib/teamChatRules.ts` (regras de criação,
  limite de arquivo, decisão de notificação)
- `src/hooks/system/useDownloadPermission.ts` (único caminho de download)
- `supabase/schema-catalog.json`, `supabase/schema-manifest.json` (conferência de nomes)
- `src/hooks/team-chat/uploadTeamMedia.ts` (bucket `team-chat-files`; o único `uploadTeamMedia.ts`
  do repositório — não existe cópia em `src/components/team-chat/`)

---

## 9. Planos relacionados de 07/10

| Plano (em `docs/plans/`) | Relação com este módulo |
|---|---|
| `PLANO_FILTRO_DATA_ARQUIVOS_8_ETAPAS_2026-10-07.md` | filtro por data na aba **Arquivos** do painel da conversa |
| `PLANO_AUDIO_PLAY_NO_CARTAO_6_ETAPAS_2026-10-07.md` | play/pause direto no cartão de áudio da aba Arquivos |
| `PLANO_MINIATURAS_E_FIGURINHAS_ARQUIVOS_2026-10-07.md` | miniaturas na aba Arquivos |
| `PLANO_JANELA_ARQUIVO_MENOR_5_ETAPAS_2026-10-07.md` | janela de visualização do arquivo menor |
| `PLANO_CARTAO_ARQUIVO_MOCKUP_REMETENTE_60_ETAPAS_2026-10-07.md` | cartão de arquivo com quem enviou (não é selo de canal/origem) |
| `PLANO_REMOVER_COLUNAS_6_8_ARQUIVOS_4_ETAPAS_2026-10-07.md` | layout de colunas da aba Arquivos |
| `PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS_2026-10-07.md` | aba **Journey** (histórico da conversa) completa |
| `PLANO_FUSAO_QUADRO_TAREFAS_50_ETAPAS_2026-10-07.md` | E13 toca `src/components/inbox/tabs/Crm360Tab.tsx` (botões que abrem Tarefas) |
| `PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md` | Y13 (A11Y/celular de Chat, Inbox e Teams), Y01/Y08 (testes que faltam no inbox/equipe), Y24/Y25/Y27/Y28/Y29 (segurança em leitura), Y19 = este documento |
| `docs/design/ANALISE_LIGACOES_WHATSAPP_2026-10-07.md` | telefonia (fronteira; não é deste módulo) |

Planos mais antigos que continuam valendo como histórico do módulo:
`docs/design/PLANO_INBOX_360_CONVERSA.md`, `docs/design/PLANO_INBOX_FIDELIDADE_CARVAO.md`,
`docs/design/PLANO_SALESVIEW_JOURNEY_50_ETAPAS_2026-10-02.md`,
`docs/design/PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS_2026-10-01.md` e os dois status citados no
cabeçalho.
