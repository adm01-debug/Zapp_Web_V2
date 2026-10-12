Especialista: Edgar (area-edge-api)

## Conclusão
CONCLUÍ: o defeito do cartão JÁ ESTÁ CORRIGIDO na branch base (`dia/2026-10-11`). Nenhum arquivo foi alterado e nenhum commit de código foi feito (o cartão manda fechar sem commit quando já resolvido). A prova está abaixo.

## O que o cartão pedia e onde está no código atual
O pedido era: o teste de conexão Bitrix nomeia o PORTAL testado (o webhook configurado no servidor) e RECUSA uma URL/portal vindo do chamador. Ambas as partes estão no `supabase/functions/bitrix-api/index.ts` do HEAD:
- Recusa do chamador: `BitrixBodySchema` fecha com `.strict()` (index.ts:15) — os campos `webhookUrl`/`domain` do corpo são rejeitados antes de tocar no provedor.
- Portal testado: `configuredPortalHost()` (index.ts:74) extrai só o host do `BITRIX_WEBHOOK_URL` (nunca o caminho `/rest/1/<token>/`); `portal` entra em toda resposta e em todo log (`bitrixProviderErrorResponse`, index.ts:85; respostas em 269-277, 302-303, 331-332, 358-359).
- Config ausente ou URL não-absoluta nega sem fetch (index.ts:120-128).
Esse código veio no commit `bdfea4785665f19f1ec55188f6e1006dae31a445` ("fix(bitrix-api): teste de conexão nomeia portal testado (#222)"), que é ancestral do HEAD (`git merge-base --is-ancestor bdfea4785 HEAD` → SIM). A entrega original desta tentativa (commit `9a021bb58`) usava injeção de dependências (`BitrixDeps`); a versão integrada resolve o mesmo problema com `globalThis.fetch` roteirizado no teste, cobrindo os mesmos critérios.

## Prova
- vermelho antes (teste ATUAL contra o código pré-fix `bdfea4785^`):
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/bitrix-api/index.test.ts`
  → `R2-API-048: resposta de teste nomeia o portal configurado ... FAILED` (e mais 3 dos R2-API-048) → `FAILED | 9 passed | 4 failed`
- verde depois (código atual do HEAD):
  mesma linha de comando → `ok | 13 passed | 0 failed (102ms)`

## O que NÃO fiz e por quê
- Não commit: o cartão manda fechar sem commit quando o defeito já não existe no código atual; diff vazio de propósito.
- Não toquei em `supabase/deployment-manifest.json` nem em arquivo derivado.
- Não regenerei teste: os testes R2-API-048 e R2-API-018 já provam o critério (nomeia o portal, recusa `webhookUrl`/`domain` sem fetch, nega config ausente/inválida sem tocar no provedor, e cobre o caminho negado).
