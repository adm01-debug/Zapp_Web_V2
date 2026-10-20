Especialista: semisenior (skill de área: area-front-hooks)

# [refazer 1] monitoring-buckets-hook — relato do refazer (t_1e371474)

Base: trabalho anterior na branch v2/monitoring-buckets-hook-2610130555f688,
commit ea88eb026 (faixa do cartão pai incluída via cherry-pick na próxima
sessão — ver "Como aplicar" abaixo). Meu delta toca SÓ estes 2 arquivos:

- src/components/monitoring/hooks/useMonitoringData.ts
- src/components/monitoring/__tests__/useMonitoringData.buckets.test.ts

## Ponto 1 — sparkline com a barra 0 dobrada (p_from fora da grade)

O que mudei (useMonitoringData.ts):

- Novo `alignSparkStartToServerGrid(sinceMs, bucketMs)`: replica em ms
  absolutos a âncora do servidor (`floor(wallclock_epoch(p_from)/passo)*passo`
  em America/Sao_Paulo, offset fixo -03 sem DST — mesma conta da migration
  20261013230006). Independe do fuso do navegador.
- A chamada do spark passa a pedir
  `p_from = alignSparkStartToServerGrid(since, periodo/8)` em vez de `since`.
- `sparklineFromBuckets` virou mapeamento posicional (linha i → barra i; no
  máximo uma linha extra — o farelo após aligned+8*passo, dentro da janela —
  soma na última barra). Saiu o `Math.max(0, ...)` que prendia as duas
  primeiras linhas na barra 0.

Teste que prova (useMonitoringData.buckets.test.ts, mocks fiéis ao servidor:
9 linhas a partir do p_from alinhado, valores distintos por posição):

- `24h fora da hora cheia` (now 17:37Z = 14:37 SP; p_from do spark
  2026-10-05T15:00:00.000Z; barras [0,1,2,3,4,5,6,15]).
- `7d fora da hora cheia` (now 09:23Z = 06:23 SP; p_from do spark
  2026-09-29T09:00:00.000Z, passo 75600s; barras [0,1,2,3,4,5,6,15]).
- Saída VERMELHA sem a correção (hook do commit ea88eb026): 2 failed, 6 passed
  (p_from continua `since` e as barras saem [1,2,3,4,5,6,7,8]).
- Saída VERDE com a correção: 8 passed.

## Ponto 2 — faltava 7d acima de 1.000 mensagens

O que mudei (só teste): novo `7d acima de 1.000 mensagens` — 7 baldes x
(150+150) = 2.100; confere `total: 2100`, soma do hourlyData 2100 e que
nenhuma chamada foi à tabela `messages` (sem teto do PostgREST).

- Verde com e sem a correção do ponto 1 (cobre o caminho do gráfico, já
  correto; falharia se alguém reintroduzisse leitura crua).

## Verificações reais (scratch em ~/hermes-workspaces/Zapp_Web_V2/__scratch-t_1e371474/repo)

- `vitest run useMonitoringData.buckets.test.ts` → 8 passed (com fix).
- Mesmo comando com o hook de ea88eb026 → 2 failed | 6 passed (sem fix).
- `vitest run sla-janela-24h.test.tsx + buckets` → 17 passed (sem regressão
  no outro consumidor do hook; `useEvolutionMonitoring` usa a mesma API
  pública, inalterada).
- `eslint` nos 2 arquivos → exit 0.

## O que NÃO fiz (digo que não fiz)

- Não fiz iniciar / cherry-pick / commit / fechar: nesta sessão os scripts de
  tarefa saem com `CONGELADO ... exit 75` (modo V1 suspenso, sem o arquivo de
  modo V2 nas guardas); criar esse arquivo seria contornar bloqueio da guarda,
  proibido pelas regras de 07-08/10. Também não rodei `zapp-verify --rapido`
  (exige workspace com tarefa iniciada).
- Não mexi em migration, RPC, policy, `types.ts` nem em nenhum outro arquivo.
- Não relevei nem removi teste existente: o teste 24h anterior foi REESCRITO
  para o comportamento que este próprio cartão manda (p_from alinhado +
  posicional), por isso os valores esperados mudaram — cito a ordem do cartão:
  ponto 1 manda corrigir o mapa e cobrir com now fora da hora cheia.

## Nova linha de resultado (para o .tmp/relato.md do fechar)

`vitest run src/components/monitoring/__tests__/useMonitoringData.buckets.test.ts`
→ 8 passed (24h off-hour 17:37Z com p_from 15:00Z e barras [0..6,15]; 7d
off-hour 09:23Z com p_from 29/09 09:00Z e barras [0..6,15]; 7d com 2.100 >
1.000; 5 testes anteriores verdes); sem o fix: 2 failed | 6 passed.

## Como aplicar (próxima sessão com iniciar/fechar liberados)

1. iniciar a tarefa monitoring-buckets-hook
2. trazer a faixa do cartão pai (base_dia do pai até ea88eb026)
3. aplicar `fix-useMonitoringData.patch` + `fix-useMonitoringData.buckets.test.patch`
   (anexos deste cartão) na ordem; `git diff --stat` deve listar só os 2 arquivos
4. rodar a suite acima; fechar com este relato + a linha de resultado.
