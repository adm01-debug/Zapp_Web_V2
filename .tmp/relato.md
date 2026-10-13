Especialista: worker (geral)

## O que mudou e por quê
- `ESTADO.md` (7 linhas): linha nova na Tabela — `| \`automation-suggest-reply\` | A | \`src/hooks/chat/useAutomationSuggestions.ts:192\` |` — mais o cabeçalho (`81` → `82` edges), o total do grupo A (`54` → `55`) e o total geral (`81` → `82`). A guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` recalcula o conjunto de edges a partir de `supabase/functions/*/index.ts`; com a edge empilhada e o doc desatualizado, o item citado no cartão reprovava. Foi o único arquivo que eu mudei de fato.
- A edge **não é órfã**: ela já tem chamador real no front em `src/hooks/chat/useAutomationSuggestions.ts:192` (`await supabase.functions.invoke('automation-suggest-reply', ...)`). Logo o grupo correto é **A** (front), não E — por isso o total sobe em A e a lista de Órfãs não muda.
- A entrega foi reaplicada com `git cherry-pick 0acdc0ce6` (a edge nova + teste Deno), como o cartão manda ("partir do commit da entrega, não recomeçar"). O commit `2fc637db8` que o cartão cita é o relato da entrega (só `.tmp/relato.md`); a edge está em `0acdc0ce6`, o pai dele.

## Prova
- vermelho antes (edge empilhada, doc ainda em 81 edges): `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `not ok 1 - ESTADO.md lista exatamente as edges que existem no repositório` e `not ok 6 - total de edges do cabeçalho do ESTADO.md bate com a tabela`; `# tests 11 / # pass 9 / # fail 2`.
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `# tests 11 / # pass 11 / # fail 0`, com `ok 1 - ESTADO.md lista exatamente as edges que existem no repositório`.
- item exato do cartão (arquivo `scripts/ci/docs-estado-registry-convention.unit.mjs`, teste `ESTADO.md lista exatamente as edges que existem no repositório`): saiu da lista de `not ok` do comando do espelho.
- deno da edge (mantém verde o que a entrega trouxe): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/automation-suggest-reply/index.test.ts` → `ok | 13 passed | 0 failed (38ms)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (392s)` — `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`.
- As falhas que sobram no conjunto node das guardas (mesmos arquivos que o espelho roda) são PRÉ-EXISTENTES na base, não novas: numa cópia limpa do HEAD (`git archive HEAD` extraído em `.tmp/base`) o mesmo comando dá `# tests 43 / # pass 36 / # fail 7` — `1` de `implicit-any-ratchet` (`o tsconfig.app.json ... TS7006`) e `6` de `lint-ratchet` (fixtures `--staged`), idênticas antes e depois da minha mudança. Nenhum desses arquivos é tocado pelo diff.

## O que NÃO fiz e por quê
- Não rodei `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` direto: o HERMES-GUARD recusa executar script de `~/arquitetura-v2` (recusou duas vezes, mensagem "mexer nas guardas/ferramentas do Hermes"). Reproduzi os MESMOS comandos do script à mão — `deno test ...` e `node --test --test-reporter=tap scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs` filtrando `^not ok ` — e o item do cartão desapareceu da lista.
- Não afrouxei nenhuma asserção: `scripts/ci/docs-estado-registry-convention.unit.mjs` não foi tocado; o diff contra a base é só `ESTADO.md` (7 linhas) + a edge/teste do cherry-pick.
- Não recomecei a entrega: a edge entrou por cherry-pick, sem reescrever nada.

sha: `1483112a9` (fix do ESTADO.md) sobre `8a6aaddc3` (cherry-pick da edge) sobre `96dd72dc5` (base `dia/2026-10-13`).
