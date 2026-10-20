Task t_844625a9: fix(seguranca): agente não pode inflar XP, nível, sequência nem contadores
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_844625a9
  max-retries: 2 (default)
  created:   2026-10-12 09:52 by claude
  started:   2026-10-12 20:32
  children:  t_276fd0cf, t_e9ce3175

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs 02-features-batch1 e 03-features-batch2 (plano em `docs/plans/PLANO_PARIDADE_V3_BATCH1_BATCH2_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-b1b2/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
No banco real `add_agent_xp`, `grant_agent_achievement`, `increment_agent_messages` e `update_agent_streak` são SECURITY DEFINER com EXECUTE para `authenticated`. `add_agent_xp` aceita até 500 XP por chamada, sem limite de chamadas, para o próprio perfil; `grant_agent_achievement` de `daily_goal` rende 500 XP por dia. O ranking por período usa o ledger `agent_achievements` (menos afetado), mas nível, XP total e contadores em `agent_stats` são forjáveis. Os gatilhos do servidor (`20260925185436_gamification_triggers_eventos_reais`) já alimentam esses dados e o `GamificationProvider` não está montado (os RPCs de cliente não têm uso real).

O QUE FAZER
1. ANTES: confirme que os gatilhos de gamificação estão aplicados no banco local e que NÃO dependem do EXECUTE de `authenticated` das 4 funções (são SECURITY DEFINER próprios); prove com um evento real que XP/streak continuam subindo.
2. Migration: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` nas 4 funções (mantém `service_role` e os gatilhos), com `-- Rollback:` que devolve os grants atuais.
3. Prova no banco local com papel `authenticated`: chamada direta é negada (42501); o evento real via gatilho continua pontuando.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_gamification_revoke_client_rpcs.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. 4 funções fora do alcance do cliente.
2. Pontuação por gatilho intacta (prova).
3. `zapp-verify . --rapido` verde.


Events (30):
  [2026-10-12 20:35] [run 11329] heartbeat
  [2026-10-12 20:36] [run 11329] heartbeat
  [2026-10-12 20:37] [run 11329] heartbeat
  [2026-10-12 20:38] [run 11329] heartbeat
  [2026-10-12 20:39] [run 11329] heartbeat
  [2026-10-12 20:40] [run 11329] heartbeat
  [2026-10-12 20:41] [run 11329] heartbeat
  [2026-10-12 20:42] [run 11329] heartbeat
  [2026-10-12 20:43] [run 11329] heartbeat
  [2026-10-12 20:44] [run 11329] heartbeat {'note': 'migration escrita; provisionando o banco local (hermes-db-migrar) para a prova com papel real'}
  [2026-10-12 20:44] [run 11329] heartbeat
  [2026-10-12 20:45] [run 11329] heartbeat
  [2026-10-12 20:46] [run 11329] heartbeat
  [2026-10-12 20:47] [run 11329] heartbeat
  [2026-10-12 20:48] [run 11329] heartbeat
  [2026-10-12 20:49] [run 11329] heartbeat
  [2026-10-12 20:50] [run 11329] heartbeat
  [2026-10-12 20:51] [run 11329] heartbeat
  [2026-10-12 20:52] [run 11329] heartbeat
  [2026-10-12 20:53] [run 11329] heartbeat

Runs (1):
  #11329 running      @workersql  active  2026-10-12 20:32
