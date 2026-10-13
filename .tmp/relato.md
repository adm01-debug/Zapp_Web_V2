Especialista: hugo

## O que mudou e por quê
- `src/hooks/inbox/useInboxUnreadTotal.ts` (novo): hook do selo de não lidas do Chat.
  `useInboxUnreadTotal(enabled = true)` devolve `{ count, teams, isLoading, isError, refetch }`.
  `count` sai da RPC `inbox_unread_total()` — UMA chamada sem argumento (`Args: never` em
  `types.ts`), que conta CONVERSAS com mensagem do contato não lida; somar a lista de conversas
  exigiria baixar `get_inbox_contact_summaries` por contato só para contar. Erro da RPC não
  lança: vira `isError: true` com `count: 0`, para a barra lateral não quebrar nem mostrar selo
  errado. `refetch()` revalida na hora.
- Realtime no mesmo arquivo: canal com `uniqueRealtimeTopic('inbox-unread-total')` (tópico
  exclusivo por instância — dois consumidores simultâneos, barra lateral e barra do celular, não
  podem dividir `supabase.channel`), assinando `messages` e `contacts`, que são as DUAS tabelas da
  publicação `supabase_realtime` (migrations 20251215163158 e 20260826210200) capazes de mudar a
  contagem. Cada evento revalida SÓ a chave `['inbox-unread-total']` — nada de invalidação global,
  que derrubaria o cache do inbox inteiro. Rajada de eventos vira uma recontagem (debounce de
  500 ms, a mesma janela de `useUnreadEmailCount`). Reconexão: a PRIMEIRA inscrição não consulta
  de novo (a consulta inicial cobre), mas a VOLTA do canal depois de `CHANNEL_ERROR`/`TIMED_OUT`/
  `CLOSED` revalida na hora — os eventos da janela offline não se recuperam sozinhos.
  Desmontagem limpa o timer e o canal (`supabase.removeChannel`).
- `src/hooks/system/useDocumentBadge.ts` (inalterado, agora LIGADO): o hook chama
  `useDocumentBadge(count)`, então o título da aba ganha "(n) " com não lidas enquanto a aba está
  em segundo plano e volta ao normal quando zera — o arquivo não precisou mudar.
- Total do Teams exposto pelo MESMO hook (`teams`) via `useTeamUnreadTotal()` — cache do inbox,
  sem consulta nova; `src/hooks/team-chat/useTeamUnreadTotal.ts` ficou inalterado de propósito
  (o contrato dele — "não abre canal nem dispara consulta" — é verificado pelo teste existente
  `useTeamUnreadTotal.test.tsx`).
- `src/hooks/inbox/__tests__/useInboxUnreadTotal.test.tsx` (novo, 10 testes): RPC sem parâmetro;
  erro da RPC não lança; revalidação nos DOIS canais (`messages` e `contacts`); rajada → 1
  recontagem; reconexão (primeira inscrição não consulta, volta do canal revalida); desabilitado
  não consulta nem assina; tópico exclusivo por instância + canal limpo ao desmontar; `teams` do
  cache; título da aba "(n)" e sem prefixo quando zera; resposta atrasada depois do desmonte não
  escreve no título.

## Prova
- vermelho antes: `npx vitest run src/hooks/inbox/__tests__/useInboxUnreadTotal.test.tsx` →
  `Error: Failed to resolve import "../useInboxUnreadTotal"` / `Test Files 1 failed (1); Tests no tests`
- verde depois: `npx vitest run src/hooks/inbox/__tests__/useInboxUnreadTotal.test.tsx` →
  `Test Files 1 passed (1); Tests 10 passed (10)`
- sem regressão na área: `npx vitest run src/hooks/inbox src/hooks/team-chat src/hooks/system src/hooks/__tests__` →
  `Test Files 177 passed (177); Tests 1559 passed | 4 expected fail | 1 todo (1564)`
- lint: `npx eslint src/hooks/inbox/useInboxUnreadTotal.ts src/hooks/inbox/__tests__/useInboxUnreadTotal.test.tsx` → rc=0, sem saída

## O que NÃO fiz e por quê
- Não toquei `src/hooks/system/useDocumentBadge.ts` nem `src/hooks/team-chat/useTeamUnreadTotal.ts`:
  os dois já fazem o que o cartão pede (título da aba / total do Teams do cache) e mudar o segundo
  quebraria o contrato verificado por teste existente.
- Não toquei `src/pages/Index.tsx` nem `src/components/**` (fora da minha área): o consumo
  (`unreadNotifications={0}` → `count`, selo do Teams → `teams`) é do cartão de telas irmão.
  Os dois valores já saem prontos do hook.
- Não mexi no barrel `src/hooks/inbox/index.ts` (fora dos arquivos que o cartão cita); o import é
  `import { useInboxUnreadTotal } from '@/hooks/inbox/useInboxUnreadTotal'`.

## Sobre os três arquivos que o juiz apontou (procede, e é explicado)
O juiz viu `src/integrations/supabase/types.ts`, `supabase/migrations/20261013230004_inbox_unread_total.sql`
e `supabase/tests/inbox_unread_total.sql` no diff da branch. Eles NÃO são meus: vêm do cartão PAI
`t_97516027` (worker (sql)), que criou a RPC `inbox_unread_total` e já está pronto na fila do
integrador (commit `f4af14a0b`, fila `26101304322a08.json`). Trouxe o commit dele por `cherry-pick`
(`c8fad95a3`) antes de começar porque este hook não existe sem a RPC e sem o tipo `inbox_unread_total`
em `types.ts` — era a dependência declarada do cartão. Não editei nenhum dos três: o commit deste
cartão lista apenas `src/hooks/inbox/useInboxUnreadTotal.ts`,
`src/hooks/inbox/__tests__/useInboxUnreadTotal.test.tsx` e `.tmp/relato.md`. Não reverto: sem o
`cherry-pick` o hook não compila nem consulta nada.
