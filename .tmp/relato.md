Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/services/contact.service.ts` (`fetchStats`): as 4 consultas ao PostgREST
  (2 head counts de `messages`, 1 de `conversation_sla`, 1 select de `csat_surveys`)
  e a leitura de `messages` com `.order('created_at',{ascending:true}).limit(200)`
  saíram. Agora é UMA chamada à RPC `contact_response_stats` (migration
  20261013230002, já na base), com `{ p_contact_id }`. O tempo de resposta passa a
  vir medido sobre o histórico INTEIRO (window function LEAD), sem o corte enviesado
  das 200 mensagens mais antigas. O contrato de retorno é o MESMO objeto de 7 campos
  (`totalMessages`, `avgResponseTimeMinutes`, `totalConversations`,
  `messagesChangePercent`, `conversationsChangePercent`, `csatAverage`, `csatCount`).
  Conjunto vazio (contato não visível — o portão de RLS está dentro da RPC) responde
  zeros, sem lançar; erro da RPC é propagado (`if (error) throw error`).
  O helper `windowChangePercent` foi removido (a variação agora é calculada no banco,
  com o mesmo contrato de NULL quando a janela anterior é 0).
- `src/services/__tests__/contact.service.stats.test.ts` (novo): prova a correção.

## Prova
- vermelho antes (`git checkout dia/2026-10-13 -- src/services/contact.service.ts`,
  teste rodado sobre a versão antiga):
  `npx vitest run src/services/__tests__/contact.service.stats.test.ts` →
  `Test Files 1 failed (1); Tests 8 failed (8)` (a versão antiga nem chama `rpc`;
  estoura em `Cannot read properties of undefined (reading 'select')`).
- verde depois: `npx vitest run src/services/__tests__/contact.service.stats.test.ts` →
  `Test Files 1 passed (1); Tests 8 passed (8)`.

## Critério de pronto (linha por item)
- "Falha de resumo visível": `src/services/contact.service.ts:243` (`if (error) throw error`); teste
  "erro da RPC é propagado..." em `contact.service.stats.test.ts` — `rejects.toBe(erro)`.
- "Sem código morto de escrita no navegador": nenhuma consulta PostgREST sobra no serviço; teste
  "não sobra consulta PostgREST (em especial o messages.limit(200) do viés antigo)" —
  `expect(h.from).not.toHaveBeenCalled()`; o único canal é a RPC.
- "Mudança mínima": o diff próprio são só os 2 arquivos do cartão (`git diff dia/2026-10-13...HEAD`
  mostra também os 2 commits do PAI, t_de3db284 — cherry-pickados no passo 1 do fluxo, não são meus):
  `supabase/migrations/20261013230002_contact_response_stats.sql` (RPC), `supabase/tests/contact_response_stats.sql`
  e `src/integrations/supabase/types.ts` vêm do commit 359873b61 do pai; eu não editei nenhum deles.

## O que NÃO fiz e por quê
- Não toquei em `src/components/inbox/tabs/ContactStatsStrip.tsx`: o subtítulo ainda
  diz "200 primeiras msgs", mas o cartão proíbe alterar outro arquivo. Deixei o
  comentário no serviço registrando que o texto ficou desatualizado e abri comentário
  no cartão para o card de tela.
- Não troquei os *campos* do retorno pelo que a RPC devolve a mais (mediana e nº de
  amostras): o cartão pede o MESMO contrato de 7 campos.
