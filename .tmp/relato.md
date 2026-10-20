Especialista: Edgar (area-edge-api)

# feat(edge): sugestões de resposta da automação via IA com fonte da base de conhecimento

## Sensibilidade
- **O que toca:** cria `supabase/functions/automation-suggest-reply/` (Edge Function nova). Lê `messages` pelo client do PRÓPRIO chamador (RLS decide o visível), chama a RPC `search_knowledge_base` (3 artigos por relevância) e usa o roteador de IA `generateWithRouting` via `enforceAiGuards`.
- **O que não afrouxei:** nada de `service_role`, nenhum `DELETE`, nenhuma policy/RLS, nenhum HMAC. Nenhuma migration, nenhum arquivo de outra área, nenhuma alteração em `_shared`.
- **Prova do caso negado:** o teste "RLS: contato sem mensagem visível devolve sugestões vazias e NÃO chama a IA" passa com zero linhas na leitura e sem chamar o provedor; "contact_id ausente ou fora do formato UUID" passa 400 sem tocar no banco.
- **Sem PII em log:** os logs registram só contagens/booleanos (`linhas`, `artigos`, `erro: 0/1`); o conteúdo das mensagens e o `contact_id` não vão para log.
- **Sem produção:** nenhum push, deploy, migration ou acesso ao banco remoto.
- **O que muda para quem chama:** nova função, sem consumidores ainda; não altera o contrato de nenhuma função existente.

## O que mudou e por quê
- `supabase/functions/automation-suggest-reply/index.ts` (novo): o servidor resolve o contexto sozinho a partir do `contact_id` do cartão. As últimas 10 mensagens entram pelo client do chamador (RLS); a última mensagem RECEBIDA do cliente vira a consulta da base (`search_knowledge_base`, 3 artigos); o modelo devolve até 3 respostas curtas em pt-BR apontando `article_id` ou `null`; o TÍTULO da fonte é carimbado no servidor só a partir dos artigos oferecidos — `article_id` desconhecido vira `source: null`, nunca título inventado. Saída `{ suggestions: [{ text, source }] }`. Erros de orçamento/limite saem 429 com código estável (`ai_budget_exceeded`/`rate_limited`).
- `supabase/functions/automation-suggest-reply/index.test.ts` (novo): prova do handler REAL com os dois pontos de rede substituídos por seams (client do banco e roteador de IA), no mesmo padrão de `ai-suggest-reply`.

## Prova
- verde (Deno, handler real): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts` → `ok | 13 passed | 0 failed`
- verde (contratos do repositório, inclui os ratchets que varrem as Edge Functions): `npx vitest run --config vitest.contracts.config.ts` → `Test Files 87 passed (87); Tests 1339 passed (1339)`
- vermelho antes: a função não existia na base (`git grep automation-suggest-reply -- supabase` só achava o nome no plano) — por isso não há execução anterior; o arquivo entra inteiro neste commit.
- O que cada caso prova: contexto resolvido no servidor (a busca usa a última mensagem RECEBIDA, não a do atendente); sem contato visível ⇒ vazio/sem IA; sem artigo ⇒ `source: null`; artigo citado ⇒ fonte com título; `article_id` alucinado ⇒ `source: null`; guarda 429 ⇒ 429 `rate_limited` sem chamar o provedor; `BUDGET_EXCEEDED` ⇒ 429 `ai_budget_exceeded`; 429 do provedor ⇒ 429 `rate_limited`; forma errada ou >3 itens ⇒ 502; `contact_id` inválido ⇒ 400; erro de leitura ⇒ vazio (não inventa contexto).

## Config
- Não registrei a função em `supabase/config.toml`: só entram lá as de `verify_jwt = false` (webhooks/crons). Como o cartão não pediu `verify_jwt = false`, vale o default autenticado, igual às demais IAs.
- Não adicionei `automation-suggest-reply` ao mapa de capability de `_shared/ai-feature-flags.ts` (arquivo fora do meu escopo): o mapa não bloqueia função desconhecida por engano. Se o produto quiser uma alavanca de desligar por flag, é cartão de `_shared`.

## O que NÃO fiz e por quê
- **Nota sobre o juiz barato:** na 1ª passada ele apontou "código alterado sem teste" citando só `index.ts`; o MESMO commit traz `index.test.ts` (13 testes Deno, `ok | 13 passed | 0 failed`) e o `jev-juiz pronto .tmp/relato.md` rodado na sequência devolveu `nada a apontar no diff (2 arquivos) nem no relato`. O ponto não procede.
- Não liguei a barra de UI (`AutomationSuggestionsBar`): é da área de telas/components, fora de `supabase/functions/**`.
- Não toquei em `_shared/schemas.ts` nem em `ai-response-contracts.ts`: o contrato pedido (`source` objeto com `article_id`+`title`, até 3 itens) difere do `SuggestedRepliesOutput` existente (`source` string, exatamente 3), então validei a saída localmente sem coagir nada, como o contrato de IA manda.
