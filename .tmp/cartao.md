Task t_01f84976: [refazer 2] feat(edge): automation-suggest-reply (sugestão de resposta citando a base de conhecimento)
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_01f84976
  max-retries: 2 (default)
  created:   2026-10-11 19:13 by user
  started:   2026-10-11 22:20

Body:
REFAZER (rodada 2 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: A edge e os 13 testes Deno estão corretos (JWT, RLS via client do chamador, 429 com código estável, fonte carimbada no servidor, sem PII em log). Mas a correção copiou para este cartão quatro arquivos que pertencem ao cartão t_40fc6c69 (ESTADO.md, FEATURE_REGISTRY.md, TESTING_CONVENTION.md e a guarda de 463 linhas), fora de 'ARQUIVOS QUE PODE TOCAR'. A recusa já dizia que essa correção está em t_40fc6c69, então a cópia vai conflitar no empilhamento.

O QUE CORRIGIR: 1) Remova do commit scripts/ci/docs-estado-registry-convention.unit.mjs, FEATURE_REGISTRY.md e TESTING_CONVENTION.md; eles são entrega de t_40fc6c69 e não podem nascer aqui como arquivos novos. 2) Faça o registro de ESTADO.md sobre a base que já contém t_40fc6c69 (traga esse cartão antes, não copie os arquivos): altere só o que a edge exige, ou seja a linha `automation-suggest-reply`, o total do cabeçalho (81), o total do grupo E (17), o cabeçalho 'Órfãs (17)' e a lista de órfãs. Se for possível, mantenha a tabela em ordem alfabética: a linha entrou entre `ai-suggest-reply` e `ai-transcribe-audio`. Se t_40fc6c69 ainda não estiver na base, avise no cartão e não fabrique os arquivos. 3) Reescreva .tmp/relato.md respondendo ao motivo real da recusa, o espelho do CI. Os 'Pontos 2, 3 e 4' do relato atual não existem na recusa, e o relato precisa declarar que `zapp-verify full .` não foi concluído. 4) Mantenha index.ts e index.test.ts como estão.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/automation-suggest-reply-t-c6a1be9f-2610111725e877` (commit 4362ca1f1) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

PEDIDO ORIGINAL:
ESPECIALISTA DA ÁREA: edgar (Edge Functions e APIs). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: edgar`.
Origem: auditoria de paridade V3 -> V2 (docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md) e decisão do Joaquim em 11/10/2026 (faixa C aprovada: tudo será implementado). Antes de mexer, confira no código ATUAL (dia/2026-10-11) o que já existe; reaproveite o que houver e relate. Se o defeito/lacuna já estiver resolvido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

PROBLEMA
A V2 tem AISuggestions e a base knowledge_base_articles, mas nada liga as duas. Decisão do Joaquim: criar a Edge dedicada que sugere resposta citando o artigo.

O QUE FAZER
1. Criar supabase/functions/automation-suggest-reply/index.ts seguindo o padrão das Edges de IA (veja ai-enhance-message e _shared/ai-generate.ts, função generateWithRouting): CORS e autenticação por JWT como as outras.
2. Entrada: { contact_id }. A Edge busca as últimas 10 mensagens COM O JWT do chamador (para a RLS impedir ler conversa alheia), pega a última mensagem inbound e procura os 3 artigos mais relevantes em knowledge_base_articles (texto/FTS).
3. Gerar até 3 sugestões curtas em português com generateWithRouting, cada uma com a origem { article_id, title } ou null. Respeitar os guardas de custo e limite de IA que as demais Edges de IA usam (orçamento, rate limit, circuit breaker); se não houver guarda no padrão, aplicar limite por usuário.
4. Saída: { suggestions: [{ text, source }] }. Sem dado pessoal em log. Erro de orçamento/limite devolve 429 com código estável (ai_budget_exceeded, rate_limited).
5. Testes Deno: usuário sem acesso ao contato recebe vazio ou 403; sem artigo relevante gera sugestão sem fonte; limite de IA respeitado; formato da saída.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/automation-suggest-reply/ (novo: index.ts e testes)
- supabase/functions/_shared/ somente para reaproveitar, sem alterar comportamento de outras Edges
- supabase/config.toml se o repositório registrar cada função ali

CRITÉRIO DE PRONTO
1. Edge responde com até 3 sugestões e fonte, respeitando RLS e limites de IA.
2. Testes Deno verdes. zapp-verify . --rapido verde.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Comments (1):
  [2026-10-11 19:15] default: [jev-entrada] rota=complexo (conf 0.73 → coordenador, p_humano=0.08), faixa=edge, injeção=0.22, ação externa=0.13 — REFAZER: complexo → senior

Events (13):
  [2026-10-11 19:13] created {'assignee': None, 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-11 19:15] commented {'author': 'default', 'len': 142}
  [2026-10-11 19:15] assigned {'assignee': 'senior', 'from': None}
  [2026-10-11 19:15] reprioritized {'priority': 1}
  [2026-10-11 22:20] [run 10646] claimed {'lock': 'Joaquim:13456', 'expires': 1791768918, 'run_id': 10646}
  [2026-10-11 22:20] [run 10646] spawned {'pid': 10964, 'started_at': '|179176801889'}
  [2026-10-11 22:20] [run 10646] heartbeat
  [2026-10-11 22:21] [run 10646] heartbeat
  [2026-10-11 22:22] [run 10646] heartbeat
  [2026-10-11 22:23] [run 10646] heartbeat
  [2026-10-11 22:24] [run 10646] heartbeat
  [2026-10-11 22:25] [run 10646] heartbeat
  [2026-10-11 22:26] [run 10646] heartbeat

Runs (1):
  #10646 running      @senior  active  2026-10-11 22:20
