Especialista: hugo
## O que mudou e por quê
- `src/hooks/communication/useSipClient.ts`: reserva o ID no INÍCIO da discagem (`reservarIdDeSaida(sessionId)`, :80) e o flush do `pagehide` usa `desfecho.callId ?? currentCallIdRef.current` (:117), com a fila passada ao registro (:122).
- `src/lib/calls/adapters/CallEngine.ts`: geração de descarte (`geracao`, :101; invalidada no `dispose` :405 e a cada chamada nova :472) com guarda nas 3 continuações pendentes (`Established` :218-220, falha do discar :284-286, `encerrar` :449-451); ID resolvido guardado de forma síncrona (`callIdResolvido` :107, `guardarCallIdResolvido` :471) e exposto em `desfechoParaSaida` (:375).
- `src/lib/calls/persistence.ts`: `reservarIdDeSaida` (:361, só determinístico); `FilaDePersistencia.aposCauda` (:348, :384) e `registrarFimNaSaidaDaPagina(colher, fila?)` (:317, :331) — o keepalive do `pagehide` entra atrás da cauda da fila.
- Testes: 3 novos em `CallEngine.test.ts` (:1219) e 4 novos em `persistence.test.ts` (:390, :402).
- FAIXA DO PAI: base `dia/2026-10-14` + arquivos do `879519e80` (cartão `t_7e3e814f); o `sha` de `t_bba659f6` citado na dependência é ID de workspace (sem entrada em `.v2-fila` e sem objeto git) — a base já contém o trabalho pai (suíte 74/74 verde antes das minhas mudanças).

## Prova
- Vermelho antes (só os 7 novos falham; o resto segue verde): `bunx vitest run src/lib/calls/adapters/__tests__/CallEngine.test.ts src/lib/calls/__tests__/persistence.test.ts` → `Tests  6 failed | 75 passed (81)` (6 falham porque a capacidade não existe; o 7º, `sem fila, o comportamento imediato continua`, é trava de compatibilidade e passa desde o início).
- Verde depois (mesmo comando): `Test Files  2 passed (2)` e `Tests  81 passed (81)` — `CallEngine.test.ts` 47 (44 anteriores + 3 novos), `persistence.test.ts` 34 (30 anteriores + 4 novos).
- Sem regressão: `bunx vitest run src/lib/calls src/hooks` → `Test Files  413 passed | 3 skipped (416)` e `Tests  3939 passed | 18 expected fail | 30 todo (3987)`; arquivos anteriores (74 testes) passam intactos contra o fonte novo.
- `bunx eslint` nos 5 arquivos: 0 erros, 0 avisos. `bunx tsc -b --force`: rc=0.
- Escopo: varredura por hash contra a base mostra exatamente estes 5 arquivos de código/teste diferentes (+ este relato); diff anterior→este refazer soma 21181 caracteres (limite 90k), sem `bun.lock`, manifesto ou CI.

## Pontos do revisor
- Ponto 1 (pagehide sem callId): resolvido — reserva síncrona no início (`useSipClient.ts:80`, `persistence.ts:361`) + ID resolvido do motor (`CallEngine.ts:375`, usado em `useSipClient.ts:117`). Teste: `P1: desfechoParaSaida carrega o callId resolvido` (vermelho: `callId` não existia; verde: `toBe('call-1')`) e `reservarIdDeSaida` (vermelho: função não existia).
- Ponto 2 (pendente dispara contra terminated): resolvido para os 3 pendentes reais do módulo (`CallEngine.ts:218-220,284-286,449-451`, descarte em :405). Não existe `setInterval` de 30s no módulo (o único intervalo do hook é o de 1s da duração, `useSipClient.ts:44`; o único `30_000` é avanço de relógio em teste antigo) — o análogo real eram as continuações `callIdPromise.then`. Testes: `P2a` e `P2b` (vermelho: `onAnswered`/`onFinished` disparavam pós-`dispose`; verde: silêncio + sem `ended`).
- Ponto 3 (rascunhos no relato): `grep -rin rascunho` no diff, no módulo e no relato anterior retorna 0 — nada a remover; este relato não menciona limpeza de rascunhos.
- Ponto 4a (visibilitychange sem status novo): não procede como correção — não há handler `visibilitychange` no módulo (`grep` retorna 0) e o caminho real (`pagehide` → `entradaDaSaidaDaPagina`) já persiste o status final calculado, não o corrente; um handler de `hidden` gravaria `ended` ao TROCAR de aba no meio da chamada. Ver item NÃO FEITO.
- Ponto 4b (flush duplicado/fora de ordem): resolvido — varredura mostra um único serializador (a fila); o keepalive agora entra atrás da cauda (`persistence.ts:331,384`). Teste: `com escrita em voo, o fim espera a cauda` (vermelho: `fetch` disparava antes da RPC assentar; verde: `fetch`×1 com `ended` depois, RPC `answered`×1 — UMA escrita por estado).
- Ponto 5 (número de testes): exato — entrega anterior adicionou 5 `it` (44 no arquivo, bate com o `Tests 44 passed` do relato anterior); os `15/14` da recusa não correspondem a nenhum diff (5 `it` adicionados, 44 no arquivo). Agora: 47 e 34 por arquivo, 81 no total (linhas de resumo acima).

## O que NÃO fiz e por quê
- NÃO criei handler `visibilitychange→hidden` (ponto 4a): além de inexistente no diff anterior, gravar `ended` no `hidden` corrompe a linha ao trocar de aba com a chamada ativa; `pagehide` continua sendo o evento certo (só dispara ao descartar a página).
- NÃO toquei em `useCallEngineSink.ts`, `useSipClient.test.ts` nem em `schema-manifest.json`/CI (fora da lista do cartão); a interface nova é opcional e o consumidor travado segue compilando e verde.
- NÃO apliquei `cherry-pick` do `t_bba659f6`: o valor citado não é objeto git (é ID de workspace, sem entrada na fila); equivalência obtida pela base + suíte verde.

Concluí: os 5 pontos estão resolvidos (2 com desvio documentado e provado acima) e a suíte passa sem regressão.
