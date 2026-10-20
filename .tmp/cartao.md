Task t_7d903073: [refazer 1] feat(db): mensagem de ausência por conexão com decisão de envio no servidor (uma por contato a cada 24 h, de
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_7d903073
  max-retries: 2 (default)
  created:   2026-10-15 19:39 by user
  started:   2026-10-16 03:27

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: O código e o teste estão corretos e no escopo: os DROP ficam só no bloco de Rollback comentado, o DELETE do teste roda em fixtures dentro de uma transação que termina em ROLLBACK, e as funções têm search_path fixo e EXECUTE só para service_role. O relato, porém, contradiz o diff num ponto.

O QUE CORRIGIR: SÓ O RELATO: 1) O relato diz que 'a trava 5 chama ESSA funcao (is_within_business_hours), nao reimplementei a regra', mas o diff reescreve a regra dentro de should_send_away_message (v_dow/v_hora, SELECT em business_hours, CASE de is_open/open_time/close_time), e o comentário da própria migration admite 'reescrita aqui'. Corrija o relato para dizer que a regra foi replicada para trazer open_time/close_time às variáveis, e que o T1/T5 só conferem a equivalência com is_within_business_hours nos casos testados (janela fechada e janela 00:00-24:00).

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/away-message-decisao-261015180242c0` (commit e1275c8b0) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
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

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
SSH do WSL (localhost:2222) fora do ar — terminal e leitura de arquivos com timeout; sem acesso ao workspace para cherry-pick + correção do relato. Tentar de novo quando o WSL voltar.

Comments (2):
  [2026-10-15 19:41] default: [jev-entrada] rota=complexo (conf 0.84 → coordenador, p_humano=0.01), faixa=migrations, injeção=0.34, ação externa=0.07 — REFAZER: complexo → semisenior
  [2026-10-16 03:28] semisenior: semisenior: SSH para o WSL (joaquim_ataides@localhost:2222) caiu — `terminal` e `read_file` retornam timeout. Não vou escrever no Windows (regra da interface). Trabalho pendente (só-relato, ponto 1 da recusa) intacto para retomada quando o WSL voltar.

Events (28):
  [2026-10-16 03:28] commented {'author': 'semisenior', 'len': 251}
  [2026-10-16 03:28] [run 19499] blocked {'reason': 'SSH do WSL (localhost:2222) fora do ar — terminal e leitura de arquivos com timeout; sem acesso ao workspace para cherry-pick + correção do relato. Tentar de novo quando o WSL voltar.', 'kind': 'transient', 'recurrences': 1, 'source_status': 'ready'}
  [2026-10-16 07:25] unblocked
  [2026-10-16 14:36] [run 19793] claimed {'lock': 'Joaquim:25096', 'expires': 1792173089, 'run_id': 19793}
  [2026-10-16 14:36] [run 19793] spawned {'pid': 24896, 'started_at': '|179217218938'}
  [2026-10-16 14:36] [run 19793] heartbeat
  [2026-10-16 14:37] [run 19793] heartbeat
  [2026-10-16 14:38] [run 19793] heartbeat
  [2026-10-16 14:39] [run 19793] heartbeat
  [2026-10-16 14:40] [run 19793] heartbeat
  [2026-10-16 14:41] [run 19793] heartbeat
  [2026-10-16 14:42] [run 19793] heartbeat
  [2026-10-16 14:43] [run 19793] heartbeat
  [2026-10-16 14:44] [run 19793] heartbeat
  [2026-10-16 14:45] [run 19793] heartbeat
  [2026-10-16 14:46] [run 19793] heartbeat
  [2026-10-16 14:48] [run 19793] heartbeat
  [2026-10-16 14:49] [run 19793] heartbeat
  [2026-10-16 14:50] [run 19793] heartbeat
  [2026-10-16 14:51] [run 19793] heartbeat

Runs (2):
  #19499 blocked      @semisenior  103s  2026-10-16 03:27
        → SSH do WSL (localhost:2222) fora do ar — terminal e leitura de arquivos com timeout; sem acesso ao workspace para cherry-pick + correção do relato. Tentar de no
  #19793 running      @semisenior  active  2026-10-16 14:36
