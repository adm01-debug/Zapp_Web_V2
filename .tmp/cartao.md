Task t_43fe7809: fix(seguranca): auditoria de acesso negado grava a rota tentada (hoje vira NULL)
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_43fe7809
  max-retries: 2 (default)
  created:   2026-10-13 07:51 by claude
  started:   2026-10-13 16:32

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`ProtectedRoute.tsx:145` passa `entityId: location.pathname`; `log_audit_event` converte `entity_id` para uuid e o caminho vira NULL (`20261003272707_reconcile_local_replay_with_canonical.sql:1067-1075`): a rota tentada se perde. O SH1 (`t_444096b8`) pede exatamente a rota na auditoria, mas não vê o NULL. A V3 normaliza em `audit.ts normalizeEntityId` (caminho vai para `details.entity_id_text`). Confira no banco real se as linhas `unauthorized_access` já gravadas têm `entity_id` nulo (o Claude confere).

O QUE FAZER
1. Em `src/lib/audit.ts`, se `entityId` não for UUID, envie `entityId: null` e coloque o valor em `details.entity_id_text`; testes de unidade e do `ProtectedRoute` (a rota aparece no detalhe).

ARQUIVOS QUE PODE TOCAR
- src/lib/audit.ts
- src/lib/__tests__/audit.test.ts
- testes

CRITÉRIO DE PRONTO
1. Rota tentada preservada na auditoria.
2. `zapp-verify . --rapido` verde.


Events (421):
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:29] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-14 07:16] reprioritized {'priority': 9}
  [2026-10-14 07:16] [run 16382] claimed {'lock': 'Joaquim:15156', 'expires': 1791973907, 'run_id': 16382}
  [2026-10-14 07:16] [run 16382] spawned {'pid': 16812, 'started_at': '|179197300731'}
  [2026-10-14 07:16] [run 16382] heartbeat
  [2026-10-14 07:17] [run 16382] heartbeat
  [2026-10-14 07:18] [run 16382] heartbeat
  [2026-10-14 07:20] [run 16382] heartbeat
  [2026-10-14 07:21] [run 16382] heartbeat
  [2026-10-14 07:22] [run 16382] heartbeat
  [2026-10-14 07:23] [run 16382] heartbeat
  [2026-10-14 07:25] [run 16382] heartbeat
  [2026-10-14 07:26] [run 16382] heartbeat
  [2026-10-14 07:27] [run 16382] heartbeat
  [2026-10-14 07:28] [run 16382] heartbeat
  [2026-10-14 07:29] [run 16382] heartbeat
  [2026-10-14 07:30] [run 16382] heartbeat
  [2026-10-14 07:31] [run 16382] heartbeat

Runs (22):
  #12667 rate_limited @hugo  33s  2026-10-13 16:32
        ! pid 33928 exited rate-limited (quota wall) — requeued without counting a failure
  #12798 rate_limited @hugo  35s  2026-10-13 16:38
        ! pid 39784 exited rate-limited (quota wall) — requeued without counting a failure
  #12952 rate_limited @hugo  34s  2026-10-13 16:44
        ! pid 8952 exited rate-limited (quota wall) — requeued without counting a failure
  #13121 rate_limited @hugo  37s  2026-10-13 16:49
        ! pid 38480 exited rate-limited (quota wall) — requeued without counting a failure
  #13305 rate_limited @hugo  22s  2026-10-13 16:55
        ! pid 43648 exited rate-limited (quota wall) — requeued without counting a failure
  #13470 rate_limited @hugo  35s  2026-10-13 17:01
        ! pid 12520 exited rate-limited (quota wall) — requeued without counting a failure
  #13628 rate_limited @hugo  34s  2026-10-13 17:06
        ! pid 43016 exited rate-limited (quota wall) — requeued without counting a failure
  #13803 rate_limited @hugo  23s  2026-10-13 17:12
        ! pid 29336 exited rate-limited (quota wall) — requeued without counting a failure
  #13983 rate_limited @hugo  34s  2026-10-13 17:18
        ! pid 35688 exited rate-limited (quota wall) — requeued without counting a failure
  #14149 rate_limited @hugo  34s  2026-10-13 17:24
        ! pid 36152 exited rate-limited (quota wall) — requeued without counting a failure
  #14320 rate_limited @hugo  34s  2026-10-13 17:29
        ! pid 32800 exited rate-limited (quota wall) — requeued without counting a failure
  #14495 rate_limited @hugo  34s  2026-10-13 17:35
        ! pid 23932 exited rate-limited (quota wall) — requeued without counting a failure
  #14667 rate_limited @hugo  48s  2026-10-13 17:41
        ! pid 42824 exited rate-limited (quota wall) — requeued without counting a failure
  #14837 rate_limited @hugo  33s  2026-10-13 17:47
        ! pid 27800 exited rate-limited (quota wall) — requeued without counting a failure
  #15021 rate_limited @hugo  22s  2026-10-13 17:52
        ! pid 38600 exited rate-limited (quota wall) — requeued without counting a failure
  #15176 rate_limited @hugo  34s  2026-10-13 17:58
        ! pid 37008 exited rate-limited (quota wall) — requeued without counting a failure
  #15344 rate_limited @hugo  36s  2026-10-13 18:04
        ! pid 4052 exited rate-limited (quota wall) — requeued without counting a failure
  #15499 rate_limited @hugo  49s  2026-10-13 18:09
        ! pid 8752 exited rate-limited (quota wall) — requeued without counting a failure
  #15679 rate_limited @hugo  34s  2026-10-13 18:15
        ! pid 22016 exited rate-limited (quota wall) — requeued without counting a failure
  #15857 rate_limited @hugo  34s  2026-10-13 18:21
        ! pid 11468 exited rate-limited (quota wall) — requeued without counting a failure
  #16031 rate_limited @hugo  21s  2026-10-13 18:27
        ! pid 2856 exited rate-limited (quota wall) — requeued without counting a failure
  #16382 running      @hugo  active  2026-10-14 07:16
