Task t_fef320c8: fix(chat): os quatro pontos de apagar mensagem usam um só caminho e mostram o erro
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_fef320c8
  max-retries: 2 (default)
  created:   2026-10-12 11:09 by claude
  started:   2026-10-13 04:35
  parents:   t_cfa99af7

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
Ver PE-20. `ChatMessagesArea.handleMessageDeleted` (`:113-119`) chama `ChatService.deleteMessage` e ignora o `{error}` devolvido; os outros três pontos escrevem direto.

O QUE FAZER
1. Unifique em `ChatService.deleteMessage` chamando a RPC `delete_message`, checando `{error}` e linhas afetadas; os quatro pontos (toolbar, menu de contexto, arquivos, serviço) passam a usá-lo; toast de erro; confirmação já existente mantida; testes.

ARQUIVOS QUE PODE TOCAR
- src/services/chat.service.ts
- src/components/inbox/chat/MessageHoverToolbar.tsx
- src/components/inbox/MessageContextActions.tsx
- src/hooks/chat/useFilesActions.ts
- src/components/inbox/chat/ChatMessagesArea.tsx
- testes

CRITÉRIO DE PRONTO
1. Um único caminho para apagar.
2. Falha aparece ao usuário.
3. `zapp-verify . --rapido` verde.


Events (21):
  [2026-10-12 11:09] dependency_wait {'reason': 'parent_not_done', 'parent': 't_cfa99af7'}
  [2026-10-13 04:35] promoted
  [2026-10-13 04:35] [run 12106] claimed {'lock': 'Joaquim:32040', 'expires': 1791877845, 'run_id': 12106}
  [2026-10-13 04:35] [run 12106] spawned {'pid': 21852, 'started_at': '|179187694569'}
  [2026-10-13 04:35] [run 12106] heartbeat
  [2026-10-13 04:36] [run 12106] heartbeat
  [2026-10-13 04:37] [run 12106] heartbeat
  [2026-10-13 04:38] [run 12106] heartbeat
  [2026-10-13 04:40] [run 12106] heartbeat
  [2026-10-13 04:41] [run 12106] heartbeat
  [2026-10-13 04:42] [run 12106] heartbeat
  [2026-10-13 04:43] [run 12106] heartbeat
  [2026-10-13 04:44] [run 12106] heartbeat
  [2026-10-13 04:45] [run 12106] heartbeat
  [2026-10-13 04:46] [run 12106] heartbeat
  [2026-10-13 04:47] [run 12106] heartbeat
  [2026-10-13 04:48] [run 12106] heartbeat
  [2026-10-13 04:49] [run 12106] heartbeat
  [2026-10-13 04:50] [run 12106] heartbeat
  [2026-10-13 04:51] [run 12106] heartbeat

Runs (1):
  #12106 running      @iris  active  2026-10-13 04:35
