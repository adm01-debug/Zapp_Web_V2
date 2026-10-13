Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/services/realtime.service.ts: as DUAS leituras de contatos da Inbox passaram a filtrar
  `.is('deleted_at', null)` — `fetchInitialConversations` (semente da lista, cujo resultado
  alimenta `buildConversations`) e `fetchContactsByIds` (contatos que só existiam na amostra de
  mensagens). Antes, o contato soft-deleted voltava para a lista; agora não há caminho que o
  traga de volta pela Inbox, nem semente nem re-busca por id.
- src/components/contacts/useContactsCRUD.ts: `handleEditContact` reconhecia o 23505 pelo nome
  REMOVIDO da constraint (`contacts_phone_unique`, retirada em
  20260827130300_drop_duplicate_phone_constraint_m04.sql); a viva é `contacts_phone_key`. Sem
  reconhecer o próprio erro, a tela mostrava o texto cru do Postgres em inglês. Agora o erro de
  telefone duplicado diz a verdade: quando o número pertence a um contato EXCLUÍDO, a mensagem
  orienta restaurar (`duplicatePhoneError` consulta `contacts` por telefone com
  `.not('deleted_at','is',null)`); a consulta passa pela policy de SELECT, que só devolve o
  excluído a admin/supervisor, então não há segunda cópia da regra de papel no front. Se a
  consulta informativa falhar, a mensagem padrão ("Já existe outro contato com este número de
  telefone.") continua correta. A leitura desestrutura `{ data, error }` e só devolve a mensagem de
  restaurar na leitura BEM-SUCEDIDA com linha; erro de rede cai na mensagem padrão (não engole a
  falha como "sem excluído"), e há teste para esse caminho.
- Testes novos: src/services/__tests__/realtime.service.contatos-excluidos.test.ts (fake
  PostgREST que aplica de verdade `is/in/not` — prova que o contato com `deleted_at` preenchido é
  cortado nas duas leituras, e que o contato vivo continua passando) e
  src/components/contacts/__tests__/useContactsCRUD.telefone-duplicado.test.tsx (prova a mensagem
  padrão, a mensagem de restaurar quando o excluído aparece, e a contraponta: erro que não é 23505
  propaga cru e não dispara a consulta).
- src/components/inbox/__tests__/RealtimeContactUpdateE2E.test.tsx: só o fake de `contacts`
  ganhou o método `.is()` encadeável (o filtro novo quebrava o mock do E2E); nenhuma asserção e
  nenhuma expectativa existente mudou.

## Prova
- vermelho antes: `npx vitest run src/services/__tests__/realtime.service.contatos-excluidos.test.ts src/components/contacts/__tests__/useContactsCRUD.telefone-duplicado.test.tsx`
  → `Test Files 2 failed (2); Tests 7 failed | 1 passed (8)` (o único verde era a contraponta do
  erro não-23505, que não depende da correção).
- verde depois: `npx vitest run <os 2 arquivos novos> <realtime.service.inbox-janela-global> <useContactsCRUD>`
  → `Test Files 4 passed (4); Tests 32 passed (32)` (os 2 testes existentes desses mesmos arquivos
  seguem verdes — nenhuma regressão de contrato).
- regressão ampla: `npx vitest run src/hooks/chat src/components/inbox src/components/contacts src/components/omnichannel src/services`
  → antes do ajuste do fake: `1 failed | 293 passed (294)`; depois: os 3 arquivos afetados rodados
  de novo → `Test Files 3 passed (3); Tests 10 passed (10)`.

## O que NÃO fiz e por quê
- Não toquei na tela: a opção de restaurar é do CT-087 (t_726160d9); aqui só garanto que o hook
  emite a mensagem de restaurar quando o excluído é visível.
- Não mexi em `handleAddContact`: ele já reconhece o 23505 pelo código (sem nome de constraint) e
  já diz a verdade.
- Dependência: o trabalho do pai (t_45046c65) não estava na minha ponta. Trouxe-o com
  `git cherry-pick -x 025568ee1 ceea986a4 78595927b` → 3 commits novos (8a5abf5a3, c109b498e,
  16849cc1f), que trazem a migration `20261013051305_contato_excluido_inbox_ingest.sql` e a policy
  de SELECT que o meu filtro assume. Sem eles o filtro explícito não tem o de/para de RLS.
