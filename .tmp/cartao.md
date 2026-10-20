Task t_fce935ee: Auditar scripts/edge-deploy e regeneracao do manifesto em busca do defeito
  status:    running
  assignee:  worker
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_45b1201f
  max-retries: 2 (default)
  created:   2026-10-13 04:26 by auto-decomposer
  started:   2026-10-13 04:28
  children:  t_45b1201f, t_9071c21d

Body:
OBJETIVO: por analise estatica, levantar a causa candidata do vermelho, ja que o commit muda apenas o manifesto e a checagem bytes+sha256 dos source_files ja confere.

CONTEXTO: 96dd72dc5 altera somente supabase/deployment-manifest.json (regeracao pelo script do repo). Se os 161 source_files batem 1-a-1 com os blobs, o defeito provavelmente esta em algo que a checagem de bytes NAO cobre: campos gerados que nao sao source_files (hashes/config de funcoes Edge, verify_jwt, ordem/estabilidade de serializacao, entradas removidas/duplicadas, campos derivados desatualizados), ou no proprio script gerador em scripts/edge-deploy/**.

COMO FAZER:
1. Leia o(s) script(s) de scripts/edge-deploy/** que geram/validam o manifesto.
2. Compare o manifesto do commit com o que o script produziria a partir do mesmo estado-fonte; procure divergencias silenciosas (silent failures): campos que o validador ignora, checks que passam por acidente, dependencia de ambiente/timestamp/ordem.
3. Se a causa apontar para uma fonte de Edge, inspecione supabase/functions/** correspondente.

CRITERIO DE PRONTO:
- Lista de causas candidatas com evidencia concreta (arquivo:linha, trecho, diff ou comando) — no maximo as mais plausiveis, ordenadas.
- Declaracao explicita de se a causa parece DENTRO da area edge (scripts/edge-deploy/**, supabase/functions/**) ou FORA dela.
- Nao edite supabase/deployment-manifest.json a mao.

NAO aplique correcao nesta tarefa — apenas diagnostico com evidencia.

Events (26):
  [2026-10-13 04:29] [run 12101] heartbeat
  [2026-10-13 04:30] [run 12101] heartbeat
  [2026-10-13 04:31] [run 12101] heartbeat
  [2026-10-13 04:32] [run 12101] heartbeat
  [2026-10-13 04:33] [run 12101] heartbeat
  [2026-10-13 04:34] [run 12101] heartbeat
  [2026-10-13 04:35] [run 12101] heartbeat
  [2026-10-13 04:36] [run 12101] heartbeat
  [2026-10-13 04:37] [run 12101] heartbeat
  [2026-10-13 04:38] [run 12101] heartbeat
  [2026-10-13 04:39] [run 12101] heartbeat
  [2026-10-13 04:40] [run 12101] heartbeat
  [2026-10-13 04:41] [run 12101] heartbeat
  [2026-10-13 04:42] [run 12101] heartbeat
  [2026-10-13 04:43] [run 12101] heartbeat
  [2026-10-13 04:44] [run 12101] heartbeat
  [2026-10-13 04:45] [run 12101] heartbeat
  [2026-10-13 04:46] [run 12101] heartbeat
  [2026-10-13 04:47] [run 12101] heartbeat
  [2026-10-13 04:48] [run 12101] heartbeat

Runs (1):
  #12101 running      @worker  active  2026-10-13 04:28
