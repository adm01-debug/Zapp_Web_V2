Task t_921e4aea: feat(edge): automation-suggest-reply (sugestão de resposta citando a base de conhecimento)
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_921e4aea
  max-retries: 2 (default)
  created:   2026-10-11 09:22 by claude
  started:   2026-10-11 09:36
  children:  t_bb34f070

Body:
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


Events (12):
  [2026-10-11 09:22] created {'assignee': 'edgar', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-11 09:23] reprioritized {'priority': 9}
  [2026-10-11 09:36] [run 10104] claimed {'lock': 'Joaquim:15012', 'expires': 1791723096, 'run_id': 10104}
  [2026-10-11 09:36] [run 10104] spawned {'pid': 24172, 'started_at': '|179172219690'}
  [2026-10-11 09:36] [run 10104] heartbeat
  [2026-10-11 09:37] [run 10104] heartbeat
  [2026-10-11 09:38] [run 10104] heartbeat
  [2026-10-11 09:39] [run 10104] heartbeat
  [2026-10-11 09:40] [run 10104] heartbeat
  [2026-10-11 09:41] [run 10104] heartbeat
  [2026-10-11 09:43] [run 10104] heartbeat
  [2026-10-11 09:44] [run 10104] heartbeat

Runs (1):
  #10104 running      @edgar  active  2026-10-11 09:36
