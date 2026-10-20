Task t_ec25181f: fix(dados): auto-fechamento de conversas só fecha o que está parado de verdade, em lotes, e entrega a mensagem de encerramento
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_ec25181f
  max-retries: 2 (default)
  created:   2026-10-13 08:52 by claude
  started:   2026-10-13 16:34
  children:  t_cb83cf1c

Body:
ESPECIALISTA DA ÁREA: edgar (Edge Functions). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: edgar`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`supabase/functions/auto-close-conversations/index.ts:139-171` (conferido): seleciona TODO contato com `updated_at < corte` e `assigned_to` não nulo — SEM filtro de `deleted_at`, de status (conversa já resolvida/arquivada), sem `limit`/`order` — e para cada um: grava a mensagem de encerramento com `from('messages').insert({... sender:'agent'})` pelo service role (esse caminho NÃO passa por `enqueue_outbound_message` + `message-delivery`, então a bolha aparece como enviada e o cliente provavelmente não recebe), grava o fechamento e DESATRIBUI o contato. `contacts.updated_at` muda com qualquer UPDATE (edição, projeção, cron), então conversa com mensagem recente pode fechar e conversa velha pode ficar viva. Ninguém agendava esta Edge até o PE-102 (`t_c2f65e14`): ao ligá-la, a primeira rodada pode desatribuir milhares de contatos de uma vez (o PostgREST corta em 1.000 por consulta). A V3 tinha `limit(200)`. NÃO foi possível ler o banco real: confira `auto_close_config` (relate quantas configs ativas e qual `inactivity_hours`).

O QUE FAZER
1. Defina inatividade pela ÚLTIMA MENSAGEM da conversa (não por `contacts.updated_at`), exija conversa aberta (`conversation_status` fora de resolved/archived) e `deleted_at IS NULL`, e que a última mensagem não seja do cliente sem resposta; teto de 200 por execução com `order by` (a próxima rodada continua); registre a falha por contato.
2. Entregue a mensagem de encerramento pelo pipeline oficial (`enqueue_outbound_message` + despacho) com `clientMessageId = auto-close:<contato>:<fechamento>` para idempotência; só desatribua e grave o fechamento se a mensagem for enfileirada (ou registre o motivo).
3. Testes Deno com o `injected` existente: conversa resolvida não fecha; contato excluído não fecha; mensagem recente do cliente não fecha; teto de 200; mensagem é enfileirada (não inserida direto); reexecução não duplica.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/auto-close-conversations/index.ts
- supabase/functions/auto-close-conversations/*.test.ts

CRITÉRIO DE PRONTO
1. Nunca fecha conversa resolvida/excluída/recente.
2. Lote de 200.
3. Mensagem entregue pelo pipeline oficial.
4. `zapp-verify . --rapido` verde.


Comments (2):
  [2026-10-13 18:43] edgar: Achado fora do escopo (não corrigido): o despacho da mensagem de encerramento não tem quem o dispare. `message-delivery` exige chamador autenticado cujo `profile.id` seja o `agent_id` da mensagem (`claim_outbound_message` casa `message.agent_id = p_agent_id`), e não existe agendador que процессы o outbox para uma mensagem sem agente. Esta Edge agora ENFILEIRA no formato oficial (status 'sending' + client_message_id); falta um caminho de despacho para mensagens de sistema — é do pipeline de mensageria/agendamento, não desta Edge. Sugiro cartão para o worker (mensageria).
  [2026-10-13 18:43] edgar: Correção do comentário anterior (erro de digitação): onde lê "não existe agendador que процессы o outbox", leia "não existe agendador que processe o outbox".

Events (266):
  [2026-10-13 18:28] respawn_guarded {'reason': 'rate_limit_cooldown'}
  [2026-10-13 18:29] [run 16108] claimed {'lock': 'Joaquim:41912', 'expires': 1791927873, 'run_id': 16108}
  [2026-10-13 18:29] [run 16108] spawned {'pid': 44340, 'started_at': '|179192697324'}
  [2026-10-13 18:30] [run 16108] heartbeat
  [2026-10-13 18:31] [run 16108] heartbeat
  [2026-10-13 18:32] [run 16108] heartbeat
  [2026-10-13 18:33] [run 16108] heartbeat
  [2026-10-13 18:34] [run 16108] heartbeat
  [2026-10-13 18:35] [run 16108] heartbeat
  [2026-10-13 18:36] [run 16108] heartbeat
  [2026-10-13 18:37] [run 16108] heartbeat
  [2026-10-13 18:38] [run 16108] heartbeat
  [2026-10-13 18:39] [run 16108] heartbeat
  [2026-10-13 18:40] [run 16108] heartbeat
  [2026-10-13 18:41] [run 16108] heartbeat
  [2026-10-13 18:42] [run 16108] heartbeat
  [2026-10-13 18:43] commented {'author': 'edgar', 'len': 576}
  [2026-10-13 18:43] [run 16108] heartbeat
  [2026-10-13 18:43] commented {'author': 'edgar', 'len': 157}
  [2026-10-13 18:44] [run 16108] heartbeat

Runs (20):
  #12720 rate_limited @edgar  47s  2026-10-13 16:34
        ! pid 6644 exited rate-limited (quota wall) — requeued without counting a failure
  #12889 rate_limited @edgar  41s  2026-10-13 16:41
        ! pid 41648 exited rate-limited (quota wall) — requeued without counting a failure
  #13054 rate_limited @edgar  35s  2026-10-13 16:47
        ! pid 25008 exited rate-limited (quota wall) — requeued without counting a failure
  #13244 rate_limited @edgar  34s  2026-10-13 16:53
        ! pid 6452 exited rate-limited (quota wall) — requeued without counting a failure
  #13417 rate_limited @edgar  36s  2026-10-13 16:59
        ! pid 28120 exited rate-limited (quota wall) — requeued without counting a failure
  #13577 rate_limited @edgar  35s  2026-10-13 17:05
        ! pid 29204 exited rate-limited (quota wall) — requeued without counting a failure
  #13749 rate_limited @edgar  35s  2026-10-13 17:11
        ! pid 43476 exited rate-limited (quota wall) — requeued without counting a failure
  #13926 rate_limited @edgar  25s  2026-10-13 17:16
        ! pid 32696 exited rate-limited (quota wall) — requeued without counting a failure
  #14100 rate_limited @edgar  35s  2026-10-13 17:22
        ! pid 18548 exited rate-limited (quota wall) — requeued without counting a failure
  #14280 rate_limited @edgar  38s  2026-10-13 17:28
        ! pid 25868 exited rate-limited (quota wall) — requeued without counting a failure
  #14459 rate_limited @edgar  21s  2026-10-13 17:34
        ! pid 32732 exited rate-limited (quota wall) — requeued without counting a failure
  #14635 rate_limited @edgar  34s  2026-10-13 17:40
        ! pid 35228 exited rate-limited (quota wall) — requeued without counting a failure
  #14833 rate_limited @edgar  33s  2026-10-13 17:47
        ! pid 44020 exited rate-limited (quota wall) — requeued without counting a failure
  #15023 rate_limited @edgar  34s  2026-10-13 17:52
        ! pid 22896 exited rate-limited (quota wall) — requeued without counting a failure
  #15196 rate_limited @edgar  34s  2026-10-13 17:59
        ! pid 38400 exited rate-limited (quota wall) — requeued without counting a failure
  #15367 rate_limited @edgar  37s  2026-10-13 18:04
        ! pid 6676 exited rate-limited (quota wall) — requeued without counting a failure
  #15527 rate_limited @edgar  36s  2026-10-13 18:10
        ! pid 33088 exited rate-limited (quota wall) — requeued without counting a failure
  #15705 rate_limited @edgar  68s  2026-10-13 18:16
        ! pid 18616 exited rate-limited (quota wall) — requeued without counting a failure
  #15913 rate_limited @edgar  38s  2026-10-13 18:23
        ! pid 39592 exited rate-limited (quota wall) — requeued without counting a failure
  #16108 running      @edgar  active  2026-10-13 18:29
