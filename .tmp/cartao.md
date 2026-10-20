Task t_c6a1be9f: [refazer 1] feat(edge): automation-suggest-reply (sugestão de resposta citando a base de conhecimento)
  status:    running
  assignee:  senior
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_c6a1be9f
  max-retries: 2 (default)
  created:   2026-10-11 13:01 by user
  started:   2026-10-11 17:25

Body:
REFAZER (rodada 1 de 2). A entrega anterior deste trabalho foi RECUSADA e nada entrou.

MOTIVO DA RECUSA: retirado pelo limpador: quebra o ESPELHO DO CI no empilhamento (node: ESTADO.md lista exatamente as edges que existem no repositório); correção em t_40fc6c69

O QUE CORRIGIR: Reproduza a falha com `zapp-verify full .`, corrija e feche de novo.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/automation-suggest-reply-2610110936a5c0` (commit c8ce7e274) no repositório; no workspace novo, traga os commits com `git cherry-pick` e corrija só o que foi apontado.

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

Comments (2):
  [2026-10-11 13:02] default: [jev-entrada] rota=complexo (conf 0.84 → coordenador, p_humano=0.11), faixa=edge, injeção=0.27, ação externa=0.15 → RETIDO (decisão do dono)
  [2026-10-11 13:04] default: [revisor-entrada] [jev-entrada] claude liberou → senior: O trabalho é criar e testar uma Edge Function e seus testes Deno no repositório local, além de corrigir o ESTADO.md para o espelho do CI. Os arquivos permitidos ficam todos dentro do repositório e nenhum ferramental da fábrica é editado. Envolve JWT, RLS e limites de custo de IA, por isso o perfil é complexo.

Events (40):
  [2026-10-11 17:35] [run 10478] heartbeat {'note': 'Falha do ESTADO.md reproduzida e corrigida; rodando zapp-verify --rapido antes de fechar.'}
  [2026-10-11 17:36] [run 10478] heartbeat
  [2026-10-11 17:37] [run 10478] heartbeat
  [2026-10-11 17:38] [run 10478] heartbeat
  [2026-10-11 17:39] [run 10478] heartbeat
  [2026-10-11 17:40] [run 10478] heartbeat {'note': 'Verificações específicas e rápida verdes; tentando o zapp-verify full com tempo maior para satisfazer literalmente o corrigir.'}
  [2026-10-11 17:41] [run 10478] heartbeat
  [2026-10-11 17:42] [run 10478] heartbeat
  [2026-10-11 17:43] [run 10478] heartbeat
  [2026-10-11 17:44] [run 10478] heartbeat
  [2026-10-11 17:45] [run 10478] heartbeat
  [2026-10-11 17:46] [run 10478] heartbeat
  [2026-10-11 17:47] [run 10478] heartbeat
  [2026-10-11 17:47] [run 10478] heartbeat {'note': 'zapp-verify full ainda em execução: já passou db_guard/tipos/lint/migrations; aguardando etapas finais.'}
  [2026-10-11 17:48] [run 10478] heartbeat
  [2026-10-11 17:49] [run 10478] heartbeat
  [2026-10-11 17:50] [run 10478] heartbeat
  [2026-10-11 17:51] [run 10478] heartbeat
  [2026-10-11 17:52] [run 10478] heartbeat
  [2026-10-11 17:53] [run 10478] heartbeat

Runs (1):
  #10478 running      @senior  active  2026-10-11 17:25
