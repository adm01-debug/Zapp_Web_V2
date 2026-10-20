Task t_8010d4a7: feat(db): mensagem de ausência por conexão com decisão de envio no servidor (uma por contato a cada 24 h, desligada por padrão)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_8010d4a7
  max-retries: 2 (default)
  created:   2026-10-13 08:52 by claude
  started:   2026-10-13 16:35
  children:  t_afc0e9a5

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/16-components-connections-dashboard.md` (telas de conexões e dashboard). Plano e relatórios: `~/arquitetura-v2/paridade-16/achados_*.md` (cópia para agentes em `~/hermes-workspaces/.assets/paridade-16/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026 (leitores + conferência do Claude em migrations e código); o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

COORDENAÇÃO: AT1/AT2 e PD-45/46 (horário comercial) tocam as mesmas tabelas; leia-os. Os cartões PL-05 (edgar) e PL-06 (iris) dependem deste.

PROBLEMA (evidência conferida)
A tela de horário comercial da V2 permite cadastrar uma 'mensagem de ausência' (`away_messages`) com variáveis `{nome}`, `{horario_abertura}`, `{horario_fechamento}` e promete envio automático fora do horário, mas NADA lê `away_messages` (nenhuma Edge, trigger ou função) e as variáveis nunca são substituídas. (V3 tem o mesmo defeito.) AT1/AT2 cobrem só o gatilho `business_hours` das automações. DECISÃO ADOTADA (vetável): implementar com trava de segurança: desligado por padrão por conexão, no máximo 1 mensagem por contato a cada 24 h, só para mensagem recebida de cliente (não grupo, não bot), nunca em conversa atribuída a um atendente online.

O QUE FAZER
1. No banco local, leia o esquema e a RLS de `away_messages`, `business_hours`, a função `is_within_business_hours` e como o webhook grava mensagem recebida; registre no relato.
2. Migration aditiva: coluna `enabled boolean default false` (se não existir) e tabela `away_message_log(contact_id, connection_id, sent_at)` com RLS só service_role/admin; função `should_send_away_message(p_contact_id, p_connection_id)` SECURITY DEFINER, `search_path` fixo, que devolve o texto já com as variáveis resolvidas (ou NULL) aplicando as travas acima; função `record_away_message(...)` idempotente.
3. Prova no banco local com papéis reais: fora do horário envia 1 vez; segunda mensagem em 24 h não; desligada não; grupo não; dentro do horário não. `-- Rollback:` completo.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_away_message_decision.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Decisão correta nos 5 casos.
2. Variáveis resolvidas no servidor.
3. Prova e Rollback.
4. `zapp-verify . --rapido` verde.


Latest summary:
Fábrica V2 congelada por guarda global, não pelo cartão. `hermes-tarefa-iniciar Zapp_Web_V2 away-message-decisao` → `CONGELADO ... exit 75`. Causa medida: o marcador `~/.local/libexec/hermes-guard/MODO_V2` está AUSENTE (só `CONGELADO`, de 04/10). Com `HERMES_AGENT=1`, o mesmo guard (linhas 5-9) bloqueia `hermes-tarefa-iniciar`, `hermes-tarefa-fechar` e `hermes-db-migrar` → sem workspace, sem migration e sem fechar. Prova de que a fábrica parou junto: o último `INICIO=` em `~/hermes-workspaces/Zapp_Web_V2/*/.hermes-tarefa` é 14/10 10:39:37, e o diretório da guarda tem mtime 10:45. Parecer existente do coordenador: `~/hermes-workspaces/.decisoes/2026-10-14-t_6eeeeca9.md` (11:28) — bloqueio legítimo de infra global; repor MODO_V2 é do Claude/Joaquim. Não contornei a guarda. Ação necessária: repor `MODO_V2` e re-enfileirar o cartão (com workspace, faço a migration `away_message_decision.sql` + teste em `supabase/tests/`, rollback completo e prova com papéis reais).

