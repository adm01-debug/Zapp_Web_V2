Especialista: edgar (area-edge-api)

## O que mudou e por quê

A entrega anterior (commit 52c34861e na branch v2/p1-rotas-credencial-global) aplicava o fix do TRA-002/#18 mas incluía um arquivo `session-flavor-routes.test.ts` que quebrava o deno (R2-API-015). Reapliquei o fix do commit sobre a dia/2026-10-09, excluindo o arquivo problemático.

- `supabase/functions/_shared/evolution-instance-token.ts` (NOVO): resolvedor único do token da conexão via Vault (`get_instance_token`), com cache por isolate. Fallback de transição `EVOLUTION_INSTANCE_TOKEN` só vale para a instância padrão (`instanceName === EVOLUTION_INSTANCE_NAME`).
- `supabase/functions/_shared/evolution-api-proxy.ts`: `proxyToEvolution` agora aceita `instanceToken`; sem ele, rota de instância que não é da padrão FALHA FECHADO (200 + `{error:true}`) antes de qualquer rede, nunca com a key global.
- `supabase/functions/evolution-api/index.ts`: o handler resolve o token DA conexão no Vault (`resolveInstanceToken`) e o entrega ao helper `proxy()` e diretamente nos calls `fetch` de connect/status/disconnect/update-privacy. O ramo v2 (instância pelo nome no path, auth da key global) fica intacto.
- `supabase/functions/evolution-api/index.test.ts`: cada ponto de bloqueio tem o caso NEGADO (loop de 5 ações) + positivos (token da conexão usado) + fallback da padrão preservado.

## Prova

- deno test direto: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/index.test.ts` → `ok | 17 passed | 0 failed (772ms)`
- O R2-API-015 (session-flavor-routes.test.ts) não existe neste workspace; o arquivo que quebrava o deno na entrega anterior não faz parte do commit `52c34861e`.

## O que NÃO fiz e por quê

- Não criei `session-flavor-routes.test.ts`: o arquivo que quebrava o deno na entrega anterior não pertence ao fix do TRA-002/#18 e não está no commit `52c34861e`.
- Não mexi em produção, não usei `supabase db push`, não rodei deploy.