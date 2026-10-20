Task t_106a978a: feat(db): alerta automático de taxa de falha de envio por conexão e mensagens presas
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_106a978a
  max-retries: 2 (default)
  created:   2026-10-13 08:13 by claude
  started:   2026-10-13 16:33
  parents:   t_bc890f8a

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: 3ª passada da auditoria de paridade V3 -> V2 do doc `docs/estado/05-features-admin.md` (módulo admin da V3). As passadas PD (12/10) e PF/PG (13/10) já geraram cartões; estes são os ACHADOS QUE ELAS DEIXARAM PASSAR (relatórios de 3 leitores, com os mais graves reconferidos no código da branch viva em 13/10/2026). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia sempre `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`: a árvore de trabalho está 99 commits atrás); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor (atomicidade do XP, presença no servidor, sem reprocesso automático, lease de envio). FORA DE ESCOPO (decisões do dono): tags/etiquetas, exportar/importar/baixar/copiar/imprimir/CSV, edição em massa, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador, Evolution fallback, Retry config por tela, API pública, Sicoob, STS, route_permissions dinâmico. Antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
A V3 alerta no NAVEGADOR de quem abriu a tela (`RetryMetricsPanel.tsx:127-188`; `useIdempotencyMissAlerts.ts:179-218` insere em `warroom_alerts` com dedupe só em localStorage): dois admins geram alerta duplicado e, se ninguém abre a tela, não há alerta. A V2 não tem alerta de falha de envio: GL5 avisa por mensagem, M6 é painel manual e o PD-78 só limpa 'sending' preso. A V2 já tem o índice único parcial `ux_warroom_alerts_dedupe_key` (`20261006155408_warroom_alerts_dedupe_key_sla_monitor.sql`). Retry config editável por tela está fora de escopo: o limiar é fixo na função.

O QUE FAZER
1. Job pg_cron a cada 5 min calcula POR CONEXÃO a taxa de falha da última hora (com amostra mínima de 20), a contagem de mensagens em 'sending' preso e as `outcome_unknown`.
2. Acima do limiar (falha >= 20% ou preso > 10), insere em `warroom_alerts` com `dedupe_key` `envio-falha:<conexao>:<hora>`; sem telefone nem texto no alerta; som e push existentes continuam disparando.
3. Não duplique o PD-78 (varredor) nem o M6 (painel): este cartão só alerta.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_alerta_falha_envio.sql (novo)
- supabase/tests/
- src/integrations/supabase/types.ts

CRITÉRIO DE PRONTO
1. Prova no banco local: rodar o job 2x na mesma hora cria 1 alerta.
2. Amostra abaixo do mínimo não alerta.
3. Alerta sem dados pessoais.
4. `zapp-verify . --rapido` verde.


Comments (2):
  [2026-10-13 18:50] default: [supervisor] REINICIAR: O agente repete hermes-tarefa-fechar sem corrigir a causa: a primeira linha do relato é 'Especialista: worker (sql) (area-sql-banco)' e o cartão exige exatamente 'Especialista: workersql'.
ORIENTAÇÃO: Pare de repetir o fechar. Leia o fechar.log e corrija a primeira linha de .tmp/relato.md para exatamente `Especialista: workersql`, sem texto extra. Confira que o relato traz o comando de verificação rodado, a linha de resultado (como `zapp-verify . --rapido` verde) e a prova com os papéis agent/anon/service_role, sem a palavra 'parcial'. Rode `zapp-verify . --rapido` uma vez, faça commit do relato com a árvore limpa e chame hermes-tarefa-fechar uma única vez. Se o fechar travar por memória ou docker, libere os containers de teste antes de tentar de novo.
Trabalho anterior: branch v2/alerta-falha-envio-26101318308772 em /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/alerta-falha-envio-26101318308772 — aproveite os commits que servirem (git cherry-pick) em vez de refazer.
  [2026-10-13 19:01] default: [revisor Claude] REJEITADO: A função é segura (SECURITY DEFINER com search_path, REVOKE total, dedupe idempotente, sem PII), mas o alerta de mensagens presas quase não dispara: o varredor da migration pai roda no mesmo cron (*/5) com o mesmo limite de 15 min e transforma as presas em 'failed' antes do monitor contá-las. Além disso, o relato não segue o formato exigido pelo cartão.
Corrigir: 1) Contagem de presas furada pelo varredor: o monitor e o sweep-stale-outbound-sending rodam em */5 com o mesmo limite de 15 min, então a corrida é indefinida e, se o varredor rodar antes, as linhas já viraram 'failed' sem amostra >= 20 e o alerta de presas não sai. Some em 'presas' também as linhas varridas na janela (messages com status='failed' e delivery_failure_reason='nao_despachada' e updated_at na última hora), ou use outra fonte estável, e cubra isso em T4 (a tabela de teste precisa ganhar a coluna delivery_failure_reason, que vem da migration pai). 2) 'presas' e 'janela' filtram whatsapp_connection_id is not null, mas o claim do diff pai usa coalesce(message.whatsapp_connection_id, contact.whatsapp_connection_id), o que mostra que a linha pode estar sem conexão (justamente o caso de sem_conexao). Resolva a conexão com o mesmo coalesce via contacts (ou justifique por escrito) e acrescente um caso de teste com whatsapp_connection_id nulo e contato com conexão. 3) Texto do alerta disparado só por presas diz 'amostra insuficiente (N envios terminais...)', o que engana; use uma redação própria para o caso de presas. 4) SÓ O RELATO: a primeira linha deve ser EXATAMENTE `Especialista: workersql` (hoje é 'worker (sql) (area-sql-banco)'); ajuste 'mesmo critério do varredor' (o varredor usa coalesce(delivery_claim_expires_at, updated_at); o monitor usa só updated_at) e o comentário do T6 que diz 'extraído do arquivo' mas repete o rollback à mão.
Corrija com commit novo e rode hermes-tarefa-fechar de novo.

