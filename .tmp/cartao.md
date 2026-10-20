Task t_803ddeec: Ampliar full sync do gmail-sync para in:inbox OR in:sent (12 meses)
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_d80d1c01
  max-retries: 2 (default)
  created:   2026-10-17 06:26 by auto-decomposer
  started:   2026-10-17 06:30
  parents:   t_2e04e699
  children:  t_d80d1c01

Body:
Objetivo: o full sync do Gmail deve trazer enviados além da caixa de entrada, dentro de uma janela de 12 meses, respeitando o limite de tempo da Edge.

Arquivo: supabase/functions/gmail-sync/index.ts (query em ~151: `body.query || "in:inbox"`).

Passos:
1. Confirme no código ATUAL (a branch do dia muda) o estado da query e da paginação; se algo já estiver feito, prove no relato.
2. Amplie a consulta para `in:inbox OR in:sent` com janela de 12 meses (ex.: `after:<epoch de 12 meses atrás>`).
3. Respeite o limite de tempo da Edge: limite o número de páginas por invocação e persista o cursor/nextPageToken para continuar em invocações seguintes — NÃO pagine a caixa inteira numa só Edge.
4. Spam/Lixeira/Rascunhos: apenas CONTAGEM do rótulo, sem baixar conteúdo (LGPD). Nada que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.
5. Atualize/crie testes do arquivo tocado e liste-os no relato.

Critério de aceite: `zapp-verify . --rapido` verde; teste cobrindo a query ampliada e o limite de páginas passando. Reporte o comando de verificação e a linha de resultado (ex.: `Test Files N passed, Tests M passed`). Sem 'parcial'.

Comments (1):
  [2026-10-17 06:44] edgar: Achado de escopo (não é deste cartão): o full sync do `gmail-sync` (`sync-inbox`) agora devolve `has_more` e `next_page_token` e para em `GMAIL_FULL_SYNC_MAX_PAGES_PER_RUN` (10) páginas por invocação. Para a varredura dos 12 meses efetivamente terminar, dois seguimentos ficam de fora da área Edge:

1. `src/hooks/integrations/useGmail.ts` (`syncInbox`) precisa devolver `next_page_token` em `page_token` nas próximas chamadas até `has_more === false` (hoje o chamador não passa `page_token`; nada em `src/` consome o campo).
2. `supabase/functions/gmail-cron-sync/index.ts:67` chama `runGmailFullSync(supabase, account.id, accessToken, log, "in:inbox", 50)` sem orçamento — segue com o comportamento anterior (paginaria até o teto absoluto de 100 numa invocação). Dar-lhe o mesmo orçamento + cursor é outro cartão.
3. Persistir o cursor em coluna de `gmail_accounts` (para o cron não depender do chamador) é migration — trilha de banco.

Nenhum arquivo dessas trilhas foi tocado neste cartão.

Events (20):
  [2026-10-17 06:26] created {'by': 'auto-decomposer', 'from_decompose_of': 't_d80d1c01'}
  [2026-10-17 06:26] linked {'parent': 't_2e04e699', 'child': 't_803ddeec'}
  [2026-10-17 06:30] promoted
  [2026-10-17 06:30] [run 19841] claimed {'lock': 'Joaquim:25096', 'expires': 1792230328, 'run_id': 19841}
  [2026-10-17 06:30] [run 19841] spawned {'pid': 42388, 'started_at': '|179222942812'}
  [2026-10-17 06:30] [run 19841] heartbeat
  [2026-10-17 06:31] [run 19841] heartbeat
  [2026-10-17 06:32] [run 19841] heartbeat
  [2026-10-17 06:33] [run 19841] heartbeat
  [2026-10-17 06:34] [run 19841] heartbeat
  [2026-10-17 06:35] [run 19841] heartbeat
  [2026-10-17 06:36] [run 19841] heartbeat
  [2026-10-17 06:37] [run 19841] heartbeat
  [2026-10-17 06:38] [run 19841] heartbeat
  [2026-10-17 06:39] [run 19841] heartbeat
  [2026-10-17 06:41] [run 19841] heartbeat
  [2026-10-17 06:42] [run 19841] heartbeat
  [2026-10-17 06:43] [run 19841] heartbeat
  [2026-10-17 06:44] commented {'author': 'edgar', 'len': 993}
  [2026-10-17 06:44] [run 19841] heartbeat

Runs (1):
  #19841 running      @edgar  active  2026-10-17 06:30
