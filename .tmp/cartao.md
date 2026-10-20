Task t_2171f991: fix(seguranca): aba de Auditoria mostra totais reais, ator, filtro de data e erro visível
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_2171f991
  max-retries: 2 (default)
  created:   2026-10-13 07:42 by claude
  started:   2026-10-13 16:10
  parents:   t_4d66a644

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
Ver PG-06. `AuditLogDashboard.tsx:97` `if (!error && data)` engole o erro: falha de RLS ou rede vira 'Nenhum log encontrado'; o supervisor (que enxerga a aba, pois `SecurityView` é STAFF) vê zeros sem aviso porque a policy é só admin; só aparece `user_id`, sem nome do ator, sem filtro de data nem paginação.

O QUE FAZER
1. Use as funções do PG-06 (consulta colocada junto da tela, num hook local); mostre o nome do ator, filtro de data, paginação por cursor, skeleton e erro explícito com 'Tentar de novo'; para quem não é admin mostre 'Você não tem permissão para ver a auditoria' (nunca zeros); testes e captura.

ARQUIVOS QUE PODE TOCAR
- src/components/security/AuditLogDashboard.tsx
- testes

CRITÉRIO DE PRONTO
1. Sem número falso.
2. Erro e permissão explícitos.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-13 14:28] default: [claude] AUDITORIA 13/10 — SOBREPOSIÇÃO com HZ-07 t_7d74e43f (hugo, outra sessão). Mesmo alvo (totais reais na aba de Auditoria). Confira o que já existe antes de implementar.

Events (345):
  [2026-10-13 18:27] [run 16035] rate_limited {'pid': 38480, 'claimer': 'Joaquim:41912', 'exit_code': 75, 'retry_status': 'ready'}
  [2026-10-13 18:27] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:29] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-14 07:00] [run 16373] claimed {'lock': 'Joaquim:15156', 'expires': 1791972911, 'run_id': 16373}
  [2026-10-14 07:00] [run 16373] spawned {'pid': 27148, 'started_at': '|179197201187'}
  [2026-10-14 07:00] [run 16373] heartbeat
  [2026-10-14 07:01] [run 16373] heartbeat
  [2026-10-14 07:02] [run 16373] heartbeat
  [2026-10-14 07:03] [run 16373] heartbeat
  [2026-10-14 07:04] [run 16373] heartbeat
  [2026-10-14 07:05] [run 16373] heartbeat
  [2026-10-14 07:06] [run 16373] heartbeat
  [2026-10-14 07:07] [run 16373] heartbeat
  [2026-10-14 07:08] [run 16373] heartbeat
  [2026-10-14 07:09] [run 16373] heartbeat
  [2026-10-14 07:11] [run 16373] heartbeat
  [2026-10-14 07:12] [run 16373] heartbeat

Runs (22):
  #12634 rate_limited @iris  1288s  2026-10-13 16:10
        ! pid 29500 exited rate-limited (quota wall) — requeued without counting a failure
  #12777 rate_limited @iris  34s  2026-10-13 16:37
        ! pid 41312 exited rate-limited (quota wall) — requeued without counting a failure
  #12931 rate_limited @iris  22s  2026-10-13 16:43
        ! pid 21928 exited rate-limited (quota wall) — requeued without counting a failure
  #13099 rate_limited @iris  23s  2026-10-13 16:49
        ! pid 43648 exited rate-limited (quota wall) — requeued without counting a failure
  #13269 rate_limited @iris  23s  2026-10-13 16:54
        ! pid 44772 exited rate-limited (quota wall) — requeued without counting a failure
  #13446 rate_limited @iris  39s  2026-10-13 17:00
        ! pid 40092 exited rate-limited (quota wall) — requeued without counting a failure
  #13607 rate_limited @iris  36s  2026-10-13 17:06
        ! pid 34528 exited rate-limited (quota wall) — requeued without counting a failure
  #13800 rate_limited @iris  23s  2026-10-13 17:12
        ! pid 33936 exited rate-limited (quota wall) — requeued without counting a failure
  #13981 rate_limited @iris  34s  2026-10-13 17:18
        ! pid 39100 exited rate-limited (quota wall) — requeued without counting a failure
  #14146 rate_limited @iris  34s  2026-10-13 17:24
        ! pid 41164 exited rate-limited (quota wall) — requeued without counting a failure
  #14327 rate_limited @iris  34s  2026-10-13 17:30
        ! pid 43164 exited rate-limited (quota wall) — requeued without counting a failure
  #14494 rate_limited @iris  22s  2026-10-13 17:35
        ! pid 39544 exited rate-limited (quota wall) — requeued without counting a failure
  #14669 rate_limited @iris  37s  2026-10-13 17:41
        ! pid 37436 exited rate-limited (quota wall) — requeued without counting a failure
  #14841 rate_limited @iris  34s  2026-10-13 17:47
        ! pid 28768 exited rate-limited (quota wall) — requeued without counting a failure
  #15025 rate_limited @iris  35s  2026-10-13 17:53
        ! pid 43340 exited rate-limited (quota wall) — requeued without counting a failure
  #15189 rate_limited @iris  34s  2026-10-13 17:58
        ! pid 40940 exited rate-limited (quota wall) — requeued without counting a failure
  #15361 rate_limited @iris  38s  2026-10-13 18:04
        ! pid 39748 exited rate-limited (quota wall) — requeued without counting a failure
  #15516 rate_limited @iris  36s  2026-10-13 18:10
        ! pid 42516 exited rate-limited (quota wall) — requeued without counting a failure
  #15690 rate_limited @iris  35s  2026-10-13 18:16
        ! pid 33124 exited rate-limited (quota wall) — requeued without counting a failure
  #15867 rate_limited @iris  23s  2026-10-13 18:21
        ! pid 29336 exited rate-limited (quota wall) — requeued without counting a failure
  #16035 rate_limited @iris  34s  2026-10-13 18:27
        ! pid 38480 exited rate-limited (quota wall) — requeued without counting a failure
  #16373 running      @iris  active  2026-10-14 07:00
