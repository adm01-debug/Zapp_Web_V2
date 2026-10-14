Especialista: semisenior (area-front-hooks)

Refazer 1 do cartão busca-filtros-url-hoje-hooks-ficha (contatos: URL + Hoje + atribuição + campos).
Verificação prévia obrigatória: os 4 defeitos descritos na recusa NÃO existem na entrega
anterior (4ada55f2a) — conferi no código real antes de obedecer (receber-revisao-de-codigo):
P1 fala em `setSearchParams(params)` com push, mas o hook usa `{ replace: true }`
(useContactsSearch.ts:113); P2 fala em `toLocaleDateString` com fallback UTC dentro do
useContactEnrichedData, mas esse arquivo não calcula "Hoje" — o chip usa `appDayStart(0)`
de `@/lib/localDay` (America/Sao_Paulo, 2 passadas p/ DST); P3 fala em `assignment_seq`
global, mas o hook não tem ref nenhum (`rg assignment_seq` = 0 ocorrências em src);
P4 fala em merge otimista que some campos, mas o hook só invalida e relê do servidor.
O commit ce2a8e6e7a citado no cartão como "trabalho anterior" é de outro cartão
(clientNoise) — não foi cherry-pick; parti do 4ada55f2a (HEAD do workspace).
Abaixo, cada ponto: o que a recusa temia, o estado real e a prova.

Ponto 1 — push vs replace nos filtros (VERIFICADO: já era replace; provei + travei)
O que mudei: nenhum comportamento — `setSearchParams(params, { replace: true })`
(useContactsSearch.ts:113) já substitui. Adicionei o teste que faltava, fim a fim com
history real (unstable_HistoryRouter + UNSAFE_createMemoryHistory):
`src/hooks/crm/__tests__/useContactsSearch.test.tsx` > "N trocas de filtro mantêm
1 entrada: voltar do navegador sai da tela" (5 trocas → go(-1) não sai do estado final,
index 0). Soube no caminho: `location.key` muda a cada replace e o `listen` do memory
history do RR7 nunca dispara (provei em node) — por isso a prova é `go(-1)` + índice.
Teste que prova: vermelho sem a correção (troquei p/ `setSearchParams(params)`:
1 failed, 28 skipped) e verde com ela (28 passed, 1 expected fail — o fail esperado
é pré-existente do commit anterior).

Ponto 2 — "Hoje" em 00:00 do fuso do app (VERIFICADO: já era appDayStart; provei + travei)
O que mudei: nenhum comportamento — `case 'today': return appDayStart(0).toISOString()`
(useContactsSearch.ts:122; `APP_TIMEZONE='America/Sao_Paulo'`, src/lib/localDay.ts:11).
Adicionei o caso que discrimina UTC de SP:
`useContactsSearch.test.tsx` > "às 23h em SP (02h UTC do dia seguinte) o Hoje começa
no dia de SP" (espera `date_from` = 2026-03-14T03:00:00.000Z; fatiar UTC daria dia 15).
Teste que prova: vermelho com janela de 24h (mutação temporária p/ `Date.now()-24h`:
1 failed) e verde com appDayStart. Já existia cobertura p/ 09h SP (03:00Z) — mantida.

Ponto 3 — guarda anti-concorrência na atribuição (CORREÇÃO REAL — único código que mudou)
O que a recusa temia (stale descartado por seq global) não existia; o risco real era
outro: dois toques rápidos disparam 2 UPDATEs paralelos e o banco pode gravar fora da
ordem dos cliques. Em vez de seq que descarta resposta (descartar criaria o stale que a
recusa teme: se a nova falha, o aceite da antiga nunca invalidaria), serializei:
`src/hooks/crm/useContactAssignment.ts` — `filasPorContato: Map<contactId, Promise>`
+ `encadearPorContato` envolvendo `assignAgent`/`assignQueue`. Ordem do banco = ordem
dos cliques; cada aceite continua invalidando + avisando (nada descartado, nada stale);
fila é por contato (contatos diferentes andam em paralelo, instâncias dividem a fila
do mesmo contato); entrada sai do Map ao assentar (sem vazar); erro num item não trava
a fila (`.then(trabalho, trabalho)` + cada trabalho engole o próprio erro como antes).
Chamadores: nenhum componente importa o hook na árvore (só o barril `hooks/crm/index.ts`)
— sem regressão ao lado.
Testes que provam (arquivo novo
`src/hooks/crm/__tests__/useContactAssignment.concorrencia.test.tsx`):
(1) "mesmo contato com resolução fora de ordem: B espera A" — B só vai ao banco após A
assentar, payloads [A,B], 2 toasts em ordem, 2 invalidações de `contact-enriched`;
(2) "contatos diferentes andam em paralelo" — UPDATEs imediatos p/ ids distintos.
Vermelho sem a correção (fila virada em no-op de 1 linha: 1 failed, 1 passed) e verde
com ela (2 passed); os 3 testes pré-existentes do hook continuam verdes.

Ponto 4 — campos personalizados que somem (VERIFICADO: sem merge otimista; provei + travei)
O que mudei: nenhum comportamento — `addField`/`removeField` fazem upsert/delete e
`invalidateQueries` (relê a verdade do servidor; `useContactCustomFields.ts`:60,74).
Adicionei regressão de concorrência em `src/hooks/__tests__/useContactCustomFields.test.tsx`:
"dois addField concorrentes: a lista final tem os dois" (dublê de servidor aplica cada
upsert; após os dois assentarem, a lista tem Telefone + Empresa).
Teste que prova: vermelho sem o invalidate (mutação temporária removendo a reconsulta:
1 failed, 9 skipped) e verde com ele (10 passed).

Arquivos (git diff --name-only + 1 novo):
src/hooks/__tests__/useContactCustomFields.test.tsx
src/hooks/crm/__tests__/useContactsSearch.test.tsx
src/hooks/crm/__tests__/useContactAssignment.concorrencia.test.tsx (novo)
src/hooks/crm/useContactAssignment.ts

Comandos de verificação (todos no workspace, agora):
npx vitest run <7 arquivos dos 4 hooks> → 7 passed, 53 passed + 1 expected fail (pré-existente)
npx vitest run useContactAssignment.test.tsx → 3 passed (sem regressão)
git diff -U3 | wc -c → 9636 (teto 90k); nenhuma linha adicionada cita projeto de produção.
Não fiz: cherry-pick de ce2a8e6e7a (é de outro cartão); mescla cliente de campos (sem
sentido sobre lista recém-lida do servidor); seq global que descarta resposta (criaria
stale de verdade — fiz fila que ordena sem descartar, com o porquê acima).
