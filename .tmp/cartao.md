Task t_911b61b1: feat(db): remover papel por RPC com as mesmas travas de trocar papel (último admin, auto-remoção, auditoria)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_911b61b1
  max-retries: 2 (default)
  created:   2026-10-12 10:36 by claude
  started:   2026-10-13 00:50
  children:  t_7055f245

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`admin_set_role` existe (SECURITY DEFINER, exige admin, trava auto-rebaixamento e último admin, audita o ator), mas NÃO existe `admin_remove_role`. A `RolesPage` (`useRolesPageState.ts`, `handleAddRole`/`handleRemoveRole`) faz insert/delete direto em `user_roles`, só protegida pela RLS de admin: dá para remover o último papel de admin ou o próprio. Hoje há 4 admins.

O QUE FAZER
1. Crie `admin_add_role(_user_id, _role)` e `admin_remove_role(_user_id, _role)` seguindo `admin_set_role` (JWT, só admin, não remove o último admin, não remove o próprio papel de admin, auditoria via trigger existente), EXECUTE só `authenticated`/`service_role`.
2. Prova no banco local: remover último admin é negado; auto-remoção negada; agente chamando é negado; sucesso grava auditoria.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_admin_add_remove_role.sql (novo)
- supabase/tests/user_roles_*.sql
- src/integrations/supabase/types.ts

CRITÉRIO DE PRONTO
1. Duas RPCs com todas as travas.
2. Prova no banco local.
3. `zapp-verify . --rapido` verde.


Events (40):
  [2026-10-13 01:04] [run 11884] heartbeat
  [2026-10-13 01:05] [run 11884] heartbeat
  [2026-10-13 01:06] [run 11884] heartbeat
  [2026-10-13 01:07] [run 11884] heartbeat
  [2026-10-13 01:08] [run 11884] heartbeat
  [2026-10-13 01:09] [run 11884] heartbeat
  [2026-10-13 01:11] [run 11884] heartbeat
  [2026-10-13 01:12] [run 11884] heartbeat
  [2026-10-13 01:13] [run 11884] heartbeat
  [2026-10-13 01:14] [run 11884] heartbeat
  [2026-10-13 01:15] [run 11884] heartbeat
  [2026-10-13 01:16] [run 11884] heartbeat
  [2026-10-13 01:17] [run 11884] heartbeat
  [2026-10-13 01:18] [run 11884] heartbeat
  [2026-10-13 01:19] [run 11884] heartbeat
  [2026-10-13 01:20] [run 11884] heartbeat
  [2026-10-13 01:21] [run 11884] heartbeat
  [2026-10-13 01:22] [run 11884] heartbeat
  [2026-10-13 01:23] [run 11884] heartbeat
  [2026-10-13 01:24] [run 11884] heartbeat

Runs (1):
  #11884 running      @workersql  active  2026-10-13 00:50
