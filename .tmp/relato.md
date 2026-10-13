Especialista: hugo

# feat(admin): hook da Sala de Crise com atualização periódica e erro explícito

## O que mudou (diff desta área: src/hooks/)
- `src/hooks/business/useCrisisRoomMetrics.ts` (novo): hook React Query que consome a RPC
  `crisis_room_snapshot()` e entrega as 4 métricas da Sala de Crise prontas para a tela.
  - Atualização automática: `refetchInterval` de 45 s (dentro da faixa 30-60 s do cartão) e
    `refetchOnReconnect: true` no próprio hook — não depende da config do QueryClient do consumidor.
  - Aba oculta pausa o relógio (`refetchInterval: false`) e, ao voltar à frente, mede na hora,
    sem esperar o próximo ciclo (ref que guarda a visibilidade anterior).
  - Falha nunca vira zero: `.error` da RPC lança; campo ausente/não numérico em
    `parseCrisisRoomSnapshot` lança. Em erro, `snapshot`/`metrics` ficam `undefined` e `isCrisis`
    fica `null` (a tela não anuncia "Operação normal" sobre dado que não existe). `queue_ratio`
    NULL = "não medido" (`severity: 'unknown'`), nunca 0 pintado de verde.
  - Expõe `isError`, `error`, `isFirstLoad`, `isRefreshing`, `dataUpdatedAt`, `refetch` e
    `refetchIntervalMs` para a tela.
- `src/hooks/business/__tests__/useCrisisRoomMetrics.test.tsx` (novo): chama o hook REAL
  (`renderHook` + `QueryClientProvider`), mockando só o cliente Supabase, com 11 casos.

## Arquivos herdados do cartão pai (t_7d403167, já aprovado) — presentes no diff desta branch
- `supabase/migrations/20261013140359_crisis_room_snapshot.sql`: a RPC que este hook consome.
- `src/integrations/supabase/types.ts`: tipo da RPC gerado a partir dela.
- `scripts/db-audit/crisis-room-snapshot.test.sh` + `scripts/ci/check-test-inventory.mjs`: prova da
  RPC com papéis reais (admin/agente/anon/service_role) em PostgreSQL descartável e a entrada
  necessária na ALLOWLIST do inventário de testes (senão o `.test.sh` é reprovado como órfão).
Vieram na faixa do pai e são indispensáveis para o hook: sem a RPC não há agregado para consumir.
Não editei nenhum desses arquivos.

## Prova
- `npx vitest run src/hooks/business/__tests__/useCrisisRoomMetrics.test.tsx`
  -> `Test Files 1 passed (1); Tests 11 passed (11)`.
  Cobre: falha da RPC vira erro e nunca zero; agregado quebrado (campo ausente) falha; `queue_ratio`
  nulo = `unknown`; atualização automática no intervalo configurado; aba oculta pausa e ao voltar
  mede de novo; reconexão re-sincroniza mesmo com o `refetchOnReconnect` do QueryClient desligado.
- `zapp-verify . --rapido` -> `OK db_guard 0s`; a etapa `tipos` foi interrompida duas vezes por
  OOM deste host compartilhado (tsc morto com exit 137, "falha de execução, NÃO é aprovação"),
  sem nenhum diagnóstico de tipo apontado. A verificação roda de novo no fechamento.
- O commit do hook toca só `src/hooks/business/useCrisisRoomMetrics.ts` e o teste. Nada de produção.

## NÃO FEITO
- Nenhum arquivo de UI: `CrisisRoom.tsx` é do worker de telas. O hook já entrega os 4 cartões com
  os dois limiares (atenção e crítico) para a tela só renderizar.
