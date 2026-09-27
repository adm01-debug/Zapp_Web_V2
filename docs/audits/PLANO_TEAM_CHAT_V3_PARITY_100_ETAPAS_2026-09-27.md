# PLANO — Team Chat: paridade de padrão e arquitetura com o Zapp Web V3 (100 etapas)

**Data:** 2026-09-27 · **Status:** PLANEJADO — nada executado ainda
**Origem:** análise exaustiva do módulo Team Chat do `adm01-debug/Zapp_Web_V3` (25 arquivos, ~4.890 linhas)
cruzada com o estado atual do módulo no V2 (12 arquivos, ~1.660 linhas) e com o banco de produção dos dois lados.
**Banco alvo:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud — seção 1 do CLAUDE.md). Schema `public`.
**Regra de ouro:** toda migration segue a regra 6 da seção 1 do CLAUDE.md
(arquivo → PR → merge em `main` → apply via `db_query` + ledger no mesmo turno, com
`register-migration.mjs` gerando o SQL exato) — **nunca** DDL de branch aberto.

---

## Contexto e princípios

### O que o V3 tem e o V2 não tem (resumo da análise)

| Área | V3 | V2 hoje |
|---|---|---|
| Componentes | 25 arquivos: Item de mensagem extraído, reações, status, departamentos (4 views), transferência, performance, stats | 12 arquivos: mensagens renderizadas inline no Panel, sem reações/status/departamentos |
| Hooks | Domínio em `features/inbox/hooks/team-chat/` + fachadas; fábrica `queryKeys`; paginação infinita keyset (50/pág) | Hooks planos; chaves literais; `limit(200)` **ascendente** (conversas longas nunca mostram as novas) |
| Banco | `team_message_receipts`, `media_bucket`/`media_path`, unique parcial de canal por depto | Tabelas base + reações + `status` + departamentos já existem; faltam receipts, bucket/path, RPCs de lote |
| UX | Virtualização (tanstack-virtual), busca server-side ⌘K, filtros na lista, chips, estatísticas, empty states com motion | Busca local sobre 200 msgs, sem filtros, sem virtualização |

### Defeitos CONHECIDOS do V3 que este plano corrige em vez de portar

1. **Realtime mudo**: no V3 nenhuma tabela `team_*` está na publication — todos os canais são inertes. No V2, `team_messages` JÁ está na publication; o plano completa o que falta.
2. **RLS quebrada no V3**: `team_conversations` sem policy de INSERT/UPDATE (criar conversa falha); membros só veem a própria linha. O V2 tem policies funcionais — o plano não regride para o modelo do V3.
3. **Scroll aninhado**: dois contêineres `overflow-auto` empilhados; `fetchNextPage` quase nunca dispara. O port usa contêiner único com `onNearTop`/`onAtBottomChange`.
4. **Mark-as-read com N UPDATEs** em `team_messages.status` por mensagem alheia. Substituído por `last_read_at` (1 UPDATE) + receipts em lote.
5. **`departments.whatsapp_api_key` legível por qualquer autenticado** no V3. O V2 já revogou as colunas e tem a RPC `get_department_whatsapp_credentials` — manter esse modelo.
6. **Permissão de transferência por string** (`department === 'Suporte'` hard-coded). Trocar por checagem de `user_roles`.
7. **Colar imagem grava só signed URL de 7 dias** (sem bucket/path) — a imagem morre depois. Corrigido na origem.
8. **Auditoria de depto grava só `profile_id`** e a view espera `profile_name` (sai "Desconhecido"). Gravar o nome no `details`.
9. Código morto do V3 (`TeamChatMessageRow`, `MessageReactions` do team-chat, `LockedDeptView` duplicado, `useTeamPermissions` sem uso) **não** é portado.

### Bugs ATIVOS do V2 que o plano conserta (bloqueadores)

1. **Upload negado por RLS**: o caminho usa `profile.id`, a policy do bucket `team-chat-files` exige `auth.uid()` (em `profiles`, `id` ≠ `user_id`). Afeta anexo, áudio gravado e imagem colada.
2. **Marcar como lida / silenciar sem efeito para agentes**: UPDATE em `team_conversation_members` é só admin/supervisor (a policy "own membership" foi removida). O contador de não lidas nunca zera.
3. **Ordenação da lista quebrada**: o touch de `team_conversations.updated_at` só passa para o criador e não há trigger no INSERT de mensagem.
4. **`limit(200)` ascendente** em `useTeamMessages`: conversas com >200 mensagens mostram as antigas para sempre.
5. **Última mensagem via `limit(N*2)` global** (conversas quietas ficam sem preview) + **N queries de count** para não lidas.
6. **FK `reply_to_id` sem `ON DELETE`**: excluir mensagem respondida falha.
7. **Preview de reply renderizado 2× na mesma bolha** (`TeamChatPanel.tsx`).
8. **Notificações só com a view aberta**; canais com nome fixo escutando a tabela inteira; sem badge de Teams na sidebar.

