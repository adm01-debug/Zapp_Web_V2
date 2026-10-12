Especialista: Hugo (area-front-hooks)

# Entrega original (dd1e9ce80972c2f9841e38759eb9276c44b45edb) — já no código atual

Reconferi a ponta de trabalho (dia/2026-10-12, base do meu workspace) e o defeito do pedido
JÁ ESTÁ CORRIGIDO. Não recriei nada e fecho SEM commit de código, conforme o cartão manda.

## O que o pedido manda e onde ele já está

- `src/hooks/sip/useSipConnection.ts:79-81` — a guarda do `connect` cobre a tentativa em voo
  (`if (uaRef.current || attemptRef.current) return;` + `const attempt = { cancelled: false }`).
- `src/hooks/sip/useSipConnection.ts:223-226` — `disconnect()` marca `attemptRef.current.cancelled = true`
  e já libera a guarda para um connect novo.
- `src/hooks/sip/useSipConnection.ts:199-208` — no `catch`, quando a tentativa foi cancelada, o UA/Registerer
  são limpos (`ua.transport.onDisconnect = () => {}`, `registerer.unregister()`, `ua.stop()`) e os refs/estado
  NÃO são tocados (`uaRef`/`registererRef`/`setSipStatus('unavailable')`/`toast.error` só acontecem no ramo
  não cancelado) — exatamente o que o commit original fez.
- `src/hooks/sip/useSipConnection.ts:238-240` — o teardown neutraliza `onDisconnect` antes de `ua.stop()`,
  para o transporte não disparar reconexão/toast ao cair.

## Prova (teste que o pedido pede, verde no código atual)

`src/hooks/sip/__tests__/useSipConnection.test.ts:329`
`it('disconnect() durante register() rejeitado limpa Registerer e UA sem sair de idle', ...)` — resolve o
`register()` pendente DEPOIS do `disconnect()` e afirma `registerer.unregister` chamado, `ua.stop` chamado,
`uaRef.current === null`, `sipStatus === 'idle'`, `toast.error` NÃO chamado, e que o `onDisconnect` tardio
não gera toast nem reconexão.

Comando executado agora no workspace:
- verde depois: `npx vitest run src/hooks/sip/__tests__/useSipConnection.test.ts` → `Test Files 1 passed (1); Tests 20 passed (20)`

## O que NÃO fiz e por quê

- Não commitei código: o defeito pedido já está no código da base (`useSipConnection.ts` linhas acima), o
  diff de código seria vazio. Criar "um controle novo" aqui não é pedido pelo cartão.
- Não criei teste novo: o teste do pedido já existe e passa (`useSipConnection.test.ts:329`).
- Não toquei em nenhum arquivo — `git status` limpo.
