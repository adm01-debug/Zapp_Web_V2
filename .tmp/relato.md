Especialista: semisenior
## O que mudou e por quê
- Nenhum arquivo de código: retomada por rebase — o fix #18 já está integral na base dia/2026-10-13 (commit 453e6b69f9); `git diff --name-only 453e6b69f9..HEAD` lista só `.tmp/relato.md`. Nenhum commit trazido por cherry-pick (trazer duplicaria o fix e seria diff alheio). Skill de área usada: area-edge-api.
- Fix preservado na base: `supabase/functions/_shared/evolution-instance-token.ts:53-77`, `supabase/functions/_shared/evolution-api-proxy.ts:144-167`, `supabase/functions/_shared/evolution-send.ts:58-86`, chamadores em `supabase/functions/evolution-api/index.ts:187,530,732,805,972`.

## Prova
- vermelho antes: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-send-instance-token.test.ts` (com mutação temporária em `evolution-send.ts`, deny 400→200, restaurada do backup; `git status` limpo depois) → `FAILED | 3 passed | 4 failed (92ms)`, falhando os 4 testes de negação (`evolution-send-instance-token.test.ts:75,97,112,146`).
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-send-instance-token.test.ts supabase/functions/evolution-api/session-flavor-routes.test.ts` → `ok | 20 passed | 0 failed (399ms)`, incluindo `R2-API-015/TRA-002 status GO: conexão que NÃO é a padrão e sem token no Vault nega sem tocar o provedor` (`session-flavor-routes.test.ts:383`).

## Pontos do revisor
- Ponto 1: retomada por rebase preservando o que entrou — resolvido sem cherry-pick; diff de código vazio (`git diff --name-only 453e6b69f9..HEAD` → só `.tmp/relato.md`).
- Ponto 2: rodar o teste do cartão — resolvido; verde `ok | 20 passed | 0 failed (399ms)` nos dois arquivos de teste do cartão, com vermelho por mutação `FAILED | 3 passed | 4 failed (92ms)`.
- Ponto 3: verificação e fechamento único — resolvido neste fechar; o `zapp-verify --rapido` roda dentro do `hermes-tarefa-fechar`, e a evidência executável do cartão é o verde + vermelho acima.

## Arquivos (`git diff --name-only 453e6b69f9..HEAD`, colado do comando)
- .tmp/relato.md (só o relato — nenhum arquivo de código)
