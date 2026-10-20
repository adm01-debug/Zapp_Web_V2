Task t_59210b33: Aplicar AT TIME ZONE do fuso da campanha antes de weekday e DND
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_25061962
  max-retries: 2 (default)
  created:   2026-10-12 16:32 by auto-decomposer
  started:   2026-10-13 08:56
  parents:   t_37e0dde7
  children:  t_25061962, t_5d0f8628

Body:
OBJETIVO: corrigir o uso de `p_at` cru em `talkx_campaign_window_open`. Hoje a função mistura `EXTRACT(ISODOW) % 7` com `EXTRACT(DOW)` e lê `p_at` sem converter para o fuso da campanha, gerando janela/DND errados perto da meia-noite.

ONDE: `supabase/migrations/<HOJE>_talkx_n102_window_fixes.sql` (mesma migration nova do cartão de cast). Não editar `20261009203548_talkx_campaigns_send_weekdays_dnd.sql`.

COMO:
- Faça `p_at AT TIME ZONE <timezone-da-campanha>` (obtenha o fuso da própria campanha já carregada na função; se não houver coluna de fuso, use a fonte que já existe no schema sem inventar coluna nova e registre a decisão no relato).
- Extraia weekday e a hora DND A PARTIR DO VALOR JÁ CONVERTIDO.
- Escolha UMA convenção consistente: ou `ISODOW` (1..7, então `-1` ou `% 7`) ou `DOW`, nunca misturados. Documente no comentário da função qual foi usada e por quê.
- Cubra explicitamente o caso `America/Sao_Paulo`.

CRITÉRIO DE PRONTO:
- Em Postgres descartável, um `p_at` UTC que cai em outro dia/hora em `America/Sao_Paulo` é avaliado pela data/hora local correta (teste manual com pelo menos 2 instantes: um cruzando a meia-noite local e um dentro do horário DND).
- Nenhuma referência a `p_at` cru permanece na extração de weekday/DND.
- Relato com o trecho final e a saída literal dos testes manuais. Não toque em scheduler, hook ou teste Deno.

Comments (1):
  [2026-10-13 09:17] workersql: hotspot: supabase/migrations/20261013230015_talkx_n102_window_fixes.sql — os 4 cartões irmãos do N-102 (t_59210b33, t_a631f82f, t_24edcc38, t_7fa3929d) gravam a MESMA migration nova (`<HOJE>_talkx_n102_window_fixes.sql`), em workspaces paralelos. Versões reservadas por `hermes-db-migrar --nova` até agora: 20261013230014 (cast) e 20261013230015 (este). A integração precisa juntar as 4 correções num só arquivo/ordem, senão o último `CREATE OR REPLACE FUNCTION public.talkx_campaign_window_open` sobrescreve a correção do outro. Também: o arquivo de base 20261009203548 entra por cherry-pick em cada filho (o cartão o lista como leitura); contra a branch do dia isso dá add/add de blob idêntico se a preparação (t_37e0dde7) já tiver integrado.

Events (33):
  [2026-10-13 09:02] [run 12308] heartbeat
  [2026-10-13 09:03] [run 12308] heartbeat
  [2026-10-13 09:04] [run 12308] heartbeat
  [2026-10-13 09:05] [run 12308] heartbeat
  [2026-10-13 09:05] [run 12308] heartbeat {'note': 'base N-102 trazida por cherry-pick; migration nova 20261013230015 criada; escrevendo corpo com AT TIME ZONE'}
  [2026-10-13 09:06] [run 12308] heartbeat
  [2026-10-13 09:07] [run 12308] heartbeat
  [2026-10-13 09:08] [run 12308] heartbeat
  [2026-10-13 09:09] [run 12308] heartbeat
  [2026-10-13 09:10] [run 12308] heartbeat
  [2026-10-13 09:11] [run 12308] heartbeat
  [2026-10-13 09:12] [run 12308] heartbeat
  [2026-10-13 09:13] [run 12308] heartbeat
  [2026-10-13 09:14] [run 12308] heartbeat
  [2026-10-13 09:15] [run 12308] heartbeat
  [2026-10-13 09:16] [run 12308] heartbeat
  [2026-10-13 09:17] commented {'author': 'workersql', 'len': 744}
  [2026-10-13 09:17] [run 12308] heartbeat
  [2026-10-13 09:18] [run 12308] heartbeat
  [2026-10-13 09:19] [run 12308] heartbeat

Runs (1):
  #12308 running      @workersql  active  2026-10-13 08:56
