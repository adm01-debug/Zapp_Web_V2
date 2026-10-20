Task t_fc794700: [refazer 1] perf(conversa): análises de conversa com cache compartilhado e sem consulta de id inválido
  status:    running
  assignee:  semisenior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_fc794700
  max-retries: 2 (default)
  created:   2026-10-15 21:22 by user
  started:   2026-10-16 03:29

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: A migração para useQuery está correta e no escopo: chave por contato, staleTime de 30 s, `enabled` com uuid, invalidação ao salvar e testes que provam os dois critérios. O próprio diff, porém, abre um caminho que fura o critério 'id inválido não consulta'. O `refetch` agora é o `query.refetch` cru, e no TanStack ele ignora `enabled`. Por isso `refetch()` com `contactId` nulo ou não-uuid dispara `.eq('contact_id', null/JID)` ao PostgREST, o que dá 400. A base já se protegia disso com `if (!contactId) return;`. O padrão sensível citado pelo portão (requireRole/isAdmin) não aparece no diff; foi falso positivo.

O QUE CORRIGIR: 1) Proteja o `refetch` devolvido. Quando `!contactId || !isValidUUID(contactId)`, ele não deve consultar e deve resolver sem erro. Faça isso com um wrapper `useCallback` que tenha as dependências completas (`[isEnabled, query.refetch]`, com `isEnabled` calculado uma vez e reaproveitado no `enabled`), para o lint `exhaustive-deps` passar sem remover a guarda. 2) Acrescente testes que provem que `refetch()` com `contactId` nulo e com id não-uuid não chama `mockFrom`/`limitSpy`. 3) Recoloque o `log.error('Error fetching analyses:', err)` na falha da consulta: na base a falha era registrada e o diff tirou isso sem motivo. Registre só o erro, sem contactId nem texto de mensagem. Observações, sem exigir mudança: a invalidação pelo prefixo `['conversation-analyses']` revalida as análises de todos os contatos montados, o que é aceitável. Os FATOS mostram 10/10 testes e vermelho→verde, coerentes com o relato. Pela regra, presumi que a versão do TanStack é a v5 (com `isLoading` falso em consulta desabilitada), já que os testes de nulo e não-uuid passam.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/analises-conversa-cache-query-2610152032dabe` (commit 6582ec35a) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: hugo`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/24-hooks-raiz-2.md (hooks da raiz de src/hooks: contato, dashboard, e-mail/Gmail, Evolution, APIs externas, grupos, metas) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_RAIZ2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

PROBLEMA (evidência conferida)
`useConversationAnalyses.ts:~35-66` usa estado local e `useEffect`; a V3 usa react-query com `staleTime` de 30 s, `enabled: isValidUUID` e `invalidateQueries` depois de salvar. O mesmo conteúdo é carregado várias vezes (painel, SLA, sentimento).

O QUE FAZER
1. Migre para `useQuery` mantendo a API devolvida (`analyses`, `saveAnalysis`, `getSentimentTrend`); invalide ao salvar; teste.

ARQUIVOS QUE PODE TOCAR
- src/hooks/chat/useConversationAnalyses.ts (confirme o caminho por git grep)
- testes correspondentes

CRITÉRIO DE PRONTO
1. Várias montagens geram 1 consulta; id inválido não consulta (teste).
2. `zapp-verify . --rapido` verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Latest summary:
SSH para o WSL indisponível (timeout em localhost:2222); sem acesso ao workspace para cherry-pick e correção. Retomar quando o WSL/sshd voltar.

Comments (2):
  [2026-10-15 21:22] default: [jev-entrada] rota=complexo (conf 0.60 → coordenador, p_humano=0.01), faixa=hooks, injeção=0.29, ação externa=0.07 — REFAZER: complexo → semisenior
  [2026-10-16 03:30] semisenior: semisenior: li o cartão e a recusa (3 pontos numerados: wrapper no `refetch` com deps completas, 2 testes de refetch com id nulo/não-uuid, recolocar `log.error` sem dados sensíveis). Não consegui iniciar: o SSH para o WSL (joaquim_ataides@localhost:2222) está fora — `terminal` e `read_file` retornam timeout, então não há como trazer o commit 6582ec35a nem editar o workspace. Devolvo para a fila para retomar quando o WSL voltar.

Events (19):
  [2026-10-15 21:22] created {'assignee': None, 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-15 21:22] commented {'author': 'default', 'len': 147}
  [2026-10-15 21:22] assigned {'assignee': 'semisenior', 'from': None}
  [2026-10-15 21:24] reprioritized {'priority': 1}
  [2026-10-16 03:29] [run 19511] claimed {'lock': 'Joaquim:38172', 'expires': 1792133058, 'run_id': 19511}
  [2026-10-16 03:29] [run 19511] spawned {'pid': 16112, 'started_at': '|179213215838'}
  [2026-10-16 03:29] [run 19511] heartbeat
  [2026-10-16 03:30] [run 19511] heartbeat
  [2026-10-16 03:30] commented {'author': 'semisenior', 'len': 431}
  [2026-10-16 03:31] [run 19511] blocked {'reason': 'SSH para o WSL indisponível (timeout em localhost:2222); sem acesso ao workspace para cherry-pick e correção. Retomar quando o WSL/sshd voltar.', 'kind': 'transient', 'recurrences': 1, 'source_status': 'ready'}
  [2026-10-16 07:27] unblocked
  [2026-10-16 15:02] [run 19807] claimed {'lock': 'Joaquim:25096', 'expires': 1792174633, 'run_id': 19807}
  [2026-10-16 15:02] [run 19807] spawned {'pid': 20808, 'started_at': '|179217373371'}
  [2026-10-16 15:02] [run 19807] heartbeat
  [2026-10-16 15:03] [run 19807] heartbeat
  [2026-10-16 15:04] [run 19807] heartbeat
  [2026-10-16 15:05] [run 19807] heartbeat
  [2026-10-16 15:06] [run 19807] heartbeat
  [2026-10-16 15:07] [run 19807] heartbeat

Runs (2):
  #19511 blocked      @semisenior  103s  2026-10-16 03:29
        → SSH para o WSL indisponível (timeout em localhost:2222); sem acesso ao workspace para cherry-pick e correção. Retomar quando o WSL/sshd voltar.
  #19807 running      @semisenior  active  2026-10-16 15:02
