Task t_a76a353e: fix(inbox): 13 botões só de ícone ganham nome acessível
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a76a353e
  max-retries: 2 (default)
  created:   2026-10-12 11:17 by claude
  started:   2026-10-13 06:08

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
Sem `aria-label`: `AudioMessagePlayer.tsx:115` (play/pause/erro), `CRMAutoSync.tsx:141`, `ConversationSummary.tsx:169` (dispensar aviso), `FileUploader.tsx:86,176`, `KeyboardShortcutsHelp.tsx:33`, `MessageContextActions.tsx:142`, `MessageReactions.tsx:253`, `VoiceChanger.tsx:212`, `VoiceChangerPicker.tsx:278,292`, `AISuggestions.tsx:203` (fechar) e `MessageTemplates.tsx:81` (fechar formulário). A V3 tem os rótulos ('Reproduzir áudio', 'Dispensar aviso de áudio'...). Coordene com PE-03, PE-48 e PD-43 (outros arquivos).

O QUE FAZER
1. Nome acessível em pt-BR em cada um (dinâmico quando o estado muda), alvo de toque de 44 px no celular; um teste por componente que falha sem o nome (`getByRole('button', { name })`).

ARQUIVOS QUE PODE TOCAR
- os arquivos listados
- testes

CRITÉRIO DE PRONTO
1. Todos os botões com nome acessível.
2. `zapp-verify . --rapido` verde.


Events (13):
  [2026-10-12 11:17] created {'assignee': 'iris', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-13 06:08] [run 12161] claimed {'lock': 'Joaquim:32040', 'expires': 1791883402, 'run_id': 12161}
  [2026-10-13 06:08] [run 12161] spawned {'pid': 10472, 'started_at': '|179188250298'}
  [2026-10-13 06:08] [run 12161] heartbeat
  [2026-10-13 06:09] [run 12161] heartbeat
  [2026-10-13 06:10] [run 12161] heartbeat
  [2026-10-13 06:11] [run 12161] heartbeat
  [2026-10-13 06:12] [run 12161] heartbeat
  [2026-10-13 06:13] [run 12161] heartbeat
  [2026-10-13 06:14] [run 12161] heartbeat
  [2026-10-13 06:15] [run 12161] heartbeat
  [2026-10-13 06:16] [run 12161] heartbeat
  [2026-10-13 06:17] [run 12161] heartbeat

Runs (1):
  #12161 running      @iris  active  2026-10-13 06:08
