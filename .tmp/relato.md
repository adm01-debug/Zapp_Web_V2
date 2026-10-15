Especialista: hugo
## O que mudou e por quê
- Nenhum arquivo de código alterado neste refazer. A causa do espelho vermelho (migração `supabase.functions.invoke` → `invokeEdge` deslocou a chamada de `message-delivery` da linha 223 para a 224 e tirou o chamador do alcance do regex `invoke\(` da guarda) já tem correção APROVADA no cartão irmão t_614d441c (commit ceb1304bf0: guarda passa a reconhecer `invokeEdge` e âncora vai a :224). Qualquer edição minha nos 6 arquivos quebraria a âncora :224 aprovada — por isso o acerto aqui é verificar, não reeditar.
- `.tmp/relato.md`: este relato (único arquivo do diff deste refazer).

## Prova (vermelho antes, verde depois — mesmo comando do espelho)
- Vermelho (entrega 48ee8c3c7 sozinha sobre a base): `node --test --test-reporter=tap scripts/ci/docs-estado-registry-convention.unit.mjs` → `# tests 11 / # pass 9 / # fail 2`, com `not ok 2` (`error: 'âncora desatualizada: src/services/outbound-message.service.ts:223 não cita \`message-delivery\`'`) e `not ok 4` (`expected: 'D' / actual: 'A'`).
- Verde (mesmo código + correção irmã ceb1304bf0 aplicada temporariamente e revertida em seguida): `# tests 11 / # pass 11 / # fail 0`. Árvore voltou a limpa (`git status -sb` só o branch).
- Testes da entrega, sem alteração: `./node_modules/.bin/vitest run src/lib/__tests__/invokeEdge.test.ts src/services/__tests__/outbound-message.service.test.ts` → `Test Files 2 passed (2); Tests 18 passed (18)`; `deno test --config scripts/ci/deno.json supabase/functions/_shared/validation.cors.test.ts` → `ok | 3 passed | 0 failed`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (19s)`.

## Pontos da recusa
- Ponto 1 (espelho: `ESTADO.md publica o grupo do primeiro chamador real na ordem A→B→C→D`): resolvido pela correção aprovada em t_614d441c (guarda reconhece `invokeEdge` como chamador de front, grupo A); meu código já chama `invokeEdge('message-delivery', {` em `src/services/outbound-message.service.ts:224` — exatamente a âncora que a correção publica. Prova verde acima, sem mudar código.
- Ponto 2 (espelho: `ESTADO.md cita só âncoras reais` — :223 desatualizada pelo +1 da importação do wrapper): mesma causa e mesma resolução do Ponto 1 (âncora :224 da correção irmã contém `message-delivery` na linha do `invokeEdge`). Prova verde acima.

## O que NÃO fiz e por quê
- Não toquei `ESTADO.md` nem `scripts/ci/docs-estado-registry-convention.unit.mjs`: fora da lista de arquivos do cartão e já corrigidos (e aprovados) em t_614d441c — duplicar seria diff alheio e colidiria com a âncora :224 aprovada.
- Não alterei os 6 arquivos da entrega: o verde acima prova que o código já está consistente com a correção; reescrever o chamador (ex.: voltar a `supabase.functions.invoke` direto) deslocaria as linhas e quebraria a âncora :224.
- Não trouxe commit por `cherry-pick`: trabalho direto no workspace/branch da entrega (`v2/correlacao-edge-observabilidade-2610130348aa9a`, HEAD 48ee8c3c7) — sem FAIXA DO PAI porque nenhum commit alheio entrou.
- Não executei `ci_espelho.sh` nem `hermes-tarefa-fechar`: ambos bloqueados nesta sessão (guarda barra script de `arquitetura-v2/integrador`; fechar congelado sem MODO_V2) — rodei o equivalente direto (comando node acima, igual ao precedente t_3f5bcaf9) e deixo a entrega no workspace.
- `zapp-verify full` não rodado: o item do espelho não pertence ao verify (o próprio `ci_espelho.sh` documenta que roda o que o `zapp-verify` não roda); `--rapido` verde acima cobre o critério de pronto do cartão.
