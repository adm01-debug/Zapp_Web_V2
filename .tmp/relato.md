Especialista: edgar

Refazer 1 da entrega 29b1671c0c (pairing-code GO+v2), rebasado sobre dia/2026-10-14 (f5885801b1) com resolução de conflito sem afrouxar teste do dia.

Ponto 1 (recusa: quebra o ESPELHO DO CI no empilhamento — node N217: docs bate com medição fresca) → a entrega adiciona 3 linhas ao helper `evolution-control-authz.ts` (`pairing-code` no CONTROL_ACTIONS e no MAINTENANCE_GATED_ACTIONS) e o doc de cobertura ficou com os números antigos (137/137, total 83.6%). Reproduzi o vermelho com `node --test scripts/ci/edge-coverage-authz.unit.mjs` (falha: `docs: evolution-control-authz.ts | 137 | 137` vs `medido: evolution-control-authz.ts | 140 | 140`) e regenerei pelo próprio script (`REGENERAR_EDGE_AUTHZ_COV=1`): `docs/audits/edge-functions-authz-coverage.md` 137/137→140/140, total 83.6%→83.8%. Verde depois: `pass 8, fail 0`, incluindo `N217: docs bate com medição fresca e segunda execução é idêntica`.

Ponto 2 (âncoras do ESTADO.md deslocadas pela mesma entrega, latente atrás da falha acima) → `supabase/functions/evolution-api/index.ts` cresceu e as citações de `evolution-webhook` 474/540/701 ficaram apontando para linhas sem a edge. Atualizei para 571/637/798 em `ESTADO.md` (mesmos números da correção aprovada em t_0c136c28). Prova direcionada na minha árvore: 10/12 âncoras da linha `evolution-webhook` passam, incluindo as 3 do evolution-api; as 2 restantes (`evolution-sync-actions.ts:215/292`) estão deslocadas já na ponta do dia (arquivo que não toquei — achado fora do escopo, registrado em comentário no cartão). A guarda do ESTADO segue com exatamente as mesmas 2 falhas da base limpa (ai-kb-ingest:99 e grupo de create-user), provadas por execução na árvore pristine de dia/2026-10-14: `pass 9, fail 2` idênticos antes e depois do meu diff.

Pedido original (parear por código GO e v2) → sem mudança de comportamento: o rebase sobre o dia exigiu mesclar `session-flavor-routes.test.ts` com o teste TRA-002 do dia (bloco do dia preservado byte-idêntico, sem afrouxar). Suite Deno na árvore final: `session-flavor-routes.test.ts` 21 passed/0 failed (8 testes R2-API-016 do pairing-code + TRA-002 verdes) e `index.test.ts + evolution-control-authz.test.ts` 36 passed/0 failed.

Arquivos (`git diff --name-only dia/2026-10-14...HEAD`):
.tmp/relato.md
ESTADO.md
docs/audits/edge-functions-authz-coverage.md
supabase/functions/_shared/evolution-control-authz.ts
supabase/functions/evolution-api/index.ts
supabase/functions/evolution-api/session-flavor-routes.test.ts

Verificações:
- `node --test scripts/ci/edge-coverage-authz.unit.mjs` → antes: fail 1 (docs 137/137 vs medido 140/140); depois: pass 8, fail 0
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/evolution-api/session-flavor-routes.test.ts` → ok | 21 passed | 0 failed
- `deno test ... supabase/functions/evolution-api/index.test.ts supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` → ok | 36 passed | 0 failed
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → pass 9, fail 2 (mesmas 2 da base limpa dia/2026-10-14, sem falha nova)
- `zapp-verify full .` → db_guard OK, tipos OK, lint OK, migrations OK, banco_local AVISO (sem nome de conjunto); testes: 1494 arquivos passed, 13199 testes passed, 1 erro flaky em `src/components/settings/__tests__/SoundCustomizationPanel.test.tsx` (`setTimeout` de 500ms do componente disparando após o teardown do ambiente — arquivo fora do meu diff: 0 arquivos `src/` no meu diff). Isolado passa 10/10; `jev-juiz falha` no log: pre_existing (certeza 0.92), "não conserte fora do escopo". N217 não aparece mais entre as falhas.
