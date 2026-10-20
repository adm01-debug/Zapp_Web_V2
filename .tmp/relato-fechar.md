- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 118s;OK lint 4s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (11/10 10:25, gerados por máquina: valem mais que números escritos à mão)
```
 scripts/ci/check-test-inventory.mjs                |   6 +
 .../db-audit/assume-return-conversation.test.sh    | 530 +++++++++++++++++++++
 .../useConversationTicketActions.test.tsx          | 274 +++++++++++
 src/hooks/inbox/useConversationTicketActions.ts    | 249 ++++++++++
 src/integrations/supabase/types.ts                 |   8 +
 .../20261011094027_assume_return_conversation.sql  | 213 +++++++++
 6 files changed, 1280 insertions(+)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 14 passed (14)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: scripts/ci/check-test-inventory.mjs, supabase/migrations/20261011094027_assume_return_conversation.sql; padrão sensível: caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b

Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/inbox/useConversationTicketActions.ts` (NOVO) — hook pedido pelo cartão: duas mutações sobre as RPCs do pai, `assume_conversation` e `return_conversation_to_queue`.
  - `assume()`/`returnToQueue(reason?)`: chamam a RPC, aplicam atualização otimista no contato (assumir = responsável eu + status `open`; devolver = responsável nulo + status `waiting`) e **voltam atrás** em `onError` (`setPatch(null)`), com o erro traduzido para português.
  - `canAssume`/`canReturn` derivados de responsável atual + usuário logado (`useAuth`) + papel (`useUserRole`): sem responsável qualquer agente assume; com responsável de terceiro só supervisor assume/devole; com responsável eu, só devolvo; status terminal (`resolved`/`closed`/`archived`) não assume nem devolve.
  - `statusLabel`: `'Aberta'` (open sem responsável), `'Na fila'` (waiting), `'Em atendimento por <nome>'` (nome do próprio perfil ou resolvido em `profiles`; `contacts.assigned_to` é FK de `profiles.id`), e `'Encerrada'` para estado terminal.
  - Tradução de erros da RPC (`translateTicketActionError`, exportado): cobre `not_authenticated`, `profile_not_found`, `not_authorized`, `contact_not_found`, `conversation_not_active`, `already_assigned`, `concurrent_assignment`, `concurrent_update`; token desconhecido/ausente cai no genérico.
  - "Refletir sem recarregar": no sucesso emite `zapp:contact-status-changed` (o MESMO canal que o `CloseConversationDialog` usa, ouvido por `useRealtimeMessages`) para o status na lista in-memory, e invalida `['contacts']`/`['conversations']`; o `assigned_to` novo chega pelo realtime de `contacts` que já existe.
- `src/hooks/inbox/__tests__/useConversationTicketActions.test.tsx` (NOVO) — chama o hook real (RPC, `useAuth` e `useUserRole` mockados), cobrindo: assumir (otimista + toast + evento), rollback no erro com erro traduzido, soltar o valor otimista quando o realtime traz outro responsável, devolver a fila, rollback na devolução, as regras de `canAssume`/`canReturn` por papel (sem responsável, eu, terceiro, terceiro+supervisor, encerrada), o rótulo `Aberta`/`Encerrada` e a resolução do nome.

## Dependência (pai não integrado na ponta) — arquivos fora do meu escopo
Os cartões pai criam as RPCs e os tipos. Ao abrir, `assume_conversation`/`return_conversation_to_queue` **não** estavam em `src/integrations/supabase/types.ts` nem na base `dia/2026-10-11` (o hook precisa dos tipos gerados, senão a chamada `supabase.rpc(...)` não compila). Pela regra medida da fila do integrador (commit citado ausente da ponta → `git cherry-pick -x`), trouxe os dois commits do pai com proveniência registrada no message:
`git cherry-pick -x 0cb904cfe d45670117`.

Por isso o diff contra a base carrega arquivos que NÃO são meus — são exatamente os produtos dos cartões pai, indispensáveis para o hook existir:
- `supabase/migrations/20261011094027_assume_return_conversation.sql` — a migration das RPCs (cartão pai).
- `src/integrations/supabase/types.ts` — os tipos gerados das RPCs (cartão pai).
- `scripts/db-audit/assume-return-conversation.test.sh` e `scripts/ci/check-test-inventory.mjs` — o teste de banco do pai + a linha dele no inventário (cartão pai).

**A minha entrega são só os 2 arquivos novos** (`src/hooks/inbox/useConversationTicketActions.ts` e o teste). Sobre o gatilho `updated_at` na migration do pai: esse arquivo é do cartão pai, cujo próprio teste (`scripts/db-audit/assume-return-conversation.test.sh`) já prova o gatilho antes/depois — não é código meu e não devo alterá-lo aqui.

## Prova
- verde depois: `npx vitest run src/hooks/inbox/__tests__/useConversationTicketActions.test.tsx` → `Test Files 1 passed (1); Tests 14 passed (14)`
- `npx tsc -b --force` → sem erros (0 linhas `error TS`), inclusive a tipagem das duas RPCs
- `npx eslint` nos dois arquivos → sem avisos
- vermelho antes: o módulo `src/hooks/inbox/useConversationTicketActions.ts` não existia nesta base (arquivo novo), então o teste novo não tinha o que executar — é cartão aditivo, a prova é o verde acima sobre o hook real.

## O que NÃO fiz e por quê
- **Não editei `src/hooks/inbox/index.ts`** (fora dos arquivos que o cartão permite). O hook se importa direto de `@/hooks/inbox/useConversationTicketActions`, como já faz `useContactQuickActions`. Se o card da barra quiser via barrel, é uma linha de follow-up.
- **`canAssume` não consulta `queue_members`**: o cartão o define por responsável + usuário + papel. Então um agente fora da fila do contato pode ver "Assumir" e receber o `not_authorized` da RPC já traduzido — a RPC continua sendo a fonte de verdade da permissão.
- **`statusLabel` tem um 4º rótulo, `'Encerrada'`**, além dos três do cartão (`Aberta`/`Na fila`/`Em atendimento por <nome>`): rotular conversa `resolved`/`closed`/`archived` como "Na fila" seria falso. Os estados terminais também ficam fora de `canAssume`/`canReturn`.
