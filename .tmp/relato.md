Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- Retomada do cartão parado na fila (estado 'conflito' com dia/2026-10-12). Conferi no código ATUAL: o defeito (recorrência Diariamente/Semanalmente) NÃO existe no topo — não havia migration de recorrência, nem campo no tipo, nem no scheduler, nem o test.sh. Ou seja, o trabalho não entrou e precisava ser trazido.
- Branch v2/recorrencia-campanha-talkx-26101307239dc3 (base dia/2026-10-13). Trouxe o trabalho anterior por `git cherry-pick 706bd8a35` (branch v2/recorrencia-campanha-talkx-2610102059399f) e resolvi os 4 conflitos PRESERVANDO o que já estava no topo:
  - src/hooks/integrations/useTalkX.ts — mantidas as props do topo (send_weekdays, respect_dnd) E os campos de recorrência da entrega.
  - src/components/talkx/TalkXCampaignScheduled.tsx — imports do topo (TalkXScheduleTimeline, useTalkXConnectionStatus) + `type TalkXRecurrenceFrequency` da entrega.
  - src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx — mantidos os describes do topo (Tela 10 / TL-151) E os de Repetição.
  - supabase/functions/talkx-scheduler/index.test.ts — mantidos os Deno.test do topo (N-102 send_weekdays) E os de recorrência.
- supabase/migrations/20261006232024_talkx_campaign_recurrence.sql: migration aditiva (7 colunas de recorrência, CHECK de forma, trigger de guarda, RPC service_role schedule_next_talkx_recurrence) — reaplicada no banco LOCAL.
- supabase/deployment-manifest.json: regenerado por scripts/edge-deploy/generate-manifest.mjs. A base já tinha regenerado o manifesto e o cherry-pick alterou supabase/functions/talkx-scheduler/index.ts, então o `--check` acusava manifesto velho. Só o manifesto gerado muda (4 linhas, o hash/estatística).

## Como resolvi o motivo da recusa (conflito com a ponta)
- Conflito 1 (imports de TalkXCampaignScheduled.tsx): união dos dois lados — sem perder nenhum import, sem duplicar.
- Conflito 2 (campos/Props em useTalkX.ts): união das props do topo com os campos de recorrência.
- Conflito 3 (asserts de UI em TalkXCampaignScheduled.test.tsx): mantive o bloco do topo (TL-151) e o bloco de Repetição, cada um com seu fechamento; nenhum assert descartado.
- Conflito 4 (Deno.test de talkx-scheduler/index.test.ts): mantive o bloco N-102 do topo e o bloco de recorrência.
- Nada do topo foi sobrescrito pela entrega antiga.

## Prova
- vermelho antes (defeito/entrega ausentes no topo): `git merge-base --is-ancestor 706bd8a35 HEAD` → "NAO ESTA no HEAD"; `git ls-tree -r --name-only HEAD | grep campaign_recurrence` → "NENHUMA".
- verde depois:
  - `hermes-db-migrar supabase/migrations/20261006232024_talkx_campaign_recurrence.sql` → "... APLICADA no banco LOCAL 'v2-26101307239dc3' (produção não foi tocada)."
  - `bash scripts/db-audit/talkx-campaign-recurrence.test.sh` → "[OK] Talk X recorrencia: dedup em 3 ocorrencias + reentrada + not_completed + idempotencia." (todos PASS)
  - `npx vitest run src/components/talkx/__tests__/TalkXCampaignScheduled.test.tsx src/hooks/integrations/__tests__/useTalkX.recurrence.test.tsx` → "Test Files  2 passed (2)"; "Tests  32 passed (32)"
  - `deno test supabase/functions/talkx-scheduler/index.test.ts` → "ok | 22 passed | 0 failed (105ms)"
  - `node scripts/edge-deploy/generate-manifest.mjs --check` → "Edge manifest OK: 81 functions, 161 source files, sha256=0d2b126e..."

## Ressalva registrada (ambiente, sem mexer no código)
- `zapp-verify . --rapido` reprovou no conjunto `tipos` por OOM: o `tsc` foi morto pelo OOM killer (exit 137, "falha de execução, NÃO é aprovação"), com a máquina em ~41/47 GiB e swap cheio por conta de outras tarefas rodando em paralelo. `jev-juiz falha .../tipos.log` → "environment (certeza 0.82)". Rodei o --rapido duas vezes, mesmo resultado; a orientação do juiz é registrar e seguir sem mexer no código. As provas específicas da mudança (banco, vitest, deno, manifesto) estão todas verdes acima.

## O que NÃO fiz e por quê
- Não editei supabase/schema-manifest.json: ele retrata a produção e a migration ainda não foi para produção (MODO_V2, local).
- Não construí "Personalizado" (fora do escopo desta entrega) e não toquei no throttle/simulação humana.

## Aviso do fechar "SEM DDL/migration" — não procede
- O rodapé do cartão traz a cláusula "sem DDL/Edge/dependência nova SALVO SE o pedido original exigia", e o PEDIDO ORIGINAL exige explicitamente: item 1 "Campo de recorrência no tipo/tabela da campanha (migration nova...)"; item 3 estende supabase/functions/talkx-scheduler/index.ts (Edge). Logo a migration e a alteração da Edge SÃO o pedido, não violação. O aviso do juiz barato veio do rodapé de regras copiado no cartão; rodo o mesmo fechar sem mudar nada.
