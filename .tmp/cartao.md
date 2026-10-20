Task t_2b046874: fix(db): "agente ausente" passa a usar a presença real (agent_presence), não a última atividade de sessão
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_2b046874
  max-retries: 2 (default)
  created:   2026-10-13 07:50 by claude
  started:   2026-10-13 16:32

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc `docs/estado/07-features-inbox-services.md` (inbox: serviços, hooks e utils). Plano e relatórios: `docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md` e `docs/audits/` (enquanto não integrados: `~/hermes-workspaces/.assets/paridade-07/`). A V3 é só REFERÊNCIA (`~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída), exportar/importar/edição em massa de contatos, ciclo de vida de negócios, SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da cópia viva da V2 em 13/10/2026; o BANCO REAL não foi consultado: confira no banco LOCAL o que o cartão mandar. A cópia lida não tem cartões `done` ainda não integrados: antes de editar, procure cartões irmãos em `~/hermes-workspaces/.v2-fila/*.json` e no quadro e, se algo já estiver feito, prove no relato em vez de refazer.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/supervisor/admin/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem; efeitos sutis respeitando reduzir movimento; cores só as do sistema.

PROBLEMA (evidência conferida)
A função `reassign_absent_agents` (última definição: `supabase/migrations/20260924203300_prevent_contact_assignee_hijack.sql`) decide ausência por `user_sessions.last_activity_at`. Esse campo só é gravado pela Edge `detect-new-device` (e `src/hooks/ui/useDeviceDetection.ts`), que só roda quando telas de Segurança montam. Resultado: quase todo agente online há mais de 30 minutos conta como ausente, e o botão de reatribuir ausentes move a carteira de quem está trabalhando. A presença real existe: `agent_presence` (heartbeat de ~25 s). O cartão PF-09 não corrige o sinal.

O QUE FAZER
1. No banco local (`zapp-db-local psql`), leia a definição VIGENTE da função, quem a chama (RPC do front, cron, Edge) e as colunas de `agent_presence`; registre no relato.
2. Migration aditiva (`CREATE OR REPLACE`) trocando o critério: ausente = sem heartbeat fresco em `agent_presence` (janela configurável, p.ex. 2 minutos) e não online. Mantenha SECURITY DEFINER, `SET search_path`, grants e o papel exigido (admin/supervisor) e as travas contra sequestro de contato.
3. Prova no banco local: (a) agente com heartbeat fresco e sem `user_sessions` recente NÃO é reatribuído; (b) agente sem heartbeat além da janela É; (c) papel sem permissão é negado. `-- Rollback:` completo.
4. Se alguma tela lista os 'ausentes' com outro critério, anote o arquivo no relato (a correção de tela fica para outro cartão).

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_absent_agents_use_presence.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Reatribuição não move a carteira de quem tem heartbeat.
2. Prova com os três casos no banco local.
3. Rollback completo.
4. `zapp-verify . --rapido` verde.


Events (498):
  [2026-10-13 22:16] [run 16255] heartbeat
  [2026-10-13 22:17] [run 16255] heartbeat
  [2026-10-13 22:18] [run 16255] heartbeat
  [2026-10-13 22:19] [run 16255] heartbeat
  [2026-10-13 22:20] [run 16255] heartbeat
  [2026-10-13 22:21] [run 16255] heartbeat
  [2026-10-13 22:22] [run 16255] heartbeat
  [2026-10-13 22:23] [run 16255] heartbeat {'note': 'harness db-audit verde (20 PASS, RED+GREEN+ACL+rollback); indo p/ commit'}
  [2026-10-13 22:23] [run 16255] heartbeat
  [2026-10-13 22:24] [run 16255] heartbeat
  [2026-10-13 22:25] [run 16255] heartbeat
  [2026-10-13 22:26] [run 16255] heartbeat
  [2026-10-13 22:27] [run 16255] heartbeat
  [2026-10-13 22:28] [run 16255] heartbeat
  [2026-10-13 22:29] [run 16255] heartbeat
  [2026-10-13 22:31] [run 16255] heartbeat
  [2026-10-13 22:32] [run 16255] heartbeat
  [2026-10-13 22:33] [run 16255] heartbeat
  [2026-10-13 22:34] [run 16255] heartbeat
  [2026-10-13 22:35] [run 16255] heartbeat

Runs (22):
  #12658 rate_limited @workersql  33s  2026-10-13 16:32
        ! pid 39468 exited rate-limited (quota wall) — requeued without counting a failure
  #12784 rate_limited @workersql  34s  2026-10-13 16:37
        ! pid 29216 exited rate-limited (quota wall) — requeued without counting a failure
  #12941 rate_limited @workersql  22s  2026-10-13 16:43
        ! pid 39212 exited rate-limited (quota wall) — requeued without counting a failure
  #13104 rate_limited @workersql  35s  2026-10-13 16:49
        ! pid 17244 exited rate-limited (quota wall) — requeued without counting a failure
  #13282 rate_limited @workersql  33s  2026-10-13 16:54
        ! pid 27504 exited rate-limited (quota wall) — requeued without counting a failure
  #13460 rate_limited @workersql  38s  2026-10-13 17:00
        ! pid 44752 exited rate-limited (quota wall) — requeued without counting a failure
  #13615 rate_limited @workersql  35s  2026-10-13 17:06
        ! pid 30840 exited rate-limited (quota wall) — requeued without counting a failure
  #13786 rate_limited @workersql  23s  2026-10-13 17:12
        ! pid 33240 exited rate-limited (quota wall) — requeued without counting a failure
  #13958 rate_limited @workersql  23s  2026-10-13 17:17
        ! pid 41444 exited rate-limited (quota wall) — requeued without counting a failure
  #14117 rate_limited @workersql  34s  2026-10-13 17:23
        ! pid 2260 exited rate-limited (quota wall) — requeued without counting a failure
  #14297 rate_limited @workersql  34s  2026-10-13 17:29
        ! pid 36492 exited rate-limited (quota wall) — requeued without counting a failure
  #14469 rate_limited @workersql  36s  2026-10-13 17:35
        ! pid 17716 exited rate-limited (quota wall) — requeued without counting a failure
  #14641 rate_limited @workersql  34s  2026-10-13 17:40
        ! pid 44208 exited rate-limited (quota wall) — requeued without counting a failure
  #14812 rate_limited @workersql  35s  2026-10-13 17:46
        ! pid 41272 exited rate-limited (quota wall) — requeued without counting a failure
  #14995 rate_limited @workersql  35s  2026-10-13 17:52
        ! pid 40216 exited rate-limited (quota wall) — requeued without counting a failure
  #15158 rate_limited @workersql  34s  2026-10-13 17:57
        ! pid 25632 exited rate-limited (quota wall) — requeued without counting a failure
  #15324 rate_limited @workersql  23s  2026-10-13 18:03
        ! pid 6552 exited rate-limited (quota wall) — requeued without counting a failure
  #15474 rate_limited @workersql  35s  2026-10-13 18:08
        ! pid 44320 exited rate-limited (quota wall) — requeued without counting a failure
  #15643 rate_limited @workersql  33s  2026-10-13 18:14
        ! pid 35944 exited rate-limited (quota wall) — requeued without counting a failure
  #15819 rate_limited @workersql  23s  2026-10-13 18:20
        ! pid 30584 exited rate-limited (quota wall) — requeued without counting a failure
  #15985 rate_limited @workersql  34s  2026-10-13 18:25
        ! pid 20556 exited rate-limited (quota wall) — requeued without counting a failure
  #16255 running      @workersql  active  2026-10-13 22:01
