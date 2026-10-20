Task t_c5f212b8: feat(db): auditoria das ações administrativas (perfil, visibilidade, configurações globais, rede)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_c5f212b8
  max-retries: 2 (default)
  created:   2026-10-12 10:36 by claude
  started:   2026-10-13 01:22

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Banco real: só existem gatilhos de auditoria para `user_roles`, `role_permissions`, `contacts` (3) e `department_audit_logs`. Nada audita: `profiles` (`is_active`, `access_level`, `max_chats`, `can_download`), `agent_visibility_grants`, `global_settings`, `ip_whitelist`, `blocked_ips`, `blocked_countries`, `geo_blocking_settings`, `rate_limit_configs`. `audit_logs` não aceita INSERT do cliente (correto), então a escrita tem de ser por gatilho/RPC.

O QUE FAZER
1. Crie um gatilho genérico `audit_admin_change()` (SECURITY DEFINER, `search_path` fixo) que grava ator (`auth.uid()`), tabela, operação, id do alvo e só os NOMES dos campos alterados (e valores não sensíveis); NUNCA grave segredos de `global_settings`, chaves, tokens, telefone ou e-mail.
2. Aplique-o às tabelas acima (confirme os nomes reais das tabelas no banco local). Em `profiles` audite só mudança de `is_active`, `access_level`, `max_chats`, `can_download`.
3. Prova no banco local: cada operação gera 1 registro; campo secreto nunca aparece; escrita por `service_role` registra ator nulo identificado como sistema.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_audit_admin_changes.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Todas as tabelas administrativas auditadas sem segredo.
2. Prova no banco local.
3. `zapp-verify . --rapido` verde.


Comments (1):
  [2026-10-12 11:20] default: [claude] ACRESCENTAR (auditoria 12/10): além das tabelas administrativas, a trilha precisa de DOIS pontos de defesa na porta do cliente: (a) log_audit_event aceita QUALQUER ação de QUALQUER usuário, sem allowlist, tamanho nem rate limit (cartão PE-19 t_e2d34fee); (b) login é gravado a cada recarga do Index (27.324 linhas): limitar a 1 por sessão/dia. Não duplique: este cartão cobre gatilhos nas tabelas administrativas.

Events (32):
  [2026-10-13 01:27] [run 11934] heartbeat
  [2026-10-13 01:28] [run 11934] heartbeat
  [2026-10-13 01:29] [run 11934] heartbeat
  [2026-10-13 01:30] [run 11934] heartbeat
  [2026-10-13 01:31] [run 11934] heartbeat
  [2026-10-13 01:32] [run 11934] heartbeat
  [2026-10-13 01:33] [run 11934] heartbeat
  [2026-10-13 01:34] [run 11934] heartbeat
  [2026-10-13 01:35] [run 11934] heartbeat
  [2026-10-13 01:36] [run 11934] heartbeat
  [2026-10-13 01:37] [run 11934] heartbeat
  [2026-10-13 01:38] [run 11934] heartbeat
  [2026-10-13 01:39] [run 11934] heartbeat
  [2026-10-13 01:40] [run 11934] heartbeat
  [2026-10-13 01:41] [run 11934] heartbeat
  [2026-10-13 01:42] [run 11934] heartbeat
  [2026-10-13 01:43] [run 11934] heartbeat
  [2026-10-13 01:44] [run 11934] heartbeat
  [2026-10-13 01:45] [run 11934] heartbeat
  [2026-10-13 01:46] [run 11934] heartbeat

Runs (1):
  #11934 running      @workersql  active  2026-10-13 01:22
