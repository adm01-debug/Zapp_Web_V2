Especialista: semisenior (area-edge-api)
## Ponto 1: retomada por rebase preservando o que entrou na base — resolvido sem cherry-pick
- O fix #18 já está integral na base dia/2026-10-13 (commit 453e6b69f9): `git diff --name-only 453e6b69f9..HEAD` lista só `.tmp/relato.md`, ou seja, diff de código vazio. Trazer os commits do trabalho anterior por cherry-pick criaria diff alheio/duplicado (causa nº 1 de recusa do refazer) — rebase = manter a base, nenhum commit trazido.
- Fix preservado na base, lido no workspace: `supabase/functions/_shared/evolution-instance-token.ts:53-77` (token por conexão via `get_instance_token`; fallback `EVOLUTION_INSTANCE_TOKEN` só quando o nome é o da padrão, demais devolvem null); `supabase/functions/_shared/evolution-api-proxy.ts:144-167` (sem `instanceToken` e fora da padrão, nega com 200 + `{error:true}` antes de qualquer rede, nunca com a key global); `supabase/functions/_shared/evolution-send.ts:58-86` (mesma regra no `evoFetch`, deny com 400 + `{error:"instance token ausente"}`); chamadores em `supabase/functions/evolution-api/index.ts:187,530,732,805,972`.

## Ponto 2: rodar o teste do cartão — resolvido, verde agora e vermelho por mutação
- Verde (13/10 23:21, árvore limpa): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-send-instance-token.test.ts supabase/functions/evolution-api/session-flavor-routes.test.ts` → `ok | 20 passed | 0 failed (399ms)`, incluindo o NEGADO `R2-API-015/TRA-002 status GO: conexão que NÃO é a padrão e sem token no Vault nega sem tocar o provedor` (`session-flavor-routes.test.ts:383`) e os TRA-002 de envio/presença (`evolution-send-instance-token.test.ts:97,112`).
- Vermelho (13/10 23:21, mutação temporária em `evolution-send.ts`, deny 400→200, restaurada do backup em /tmp, `git status` limpo depois): só o arquivo de envio → `FAILED | 3 passed | 4 failed (92ms)`, falhando exatamente os 4 testes de negação (`evolution-send-instance-token.test.ts:75,97,112,146`). Os testes chamam o código real e falham sem a correção.

## Ponto 3: verificação e fechamento único — resolvido neste fechar
- A verificação do cartão roda dentro deste `hermes-tarefa-fechar` (`zapp-verify --rapido`); a evidência executável deste cartão é o verde `ok | 20 passed | 0 failed` + o vermelho `FAILED | 3 passed | 4 failed` acima, ambos rodados agora no workspace. Fechamento único, sem repetição.
- Contexto de máquina (fato, não pendência): load 37,9, RAM 40/47 GB, swap 7/8 GB às 23:21 — suite completa fora do fechar dispensada porque o diff de código é vazio e o fechar já executa a verificação dele.

## FATOS MEDIDOS
- `git diff --name-only 453e6b69f9..HEAD` → `.tmp/relato.md` (só o relato, nenhum arquivo de código).
- `git status --short` (working tree) → limpo; `grep -c "status: 400" supabase/functions/_shared/evolution-send.ts` → 2 (arquivo restaurado íntegro após a mutação).
- Deno verde: `ok | 20 passed | 0 failed (399ms)`; Deno vermelho por mutação: `FAILED | 3 passed | 4 failed (92ms)`.
- Retomada CONCLUÍDA; sem pendência de código.

## Arquivos (`git diff --name-only 453e6b69f9..HEAD`, colado do comando)
- .tmp/relato.md (só o relato — nenhum arquivo de código)
