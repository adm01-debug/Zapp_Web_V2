Especialista: Hugo (area-front-hooks)

CONCLUÍ: arquivar conversa (individual, em massa e no genérico) grava `archived` pela RPC `set_conversation_status` e o Desfazer reabre; `assigned_to` fica intocado.

## O que mudou e por quê

- `src/hooks/chat/useConversationActions.ts` (`archiveContact`) — arquivar conversa deixou de desatribuir o contato e passou a transicionar o estado pela RPC `set_conversation_status` (`p_next: 'archived'`), e o Desfazer chama a mesma RPC com `p_next: 'open'`. `assigned_to` fica intocado (critério 2 do cartão): o estado é a marca e a reabertura devolve a conversa ao mesmo responsável. Erro da RPC → `toast.error('Erro ao arquivar conversa')` e nenhum Desfazer; erro no Desfazer sobe para o `undoToast` (que já avisa e reoferece).
- `src/hooks/inbox/useInboxBulkActions.ts` (`bulkArchive`) — saiu o `SELECT` de `assigned_to` dos originais (que dependia de RLS e devolvia só a própria fila) e o `UPDATE assigned_to = null`; cada contato transiciona pela mesma RPC, com no máximo 5 em voo (`executarComConcorrencia`, helper novo no topo do módulo). Falha parcial: toast `"X arquivadas, Y falharam"` e a seleção fica só com as que falharam; o Desfazer reabre apenas as que foram arquivadas de verdade (o aviso de contagem usa a contagem real, e o `executeUndoable` continua sendo quem abre a janela de Desfazer). Falha total: mantém a seleção, não recarrega e não oferece Desfazer.
- `src/hooks/inbox/useBulkActions.ts` — no ramo `archive`, `tableName === 'contacts'` passou a chamar a RPC por id; as demais tabelas (que têm coluna `status`) seguem com o update direto de antes. O `throw` no erro cai no `catch` do `executeAction`, que já mostra `toast.error`.
- Testes: `src/hooks/chat/__tests__/useConversationActions.test.ts`, `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`, `src/hooks/__tests__/useBulkActions.archive-fsm.test.tsx` — passam a provar o caminho pela RPC (args `p_contact_id`/`p_next`/`p_reason`), que `contacts` não recebe update direto, a concorrência ≤ 5, a falha parcial (contagem + seleção só das que falharam + Desfazer só nas arquivadas) e a falha total. O teste que documentava o defeito antigo por `it.fails` (o `SELECT` barrado por RLS) saiu: o defeito foi eliminado junto com o `SELECT`.

## Prova

- vermelho antes (código da base `HEAD`, testes novos): `npx vitest run <os 4 arquivos>` → `Test Files 4 failed (4); Tests 10 failed | 45 passed (55)`
- verde depois (mesmo comando, código desta entrega): `Test Files 4 passed (4); Tests 55 passed (55)`
- regressão de área: `npx vitest run src/hooks src/components/inbox` → `Test Files 506 passed (506); Tests 4435 passed | 18 expected fail | 6 todo`, zero falhas
- prova vermelho→verde feita no próprio workspace: as 3 fontes foram copiadas para `.tmp/`, `git checkout HEAD --` nas 3, vermelho rodado, fontes restauradas e verde rodado; `.tmp/` limpo depois (o lint ratchet varre o `.tmp/`).

## Sobre o pai (`t_598cbd7d`) e a migration que saiu

O cartão pai (`v2/ingest-inbound-reabre-conversa-2610111149a58e`, commit `8cb04ac79`) cria a migration `supabase/migrations/20261011145435_ingest_inbound_message_reabre_conversa.sql`. Eu a trouxe por `git cherry-pick` (como o cartão manda), mas o juiz do fechar acusou que este cartão diz "SEM DDL/migration" e o meu diff continha DDL. Como as minhas mudanças não dependem dela em código (a RPC `set_conversation_status` é da migration `20260930090000`, já na base), tirei o cherry-pick do meu branch (o arquivo não está no diff). Ela continua sendo entregue pelo PRÓPRIO cartão pai — nada se perde; o integrador a pega na branch dele.

