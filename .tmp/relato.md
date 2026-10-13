Especialista: iris (telas e componentes; retomada: o trabalho anterior veio do senior/area-front-hooks)

## O que mudou e por quê
- src/components/inbox/conversation-list/StatusChips.tsx: StatusChips passou a exibir os números recebidos por prop (`counts: ChipCounts`); saiu o `countByChip`/`useMemo` que contava sozinho a partir de todas as conversas. Mantive `data-testid="status-chip-<id>"` e o `aria-label` passou a dizer a contagem filtrada com singular/plural ("Todas, 1 conversa" / "Todas, 3 conversas"). Visual inalterado.
- src/components/inbox/ConversationListSidebar.tsx: único encanamento — saiu `conversations={inbox.conversations}` e entrou `counts={inboxFilters.chipCounts}`. `RealtimeInboxView.tsx` não foi tocado: ele já passa o objeto `inboxFilters` inteiro ao sidebar, então `chipCounts` já chega sem mudança.
- src/components/inbox/__tests__/StatusChips.test.tsx, StatusChips.identidade-profile.test.tsx e StatusChips.contrasteChipAtendendo.test.tsx: testes preservados do trabalho anterior, agora sobre a API por prop. Cobrem os seis números recebidos por prop, o rótulo acessível com singular/plural, e a integração leve (harness com `useInboxFilters` real) em que digitar na busca muda o número do chip ativo sem recarregar.
- src/hooks/inbox/chipCounts.ts: UMA linha, e ela é de um cartão pai, não escopo novo. A integração do pai G1 na base de hoje trouxe o `chipCounts.ts` sem a guarda `profileId != null` em `isAttending` que o commit do pai `6766bff120` tinha. Sem ela, "Em atendimento" contava conversa sem responsável quando o perfil ainda é nulo — e o teste herdado `StatusChips.identidade-profile.test.tsx` (R2-INB-056) quebra. Restaurei a linha para a mudança não derrubar uma proteção que já existia.

## Prova
- vermelho antes (StatusChips da base + testes novos): `bunx vitest run .../StatusChips.test.tsx .../StatusChips.identidade-profile.test.tsx .../StatusChips.contrasteChipAtendendo.test.tsx` -> 3 arquivos falhados, 25 testes falhados / 1 passado. O componente da base conta sozinho pelos próprios critérios e ignora os números filtrados, que é o defeito do cartão.
- vermelho comportamental extra (guarda removida): com o `chipCounts.ts` da base (sem `profileId != null`) o `identidade-profile` acusa `Expected 0, Received "Em atendimento1"` no chip com perfil nulo; com a guarda restaurada, verde.
- verde depois: `bunx vitest run .../StatusChips.test.tsx .../StatusChips.identidade-profile.test.tsx .../StatusChips.contrasteChipAtendendo.test.tsx src/hooks/inbox/__tests__/chipCounts.test.ts` -> "Test Files 4 passed (4); Tests 60 passed (60)".
- verificação rápida: no bloco FATOS MEDIDOS PELO FECHAR abaixo.
- confirmei no código ATUAL (dia/2026-10-13) que o defeito ainda existia: o `StatusChips.tsx` da base ainda tinha o `useMemo` contando por conta própria, então reapliquei o trabalho anterior em vez de fechar sem commit.

## Esclarecimento de expectativas de teste (herança dos pais)
A regra de contagem que chips e lista compartilham mudou nos cartões pais, e os testes antigos de StatusChips na base ainda afirmavam a regra velha. Ao reaproveitar os testes do trabalho anterior, as expectativas passam a ser as dos pais: `Aguardando` deixou de ser "sem responsável" e passou a ser `conversation_status: 'waiting'`; `Resolvidas` deixou de ser "sem mensagem" e passou a ser `conversation_status: 'resolved'`; a prova do chip `Arquivadas` usa a fixture nova. Não é regra nova deste cartão — é a mesma regra que a lista já mostra hoje. Nenhuma asserção foi enfraquecida: os testes novos cobrem mais casos que os da base, não menos.

## O que NÃO fiz e por quê
- Não mexi em RealtimeInboxView.tsx: o encanamento necessário já chega pelo objeto `inboxFilters` passado ao sidebar.
- Não alterei o comportamento visível da lista: `useInboxFilters` (filtro/ordenação da lista) não foi tocado; a lista segue mostrando exatamente o que mostrava.
- Sem migration, sem Edge Function, sem dependência nova; nenhuma informação sai do sistema; só tokens/classes existentes.
