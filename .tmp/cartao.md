Task t_8ea464f2: feat(db): admin destrava conta bloqueada por tentativas de login, com auditoria
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_8ea464f2
  max-retries: 2 (default)
  created:   2026-10-13 09:01 by claude
  started:   2026-10-14 11:59
  children:  t_35f3740e

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/24-hooks-raiz-2.md (hooks da raiz de src/hooks: contato, dashboard, e-mail/Gmail, Evolution, APIs externas, grupos, metas) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_RAIZ2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`clear_login_attempts` só aceita o próprio e-mail ou `service_role` (`20260827180000_guard_clear_login_attempts.sql`); LA1/LA2 só LISTAM. O usuário bloqueado espera o prazo.

O QUE FAZER
1. RPC `admin_unlock_login(p_email)` (SECURITY DEFINER, `search_path` fixo, `is_admin`) que registra na auditoria QUEM destravou (sem o e-mail completo no log); prova no banco local por papel; `-- Rollback:`.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_admin_unlock_login.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Admin destrava, agente não; auditoria gravada (provas por papel).
2. `zapp-verify . --rapido` verde.


Latest summary:
MODO_V2 ausente em ~/.local/libexec/hermes-guard (só CONGELADO presente): `hermes-tarefa-iniciar` sai 75 e não abre workspace, e não há outro comando de início. Nenhum agente consegue trabalhar nesta máquina. Pedido registrado em hermes-pedir-decisao id 20261014-120209-2f87-sem-tarefa (religar a flag MODO_V2). Não crio workspace à mão.

Comments (3):
  [2026-10-14 12:02] workersql: Bloqueio de ambiente (não é do cartão): `hermes-tarefa-iniciar Zapp_Web_V2 admin-unlock-login` sai 75 — "CONGELADO: o modo V1 está suspenso pela Arquitetura V2". Causa verificada no filesystem: `~/.local/libexec/hermes-guard/MODO_V2` está AUSENTE (o `CONGELADO`, de 04/10, segue presente), então o script cai no caminho congelado e não abre workspace. Não existe comando alternativo de início. Os cartões de hoje (t_2f61bbd8, t_8b123f2f) abriram em MODO=V2 às 08:58; o marcador sumiu depois. Decisão registrada: `hermes-pedir-decisao` id 20261014-120209-2f87-sem-tarefa (religar a flag MODO_V2). Não crio workspace à mão. Trabalho do cartão preservado no card; basta reabrir quando o V2 voltar.
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 22:18] workersql: Achado fora do escopo (não corrigido, é decisão do dono): a RLS de `public.login_attempts` libera DELETE para `is_admin_or_supervisor` (policy "Only admins can delete login attempts", migration 20260404162520), então um SUPERVISOR ainda consegue destravar apagando a linha direto pelo PostgREST, sem passar pela RPC. A RPC `admin_unlock_login` do cartão é mais estrita de propósito (só `is_admin`, como o critério de pronto pediu) — daí a assimetria: supervisor não usa a RPC, mas usa o caminho direto. Quem decide se os dois caminhos devem ter a MESMA autoridade é o Jev/Claude; se for para alinhar, é uma migration nova (dropa/recria a policy) e um cartão próprio.

Events (37):
  [2026-10-15 21:59] [run 18756] heartbeat
  [2026-10-15 22:00] [run 18756] heartbeat
  [2026-10-15 22:01] [run 18756] heartbeat
  [2026-10-15 22:02] [run 18756] heartbeat
  [2026-10-15 22:03] [run 18756] heartbeat
  [2026-10-15 22:04] [run 18756] heartbeat
  [2026-10-15 22:05] [run 18756] heartbeat
  [2026-10-15 22:06] [run 18756] heartbeat
  [2026-10-15 22:07] [run 18756] heartbeat
  [2026-10-15 22:08] [run 18756] heartbeat
  [2026-10-15 22:09] [run 18756] heartbeat
  [2026-10-15 22:10] [run 18756] heartbeat
  [2026-10-15 22:11] [run 18756] heartbeat
  [2026-10-15 22:12] [run 18756] heartbeat
  [2026-10-15 22:13] [run 18756] heartbeat
  [2026-10-15 22:14] [run 18756] heartbeat
  [2026-10-15 22:15] [run 18756] heartbeat
  [2026-10-15 22:16] [run 18756] heartbeat
  [2026-10-15 22:17] [run 18756] heartbeat
  [2026-10-15 22:18] commented {'author': 'workersql', 'len': 666}

Runs (2):
  #16745 blocked      @workersql  179s  2026-10-14 11:59
        → MODO_V2 ausente em ~/.local/libexec/hermes-guard (só CONGELADO presente): `hermes-tarefa-iniciar` sai 75 e não abre workspace, e não há outro comando de início.
  #18756 running      @workersql  active  2026-10-15 21:54
