Especialista: hugo

## O que mudou e por quê

- `src/components/monitoring/hooks/useMonitoringData.ts`: o `fetchData` deixou de trazer mensagens cruas (`.from('messages').select('sender, created_at')` sem limit) e passou a ler a agregação do servidor via `supabase.rpc('get_monitoring_message_buckets', { p_from, p_to, p_bucket })` (RPC do cartão pai t_cb75a447). Uma linha por balde, então nada é cortado: a curva e a soma cobrem a janela inteira mesmo com mais de 1.000 mensagens. Cada linha vira rótulo com `formatBucketLabel(Date.parse(bucket_start), period, bucketSize)`; `incoming`/`outgoing`/`total` são a soma das linhas. As 8 barras do card de mensagens também vêm da RPC (janela deslizante do período, `periodMs[period]/8`), remontadas por posição em `sparklineFromBuckets` — nenhum balde é descartado.
- Sinalização: novo estado `messageStatsPartial` devolvido pelo hook, marcado por `aggregationPartial(rows, messageSince)`. Fica verdadeiro quando a RPC falha (erro registrado em log, sem telefone/token/texto) ou quando o primeiro balde devolvido começa depois do início da janela pedida — a tela consegue dizer que a soma não cobre o período em vez de exibir um número incompleto como se fosse o total. `loading` continua sendo liberado no `finally`, e a falha da RPC nunca sobe para o `Promise.all` (o `fetchMessageBuckets` trata), então o resto do painel (conexões, SLA, uptime) não cai junto.
- `localDayIndex` foi removido (o agrupamento por dia civil passou a ser do servidor, que ancora os baldes em America/Sao_Paulo); `computeSparklines` perdeu o parâmetro de mensagens e agora devolve só latência/uptime, que continuam saindo dos health logs.
- `src/components/monitoring/__tests__/useMonitoringData.buckets.test.ts` (R2-INF-028, atualizado): roda o hook real com o Supabase mockado e confere a janela e o `interval` exatos pedidos à RPC em 7d (`p_from` 30/09 03:00Z, `86400 seconds`), 24h (24 baldes de hora cheia) e 1h (6 baldes de 10 min distintos, `600 seconds`); que nenhuma consulta vai na tabela `messages` (o teto de linhas do PostgREST não tem por onde cortar); que uma agregação de 24x200 = 4.800 é exibida como 4.800; que os baldes zerados mantêm as 24 entradas; e que falha da RPC e janela furada ficam sinalizadas com `messageStatsPartial = true`.

## Prova

- vermelho antes (hook anterior, sem esta mudança): `npx vitest run src/components/monitoring/__tests__/useMonitoringData.buckets.test.ts` → `Test Files 1 failed (1) / Tests 6 failed (6)` (o hook antigo não chama a RPC: `messageStatsPartial` indefinido e nenhum balde).
- verde depois: mesmo comando → `Test Files 1 passed (1) / Tests 6 passed (6)`.
- regressão do módulo: `npx vitest run src/components/monitoring` → `Test Files 5 passed (5) / Tests 28 passed (28)` (inclui `sla-janela-24h.test.tsx`, cujo mock não tem `rpc` e continua verde porque a falha da RPC não derruba o resto).
- verificação do cartão: `zapp-verify . --rapido` (bloco FATOS do fechar).

## O que NÃO fiz e por quê

- Não liguei `messageStatsPartial` a nenhum texto de tela: os arquivos de tela/componente não estão na lista de ARQUIVOS QUE PODE TOCAR deste cartão (é da área de componentes). Fica uma linha em `useEvolutionMonitoring`/`MonitoringStatsCards` para quem pegar isso.
- Não mexi em migration nem no SQL da RPC: vieram prontos do cartão pai (t_cb75a447) e a prova de banco está no cartão dele.
