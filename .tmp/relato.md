Especialista: iris (telas e componentes; retomada: o trabalho anterior veio do senior/area-front-hooks)

## Refazer 1 — resposta ponto a ponto à recusa (commit c6716f5b3d)

Ponto 1 — teste 'aplica o mesmo estilo ativo dos demais chips em Arquivadas' apagado: RECOLOCADO em `src/components/inbox/__tests__/StatusChips.test.tsx`, idêntico ao do pai, só com a assinatura nova (`counts={countsOf(conversations)}`, `chipTab="archived"`). Cobre `StatusChips.tsx:59-61` (classes `status-chip-active bg-accent border-primary/50 text-foreground` no chip ativo + `bg-muted/40 border-border text-muted-foreground` nos inativos), trecho que o diff não toca.

Ponto 2 — teste 'chama onChipTabChange com archived ao clicar no chip Arquivadas' apagado: RECOLOCADO no mesmo arquivo, idêntico ao do pai, só com a assinatura nova (`counts={countsOf(conversations)}`). Cobre `StatusChips.tsx:56` (`onClick={() => onChipTabChange(chip.id)}` vale para qualquer chip, inclusive Arquivadas). O teste novo 'mostra o ícone Archive apenas no chip Arquivadas' continua existindo, mas ele só confere o `<svg>` — não o clique — então não cobria este ponto.

Prova dos 2 testes (nome da suite, vermelho sem a correção e verde com ela): com o componente mutado de propósito (clique de Arquivadas ignorado + classe ativa trocada), `bunx vitest run StatusChips.test.tsx -t "Arquivadas"` -> 2 failed | 3 passed | 12 skipped; com o componente real, `bunx vitest run StatusChips.test.tsx` -> 1 passed, 17 passed (15 + 2 recolocados). Vizinhos sem regressão: 3 arquivos StatusChips* -> 3 passed, 28 passed.

Diff desta rodada (`git diff --stat b2016b140...HEAD`): só `src/components/inbox/__tests__/StatusChips.test.tsx` (+27 linhas, 0 remoções) + `.tmp/relato.md` (esta seção). Nenhum teste existente foi removido, pulado ou afrouxado nesta rodada.

## O que mudou e por quê
- src/components/inbox/conversation-list/StatusChips.tsx: StatusChips passou a exibir os números recebidos por prop (`counts: ChipCounts`); saiu o `countByChip`/`useMemo` que contava sozinho a partir de todas as conversas. Mantive `data-testid="status-chip-<id>"` e o `aria-label` passou a dizer a contagem filtrada com singular/plural ("Todas, 1 conversa" / "Todas, 3 conversas"). Visual inalterado.
- src/components/inbox/ConversationListSidebar.tsx: único encanamento — saiu `conversations={inbox.conversations}` e entrou `counts={inboxFilters.chipCounts}`. `RealtimeInboxView.tsx` não foi tocado: ele já passa o objeto `inboxFilters` inteiro ao sidebar, então `chipCounts` já chega sem mudança.
- src/components/inbox/__tests__/StatusChips.test.tsx, StatusChips.identidade-profile.test.tsx e StatusChips.contrasteChipAtendendo.test.tsx: testes preservados do trabalho anterior, agora sobre a API por prop. Cobrem os seis números recebidos por prop, o rótulo acessível com singular/plural, e a integração leve (harness com `useInboxFilters` real) em que digitar na busca muda o número do chip ativo sem recarregar.
- src/hooks/inbox/chipCounts.ts: UMA linha, e ela é de um cartão pai, não escopo novo. A integração do pai G1 na base de hoje trouxe o `chipCounts.ts` sem a guarda `profileId != null` em `isAttending` que o commit do pai `6766bff120` tinha. Sem ela, "Em atendimento" contava conversa sem responsável quando o perfil ainda é nulo — e o teste herdado `StatusChips.identidade-profile.test.tsx` (R2-INB-056) quebra. Restaurei a linha para a mudança não derrubar uma proteção que já existia.

