Especialista: edgar
## O que mudou e por quê
- Nenhum arquivo de código: o fix #18 já está integralmente na base dia/2026-10-13 (commit 453e6b69f9). `git diff e0b6ee7862..453e6b69f9` é vazio nos 4 arquivos do trabalho anterior (proxy, instance-token, index.ts, index.test.ts). Trazer os commits por cherry-pick criaria diff alheio/duplicado — rebase = manter a base.
- Fix preservado na base: `supabase/functions/_shared/evolution-instance-token.ts:53-77` (token resolvido por conexão via `get_instance_token`; fallback `EVOLUTION_INSTANCE_TOKEN` só para a instância padrão, demais devolvem null); `supabase/functions/_shared/evolution-api-proxy.ts:114,144-167` (sem `instanceToken` e fora da padrão, a rota nega com 200 + `{error:true}` antes de qualquer rede, nunca com a key global); `supabase/functions/_shared/evolution-send.ts:58-86` (mesma regra no `evoFetch`); chamadores em `supabase/functions/evolution-api/index.ts:187,530,732,805,972`.

## Prova
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-send-instance-token.test.ts supabase/functions/evolution-api/session-flavor-routes.test.ts` → `ok | 20 passed | 0 failed`, incluindo o NEGADO `R2-API-015/TRA-002 status GO: conexão que NÃO é a padrão e sem token no Vault nega sem tocar o provedor` (`session-flavor-routes.test.ts:383`) e os TRA-002 de envio/presença (`evolution-send-instance-token.test.ts:97,112`).
- vermelho antes (mutação temporária em `evolution-send.ts:77-80`, status do deny 400→200, revertida do backup; árvore limpa depois): → `FAILED | 3 passed | 4 failed`, com `AssertionError: Values are not equal: - 200 / + 400` nos 4 testes de negação. Os testes chamam o código real e falham sem a correção.
- `zapp-verify . --rapido`: NÃO RODADO — máquina saturada (load 26, RAM 39,6/48 GB, swap 100% em uso às 22:31); rodar o verify com a máquina nesse estado é OOM certo e não prova nada deste cartão (diff de código vazio). Registro como bloqueado por ambiente, sem insistir.

## Pontos do revisor
- Ponto 1 (retomada por rebase, resolver o conflito preservando o que entrou): resolvido sem cherry-pick — `git show --stat e0b6ee7862` + `git diff e0b6ee7862..453e6b69f9` (vazio nos 4 arquivos) provam que o conteúdo já entrou na base; nenhum commit trazido, nenhum arquivo fora do título.
- Ponto 2 (rodar o teste do cartão): resolvido — 20 passed nos dois arquivos de teste do cartão, com vermelho→verde por mutação.
- Ponto 3 (`zapp-verify full` + fechar de novo): parcialmente — verify bloqueado por OOM da máquina (ver prova acima); fechamento único abaixo, sem repetição.

## O que NÃO fiz e por quê
- Não commitei código: não há o que commitar — a base já contém o fix; commit duplicado seria escopo fantasma.
- Não rodei `zapp-verify`: ambiente saturado (load/RAM/swap acima); o fechar executa a verificação dele.

## Arquivos (`git diff --name-only 453e6b69f9..HEAD`)
- .tmp/relato.md (só o relato — nenhum arquivo de código)