Comments (2):
  [2026-10-14 11:28] workersql: Especialista: workersql (banco). Bloqueio de infraestrutura, não do cartão — não é defeito do meu escopo.

PASSO 1 (abrir workspace) falhou na guarda:
`hermes-tarefa-iniciar Zapp_Web_V2 away-message-decisao` (workdir ~/projetos/Zapp_Web_V2) →
`CONGELADO: o modo V1 está suspenso...` exit 75 (mensagem de `hermes-tarefa-iniciar` linhas 5-9).

CAUSA MEDIDA (comandos rodados agora):
- `ls -la ~/.local/libexec/hermes-guard/MODO_V2` → No such file or directory.
- `ls ~/.local/libexec/hermes-guard | grep '^[A-Z]'` → só `CONGELADO` (04/10).
- Com `HERMES_AGENT=1` (o meu caso), o mesmo guard das linhas 5-9 está em `hermes-tarefa-iniciar`, `hermes-tarefa-fechar` e `hermes-db-migrar`: sem o marcador `MODO_V2`, recusam com exit 75. Ou seja: sem workspace, sem `hermes-db-migrar` e sem `hermes-tarefa-fechar`.

PROVA DE QUE A FÁBRICA PAROU JUNTO (não é só o meu cartão):
- Último `INICIO=` em `~/hermes-workspaces/Zapp_Web_V2/*/.hermes-tarefa` é `2026-10-14T10:39:37-03:00`; nenhum workspace nasceu depois. Diretório da guarda com mtime 10:45.
- O quadro tem outros agentes no mesmo estado (ex.: `t_cca276de`, `t_4128d906`), registrados no supervisor 11:08 e 11:18 como "bloqueado pela guarda do fechamento (MODO_V2 ausente), pediu decisão, reiniciar não resolve".

PARECER JÁ EXISTENTE: `~/hermes-workspaces/.decisoes/2026-10-14-t_6eeeeca9.md` (coordenador, 11:28) — "CONGELADO presente, MODO_V2 ausente; bloqueio legítimo de infra/guarda global; repor MODO_V2 é do Claude/Joaquim; re-enfileirar só após MODO_V2 voltar".

O QUE FIZ / O QUE NÃO FIZ:
- Não contornei a guarda (nada de env limpo, `git worktree` manual ou tocar em `~/.local/libexec/hermes-guard/`). Regra 07-08/10: só o Joaquim autoriza e nunca se contorna bloqueio da guarda.
- Li o cartão e os irmãos: PL-05 (edgar) já foi entregue (`t_56355b2c`, fila `26101319393152.json`, commit 4b6abcb255) — resolveu a decisão no lado Edge (`supabase/functions/_shared/evolution-webhook-messages.ts`); a parte de BANCO deste cartão (migration aditiva, `away_message_log`, `should_send_away_message`, `record_away_message`, RLS) segue NÃO feita.
- Não escrevi migration nem teste: sem workspace válido não há onde editar/commitar.

PRECISA: repor o marcador `MODO_V2` em `~/.local/libexec/hermes-guard/` (ação do Claude/Joaquim) e re-enfileirar este cartão. Com o workspace de volta, o trabalho é: migration `supabase/migrations/<ts>_away_message_decision.sql` + teste em `supabase/tests/`, com `-- Rollback:` completo, prova no banco LOCAL com papéis reais e `zapp-verify . --rapido` verde.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao

