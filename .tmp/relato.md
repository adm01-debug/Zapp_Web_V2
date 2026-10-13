Especialista: hugo

## O que mudou e por quê

- `src/lib/web-vitals.ts` — o coletor que já media LCP/FID/CLS/INP/TTFB/FCP/TTI no
  navegador passou a MANDAR o que mediu, de forma AMOSTRADA, pela RPC
  `record_web_vital` (o cliente não tem INSERT em `web_vitals_samples`):
  * `deveAmostrar(rate = 0.1, rand)` decide UMA vez por documento se este
    documento entra nos ~10% (`initWebVitals` chama no início); `rate >= 1` liga
    tudo e `rate <= 0` desliga tudo sem depender do sorteio.
  * `normalizeVitalRoute(pathname)` monta a rota que sobe: corta query string e
    fragmento, garante o `/` inicial, troca identificador de linha (uuid colado
    ou número puro, sempre com dígito) por `:id` e respeita o teto de 200
    caracteres do CHECK de `web_vitals_samples.route`. Não sobe URL completa,
    user-agent, IP nem id de sessão.
  * `buildVitalSamples(report, route, appVersion)` filtra o que a RPC aceita —
    métrica que o coletor mede e valor na faixa dos CHECKs (CLS 0..10; demais
    0..600000), arredondando CLS em 3 casas e ms em inteiro — porque uma amostra
    inválida faz a RPC recusar o LOTE INTEIRO (22023).
  * `sendVitalSamples(samples, send?)` chama a RPC e devolve `false` quando não
    houve envio; nunca lança (o `catch` só registra em `log.debug`).
  * `flushVitalsToServer()` dispara o lote no MESMO unload que já fechava o
    relatório (`pagehide` e `visibilitychange` → `flushAccumulated`), sem `await`
    (o unload não espera promessa) e com trava de UM lote por documento, já que
    os dois eventos disparam juntos.
  * Interruptor lido uma vez por documento, com chave ausente/ilegível = DESLIGADO
    (fail-closed): `feature_flags.web_vitals_samples` (`switchEnabled` aceita
    'on'/'true'/'1'/'yes') e `global_settings.web_vitals_samples`, como pede o
    cartão. A segunda sozinha só ligaria a coleta na sessão de um admin — a
    leitura de `global_settings` é restrita a admin/supervisor por RLS (migration
    20260317223223) —, então `true` em QUALQUER uma das duas fontes liga a coleta;
    assim o interruptor vale para `authenticated` e não só para quem é admin. A
    leitura é assíncrona e feita ANTES do unload de propósito (o lote só sai com
    o interruptor já lido).
- `src/lib/__tests__/web-vitals-envio.test.ts` (NOVO) — chama o módulo REAL
  (`initWebVitals`), com `PerformanceObserver` dublê e o cliente Supabase
  mockado: rota normalizada e ausência de PII no lote enviado, um lote por
  documento mesmo com `pagehide` + `visibilitychange`, saída pelo
  `visibilitychange`, interruptor desligado (chave ausente) e fora do sorteio
  não enviam, leitura do interruptor que falha desliga em silêncio, além dos
  casos puros de `switchEnabled`, `normalizeVitalRoute`, `deveAmostrar`,
  `buildVitalSamples` e `sendVitalSamples`.

O trabalho do cartão pai (`t_81e2678e`, migration + teste de banco) não estava na
minha base: peguei o commit `1048d249dbdcab0cdf002166d41393ba568617e2` com
`git cherry-pick -x` (ficou como `5948e1f527`) antes de escrever o coletor, para
o contrato da RPC conferir com o que o cliente manda. Foi INDISPENSÁVEL: sem
esse commit o meu `supabase.rpc('record_web_vital', ...)` chamaria uma RPC que
não existe na base e o teste de envio não teria contrato para provar. É desse
commit pai (não meu) que vêm os outros 3 arquivos deste diff, todos do lado
servidor e já entregues pelo especialista de banco:
- `supabase/migrations/20261013230010_web_vitals_samples.sql` — tabela
  `web_vitals_samples`, RPC `record_web_vital(jsonb)`, purge e policy de leitura
  admin; é o contrato que o meu coletor chama.
- `scripts/db-audit/web-vitals-samples-rpc.test.sh` — prova de banco do cartão pai.
- `scripts/ci/check-test-inventory.mjs` — inventário de testes que o cartão pai
  atualizou.

## Prova

- vermelho antes (a MESMA suíte de envio contra `dia/2026-10-13`, sem o coletor
  novo em `src/lib/web-vitals.ts`):
  `npx vitest run src/lib/__tests__/web-vitals-envio.test.ts` →
  `Test Files 1 failed (1); Tests 12 failed (12)`
- verde depois:
  `npx vitest run src/lib/__tests__/web-vitals-envio.test.ts src/lib/__tests__/web-vitals-cls-inp.test.ts src/lib/__tests__/web-vitals-fcp-tti.test.ts src/__tests__/security-and-performance.test.ts`
  → `Test Files 4 passed (4); Tests 41 passed (41)`
- os 3 testes que já existiam para este módulo continuam passando (coleta de
  CLS/INP/FCP/TTI e contrato de orçamento) — o diff só ADICIONA (nenhuma linha
  removida em `web-vitals.ts`).
- verificação do cartão (`zapp-verify . --rapido`) → `VERIFY: VERDE (897s)`
  (`OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`).

## O que NÃO fiz e por quê

- Não criei a linha do interruptor (nem em `global_settings`, nem em
  `feature_flags`): isso é decisão de configuração/DDL, fora do meu escopo —
  registrei no comentário do cartão qual das duas liga a coleta para a equipe.
- Não mexi em `src/main.tsx`: o coletor entra pelo `initWebVitals()` que já é
  chamado lá; nenhum arquivo de outro cartão foi tocado.
- Não troquei a RPC nem o formato do lote (contrato fechado pelo cartão pai).
