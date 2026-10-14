Especialista: semisenior (area-edge-api)
## O que mudou e por quê
- Nenhum arquivo de código: o cherry-pick de `e0b6ee7862` + `92ef0b2cb2` foi dispensado porque o conteúdo integral dele já está em `dia/2026-10-13` — `git diff e0b6ee7862 dia/2026-10-13` é vazio nos 4 arquivos (`_shared/evolution-api-proxy.ts`, `_shared/evolution-instance-token.ts`, `evolution-api/index.ts`, `evolution-api/index.test.ts`), e o teste de `92ef0b2cb2` foi sucedido por `ff4754bcc5` (13/10) no mesmo arquivo. Rebase = manter a base; trazer os commits seria diff alheio/reversão.
- Fix preservado na base: `supabase/functions/_shared/evolution-api-proxy.ts:158-170` (rota de outra conexão sem token nega, nunca usa a key global nem a da padrão), `supabase/functions/evolution-api/index.ts:733-737` (status GO nega sem token antes de qualquer I/O), `supabase/functions/_shared/evolution-instance-token.ts:53-77` (resolve por conexão via `get_instance_token`, sem token devolve null).

## Prova
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/session-flavor-routes.test.ts supabase/functions/evolution-api/index.test.ts` → `ok | 40 passed | 0 failed` (inclui o NEGADO `R2-API-015/TRA-002 status GO: conexão que NÃO é a padrão e sem token no Vault nega sem tocar o provedor`).
- vermelho antes (mutação temporária, revertida com `git checkout`, árvore limpa depois): removido o `if (!token) return deny` do status GO com fallback para a key global → `FAILED | 0 passed | 1 failed` no teste NEGADO (linha 403: provedor tocado). O teste chama o handler real e falha sem a correção.
- `zapp-verify . --rapido`: dependências OK, db_guard OK; etapa `tipos` morta pelo OOM da máquina (tsc Killed, exit 137, load 76, RAM 42/47GB) — falha de execução ambiental, sem relação com este cartão (diff vazio, nenhum `.ts` tocado).

## Pontos do revisor
- Ponto 1 (rebase sem cherry-pick cego): resolvido — `git show --stat` dos 2 commits antes de trazer; diff vazio contra a base provou que o trabalho já entrou via `62337b79dd` (10/10) e `ff4754bcc5` (13/10); nenhum commit trazido, nenhum arquivo fora do título.
- Ponto 2 (teste do cartão + zapp-verify, fechar de novo): teste do cartão verde (40 passed, com prova vermelho→verde por mutação); verify parcial (deno + db_guard verdes, tipos bloqueado por OOM da máquina).

## O que NÃO fiz e por quê
- Não commitei código: não há o que commitar — a base já contém o fix; commit vazio/duplicado seria escopo fantasma.
- Não rodei a suite Deno completa nem o typecheck com sucesso: máquina com load 76 e RAM esgotada (OOM kill); o fechar roda a verificação de novo.
- Juiz barato (ANTES DE ENTREGAR): o ponto não procede — diff de código vazio é o resultado correto: `git diff e0b6ee7862 dia/2026-10-13` vazio nos 4 arquivos prova que o trabalho já entrou na base via `62337b79dd`/`ff4754bcc5`; trazer os commits criaria diff alheio (causa nº 1 de recusa do refazer). Prova comportamental: teste NEGADO verde + vermelho por mutação.

## Arquivos (`git diff --name-only dia/2026-10-13...HEAD`)
.tmp/relato.md (só o relato — nenhum arquivo de código)