## Prova
- vermelho antes (StatusChips da base + testes novos): `bunx vitest run .../StatusChips.test.tsx .../StatusChips.identidade-profile.test.tsx .../StatusChips.contrasteChipAtendendo.test.tsx` -> 3 arquivos falhados, 25 testes falhados / 1 passado. O componente da base conta sozinho pelos próprios critérios e ignora os números filtrados, que é o defeito do cartão.
- vermelho comportamental extra (guarda removida): com o `chipCounts.ts` da base (sem `profileId != null`) o `identidade-profile` acusa `Expected 0, Received "Em atendimento1"` no chip com perfil nulo; com a guarda restaurada, verde.
- verde depois: `bunx vitest run .../StatusChips.test.tsx .../StatusChips.identidade-profile.test.tsx .../StatusChips.contrasteChipAtendendo.test.tsx src/hooks/inbox/__tests__/chipCounts.test.ts` -> "Test Files 4 passed (4); Tests 60 passed (60)".
- verificação rápida: `zapp-verify . --rapido` -> `OK db_guard 1s; OK tipos 289s; OK lint 9s; OK migrations 2s` e `VERIFY: VERDE SEM BANCO (301s)`. Concluído, sem ressalva: nenhuma etapa ficou vermelha nem pulada; o `banco_local` não é verificado pelo modo rápido sem conjunto, igual às entregas anteriores deste cartão.
- confirmei no código ATUAL (dia/2026-10-13) que o defeito ainda existia: o `StatusChips.tsx` da base ainda tinha o `useMemo` contando por conta própria, então reapliquei o trabalho anterior em vez de fechar sem commit.

## Esclarecimento de expectativas de teste (herança dos pais)
A regra de contagem que chips e lista compartilham mudou nos cartões pais, e os testes antigos de StatusChips na base ainda afirmavam a regra velha. Ao reaproveitar os testes do trabalho anterior, as expectativas passam a ser as dos pais: `Aguardando` deixou de ser "sem responsável" e passou a ser `conversation_status: 'waiting'`; `Resolvidas` deixou de ser "sem mensagem" e passou a ser `conversation_status: 'resolved'`; a prova do chip `Arquivadas` usa a fixture nova. Não é regra nova deste cartão — é a mesma regra que a lista já mostra hoje. Nenhuma asserção foi enfraquecida: os testes novos cobrem mais casos que os da base, não menos.

## Arquivo fora da lista (justificativa — indispensável)
O aviso do juiz sobre `src/hooks/inbox/chipCounts.ts` não procede como escopo novo: é UMA linha de um cartão pai. O cartão manda "traga os commits dos pais com git cherry-pick e ajuste só o necessário" e "resolva os conflitos PRESERVANDO o que já entrou na base". O commit do pai `6766bff120` (o que liga os contadores ao `countByChip`) traz exatamente esta linha — `profileId != null &&` em `isAttending` — e a integração de G1 na base de hoje a perdeu. Sem restaurá-la, o encanamento deste cartão (que move a contagem para o hook) derruba a proteção R2-INB-056 e o teste herdado `StatusChips.identidade-profile.test.tsx` passa a acusar `Expected 0, Received "Em atendimento1"`. Restaurar a linha do pai é "ajustar só o necessário", não escopo novo; nenhum outro trecho do arquivo foi tocado.

## O que NÃO fiz e por quê
- Não mexi em RealtimeInboxView.tsx: o encanamento necessário já chega pelo objeto `inboxFilters` passado ao sidebar.
- Não alterei o comportamento visível da lista: `useInboxFilters` (filtro/ordenação da lista) não foi tocado; a lista segue mostrando exatamente o que mostrava.
- Sem migration, sem Edge Function, sem dependência nova; nenhuma informação sai do sistema; só tokens/classes existentes.
