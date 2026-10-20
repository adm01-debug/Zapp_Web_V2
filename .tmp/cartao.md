Task t_a1470de4: fix(chat): balão de mídia sem endereço mostra 'baixando' ou 'indisponível', nunca fica em branco
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a1470de4
  max-retries: 2 (default)
  created:   2026-10-12 11:16 by claude
  started:   2026-10-13 05:41

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: iris`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: auditoria de paridade V3 -> V2 dos docs docs/estado 10 a 12 e 17 a 40 (inbox components, team-chat, security/queues, layout/talkx, email/voice, shared, hooks, integrations, services, lib, backend, infra, testes) (plano em `docs/plans/PLANO_PARIDADE_V3_DOCS_10_A_40_2026-10-12.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-resto/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 12/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`chat/MessageBubble.tsx:255,262,269,279,298` só renderiza imagem, vídeo, áudio, documento e figurinha quando `message.mediaUrl` existe: sem URL não aparece NADA (nem 'baixando', nem 'indisponível'). O estado `unsupported` (C8a/C8b) não cobre esse caso e MR1/MR2 só tratam URL vencida. A V3 (`ImagePreview.tsx:124-134`) mostra 'Baixando imagem… Aguarde enquanto processamos a mídia.' (`role=status`) e, para vídeo, 'Vídeo indisponível / Não foi possível recuperar'.

O QUE FAZER
1. Placeholder por tipo (imagem, vídeo, áudio, documento, figurinha) quando não há URL: 'Baixando…' para mensagem recente e 'Mídia indisponível' para a mais antiga que um limite ou marcada como falha, com `role="status"`; integre com o MR2 quando existir (leia o cartão). Confira no banco local com que frequência `media_url` é nulo para mídia recebida e registre no relato.
2. Teste por tipo e captura claro/escuro.

ARQUIVOS QUE PODE TOCAR
- src/components/inbox/chat/MessageBubble.tsx
- src/components/inbox/ImagePreview.tsx
- src/components/inbox/MediaPreview.tsx
- src/types/chat.ts (se precisar de estado)
- testes

CRITÉRIO DE PRONTO
1. Nenhum balão de mídia em branco.
2. Estado explicado por tipo.
3. `zapp-verify . --rapido` verde.


Events (15):
  [2026-10-12 11:16] created {'assignee': 'iris', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-12 11:17] reprioritized {'priority': 5}
  [2026-10-12 12:08] reprioritized {'priority': 6}
  [2026-10-12 12:13] reprioritized {'priority': 5}
  [2026-10-13 05:41] [run 12144] claimed {'lock': 'Joaquim:32040', 'expires': 1791881775, 'run_id': 12144}
  [2026-10-13 05:41] [run 12144] spawned {'pid': 30408, 'started_at': '|179188087560'}
  [2026-10-13 05:41] [run 12144] heartbeat
  [2026-10-13 05:42] [run 12144] heartbeat
  [2026-10-13 05:43] [run 12144] heartbeat
  [2026-10-13 05:44] [run 12144] heartbeat
  [2026-10-13 05:45] [run 12144] heartbeat
  [2026-10-13 05:46] [run 12144] heartbeat
  [2026-10-13 05:47] [run 12144] heartbeat
  [2026-10-13 05:48] [run 12144] heartbeat
  [2026-10-13 05:49] [run 12144] heartbeat

Runs (1):
  #12144 running      @iris  active  2026-10-13 05:41
