Task t_f4041bd2: Aplicar messageDeleted/labelAdded/labelRemoved no gmail-cron-sync
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_d80d1c01
  max-retries: 2 (default)
  created:   2026-10-17 06:26 by auto-decomposer
  started:   2026-10-17 06:30
  parents:   t_2e04e699
  children:  t_d80d1c01

Body:
Objetivo: o incremental do cron deve refletir exclusões e mudanças de rótulo feitas no Gmail (hoje só aplica `messageAdded`).

Arquivo: supabase/functions/gmail-cron-sync/index.ts (historyTypes em ~20, query em ~67).

Passos:
1. Confirme no código ATUAL o estado do incremental.
2. Amplie a consulta do cron para `in:inbox OR in:sent` dentro de 12 meses.
3. Passe a aplicar `messageDeleted`, `labelAdded` e `labelRemoved` (não só `messageAdded`).
4. Atualize/crie testes do arquivo tocado cobrindo cada historyType; liste-os no relato.

Critério de aceite: `zapp-verify . --rapido` verde; testes cobrindo messageDeleted/labelAdded/labelRemoved passando. Reporte o comando de verificação e a linha de resultado (ex.: `Test Files N passed, Tests M passed`). Sem 'parcial'.

Events (11):
  [2026-10-17 06:26] created {'by': 'auto-decomposer', 'from_decompose_of': 't_d80d1c01'}
  [2026-10-17 06:26] linked {'parent': 't_2e04e699', 'child': 't_f4041bd2'}
  [2026-10-17 06:30] promoted
  [2026-10-17 06:30] [run 19842] claimed {'lock': 'Joaquim:25096', 'expires': 1792230328, 'run_id': 19842}
  [2026-10-17 06:30] [run 19842] spawned {'pid': 25492, 'started_at': '|179222942815'}
  [2026-10-17 06:30] [run 19842] heartbeat
  [2026-10-17 06:31] [run 19842] heartbeat
  [2026-10-17 06:32] [run 19842] heartbeat
  [2026-10-17 06:33] [run 19842] heartbeat
  [2026-10-17 06:34] [run 19842] heartbeat
  [2026-10-17 06:35] [run 19842] heartbeat

Runs (1):
  #19842 running      @edgar  active  2026-10-17 06:30
