Task t_a2d49ea1: fix(db): Team Chat — realtime das reações, exclusão chegando ao painel e permissões de ex-membro (conferir antes)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a2d49ea1
  max-retries: 2 (default)
  created:   2026-10-13 07:53 by claude
  started:   2026-10-13 07:59

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/07-features-inbox-services.md` (inbox: serviços, hooks e utils). Plano e relatórios: `docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md` e `docs/audits/` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-07/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026; o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
Suspeitas do auditor, TODAS a confirmar no banco LOCAL antes de agir: (1) nenhuma migration publica `team_message_reactions` em `supabase_realtime`: a reação de outro membro só aparece após refetch; (2) `team_messages` voltou a `REPLICA IDENTITY DEFAULT` (migration e47): o filtro do realtime não vale em DELETE e a exclusão por outro membro pode não chegar ao painel aberto; (3) DELETE e UPDATE de `team_messages` só checam `sender_id`: ex-membro da conversa ainda apaga ou edita as próprias mensagens antigas; (4) `team_message_reactions` tem políticas antigas e novas somadas por OR.

O QUE FAZER
1. Consulte `pg_publication_tables`, `pg_class.relreplident` e `pg_policies` de `team_messages`, `team_message_reactions` e `team_conversations`; escreva no relato o que confirmou e o que NÃO confirmou.
2. Corrija só o confirmado, em migration aditiva: publicar a tabela no realtime; definir REPLICA IDENTITY adequada (avalie o custo e justifique); exigir participação ativa na conversa em UPDATE/DELETE; consolidar as políticas duplicadas.
3. Prova no banco local com papéis: membro ativo, ex-membro, outro usuário, admin. `-- Rollback:` completo.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_team_chat_realtime_e_politicas.sql (novo, só se algo for confirmado)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Relato lista suspeita por suspeita: confirmada ou não, com a consulta.
2. Ex-membro não edita nem apaga.
3. Reação e exclusão chegam em tempo real (prova).
4. `zapp-verify . --rapido` verde.


Latest summary:
Backend terminal degradado: SSH para joaquim_ataides@localhost:2222 dá timeout em 3 tentativas (inclusive comando trivial). Sem WSL não há workspace, consulta ao banco local, migration nem verificação. Reatribuir/retomar quando o SSH voltar.

Comments (1):
  [2026-10-13 08:01] workersql: Bloqueio por infraestrutura: o backend `terminal` (SSH `joaquim_ataides@localhost:2222`) está degradado — 3 chamadas seguidas (`hermes-tarefa-iniciar`, um `uname -a && whoami && pwd` simples) devolvem `SSH connection ... timed out`. Sem terminal não consigo criar o workspace da tarefa (`hermes-tarefa-iniciar`), consultar `pg_publication_tables`/`pg_class.relreplident`/`pg_policies` no banco LOCAL, escrever a migration nem rodar `zapp-verify`. Nenhum arquivo foi tocado; nenhuma migration criada. Retomar quando o WSL/sshd voltar.

Events (473):
  [2026-10-14 07:28] [run 16377] heartbeat
  [2026-10-14 07:29] [run 16377] heartbeat
  [2026-10-14 07:30] [run 16377] heartbeat
  [2026-10-14 07:31] [run 16377] heartbeat
  [2026-10-14 07:32] [run 16377] heartbeat
  [2026-10-14 07:33] [run 16377] heartbeat
  [2026-10-14 07:34] [run 16377] heartbeat
  [2026-10-14 07:35] [run 16377] heartbeat
  [2026-10-14 07:36] [run 16377] heartbeat
  [2026-10-14 07:37] [run 16377] heartbeat
  [2026-10-14 07:38] [run 16377] heartbeat
  [2026-10-14 07:39] [run 16377] heartbeat
  [2026-10-14 07:40] [run 16377] heartbeat
  [2026-10-14 07:41] [run 16377] heartbeat
  [2026-10-14 07:42] [run 16377] heartbeat
  [2026-10-14 07:43] [run 16377] heartbeat
  [2026-10-14 07:44] [run 16377] heartbeat
  [2026-10-14 07:45] [run 16377] heartbeat
  [2026-10-14 07:46] [run 16377] heartbeat
  [2026-10-14 07:48] [run 16377] heartbeat

Runs (23):
  #12257 blocked      @workersql  104s  2026-10-13 07:59
        → Backend terminal degradado: SSH para joaquim_ataides@localhost:2222 dá timeout em 3 tentativas (inclusive comando trivial). Sem WSL não há workspace, consulta a
  #12676 rate_limited @workersql  22s  2026-10-13 16:33
        ! pid 21684 exited rate-limited (quota wall) — requeued without counting a failure
  #12808 rate_limited @workersql  34s  2026-10-13 16:38
        ! pid 7044 exited rate-limited (quota wall) — requeued without counting a failure
  #12966 rate_limited @workersql  34s  2026-10-13 16:44
        ! pid 43180 exited rate-limited (quota wall) — requeued without counting a failure
  #13133 rate_limited @workersql  37s  2026-10-13 16:50
        ! pid 14404 exited rate-limited (quota wall) — requeued without counting a failure
  #13322 rate_limited @workersql  34s  2026-10-13 16:56
        ! pid 34928 exited rate-limited (quota wall) — requeued without counting a failure
  #13484 rate_limited @workersql  24s  2026-10-13 17:01
        ! pid 39508 exited rate-limited (quota wall) — requeued without counting a failure
  #13641 rate_limited @workersql  23s  2026-10-13 17:07
        ! pid 34348 exited rate-limited (quota wall) — requeued without counting a failure
  #13808 rate_limited @workersql  34s  2026-10-13 17:12
        ! pid 41320 exited rate-limited (quota wall) — requeued without counting a failure
  #13986 rate_limited @workersql  34s  2026-10-13 17:18
        ! pid 26696 exited rate-limited (quota wall) — requeued without counting a failure
  #14152 rate_limited @workersql  34s  2026-10-13 17:24
        ! pid 24232 exited rate-limited (quota wall) — requeued without counting a failure
  #14323 rate_limited @workersql  23s  2026-10-13 17:29
        ! pid 27596 exited rate-limited (quota wall) — requeued without counting a failure
  #14490 rate_limited @workersql  34s  2026-10-13 17:35
        ! pid 19684 exited rate-limited (quota wall) — requeued without counting a failure
  #14658 rate_limited @workersql  35s  2026-10-13 17:41
        ! pid 13720 exited rate-limited (quota wall) — requeued without counting a failure
  #14827 rate_limited @workersql  33s  2026-10-13 17:46
        ! pid 6320 exited rate-limited (quota wall) — requeued without counting a failure
  #15012 rate_limited @workersql  33s  2026-10-13 17:52
        ! pid 31252 exited rate-limited (quota wall) — requeued without counting a failure
  #15179 rate_limited @workersql  34s  2026-10-13 17:58
        ! pid 23704 exited rate-limited (quota wall) — requeued without counting a failure
  #15354 rate_limited @workersql  38s  2026-10-13 18:04
        ! pid 24940 exited rate-limited (quota wall) — requeued without counting a failure
  #15508 rate_limited @workersql  37s  2026-10-13 18:10
        ! pid 33004 exited rate-limited (quota wall) — requeued without counting a failure
  #15685 rate_limited @workersql  35s  2026-10-13 18:15
        ! pid 34536 exited rate-limited (quota wall) — requeued without counting a failure
  #15864 rate_limited @workersql  34s  2026-10-13 18:21
        ! pid 6352 exited rate-limited (quota wall) — requeued without counting a failure
  #16041 rate_limited @workersql  35s  2026-10-13 18:27
        ! pid 41540 exited rate-limited (quota wall) — requeued without counting a failure
  #16377 running      @workersql  active  2026-10-14 07:06
