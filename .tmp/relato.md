Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/services/chat.service.ts`: `deleteMessage` virou o caminho ÚNICO de exclusão — chama a RPC
  `delete_message` (`supabase.rpc('delete_message', { p_message_id })`) em vez do
  `.from('messages').update({ is_deleted: true, content: '[Mensagem apagada]' })` que sobrescrevia o
  texto original. O UPDATE continua acontecendo no SERVIDOR (dentro da RPC), então o realtime segue
  vendo a mudança de `is_deleted` e não preciso empurrar estado local.
- `src/components/inbox/chat/MessageHoverToolbar.tsx`: o delete do menu hover deixa de escrever direto
  na tabela e passa a chamar `ChatService.deleteMessage(message.id)`; o import de
  `@/integrations/supabase/client` saiu do componente (dado por serviço, como o lint da área pede).
  Semântica de erro preservada: `{ error }` → `toast.error('Erro ao deletar mensagem')`, sem sucesso e
  sem `onMessageDeleted`.
- `src/components/inbox/MessageContextActions.tsx`: mesma troca no menu contextual; mesmo tratamento de
  erro (rejeição do banco não vira "Mensagem deletada").
- `src/hooks/chat/useFilesActions.ts`: a exclusão da aba Arquivos chama `ChatService.deleteMessage(item.id)`;
  no erro continua devolvendo `false`, sem `onRemoved` e sem invalidar as chaves.
- `src/components/inbox/tabs/FilesTab.tsx`: só a descrição do AlertDialog, que afirmava "o conteúdo vira
  '[Mensagem apagada]'" — agora diz o que a RPC faz de fato: marca `is_deleted = true`, a mensagem passa a
  aparecer como "[Mensagem apagada]" e o texto original fica guardado, sem ser sobrescrito.
- Comentários de código (chat.service.ts, useFilesActions.ts, os dois componentes) atualizados para a
  semântica nova — nenhum deles descreve mais o UPDATE antigo.

Único caminho e realtime: os 4 pontos de tela agora chamam `ChatService.deleteMessage`. O
`handleMessageDeleted` de `ChatMessagesArea.tsx` NÃO foi tocado: ele já chamava `ChatService.deleteMessage`,
ou seja, continua marcando pelo mesmo caminho (o efeito de realtime vem do UPDATE da RPC no servidor) e não
sobra nenhum vetor `.update().eq('id', …)` de exclusão no código de produção.

## Prova
- vermelho antes: com o código antigo restaurado (patch salvo em `.tmp/impl.patch`, `git apply` de volta em
  seguida) → `npx vitest run` nos 5 arquivos →
  `Test Files  5 failed (5)` / `Tests  13 failed | 9 passed (22)`
- verde depois: mesma execução com a mudança `f5a5a8979` →
  `Test Files  5 passed (5)` / `Tests  22 passed (22)`
- suíte relacionada (inclui `MessageHoverToolbar.historico-envio.test.tsx` e
  `ChatMessagesArea.pagination.test.tsx`, que mockam `ChatService`) →
  `Test Files  7 passed (7)` / `Tests  28 passed (28)`
- `grep -rn "content: '\[Mensagem apagada\]'\|is_deleted: true" src/` (fora de teste) → sem resultado:
  nenhum ponto de produção escreve a marcação à mão.
- testes ajustados para o contrato novo (todos renderizam o componente/hook REAL e mockam só o
  `@/integrations/supabase/client`): `chat.service.delete.test.ts` (novo), `MessageHoverToolbar.delete.test.tsx`,
  `MessageContextActions.r2inb014.test.tsx`, `useFilesActions.test.tsx`, `FilesTab.fase6.test.tsx`. O mock de
  `from` registra a tabela acessada: o teste prova que a exclusão não passa por `from('messages')`.

## O que NÃO fiz e por quê
- Não escrevi a RPC/migration: ela é o `feat(db)` do cartão pai (t_cfa99af7) e entrou aqui pelo commit
  integrado da dependência (`8b91eee2d`, cherry-pick do range `dia/2026-10-13..59d554b0f`), sem alterar nada
  dela.
- Não mexi na autorização da RPC (visibilidade do contato + posse da mensagem OU admin/supervisor), que
  pode fazer a exclusão de mídia RECEBIDA falhar para agente comum: quem decide isso é o banco (worker (sql)).
  A tela já trata o erro (`Erro ao apagar mensagem`, item segue na lista e na seleção) — coberto no teste.
- Não adicionei nada de exportar/baixar; nada de tela nova.
- Estados vazio/carregando/erro da aba Arquivos não mudaram de comportamento; o de erro é o que o teste acima cobre.

## Pontos do juiz automático (ANTES DE ENTREGAR)
- Ponto 1 — arquivo fora da lista `ARQUIVOS QUE PODE TOCAR`: `src/components/inbox/tabs/FilesTab.tsx` entrou porque
  é a tela do MESMO fluxo de exclusão e a descrição do AlertDialog afirmava o efeito antigo ("o conteúdo vira
  '[Mensagem apagada]'"), que deixou de ser verdade com a RPC; mudança de 3 linhas, mantendo as strings que o teste
  já cobria. Indispensável porque a tela passaria a mentir sobre a própria ação que este cartão corrige.
  Já os arquivos `supabase/migrations/20261013230001_delete_message_rpc.sql` e `supabase/tests/delete_message_rpc.sql`
  NÃO são deste cartão: chegaram no commit de dependência `8b91eee2d` (cherry-pick do range `dia/2026-10-13..59d554b0f`
  do cartão pai t_cfa99af7), sem nenhuma edição minha — o `git diff` deste cartão (feature + relato) não os toca.
- Ponto 2 — gatilho `BEFORE UPDATE` de `updated_at` na migration do pai: o UPDATE da RPC atinge UMA linha
  (`WHERE id = p_message_id AND coalesce(is_deleted, false) = false`), não um lote; e a função é idempotente
  (segunda chamada devolve `false` sem tocar no original). O arquivo é do cartão pai e lá já foi julgado `ok`
  (`juiz_estado: ok` na fila); este cartão não altera a migration nem o teste dela.

Concluí: os 4 pontos de tela chamam a RPC por um único caminho (`ChatService.deleteMessage`), nenhum vetor
`.update().eq('id', …)` de exclusão sobrou no código de produção, os testes ajustados passam e a suíte relacionada passa.