### Regras de execução (valem para TODAS as etapas)

- **Uma PR por bloco de fase** (indicado em cada fase), branch nova por PR, diff mínimo.
- DDL: arquivo em `supabase/migrations/` + PR + merge + apply por `db_query` com `INSERT` no ledger na mesma transação + `schema-catalog.json` + `supabase-usage-guard.mjs` com `novas: 0` + paridade arquivos↔ledger. Publication: atualizar `scripts/db-audit/realtime-publication-baseline.json` e `runtime-config.test.sh` no MESMO PR.
- Editar qualquer arquivo do módulo exige atualizar os hashes em `scripts/ci/eslint-baseline.json` (8 entradas do team-chat) — preferir zerar as violações a re-fixar o hash.
- Toasts: padronizar `sonner` (o V3 mistura os dois sistemas).
- Strings em pt-BR fixas, como no restante do V2 (o i18n do V2 não tem chaves do módulo; não criar agora — registrado na E96).
- Tokens de tema sempre (`bg-inbox-panel`, `chat-*`); **nunca** cor fixa sem variante (lição dos PRs #755/#771/#774).

---

## FASE 0 — Verificação ao vivo e decisões (E01–E08)
*PR desta fase: nenhuma (somente leitura + registro de decisões neste arquivo).*

- [ ] **E01** — Congelar o escopo: paridade funcional com o Team Chat do V3, com os 9 defeitos do V3 listados acima corrigidos e os 8 bugs do V2 eliminados. Fora do escopo desta rodada: comandos "/", fila offline com retry por mensagem, tradução i18n.
- [ ] **E02** — Validar ao vivo no banco oficial (`db_list_policies`, `db_describe_table`) o estado real de `team_conversations`, `team_conversation_members`, `team_messages`, `team_message_reactions`, `departments`, `department_invitations` — confirmar que os achados da análise (policies, índices, publication) batem com produção antes de escrever qualquer migration.
- [ ] **E03** — Reconciliar os 2 drifts documentados: `team_conversations.metadata` existe no banco sem migration; `team_message_reactions` está na publication sem migration de `ADD TABLE`. Criar os arquivos-espelho (sem aplicar nada novo) e registrar no ledger se faltarem.
- [ ] **E04** — Decisão de modelo de leitura (registrar aqui): `last_read_at` continua sendo a fonte do badge de não lidas (1 UPDATE ao abrir); tabela nova `team_message_receipts` passa a alimentar os ticks entregue/lida por leitor e as estatísticas. Não portar o modelo do V3 (N UPDATEs em `status`).
- [ ] **E05** — Decisão de presença: usar `agent_presence` + `useAgentPresenceMap()` (já montado no `AppShell.tsx:60` do V2 e na publication) para "Online" real. Nunca `profiles.is_active`.
- [ ] **E06** — Decisão de departamentos: aproveitar `departments`, `department_invitations`, `profiles.department_id` e a RPC `get_department_whatsapp_credentials` já existentes no V2. Segredos de WhatsApp nunca via SELECT direto.
- [ ] **E07** — Inventariar os componentes do inbox V2 reutilizáveis no port (já usados hoje pelo módulo: RichTextToolbar, AIRewrite, StickerPicker, AudioMemePicker, VoiceChanger, CustomEmoji, AudioRecorder, VoiceDictation, MentionAutocomplete; a portar o padrão: `MessageStatus`, `useTypingPresence`, `useResolvedStorageUrl`) e confirmar as assinaturas.
- [ ] **E08** — Registrar baseline de comportamento atual (screenshots das 3 colunas em light/dark + lista dos fluxos que funcionam hoje) para comparação de regressão no fechamento (E90/E98).

## FASE 1 — Banco: bloqueadores e fundação (E09–E24)
*PRs desta fase: 3 blocos — (a) correções E09–E13, (b) estruturas novas E14–E19, (c) publication/storage/limpeza E20–E23. Cada bloco = 1 PR + apply no mesmo turno do merge. E24 fecha.*

- [ ] **E09** — Migration: recriar a policy de UPDATE do próprio membro em `team_conversation_members` (`profile_id = meu profile` via `user_id = auth.uid()`), colunas `last_read_at`/`is_muted`. Corrige "marcar como lida" e "silenciar" para agentes (bug bloqueador nº 2).
- [ ] **E10** — Migration: trigger `AFTER INSERT ON team_messages` que faz touch em `team_conversations.updated_at` (SECURITY DEFINER). Remove a dependência do UPDATE do criador e conserta a ordenação da lista (bug nº 3). O touch feito pelo cliente em `useSendTeamMessage` sai depois (E31).
- [ ] **E11** — Migration: `ALTER TABLE team_messages ... reply_to_id ... ON DELETE SET NULL` (recriar a FK). Corrige exclusão de mensagem respondida (bug nº 6); a UI mostra "Mensagem apagada" na citação órfã (E37).
- [ ] **E12** — Migration: CHECKs de integridade — `status IN ('sent','delivered','read','failed')` (alinhado ao normalizador da E36), `message_type` e `media_type` com listas fechadas, `char_length(content) <= 10000`.
- [ ] **E13** — Migration: colunas `media_bucket text` e `media_path text` em `team_messages` (paridade com o banco do V3; mídia re-assinável para sempre, sem depender de signed URL de 7 dias).
- [ ] **E14** — Migration: tabela `team_message_receipts` (`message_id` FK CASCADE, `profile_id` FK CASCADE, `status`, `delivered_at`, `read_at`, UNIQUE `(message_id, profile_id)`, índice parcial `status <> 'read'`). RLS: SELECT para membros da conversa; INSERT/UPDATE só na própria linha.
- [ ] **E15** — Migration: `team_conversation_members` ganha `is_pinned boolean`, `is_archived boolean` e `member_role text default 'member'` (owner/member). Destrava os stubs "Fixar" e "Arquivar" e dá base para renomear grupo/remover membro com permissão (E56).
- [ ] **E16** — Migration: RPC `find_or_create_direct_conversation(other_profile_id)` (SECURITY DEFINER, atômica) + índice único que impeça chat direto duplicado. Elimina a checagem N+1 client-side de `useCreateTeamConversation` e a corrida entre duas sessões criando o mesmo chat.
- [ ] **E17** — Migration: RPC `get_team_unread_counts()` — devolve `(conversation_id, unread_count)` de todas as minhas conversas em 1 chamada, com base em `last_read_at`. Mata as N queries de count (bug nº 5).
- [ ] **E18** — Migration: RPC `get_team_conversation_previews()` — última mensagem por conversa via `LATERAL` (substitui o `limit(N*2)` global que perde conversas quietas).
- [ ] **E19** — Migration: busca server-side — extensão `pg_trgm` (se ausente) + índice GIN em `team_messages.content` + o `ilike` do hook passa a usar esse índice. Sem RPC dedicada: o padrão do V3 (`ilike` sanitizado no hook) é suficiente com o índice.
- [ ] **E20** — Migration: publication realtime — `ADD TABLE team_conversation_members` (voltou a ser necessária: membros/mute em tempo real) e arquivo-espelho do `team_message_reactions` (drift da E03). Atualizar `realtime-publication-baseline.json` + `runtime-config.test.sh` no mesmo PR. `team_messages` já está; `team_conversations` NÃO entra (a lista invalida por evento de mensagem — evitar tráfego de WAL desnecessário).
- [ ] **E21** — Migration: storage `team-chat-files` — padronizar a regra da pasta 1 com o caminho que o cliente vai usar (decisão: cliente passa a enviar `auth.uid()`; policies de INSERT/DELETE permanecem por `auth.uid()`) **e** criar policy de SELECT para membros da conversa (hoje quem recebe o arquivo não pode assiná-lo — mesma lacuna do V3). Corrige o bug bloqueador nº 1 junto com a E33.
- [ ] **E22** — Migration: dropar os 3 índices redundantes (`idx_team_conversation_members_conversation_id`, `idx_team_messages_conversation_id`, `idx_team_message_reactions_message_id` — todos duplicam índices/uniques existentes; o histórico mostra que um deles já foi removido e recriado por engano em `20260906000003`). Registrar no arquivo o motivo para não voltarem.
- [ ] **E23** — Migration: policy de DELETE em `team_conversations` (criador ou admin) — pré-requisito de "Excluir conversa" (E60).
- [ ] **E24** — Fechamento da fase: `types.ts` regenerado (types-sync roda e abre a PR sozinho — não editar à mão), `supabase/schema-catalog.json` atualizado, `node scripts/db-audit/supabase-usage-guard.mjs` com `novas: 0`, paridade arquivos↔ledger (count + md5), `db-live-guard` verde no push da `main`.

## FASE 2 — Infra de dados no front (E25–E34)
*PR desta fase: 1 (hooks). Depende da Fase 1 aplicada.*

- [ ] **E25** — Criar `src/services/api/queryKeys.ts` com a fábrica do V3 (ao menos os namespaces `teamChat.*`, `teamProfiles.*`, `departments.*`) e migrar as chaves literais do módulo (`['team-messages', id]` etc.) para a fábrica. Não migrar o resto do app (zero churn fora do módulo).
- [ ] **E26** — Atualizar `src/hooks/team-chat/teamChatTypes.ts`: `status`, `department_id`, `metadata`, `media_bucket`/`media_path`, `member_role`, `is_pinned`/`is_archived`, tipo `TeamMessageReaction` e `MessageUIStatus` (novo `src/types/messageStatus.ts` se não existir equivalente).
- [ ] **E27** — Refatorar `useTeamConversations`: trocar as 5 consultas encadeadas por `team_conversations` (RLS filtra) + `get_team_conversation_previews()` + `get_team_unread_counts()`; manter `refetchInterval` 30s como rede de segurança; enriquecimento de nome/avatar do chat direto igual ao V3.
- [ ] **E28** — Refatorar `useTeamMessages` para `useInfiniteQuery` com cursor keyset `(created_at, id)` DESC, 50 por página, páginas concatenadas em ordem cronológica (padrão exato do V3). Elimina o `limit(200)` ascendente (bug nº 4).
- [ ] **E29** — Realtime de mensagens: canal `team-messages-<cid>:<sufixo aleatório>`, `INSERT` filtrado por `conversation_id`, append do payload na página 0 + invalidação de `allMessages` (o `sender` chega no refetch). Canal da lista: `team-chat-updates:<sufixo>` em `team_messages` + `team_conversation_members`. Sufixo aleatório evita colisão de canal entre abas (defeito do V2 atual).
- [ ] **E30** — Mark-as-read novo: ao abrir/focar a conversa, 1 UPDATE em `last_read_at` (agora permitido pela E09) + upsert em lote em `team_message_receipts` das mensagens visíveis não lidas. Remover os dois efeitos duplicados do hook atual.
- [ ] **E31** — `useTeamChatMutations`: `useCreateTeamConversation` passa a chamar a RPC da E16 no caso direto; remover o touch manual de `updated_at` (trigger da E10 cobre); adicionar `useUpdateTeamMessageStatus` para `failed` local; toasts sonner; sem mudança de assinatura para os componentes.
- [ ] **E32** — Criar `src/hooks/team-chat/useTeamMessageReactions.ts` no padrão V3: query em 2 passos (ids da conversa → reações), key `teamChat.reactions(cid)`, realtime próprio, toggle otimista com snapshot/rollback e `aggregate(messageId)` devolvendo `{emoji, count, reactedByMe, profileIds}`.
- [ ] **E33** — Corrigir os 3 pontos de upload (`TeamFileUploader.handleUpload`, `useTeamChatPanel.handleAudioSend`, `useTeamChatDraft.handlePaste`): pasta 1 = `auth.uid()` (via `session.user.id`), gravar SEMPRE `media_bucket` + `media_path` na mensagem, e parar de usar `getPublicUrl` em bucket privado — `media_url` vira apenas fallback de exibição.
- [ ] **E34** — Portar `useSignedMediaUrlBatch` (assinatura de mídia em lote com cache e margem de expiração) e integrar com o `useResolvedStorageUrl` existente do V2 sem duplicar caminho de resolução — decidir no code review qual dos dois fica como camada única.

## FASE 3 — Componentes de mensagem (E35–E48)
*PRs desta fase: 2 — (a) extração E35–E42, (b) virtualização/busca E43–E48.*

- [ ] **E35** — Criar `teamChatParts.tsx`: `formatTime`, `formatDateSep` com "Hoje/Ontem" (o V3 tem duas implementações; usar a boa), `MediaContent` completo (image, video, audio, **sticker, emoji, audio_meme** — casos que o `TeamMessageItem` do V3 perdeu — e document com card), `MediaTypeIcon`. Legendas-padrão ("🎨 Figurinha" etc.) ocultas.
- [ ] **E36** — Criar `teamMessageStatus.ts` com `normalizeTeamMessageStatus` (whitelist; desconhecido vira `sent`) + teste unitário portado do V3 (`TeamMessageItem.status.test.ts`).
- [ ] **E37** — Criar `TeamMessageItem.tsx`: bolha com tokens `chat-sent`/`chat-received`, citação de reply (com estado "Mensagem apagada" para órfã da E11), edição inline (Enter salva/Esc cancela), menu de contexto (reagir com grid de 6 emojis, responder, copiar, ouvir, editar/excluir só nas minhas), TTS **com aria-label** e avatar **com alt** (correções sobre o V3).
- [ ] **E38** — Ao extrair o item, eliminar o preview de reply duplicado que existe hoje no `TeamChatPanel` do V2 (bug nº 7) — a renderização inline morre inteira.
- [ ] **E39** — Criar `TeamMessageReactionsWrapper.tsx`: `TeamQuickReactionBarWrapper` (faixa flutuante no hover/foco) + `TeamReactionBar` (pílulas sob a bolha), com `EXTENDED_EMOJIS`, `aria-pressed` e contagens agregadas do hook da E32.
- [ ] **E40** — Ticks de status nas minhas mensagens: reutilizar o `MessageStatus` do inbox V2 com o normalizador da E36 (`scale-75`, cor `text-info` quando lida) — lida = todos os membros com receipt `read` (dados da E14).
- [ ] **E41** — Separador de data como pílula central via `dateFirstIndexes` (primeiro índice de cada dia), no padrão visual do V3.
- [ ] **E42** — Refatorar `TeamChatPanel.tsx`: passa a compor `TeamMessageItem` + wrapper de reações; envolver com `ErrorBoundary` (fallback "Erro ao carregar o chat"); remover todo o markup de mensagem inline. Meta: Panel < 250 linhas.
- [ ] **E43** — Virtualização: criar `ChatScroller` com `@tanstack/react-virtual` (measureElement dinâmico, overscan 10, `scrollToIndex`) com **contêiner único de scroll** expondo `onNearTop`/`onAtBottomChange` — a correção do scroll aninhado do V3 entra por construção, não por remendo.
- [ ] **E44** — Paginação infinita para cima: `onNearTop` → `fetchNextPage` com âncora de scroll (`useLayoutEffect` preservando `scrollHeight - scrollTop`) e linha "Carregando mensagens anteriores…".
- [ ] **E45** — Indicadores de scroll: pílula "Pular para mensagens novas" + botão circular com badge quando chegam mensagens fora da viewport (`hasNewMessagesUnseen`).
- [ ] **E46** — Busca in-chat: barra animada aberta por ⌘K, debounce 400ms, `ilike` sanitizado server-side (índice da E19), contador "N resultado(s)", Esc fecha a busca antes de voltar. Corrigir o comportamento do V3 em que Esc global sai da conversa mesmo com foco no composer.
- [ ] **E47** — Slot de estatísticas colapsável no Panel (`bg-muted/30`) alternando entre `ParticipantStatsGraph` e `TeamPerformancePanel` (componentes chegam na Fase 6; até lá o slot fica atrás dos botões do header desabilitados).
- [ ] **E48** — `AlertDialog` de confirmação ao excluir mensagem (melhoria sobre o V3, que exclui sem confirmar; exclusão continua física, como nos dois projetos).

## FASE 4 — Lista, header e diálogos (E49–E60)
*PRs desta fase: 2 — (a) lista+header E49–E53, (b) diálogos+grupo E54–E60.*

- [ ] **E49** — `TeamConversationList`: chips de filtro Todos/Chats/Grupos/Deptos, busca com debounce 300ms, a11y completa (`listbox`/`option`, `aria-selected/setsize/posinset`), navegação por ↑/↓ e ⌘F focando a busca (padrão V3). Remover o `forwardRef` inútil.
- [ ] **E50** — Item da lista: tempo relativo (`formatDistanceToNow` ptBR), preview com fallback "Canal do departamento"/"Sem mensagens", badge de não lidas alimentado pela RPC da E17, avatar com fallback por tipo (`Building2`/`Users`/`User`), fixadas no topo (E15).
- [ ] **E51** — `TeamChatHeader`: paridade V3 — botões Buscar (⌘K), Adicionar membros (grupo), Estatísticas (grupo/depto), Performance, Detalhes (`PanelRightOpen/Close`), tooltips `side=bottom` com aria-label; ativar "Fixar" e "Arquivar" no menu (colunas da E15, mutações novas).
- [ ] **E52** — Menu do header: Silenciar/Ativar (agora funcional pós-E09); "Transferir departamento" com permissão via `user_roles` (admin/supervisor) — **sem** a string "Suporte" hard-coded do V3.
- [ ] **E53** — Ligar o seletor de voz e velocidade do TTS no header (as props existem e são ignoradas hoje nos DOIS projetos): persistir em `useUserSettings` (`tts_voice_id`, `tts_speed`) como o V3 faz no painel.
- [ ] **E54** — `NewConversationDialog`: adicionar a aba "Departamento" (lista de `useActiveDepartments`, reaproveita canal existente pelo `department_id` — unique parcial garante 1 por depto); manter validações (grupo ≥ 2 outros membros, nome ≤ 60); adicionar `role`/`aria-checked` nas opções (melhoria sobre o V3).
- [ ] **E55** — `AddMembersDialog`: mover a mutação inline para `src/hooks/team-chat/useTeamChatMembers.ts` (`useActiveTeamProfiles` + `useAddConversationMembers` com as invalidações do V3); `role="option"` nos itens.
- [ ] **E56** — Gestão de grupo: renomear, trocar avatar, remover membro (só `member_role='owner'` ou admin), sair do grupo (DELETE da própria linha — policy já existe). Mutações novas em `useTeamChatMembers` + UI no `TeamMemberDetails`.
- [ ] **E57** — `TeamMemberDetails`: seções colapsáveis com "Recolher/Expandir tudo", "Próximos Aniversários" (top 5), ponto de presença **real** via `useAgentPresenceMap` (E05), 🎂 no aniversariante do dia. Query sai do componente para `useTeamMemberDetails` (hook novo, padrão V3).
- [ ] **E58** — `TeamMemberProfileHeader`: badges de papel (admin `destructive`, supervisor `chart-4`, agent `primary`), card de aniversário, "Online/Offline" pela presença real — nunca `is_active`.
- [ ] **E59** — `TransferConversationDialog` + `useTransferTeamConversation`: Select de departamentos ativos (atual desabilitado), metadata `{transferred_at, transferred_by: <profile.id real>, original_department_id}` — sem o "Support Agent" fixo do V3; manter os `data-testid`.
- [ ] **E60** — "Excluir conversa" (policy da E23, confirmação destrutiva) e "Arquivar" filtrando a lista (arquivadas somem do filtro padrão, chip próprio as mostra).

## FASE 5 — Departamentos (E61–E68)
*PR desta fase: 1.*

- [ ] **E61** — Hook `useActiveDepartments` (lista `departments` ativos, key `departmentChat.list`, staleTime 30s).
- [ ] **E62** — Hook `src/hooks/team-chat/useDepartmentManagement.ts`: leituras (profiles por depto, `audit_logs` `entity_type='department'` limit 100, convites pendentes — `enabled` por aba) e mutações (criar/excluir convite, salvar WhatsApp, adicionar/remover membro). Auditoria grava `profile_name` no `details` (correção do defeito nº 8 do V3).
- [ ] **E63** — `DepartmentManagementDialog.tsx`: dialog `max-w-2xl` com segmented control de 4 visões (Membros, Convites, WhatsApp, Auditoria), aberto pelo botão `Settings2` que aparece para admin nos itens de departamento da lista (E49).
- [ ] **E64** — `department-management/DepartmentMembersView.tsx`: busca local, seção "Membros (N)" com Remover e "Outros Colaboradores" com Adicionar (badge "Outro Depto").
- [ ] **E65** — `department-management/DepartmentInvitesView.tsx`: gerar código de 8 caracteres (expira em 7 dias), lista com copiar/excluir. **Completar o que o V3 nunca fez**: RPC `accept_department_invite(code)` (valida expiração/uso, muda `profiles.department_id`, marca `used_at`/`used_by`) + entrada "Entrar via Código" na tela de bloqueio do canal — sem isso o convite é um enfeite. (RPC entra como migration adicional seguindo a regra da Fase 1.)
- [ ] **E66** — `department-management/DepartmentWhatsAppView.tsx`: ModeCards (none/evolution/official) com `aria-pressed`, campos Instance ID/API Key `type=password` lidos via RPC `get_department_whatsapp_credentials` (nunca SELECT — o V2 já revogou as colunas; não repetir o vazamento do V3).
- [ ] **E67** — `department-management/DepartmentAuditView.tsx`: lista com badges Inclusão/Remoção e export CSV **com escape de vírgulas/aspas** (defeito do V3).
- [ ] **E68** — Canal de departamento no Panel: bloqueio "Conteúdo Protegido" para não-membros (admin passa; membro = `department_id` do profile), com os cards "Solicitar Acesso" e "Entrar via Código" (ligado à E65) — implementação única, sem a duplicação de markup do V3.

## FASE 6 — Estatísticas e performance (E69–E73)
*PR desta fase: 1.*

- [ ] **E69** — Hook `useTeamPerformance(cid)`: `team_messages (id, created_at, status)` dos últimos 30 min, `limit 2000`, key `teamChat.performance(cid)`, staleTime 30s.
- [ ] **E70** — `TeamPerformancePanel.tsx`: 3 KPIs (msgs/min, intervalo médio, % entregues/lidas), LineChart por minuto, BarChart por status, export JSON, estados de loading/erro/vazio honestos. Grid do Recharts com token de tema (`hsl(var(--border))`) — não o `rgba(255,255,255,0.05)` do V3 que some no claro.
- [ ] **E71** — Hook `useParticipantStats(cid)`: mensagens por remetente + `team_message_receipts` (agora com dados reais via E30 — no V3 o gráfico só mostrava "Enviadas" porque a tabela estava vazia).
- [ ] **E72** — `ParticipantStatsGraph.tsx`: BarChart Enviadas/Entregues/Lidas com cores por token (`--primary`/`--success`/`--warning`), modo simulação atrás de `settings.simulation_mode_enabled` com selo "(MODO SIMULAÇÃO)".
- [ ] **E73** — Instrumentação: `usePerformanceMetrics('TeamChatPanel')` (se o util existir no V2; senão, log de render > 16ms em dev apenas — não criar infraestrutura nova).

## FASE 7 — Notificações, presença e digitação (E74–E82)
*PR desta fase: 1.*

- [ ] **E74** — Badge "Teams" na sidebar: total de não lidas via RPC da E17, no mesmo mecanismo do badge de `inbox` (`Sidebar.tsx:109`), atualizado pelo realtime da lista.
- [ ] **E75** — Mover o listener de notificações do `TeamChatView` para o nível do `AppShell` (hook global): notificação chega em qualquer tela, não só com o módulo aberto (bug nº 8).
- [ ] **E76** — Som + notificação do navegador: manter o pipeline atual do V2 (`useTeamChatNotifications` com acorde + `usePushNotifications`), mas filtrar por membership usando o cache de conversas já carregado (sem a query extra por evento) e canal com sufixo aleatório.
- [ ] **E77** — "Digitando…": adaptar `useTypingPresence` do inbox para canal broadcast por conversa (`team-typing-<cid>`), indicador no header e na lista. Nem o V3 tem — entra como paridade com o inbox do próprio V2.
- [ ] **E78** — Presença online nos itens da lista e no header (ponto verde via `useAgentPresenceMap`), consistente com E57/E58.
- [ ] **E79** — Menções `@`: `MentionAutocomplete` alimentado pelos **membros da conversa** (hoje usa a lista do inbox) e INSERT em `app_notifications` para o mencionado ao enviar (no V3 a menção é só texto).
- [ ] **E80** — Rascunhos: manter `localStorage` (`team_draft_<id>`, debounce 500ms, limpo no envio) — paridade já existente; garantir que o `handlePaste` corrigido (E33) preserva o rascunho de texto ao colar imagem.
- [ ] **E81** — `is_muted` passa a ter efeito: silencia som/notificação do navegador e o toast, mantém o badge numérico (padrão WhatsApp).
- [ ] **E82** — Revisão do fluxo de push existente (`usePushNotifications`): notificação exibida leva à conversa certa via `?view=team-chat` + seleção — sem novo backend de push nesta rodada.

## FASE 8 — Design, tema e acessibilidade (E83–E90)
*PR desta fase: 1.*

- [ ] **E83** — Tokens: módulo inteiro passa a usar `bg-inbox-panel`, `chat-sent`/`chat-received` (+`-foreground`), `chat-header`, `chat-input-bg` — os tokens já existem em `src/styles/tokens.css` e o inbox do V2 já os usa; o team chat hoje usa `bg-background`/`bg-card` genéricos. Nenhuma cor fixa sem variante de tema (lição #755/#771/#774: `bg-black` puro quebrou o light mode com contraste 1.24:1).
- [ ] **E84** — Header com altura padronizada (56px mobile / 65px desktop, `role="banner"`) e `pr` reservado para o botão "Zen" absoluto do AppShell — mesmo contrato do V3/inbox.
- [ ] **E85** — Auditoria de contraste WCAG AA (≥ 4.5:1) nas bolhas, badges e painéis nos 3 temas do V2 (light, dark, alto contraste) — checar principalmente `chat-received` no claro e os `text-[10px]` de metadados.
- [ ] **E86** — Empty states com motion (fade+scale, badge flutuante animado, CTA `rounded-xl shadow-primary/20`) e skeletons (5 linhas na lista, 4 bolhas alternadas no painel) — padrão visual do V3.
- [ ] **E87** — Mobile: lista some com conversa aberta (`hidden md:flex`), botão voltar, vibração de 50ms no envio, toolbar do composer rolável com `role="toolbar"`, FAB oculto no módulo (já existe no `MobileShell`).
- [ ] **E88** — Acessibilidade fina: `role="log"` + `aria-live="polite"` na área de mensagens, aria-label no botão TTS, `alt` nos avatares, focus trap no preview de upload (trocar o overlay caseiro pelo `Dialog` do shadcn), Esc não sai da conversa com foco no composer, ações de mensagem alcançáveis por teclado (faixa de reações focável).
- [ ] **E89** — Container queries (`@container/team-chat`, `@container/msg`) para a largura das bolhas e da faixa de reações, como no V3 (plugin já disponível via Tailwind).
- [ ] **E90** — Revisão visual final contra o baseline da E08 e contra o V3: screenshots das 3 colunas em light/dark, filtros, diálogos e estados vazios; divergências viram follow-up, não bloqueiam.

## FASE 9 — Testes, governança e fechamento (E91–E100)
*PRs desta fase: 2 — (a) testes E91–E95, (b) fechamento E96–E100.*

- [ ] **E91** — Substituir os testes-placeholder do módulo (219 `expect(true).toBe(true)` em `team-chat-comprehensive.test.ts` + 52 triviais no de security-gaps) por testes reais de hooks com Supabase mockado — modelo: `src/hooks/__tests__/useMessageReactions.test.tsx` do próprio V2 e o `team-chat-comprehensive.test.tsx` do V3 (1.940 linhas, mocka o client).
- [ ] **E92** — Testes RTL dos componentes novos: `TeamMessageItem` (bolha, reply, edição, menu), `TeamMessageReactionsWrapper` (toggle otimista), `TeamConversationList` (filtros, teclado), `teamMessageStatus` (já na E36).
- [ ] **E93** — Teste de contrato RLS lido das migrations (padrão do V3): policies esperadas de `team_*` e das policies de storage — falha se alguém remover a policy da E09/E21 no futuro.
- [ ] **E94** — Atualizar `scripts/ci/eslint-baseline.json`: os 8 arquivos do módulo fixados por hash vão mudar — zerar as violações reais nos arquivos tocados e só re-fixar o que for herdado; nunca inflar o baseline.
- [ ] **E95** — E2E Playwright: spec `team-chat.spec.ts` (abrir módulo, criar conversa direta com o contato de teste, enviar mensagem, reagir, marcar como lida) — verificar antes se o usuário de teste enxerga "Teams" (lição do `talkx.spec.ts`, que está fora do CI porque o usuário não vê "Campanhas"); se enxergar, habilitar no `e2e-logado.yml`.
- [ ] **E96** — Registrar a decisão de i18n: strings do módulo permanecem em pt-BR fixo (o `i18n/index.ts` do V2 não tem chaves do módulo e só 1 arquivo do app usa `useTranslation` — criar chaves agora seria churn sem consumidor). Anotar como dívida se a internacionalização virar requisito.
- [ ] **E97** — Validação de banco de fechamento: `supabase-usage-guard.mjs` `novas: 0`, paridade tripla (arquivos ↔ ledger ↔ catálogo), `db-live-guard` verde na `main`, publication conferida ao vivo contra o baseline.
- [ ] **E98** — Teste funcional assistido em produção com 2 usuários reais (checklist: direto, grupo, canal de depto, anexo + áudio + imagem colada, reação, reply, edição, exclusão, mute, fixar, transferir, badge da sidebar, notificação com o módulo fechado, mobile). Só aqui o módulo é declarado "pronto" (pronto = mergeado + deploy + comportamento verificado).
- [ ] **E99** — Faxina final: remover stubs e código morto remanescentes do módulo, remover os testes-regex de `team-chat-exhaustive-audit.test.ts` que ficaram obsoletos, conferir `bun run lint`/`typecheck`/`test` e os 7 required checks verdes.
- [ ] **E100** — Encerramento: atualizar o CLAUDE.md do V2 (estado do módulo, decisões E04/E05/E96), registrar neste arquivo o checklist final com os links das PRs mergeadas, e listar os follow-ups fora de escopo (comandos "/", retry offline por mensagem, i18n, recibos "played" para áudio).

---

## Mapa de PRs previsto (12 PRs, uma por bloco)

| Bloco | Etapas | Conteúdo | Risco |
|---|---|---|---|
| 1 | E09–E13 | Migrations de correção (RLS membros, trigger, FK, CHECKs, colunas de mídia) | **DDL produção — PR aberta aguarda Joaquim (regra 8 do fluxo Git)** |
| 2 | E14–E19 | Migrations de estrutura (receipts, pin/archive, RPCs, índice de busca) | **DDL produção — idem** |
| 3 | E20–E23 | Publication, storage policies, limpeza de índices, policy DELETE | **DDL produção — idem** |
| 4 | E25–E34 | Hooks e infra de dados | CI normal |
| 5 | E35–E42 | Extração de componentes de mensagem | CI normal |
| 6 | E43–E48 | Virtualização, paginação, busca | CI normal |
| 7 | E49–E53 | Lista e header | CI normal |
| 8 | E54–E60 | Diálogos e gestão de grupo | CI normal |
| 9 | E61–E68 | Departamentos (inclui 1 migration da RPC de convite) | DDL na E65 |
| 10 | E69–E73 | Estatísticas e performance | CI normal |
| 11 | E74–E82 | Notificações, presença, digitando | CI normal |
| 12 | E83–E100 | Design/a11y + testes + fechamento (2–3 PRs) | CI normal |

**Ordem obrigatória:** blocos 1–3 antes de tudo (o front das fases 2+ depende das colunas/RPCs).
Dentro das fases de front, os blocos são paralelizáveis com cuidado de não tocar os mesmos arquivos.

*Plano criado em 2026-09-27 a partir de análise ao vivo dos dois repositórios e do banco de produção do V3. Nenhuma etapa foi executada.*
