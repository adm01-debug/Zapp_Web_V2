Task t_a4e3109e: feat(hooks): Arquivar grava o estado arquivada (set_conversation_status) com Desfazer
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a4e3109e
  max-retries: 2 (default)
  created:   2026-10-11 10:54 by claude
  started:   2026-10-11 12:17
  parents:   t_598cbd7d

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: hugo`.
Origem: pedido do Joaquim em 11/10/2026 (decisões: Arquivar passa a gravar o estado arquivada em ordem segura, e contadores dos chips pelo mesmo critério da lista) (plano: docs/plans/PLANO_ARQUIVAR_E_CONTADORES_2026-10-11.md). Antes de mexer, confira no código ATUAL (dia/2026-10-11) o que existe e reaproveite. Se já estiver feito, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Sem migration, sem Edge Function, sem dependência nova. Fique estritamente nos arquivos listados no cartão.

DEPENDÊNCIA: este cartão só começa depois dos cartões pai. Se o que eles criam não estiver no seu workspace, o pai ainda não integrou: localize o commit em ~/hermes-workspaces/.v2-fila/*.json (campo `cartao` igual ao id do pai), traga com git cherry-pick <sha> se `git merge-base --is-ancestor <sha> HEAD` falhar, e siga. Se não achar, bloqueie dizendo qual.

PROBLEMA
Hoje archiveContact (src/hooks/chat/useConversationActions.ts) e bulkArchive (src/hooks/inbox/useInboxBulkActions.ts) só fazem contacts.assigned_to = null, então a conversa nunca vira 'archived' e o chip Arquivadas (cartões B1/B2) fica sempre em 0. A RPC public.set_conversation_status(p_contact_id uuid, p_next text, p_reason text) já existe em produção (SECURITY DEFINER, executável por authenticated) e o ADR-005 manda que transições passem por ela; o front ainda não a chama em lugar nenhum. Decisão do Joaquim (11/10/2026): Arquivar passa a gravar o estado de verdade, DEPOIS que a reabertura automática (cartão E1) existir. Decisão de desenho: arquivar NÃO mexe em assigned_to (o estado 'archived' é a marca; ao reabrir a conversa volta ao mesmo responsável).

O QUE FAZER
1. Em archiveContact: troque o update de assigned_to por supabase.rpc('set_conversation_status', { p_contact_id, p_next: 'archived', p_reason: <texto curto sem dado pessoal> }). Confira a assinatura e quem pode chamar na migration/banco (a RPC valida papel e transição); trate erro com o toast existente 'Erro ao arquivar conversa'. O Desfazer vira set_conversation_status(contactId, 'open') (archived só volta para open na tabela de transições do ADR) e mantém o toast com Desfazer atual.
2. Em bulkArchive (useInboxBulkActions.ts): mesmo comportamento para N contatos, chamando a RPC por contato com concorrência limitada (ex.: 5 por vez); se alguns falharem, informe 'X arquivadas, Y falharam' e mantenha a seleção só dos que falharam; o Desfazer reabre as que foram arquivadas.
3. O ramo 'archive' do hook genérico src/hooks/inbox/useBulkActions.ts que grava conversation_status direto em contacts deve passar a usar a mesma RPC quando tableName === 'contacts' (as outras tabelas ficam como estão).
4. Confira todos os chamadores (ConversationListSidebar, RealtimeInboxView atalho Delete/Backspace, ContactDetails, ContactActionButtons, useChatPanelHandlers case 'archive', slash command) e garanta que todos passam pelas funções acima, nenhum grava status direto. Liste no relato todos os caminhos do mesmo defeito (git grep).
5. Com a conversa selecionada sendo arquivada, ela sai das listas abertas (o filtro já exclui archived): confirme que a tela não quebra e relate o que acontece com a conversa aberta no painel.
6. Testes em src/hooks/chat/__tests__/ e src/hooks/inbox/__tests__/ (ou onde já houver): chama a RPC com 'archived', não mexe em assigned_to, Desfazer chama 'open', erro mostra toast, bulk com falha parcial.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/useConversationActions.ts
- src/hooks/inbox/useInboxBulkActions.ts
- src/hooks/inbox/useBulkActions.ts (só o ramo archive de contacts)
- testes dos três em src/hooks/**/__tests__/

CRITÉRIO DE PRONTO
1. Arquivar (individual, em massa, atalho, menu, slash) grava archived via RPC e o Desfazer reabre.
2. assigned_to intocado; erros tratados; testes dos casos acima.
3. zapp-verify . --rapido verde.


Comments (1):
  [2026-10-11 12:37] hugo: Caminho do mesmo defeito FORA do escopo permitido do cartão (não toquei — precisa de cartão próprio, área de componentes/íris):

- `src/components/inbox/chat/useChatPanelHandlers.ts:356-367` (case `'archive'` do slash/menu do painel): grava `contacts.assigned_to = null` direto, **não** transiciona `conversation_status`. É o `/archive` do slash command. O cartão pede no "O QUE FAZER 4" que ele passe pela função `archiveContact`, mas `useChatPanelHandlers.ts` não está em ARQUIVOS QUE PODE TOCAR e fica fora da minha área (`src/components/**`). Fica registrado: enquanto isso, `/archive` não arquiva a conversa.

Todos os outros chamadores passam pelas funções alteradas: `ContactDetails.tsx:74` e `RealtimeInboxView.tsx:356` → `archiveContact` (RPC `set_conversation_status`); `ConversationListSidebar.tsx:125` e `RealtimeInboxView.tsx:182` (atalho Delete/Backspace) → `bulkArchive` (RPC, concorrência 5); `ContactActionButtons.tsx:193` (menu) → `onQuickAction('archive')` → `archiveContact`.

Events (26):
  [2026-10-11 12:18] [run 10290] heartbeat
  [2026-10-11 12:19] [run 10290] heartbeat
  [2026-10-11 12:20] [run 10290] heartbeat
  [2026-10-11 12:21] [run 10290] heartbeat
  [2026-10-11 12:22] [run 10290] heartbeat
  [2026-10-11 12:23] [run 10290] heartbeat
  [2026-10-11 12:25] [run 10290] heartbeat
  [2026-10-11 12:26] [run 10290] heartbeat
  [2026-10-11 12:27] [run 10290] heartbeat
  [2026-10-11 12:28] [run 10290] heartbeat
  [2026-10-11 12:29] [run 10290] heartbeat
  [2026-10-11 12:30] [run 10290] heartbeat
  [2026-10-11 12:31] [run 10290] heartbeat
  [2026-10-11 12:32] [run 10290] heartbeat
  [2026-10-11 12:33] [run 10290] heartbeat
  [2026-10-11 12:34] [run 10290] heartbeat
  [2026-10-11 12:35] [run 10290] heartbeat
  [2026-10-11 12:36] [run 10290] heartbeat
  [2026-10-11 12:37] commented {'author': 'hugo', 'len': 995}
  [2026-10-11 12:37] [run 10290] heartbeat

Runs (1):
  #10290 running      @hugo  active  2026-10-11 12:17