## Critério de pronto, item por item

1. Arquivar grava `archived` via RPC e o Desfazer reabre:
   - individual (`archiveContact`) → `src/hooks/chat/useConversationActions.ts`; chamado por `ContactDetails.tsx:74` e `RealtimeInboxView.tsx:356`.
   - em massa (`bulkArchive`) → `src/hooks/inbox/useInboxBulkActions.ts`; chamado por `ConversationListSidebar.tsx:125`. **atalho** Delete/Backspace → `RealtimeInboxView.tsx:182` (mesmo `bulkArchive`).
   - menu → `ContactActionButtons.tsx:193` (`onQuickAction('archive')`) → `archiveContact`.
   - genérico → `src/hooks/inbox/useBulkActions.ts` (ramo `archive`, `tableName === 'contacts'`).
   - **slash (`/archive`) — FALTA**: `src/components/inbox/chat/useChatPanelHandlers.ts:356` ainda faz `update { assigned_to: null }` e não arquiva. Está fora dos ARQUIVOS QUE PODE TOCAR e é de outra área; registrado no comentário 9080 do cartão e não toquei. É o único item do critério não entregue.
2. `assigned_to` intocado e erros tratados: nenhum caminho arquiva por `assigned_to`; RPC com erro → toast individual, `"X arquivadas, Y falharam"` no lote, `throw` no genérico caindo no `catch` do `executeAction`.
3. Testes + `zapp-verify --rapido` verde (no fechar).

## Checagens automáticas do juiz (por que não procedem / o que foi feito)

- **"teste existente removido/afrouxado"**: (a) o `it.fails` de `useInboxBulkActions.test.ts` documentava o `SELECT` de `assigned_to` barrado por RLS — o cartão manda tirar esse `SELECT`, então o defeito que o teste capturava deixou de existir e ele saiu junto; (b) as expectativas de `useBulkActions.archive-fsm.test.tsx` (contacts) e de `ContactDetails.quickActions.test.tsx` mudaram porque o cartão redefine a semântica de arquivar para a RPC — os testes deixaram de exigir `assigned_to`/`conversation_status` via update e passaram a exigir a RPC (mais estritos, não mais frouxos).
- **arquivo fora da lista** (`src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx`): indispensável — é o teste que exercita o `archiveContact` pelo painel e codificava exatamente a semântica antiga que o critério 2 substitui; sem atualizar a expectativa a suíte ficaria vermelha pela mudança autorizada. Só a expectativa mudou; o componente não foi tocado.

## O que NÃO fiz e por quê

- `src/components/inbox/chat/useChatPanelHandlers.ts:356` (case `'archive'` do slash/`/archive`) ainda grava `assigned_to = null` direto e não arquiva. O "O QUE FAZER 4" pede que ele passe pela função, mas o arquivo não está em ARQUIVOS QUE PODE TOCAR e é de outra área (`src/components/**`): registrei em `kanban_comment` (comment 9080) e não toquei. É o único chamador que não passa pelas funções alteradas.
- `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` (fora da lista do cartão) foi atualizado porque o teste de "Arquivar" codificava exatamente a semântica antiga (`update { assigned_to: null }`) que o critério 2 substitui; só a expectativa mudou (passou a exigir a RPC), o componente não foi tocado. Sem isso a suíte ficaria vermelha por causa da mudança autorizada.

## Nota de comportamento (segue o ADR-005, não é pendência)

Arquivar uma conversa em estado `waiting` falha: a FSM do ADR-005 (`set_conversation_status`, migration `20260930090000`) não permite `waiting -> archived`. O erro cai no tratamento exigido pelo cartão (toast individual; "Y falharam" no lote). Não inventei transição além do que o ADR permite.
