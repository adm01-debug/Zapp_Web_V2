Especialista: hugo

## Prova (comandos rodados e resultado)

- `npx vitest run src/lib/calls/adapters/__tests__/CallEngine.test.ts` →
  Test Files 1 passed (1); Tests 44 passed (44)
- `npx vitest run src/lib/calls/adapters/__tests__/CallEngine.test.ts src/lib/calls/__tests__/persistence.test.ts src/hooks/__tests__/useSipClient.test.ts`
  → Test Files 3 passed (3); Tests 128 passed (128)
- vermelho antes (fontes de produção no ponto da base `dia/2026-10-14`):
  Tests 5 failed | 39 passed (44) — `TypeError: registrarFimNaSaidaDaPagina is not a function`,
  `expect(hangup).toHaveBeenCalledWith(sessao, 'outbound')` (linha 1104) e
  `expect(reject).toHaveBeenCalledWith(convite)` (linha 1117)
- `zapp-verify . --rapido` → VERIFY: VERDE SEM BANCO (tipos, lint, db_guard e migrations OK)

## O que mudou

- src/hooks/communication/useSipClient.ts:103 — efeito registra o listener de `pagehide` na saída da
  página e o remove no cleanup (não sobra listener global); entrega o instantâneo do motor com o
  `callId` da linha (ref espelhada do estado, linhas 38-39).
- src/lib/calls/persistence.ts:315 — `registrarFimNaSaidaDaPagina()`: registra em `window` (o evento
  não borbulha do `document`) e devolve o descarte; colhe o bearer com `getSession()` no PRÓPRIO evento.
- src/lib/calls/persistence.ts:281 — `gravarFimComKeepalive()`: POST em
  `${SUPABASE_URL}/rest/v1/rpc/upsert_my_call` com `keepalive: true` e o mesmo mapa `p_*` da RPC. O
  `supabase.rpc()` usa `fetch` sem `keepalive`: com a aba descartada o pedido em voo morre e a linha
  fica em `ringing`/`answered` (o defeito do cartão).
- src/lib/calls/persistence.ts:254 — `bearerDaSessao()`: desestrutura `{ data, error }` e trata
  `error` (sem JWT a RPC `security invoker` recusaria o POST).
- src/lib/calls/persistence.ts:236 — `entradaDaSaidaDaPagina()`: payload da RPC reusando
  `desfechoDaChamada` (mesma regra de status/motivo das outras gravações).
- src/lib/calls/adapters/CallEngine.ts:332 — `desfechoParaSaida()`: instantâneo do fim (direction,
  talkSeconds, outcome) sem esperar o banco; `null` em `idle`/`ended` (em `ended` a linha já recebeu o
  desfecho no `Terminated`).
- src/lib/calls/adapters/CallEngine.ts:359-360 — `dispose()` chama `hangUp()` antes de soltar as
  referências: o `bye`/`cancel` é enviado e a perna SIP não fica viva no provedor.

## Critério de pronto

1. `dispose` com chamada ativa encerra: CallEngine.ts:359-360; testes CallEngine.test.ts:1094 (spy em
   `adapter.hangup` + `bye`) e CallEngine.test.ts:1108 (convite tocando → `adapter.reject`).
2. `pagehide` grava o fim: useSipClient.ts:103 + persistence.ts:281/315; teste CallEngine.test.ts:1120
   dispara um `pagehide` real e cobra o POST com `keepalive: true`, `p_id` da linha e
   `p_status`/`p_end_reason` explícitos; CallEngine.test.ts:1167 (sem chamada em curso não grava),
   CallEngine.test.ts:1189 (sem sessão válida não grava) e o descarte (2º `pagehide` não regrava).
3. `zapp-verify . --rapido` verde: na Prova.

## NÃO FEITO

- Perda de rede SEM fechar a aba: as gravações da fila esgotam as tentativas offline; re-tentar no
  evento `online` vive em `src/hooks/communication/useCallEngineSink.ts`, fora dos 4 arquivos que o
  cartão libera.
- `src/hooks/__tests__/useSipClient.test.ts` não foi tocado (fora da lista; o cartão filho
  t_a3cf8912 é o dono dos testes daquele arquivo).
