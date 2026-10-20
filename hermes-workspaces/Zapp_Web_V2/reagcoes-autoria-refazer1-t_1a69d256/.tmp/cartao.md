Task t_8d53f9bd: fix(seguranca): reações só pelo próprio autor e sem personificar o cliente
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_8d53f9bd
  max-retries: 2 (default)
  created:   2026-10-12 10:44 by claude
  started:   2026-10-13 02:17
  children:  t_652beec8, t_fa2f142f

Body:
ESPECIALISTA DA ÁREA: workersql (banco, migrations e RLS). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: workersql`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 04 a 16 (auth, admin, inbox, settings, contacts, connections/dashboard) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_04_A_16_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Banco real: `message_reactions` tem políticas duplicadas somadas por OR (INSERT: 'Users can insert reactions for assigned contacts' + `message_reactions_insert_policy`; DELETE: 'Users can delete their own reactions' + `message_reactions_delete_policy`; UPDATE `message_reactions_update_policy`). A política de INSERT por mensagem/contato não exige `user_id` = meu perfil; o DELETE por visibilidade da mensagem permite apagar a reação de um colega ou do cliente; UPDATE sem WITH CHECK. Dois leitores chegaram ao mesmo resultado de forma independente.

O QUE FAZER
1. Consolide: INSERT com `WITH CHECK user_id = get_profile_id_for_user(auth.uid()) AND contact_id IS NULL` (reação do cliente só pelo webhook/service role); UPDATE/DELETE só do autor ou admin/supervisor, com WITH CHECK; remova as políticas antigas redundantes.
2. Prova no banco local: agente não insere como colega nem como cliente; não apaga reação alheia; admin pode moderar; suíte de RLS verde. `-- Rollback:`.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/<ts>_message_reactions_autoria.sql (novo)
- supabase/tests/

CRITÉRIO DE PRONTO
1. Autoria da reação garantida pelo banco.
2. Prova com 3 papéis.
3. `zapp-verify . --rapido` verde.


Events (34):
  [2026-10-13 02:26] [run 12003] heartbeat
  [2026-10-13 02:27] [run 12003] heartbeat
  [2026-10-13 02:28] [run 12003] heartbeat
  [2026-10-13 02:29] [run 12003] heartbeat {'note': 'migration + prova RLS escritas; aguardando o stack local subir para aplicar e rodar a prova'}
  [2026-10-13 02:29] [run 12003] heartbeat
  [2026-10-13 02:30] [run 12003] heartbeat
  [2026-10-13 02:31] [run 12003] heartbeat
  [2026-10-13 02:32] [run 12003] heartbeat
  [2026-10-13 02:33] [run 12003] heartbeat
  [2026-10-13 02:34] [run 12003] heartbeat
  [2026-10-13 02:35] [run 12003] heartbeat
  [2026-10-13 02:36] [run 12003] heartbeat
  [2026-10-13 02:37] [run 12003] heartbeat
  [2026-10-13 02:38] [run 12003] heartbeat
  [2026-10-13 02:39] [run 12003] heartbeat
  [2026-10-13 02:40] [run 12003] heartbeat
  [2026-10-13 02:41] [run 12003] heartbeat
  [2026-10-13 02:42] [run 12003] heartbeat
  [2026-10-13 02:43] [run 12003] heartbeat
  [2026-10-13 02:44] [run 12003] heartbeat

Runs (1):
  #12003 running      @workersql  active  2026-10-13 02:17
