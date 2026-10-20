Task t_23deb8a0: chore(tags): automações deixam de oferecer gatilho e ação de tag
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_23deb8a0
  max-retries: 2 (default)
  created:   2026-10-13 07:42 by claude
  started:   2026-10-13 16:35

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
ORDEM DO DONO: a função de tags foi excluída do sistema. `components/automations/automationConstants.ts:7` oferece o gatilho `tag_added`, `:14` a ação `add_tag` e `:25` o parâmetro `tag_id`; nenhum cartão TG-A..TG-K cobre automações (o AT2 só diz 'relatar'). Confira também a Edge/executor de automações (`supabase/functions/`) e `useAutomations` para usos de `tag_*`.

O QUE FAZER
1. Remova `tag_added`, `add_tag` e `tag_id` do editor e das constantes; automações já gravadas com esses tipos aparecem como 'obsoleta (tag removida)' e desativadas na lista, sem apagar o registro e sem quebrar a tela; se o executor da Edge referenciar tag, NÃO edite Edge: registre no relato o arquivo e a linha para um cartão do edgar. Busca final por `tag_added|add_tag|tag_id` em `src/components/automations` sem acerto; testes.

ARQUIVOS QUE PODE TOCAR
- src/components/automations/automationConstants.ts
- src/components/automations/AutomationEditorDialog.tsx
- src/components/automations/AutomationsManager.tsx
- testes

CRITÉRIO DE PRONTO
1. Nenhuma opção de tag nas automações.
2. Registros antigos preservados e marcados.
3. `zapp-verify . --rapido` verde.


Events (332):
  [2026-10-14 06:59] [run 16372] claimed {'lock': 'Joaquim:15156', 'expires': 1791972880, 'run_id': 16372}
  [2026-10-14 06:59] [run 16372] spawned {'pid': 22900, 'started_at': '|179197198039'}
  [2026-10-14 06:59] [run 16372] heartbeat
  [2026-10-14 07:00] [run 16372] heartbeat
  [2026-10-14 07:01] [run 16372] heartbeat
  [2026-10-14 07:03] [run 16372] heartbeat
  [2026-10-14 07:04] [run 16372] heartbeat
  [2026-10-14 07:05] [run 16372] heartbeat
  [2026-10-14 07:06] [run 16372] heartbeat
  [2026-10-14 07:07] [run 16372] heartbeat
  [2026-10-14 07:08] [run 16372] heartbeat
  [2026-10-14 07:09] [run 16372] heartbeat
  [2026-10-14 07:10] [run 16372] heartbeat
  [2026-10-14 07:11] [run 16372] heartbeat
  [2026-10-14 07:12] [run 16372] heartbeat
  [2026-10-14 07:13] [run 16372] heartbeat
  [2026-10-14 07:14] [run 16372] heartbeat
  [2026-10-14 07:15] [run 16372] heartbeat
  [2026-10-14 07:16] [run 16372] heartbeat
  [2026-10-14 07:17] [run 16372] heartbeat

Runs (21):
  #12726 rate_limited @iris  40s  2026-10-13 16:35
        ! pid 43416 exited rate-limited (quota wall) — requeued without counting a failure
  #12882 rate_limited @iris  42s  2026-10-13 16:41
        ! pid 36148 exited rate-limited (quota wall) — requeued without counting a failure
  #13062 rate_limited @iris  34s  2026-10-13 16:48
        ! pid 21780 exited rate-limited (quota wall) — requeued without counting a failure
  #13251 rate_limited @iris  34s  2026-10-13 16:54
        ! pid 42400 exited rate-limited (quota wall) — requeued without counting a failure
  #13442 rate_limited @iris  37s  2026-10-13 17:00
        ! pid 44392 exited rate-limited (quota wall) — requeued without counting a failure
  #13602 rate_limited @iris  35s  2026-10-13 17:06
        ! pid 43672 exited rate-limited (quota wall) — requeued without counting a failure
  #13780 rate_limited @iris  35s  2026-10-13 17:12
        ! pid 42100 exited rate-limited (quota wall) — requeued without counting a failure
  #13961 rate_limited @iris  34s  2026-10-13 17:18
        ! pid 41660 exited rate-limited (quota wall) — requeued without counting a failure
  #14127 rate_limited @iris  35s  2026-10-13 17:23
        ! pid 44548 exited rate-limited (quota wall) — requeued without counting a failure
  #14311 rate_limited @iris  23s  2026-10-13 17:29
        ! pid 30976 exited rate-limited (quota wall) — requeued without counting a failure
  #14484 rate_limited @iris  34s  2026-10-13 17:35
        ! pid 30128 exited rate-limited (quota wall) — requeued without counting a failure
  #14664 rate_limited @iris  36s  2026-10-13 17:41
        ! pid 44512 exited rate-limited (quota wall) — requeued without counting a failure
  #14836 rate_limited @iris  34s  2026-10-13 17:47
        ! pid 22856 exited rate-limited (quota wall) — requeued without counting a failure
  #15020 rate_limited @iris  34s  2026-10-13 17:52
        ! pid 34740 exited rate-limited (quota wall) — requeued without counting a failure
  #15183 rate_limited @iris  34s  2026-10-13 17:58
        ! pid 15636 exited rate-limited (quota wall) — requeued without counting a failure
  #15351 rate_limited @iris  38s  2026-10-13 18:04
        ! pid 44388 exited rate-limited (quota wall) — requeued without counting a failure
  #15503 rate_limited @iris  24s  2026-10-13 18:09
        ! pid 16024 exited rate-limited (quota wall) — requeued without counting a failure
  #15663 rate_limited @iris  22s  2026-10-13 18:15
        ! pid 15752 exited rate-limited (quota wall) — requeued without counting a failure
  #15836 rate_limited @iris  34s  2026-10-13 18:20
        ! pid 34772 exited rate-limited (quota wall) — requeued without counting a failure
  #16016 rate_limited @iris  35s  2026-10-13 18:26
        ! pid 13384 exited rate-limited (quota wall) — requeued without counting a failure
  #16372 running      @iris  active  2026-10-14 06:59