Events (424):
  [2026-10-13 18:45] [run 16101] heartbeat
  [2026-10-13 18:46] [run 16101] heartbeat
  [2026-10-13 18:47] [run 16101] heartbeat
  [2026-10-13 18:48] [run 16101] heartbeat
  [2026-10-13 18:49] [run 16101] heartbeat
  [2026-10-13 18:50] [run 16101] heartbeat
  [2026-10-13 18:50] commented {'author': 'default', 'len': 1011}
  [2026-10-13 18:50] [run 16101] reclaimed {'manual': True, 'reason': None, 'prev_lock': 'Joaquim:41912', 'retry_status': 'ready', 'prev_pid': 43784, 'host_local': True, 'termination_attempted': False, 'terminated': True, 'sigkill': False, 'pid_recycled': True}
  [2026-10-13 18:52] [run 16101] terminal_worker_reaped {'pid': 43784, 'worker_started_at': '|179192697289', 'prev_pid': 43784, 'host_local': True, 'termination_attempted': True, 'terminated': True, 'sigkill': False}
  [2026-10-13 19:01] commented {'author': 'default', 'len': 1924}
  [2026-10-14 09:33] reprioritized {'priority': 9}
  [2026-10-14 10:27] [run 16467] claimed {'lock': 'Joaquim:28864', 'expires': 1791985376, 'run_id': 16467}
  [2026-10-14 10:27] [run 16467] spawned {'pid': 32528, 'started_at': '|179198447681'}
  [2026-10-14 10:28] [run 16467] heartbeat
  [2026-10-14 10:29] [run 16467] heartbeat
  [2026-10-14 10:30] [run 16467] heartbeat
  [2026-10-14 10:31] [run 16467] heartbeat
  [2026-10-14 10:32] [run 16467] heartbeat
  [2026-10-14 10:33] [run 16467] heartbeat
  [2026-10-14 10:34] [run 16467] heartbeat

Runs (22):
  #12685 rate_limited @workersql  33s  2026-10-13 16:33
        ! pid 30764 exited rate-limited (quota wall) — requeued without counting a failure
  #12825 rate_limited @workersql  36s  2026-10-13 16:39
        ! pid 31552 exited rate-limited (quota wall) — requeued without counting a failure
  #12980 rate_limited @workersql  24s  2026-10-13 16:44
        ! pid 33932 exited rate-limited (quota wall) — requeued without counting a failure
  #13149 rate_limited @workersql  23s  2026-10-13 16:50
        ! pid 36276 exited rate-limited (quota wall) — requeued without counting a failure
  #13336 rate_limited @workersql  36s  2026-10-13 16:56
        ! pid 37420 exited rate-limited (quota wall) — requeued without counting a failure
  #13503 rate_limited @workersql  35s  2026-10-13 17:02
        ! pid 43624 exited rate-limited (quota wall) — requeued without counting a failure
  #13660 rate_limited @workersql  34s  2026-10-13 17:07
        ! pid 39544 exited rate-limited (quota wall) — requeued without counting a failure
  #13835 rate_limited @workersql  46s  2026-10-13 17:13
        ! pid 9232 exited rate-limited (quota wall) — requeued without counting a failure
  #14018 rate_limited @workersql  66s  2026-10-13 17:19
        ! pid 41648 exited rate-limited (quota wall) — requeued without counting a failure
  #14201 rate_limited @workersql  49s  2026-10-13 17:26
        ! pid 39044 exited rate-limited (quota wall) — requeued without counting a failure
  #14373 rate_limited @workersql  38s  2026-10-13 17:32
        ! pid 36080 exited rate-limited (quota wall) — requeued without counting a failure
  #14550 rate_limited @workersql  38s  2026-10-13 17:37
        ! pid 31352 exited rate-limited (quota wall) — requeued without counting a failure
  #14710 rate_limited @workersql  39s  2026-10-13 17:43
        ! pid 23352 exited rate-limited (quota wall) — requeued without counting a failure
  #14898 rate_limited @workersql  44s  2026-10-13 17:49
        ! pid 16924 exited rate-limited (quota wall) — requeued without counting a failure
  #15089 rate_limited @workersql  33s  2026-10-13 17:55
        ! pid 15824 exited rate-limited (quota wall) — requeued without counting a failure
  #15257 rate_limited @workersql  44s  2026-10-13 18:01
        ! pid 37844 exited rate-limited (quota wall) — requeued without counting a failure
  #15422 rate_limited @workersql  33s  2026-10-13 18:07
        ! pid 30252 exited rate-limited (quota wall) — requeued without counting a failure
  #15581 rate_limited @workersql  35s  2026-10-13 18:12
        ! pid 36736 exited rate-limited (quota wall) — requeued without counting a failure
  #15748 rate_limited @workersql  24s  2026-10-13 18:18
        ! pid 15936 exited rate-limited (quota wall) — requeued without counting a failure
  #15926 rate_limited @workersql  34s  2026-10-13 18:23
        ! pid 30000 exited rate-limited (quota wall) — requeued without counting a failure
  #16101 reclaimed    @workersql  1281s  2026-10-13 18:29
        ! manual_reclaim lock=Joaquim:41912
  #16467 running      @workersql  active  2026-10-14 10:27
