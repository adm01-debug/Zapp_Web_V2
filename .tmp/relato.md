Especialista: Edgar (area-edge-api)

## O que mudou e por quê
- NADA de produção/teste foi alterado. O cartão manda aplicar a correção "se a causa raiz estiver dentro da área edge" e diz, literalmente: "Se a causa raiz estiver FORA dessa area: NAO corrija. Apenas relate a causa com evidencia e PARE". A causa está fora (front, Talk X).

## Defeito-raiz único (declarado)
`src/components/talkx/__tests__/RuleValueInput.test.tsx` — o teste `"em breve": Lead score e Risco de churn ficam desabilitados no catálogo` (linha 205, quebra na 207) fica vermelho por POLUIÇÃO entre testes, não por defeito de produto:
- `TalkXSegments` deriva o estado inicial da URL: `useState<TalkXSegmentsRoute | null>(() => parseTalkXSegmentsRoute(window.location.search).route)` (TalkXSegments.tsx:43-44).
- `openNew` -> `openBuilder` -> `pushTalkXSegmentsRoute` -> `window.history.pushState(...)` (TalkXSegments.tsx:106-114; segments/talkxSegmentsRoute.ts:92-93), gravando `?view=talkx&tab=segments&mode=new` em `window.location.search`.
- O teste da linha 194 abre o construtor e NÃO o fecha: a URL fica com `mode=new` e vaza para o teste seguinte (o jsdom mantém a mesma `window` durante o arquivo).
- O teste da linha 205 monta `TalkXSegments` já com o construtor aberto -> o botão "Novo segmento" não é renderizado -> `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"`.
- Os vizinhos do mesmo diretório resetam a URL no `beforeEach` (ex.: `TalkXSegments.route.test.tsx:102` -> `window.history.replaceState(null, '', '/')`); `RuleValueInput.test.tsx` não reseta.

## Prova (vermelho -> verde, medido agora neste workspace)
- vermelho (arquivo inteiro): `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` -> `Test Files 1 failed (1); Tests 1 failed | 4 passed (5)` (rc=1); o erro é em `RuleValueInput.test.tsx:207`.
- isolado (só o teste da linha 205): `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx -t "churn ficam desabilitados"` -> `Test Files 1 passed (1); Tests 1 passed | 4 skipped (5)` (rc=0).
- isolando o vazador: `-t "número \"em breve\"|churn ficam"` -> `1 failed | 1 passed` (rc=1); `-t "lista: mostra|churn ficam"` -> `2 passed` (rc=0). Logo o teste que vaza é o da linha 194.

## O que NÃO fiz e por quê
- NÃO corrigi: o defeito está em `src/components/talkx/**` (front, Talk X), fora de `scripts/edge-deploy/**`, `supabase/functions/**` e do manifesto. A regra de escopo do cartão proíbe corrigir aí.
- Nenhum arquivo de produção/teste tocado; o manifesto não foi regenerado porque não há mudança de fonte de Edge que o exija.

## Pendente e para quem
- Corrigir a isolação do teste (resetar a URL/`window.history` no `beforeEach`, como fazem os vizinhos) e/ou fechar o construtor. Dono: worker (mensageria) — área Talk X.
- Mesma suíte `testes` do noturno, mesmo dono: (a) `src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx` (timeout de 15s só sob carga; isolado passa, é flaky); (b) erro não tratado de WebSocket em `RealtimeInboxView.selectedMessagesError.test.tsx`.
- Sem isso o passo `testes` do noturno segue vermelho e prende as correções na fila do integrador.

## Critério de pronto — item por item
1. Único defeito-raiz declarado, com arquivo/trecho: SIM. `src/components/talkx/__tests__/RuleValueInput.test.tsx` (teste da linha 194 vaza a URL; falha cobrada na linha 205/207) + trecho que lê a URL: `TalkXSegments.tsx:43-44` e `106-114`.
2. Comando exato do guarda/teste com log PASSANDO (exit 0) após a correção: NÃO APLICÁVEL. A correção está fora da área permitida (`src/components/talkx/**`), então não há correção nem log "passando" do arquivo inteiro. O que foi rodado agora: vermelho no arquivo inteiro (rc=1) e verde isolado (rc=0), logs colados acima.
3. `git diff` só com arquivos da área permitida + manifesto regenerado por script: SIM para o escopo. `git diff --stat HEAD~1 HEAD` = `.tmp/relato.md` (o próprio relato); nenhum arquivo de produção/teste tocado; manifesto NÃO regenerado porque não há mudança de fonte de Edge que o exija.

NÃO CONCLUÍ: o CRITÉRIO DE PRONTO pede o guarda/teste PASSANDO, o que só se consegue corrigindo arquivo fora da área permitida. Declaro o defeito-raiz com prova e paro, conforme a regra de escopo do cartão.