Events (297):
  [2026-10-15 18:43] [run 18635] heartbeat
  [2026-10-15 18:44] [run 18635] heartbeat
  [2026-10-15 18:45] [run 18635] heartbeat
  [2026-10-15 18:46] [run 18635] heartbeat
  [2026-10-15 18:48] [run 18635] heartbeat
  [2026-10-15 18:49] [run 18635] heartbeat
  [2026-10-15 18:50] [run 18635] heartbeat
  [2026-10-15 18:51] [run 18635] heartbeat
  [2026-10-15 18:52] [run 18635] heartbeat
  [2026-10-15 18:53] [run 18635] heartbeat
  [2026-10-15 18:54] [run 18635] heartbeat
  [2026-10-15 18:55] [run 18635] heartbeat
  [2026-10-15 18:56] [run 18635] heartbeat
  [2026-10-15 18:57] [run 18635] heartbeat
  [2026-10-15 18:58] [run 18635] heartbeat
  [2026-10-15 18:59] [run 18635] heartbeat
  [2026-10-15 19:00] [run 18635] heartbeat
  [2026-10-15 19:01] [run 18635] heartbeat
  [2026-10-15 19:02] [run 18635] heartbeat
  [2026-10-15 19:03] [run 18635] heartbeat

Runs (21):
  #12735 rate_limited @workersql  39s  2026-10-13 16:35
        ! pid 42572 exited rate-limited (quota wall) — requeued without counting a failure
  #12893 rate_limited @workersql  41s  2026-10-13 16:41
        ! pid 24144 exited rate-limited (quota wall) — requeued without counting a failure
  #13067 rate_limited @workersql  33s  2026-10-13 16:48
        ! pid 39372 exited rate-limited (quota wall) — requeued without counting a failure
  #13257 rate_limited @workersql  34s  2026-10-13 16:54
        ! pid 28244 exited rate-limited (quota wall) — requeued without counting a failure
  #13467 rate_limited @workersql  35s  2026-10-13 17:01
        ! pid 28344 exited rate-limited (quota wall) — requeued without counting a failure
  #13624 rate_limited @workersql  34s  2026-10-13 17:06
        ! pid 42280 exited rate-limited (quota wall) — requeued without counting a failure
  #13796 rate_limited @workersql  23s  2026-10-13 17:12
        ! pid 22776 exited rate-limited (quota wall) — requeued without counting a failure
  #13972 rate_limited @workersql  34s  2026-10-13 17:18
        ! pid 31120 exited rate-limited (quota wall) — requeued without counting a failure
  #14138 rate_limited @workersql  34s  2026-10-13 17:23
        ! pid 40264 exited rate-limited (quota wall) — requeued without counting a failure
  #14325 rate_limited @workersql  23s  2026-10-13 17:29
        ! pid 27728 exited rate-limited (quota wall) — requeued without counting a failure
  #14498 rate_limited @workersql  34s  2026-10-13 17:35
        ! pid 40628 exited rate-limited (quota wall) — requeued without counting a failure
  #14679 rate_limited @workersql  35s  2026-10-13 17:41
        ! pid 43124 exited rate-limited (quota wall) — requeued without counting a failure
  #14853 rate_limited @workersql  33s  2026-10-13 17:47
        ! pid 37176 exited rate-limited (quota wall) — requeued without counting a failure
  #15037 rate_limited @workersql  23s  2026-10-13 17:53
        ! pid 41936 exited rate-limited (quota wall) — requeued without counting a failure
  #15206 rate_limited @workersql  35s  2026-10-13 17:59
        ! pid 42928 exited rate-limited (quota wall) — requeued without counting a failure
  #15379 rate_limited @workersql  71s  2026-10-13 18:05
        ! pid 37764 exited rate-limited (quota wall) — requeued without counting a failure
  #15562 rate_limited @workersql  43s  2026-10-13 18:11
        ! pid 42916 exited rate-limited (quota wall) — requeued without counting a failure
  #15737 rate_limited @workersql  34s  2026-10-13 18:17
        ! pid 37656 exited rate-limited (quota wall) — requeued without counting a failure
  #15917 rate_limited @workersql  38s  2026-10-13 18:23
        ! pid 37004 exited rate-limited (quota wall) — requeued without counting a failure
  #16593 blocked      @workersql  344s  2026-10-14 11:22
        → Fábrica V2 congelada por guarda global, não pelo cartão. `hermes-tarefa-iniciar Zapp_Web_V2 away-message-decisao` → `CONGELADO ... exit 75`. Causa medida: o mar
  #18635 running      @workersql  active  2026-10-15 18:02
