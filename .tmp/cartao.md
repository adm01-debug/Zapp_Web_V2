Task t_a3c004b7: fix(seguranca): conta sem papel não lê configuração interna (27 tabelas com leitura aberta a qualquer autenticado)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a3c004b7
  max-retries: 2 (default)
  created:   2026-10-12 10:35 by claude
  started:   2026-10-12 12:05

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

AÇÃO DO JOAQUIM (fora do repositório): desligar 'Allow new users to sign up' no painel do Supabase (Authentication > Sign In / Providers). Com isso o Google também deixa de criar contas novas; novos colaboradores entram por convite/create-user.

PROBLEMA (evidência conferida)
Auth de produção: `disable_signup = false` (cadastro público ABERTO; confirmação de e-mail exigida, `mailer_autoconfirm = false`) e Google ativo. Qualquer pessoa de fora pode criar e confirmar uma conta e virar `authenticated` SEM papel. No banco real 27 tabelas têm política de SELECT `USING (true)` para `authenticated`: `agent_presence`, `ai_model_prices`, `audio_memes`, `auto_close_config`, `away_messages`, `business_hours`, `channel_routing_rules`, `chatbot_flows`, `csat_auto_config`, `custom_emojis`, `department_invites`, `departments`, `feature_flags`, `number_reputation`, `playbooks`, `products`, `queue_goals`, `queue_skill_requirements`, `queues`, `sales_pipeline_stages`, `sla_configurations`, `stickers`, `talkx_settings`, `whatsapp_connection_queues`, `whatsapp_flows`, `whatsapp_groups`, `whatsapp_templates`. Contatos e mensagens seguem protegidos por `is_contact_visible_to_user`; o risco é configuração interna (fluxos, playbooks, regras, convites de departamento, grupos). O cadastro é fechado no painel do Supabase pelo Joaquim (o cartão SG1 fecha só a tela); este cartão é a defesa em profundidade no banco.

O QUE FAZER
1. Crie `user_has_any_app_role(_user_id uuid)` (STABLE, SECURITY DEFINER, `search_path` fixo, EXECUTE só `authenticated`/`service_role`) que devolve true se o usuário tem qualquer linha em `user_roles`.
2. Recrie as 27 políticas de SELECT acima trocando `true` por `public.user_has_any_app_role(auth.uid())` (mantenha nomes e `TO authenticated`). Confira cada tabela: se alguma for lida legitimamente por fluxo sem login (anon) ou por usuário sem papel (ex.: tela de convite de departamento), NÃO a altere, liste no relato com o motivo.
3. `department_invites`: avalie se o código de convite pode ser lido por qualquer autenticado; se só o convidado e a equipe precisam, restrinja mais (registre a decisão).
4. Prova no banco local com 3 papéis: usuário SEM papel recebe 0 linhas nas 27; agent/supervisor/admin continuam lendo; `service_role` intacto. `-- Rollback:` completo.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_authenticated_sem_papel_nao_le.sql (novo)
- supabase/tests/
- src/integrations/supabase/types.ts (se necessário)

CRITÉRIO DE PRONTO
1. Conta sem papel não lê nenhuma das 27 tabelas.
2. Quem tem papel continua lendo (prova com 3 papéis).
3. Lista de exceções justificada no relato.
4. `zapp-verify . --rapido` verde.


Events (34):
  [2026-10-12 12:14] [run 11096] heartbeat
  [2026-10-12 12:15] [run 11096] heartbeat
  [2026-10-12 12:16] [run 11096] heartbeat
  [2026-10-12 12:17] [run 11096] heartbeat
  [2026-10-12 12:18] [run 11096] heartbeat
  [2026-10-12 12:20] [run 11096] heartbeat
  [2026-10-12 12:21] [run 11096] heartbeat
  [2026-10-12 12:22] [run 11096] heartbeat
  [2026-10-12 12:23] [run 11096] heartbeat
  [2026-10-12 12:24] [run 11096] heartbeat
  [2026-10-12 12:25] [run 11096] heartbeat
  [2026-10-12 12:26] [run 11096] heartbeat
  [2026-10-12 12:27] [run 11096] heartbeat
  [2026-10-12 15:22] [run 11096] reclaim_deferred {'reason': 'ttl_expired_worker_alive', 'claim_lock': 'Joaquim:15248', 'claim_expires_now': 1791829495, 'prev_pid': 37152, 'host_local': True, 'termination_attempted': True, 'terminated': False, 'sigkill': False}
  [2026-10-12 15:22] [run 11096] crashed {'pid': 37152, 'claimer': 'Joaquim:15248', 'worker_output': 'ng terminal… ┊ 💻 $         hermes-tarefa-fechar "fix(db): authenticated sem papel deixa de ler 27 tabelas de config" .tmp/relato.md  0.8s ┊ ⚡ preparing a tool call… ┊ ⚙️  proc      wait proc_23b4bd0  0.0s ┊ 💻 preparing terminal… ┊ 💻 $         tail -60 .tmp/fechar.log  0.5s ┊ 💻 preparing terminal… ┊ 💻 $         sed -n \'1,14p\' supabase/migrations/20261006141643_*.sql  0.7s ┊ ✍️ preparing write_file…', 'retry_status': 'ready'}
  [2026-10-12 15:22] [run 11102] claimed {'lock': 'Joaquim:13636', 'expires': 1791830275, 'run_id': 11102}
  [2026-10-12 15:22] [run 11102] spawned {'pid': 21528, 'started_at': '|179182937553'}
  [2026-10-12 15:23] [run 11102] heartbeat
  [2026-10-12 15:24] [run 11102] heartbeat
  [2026-10-12 15:25] [run 11102] heartbeat

Runs (2):
  #11096 crashed      @workersql  11852s  2026-10-12 12:05
        ! pid 37152 not alive Worker's last output: 'ng terminal… ┊ 💻 $         hermes-tarefa-fechar "fix(db): authenticated sem papel deixa de ler 27 tabelas de config" 
  #11102 running      @workersql  active  2026-10-12 15:22
