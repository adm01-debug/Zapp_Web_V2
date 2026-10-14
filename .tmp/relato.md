Especialista: edgar

Ponto 1 — teste da migração idempotente exigido (segunda rodada sem efeito + `.or(...)` + ramo de falha do legado).
O que mudei: só `supabase/functions/batch-fetch-avatars/index.test.ts` (+190 linhas, 2 testes novos + helpers `recordingBuilder`/`recordingDeps`/`legacyRow`); nenhum arquivo de produção foi tocado nesta rodada (`git diff HEAD~1 --name-only` = só o `index.test.ts`).
Teste 1 "migracao e idempotente: segunda rodada com URL canonica nao re-hospeda nem remove": o mock evolui entre rodadas (1a = linha legada, 2a = mesma linha já com URL `.../avatars/contacts/<id>/<token>.jpg`). Rodada 1: updated=1, 1 upload `contacts/contato-1/<token>.jpg`, 1 remoção `avatars/5511999998888.jpg`. Captura do `.or(...)`: toda cláusula gravada não contém `contacts/` e ao menos uma contém `avatars/avatars/`. Rodada 2: updated=0, failed=1 (Evolution sem foto), uploads e remoções congelados em 1, e nenhum update da rodada 2 toca `avatar_url`.
Teste 2 "legado que falha (arquivo antigo indisponivel): failed++ e URL antiga intacta, sem remocao": fetch sempre 404 → persist devolve null → ramo `if (!newUrl)`: failed=1, updated=0, 0 uploads, 0 remoções, único update = `{avatar_fetch_attempted_at}` sem `avatar_url` (URL antiga intacta + backoff marcado).
Prova vermelho→verde (comando real, `--no-check` porque o type-check TS2589 em `index.ts:112` falha idêntico com o teste HEAD, pré-existente): mutação 1 — `LEGACY_AVATAR_LIKE` alargado para `%/avatars/%` ⇒ teste 1 FALHA (`FAILED | 0 passed | 1 failed`), revertido ⇒ passa; mutação 2 — fetch do teste 2 trocado para bytes 200 ⇒ teste 2 FALHA (`FAILED | 0 passed | 1 failed`), revertido ⇒ passa.

Ponto 2 — correções só do relato (primeira linha exata, linha de verificação com contagem real, lista dos testes tocados): atendido neste próprio relato.
Verificação: `deno test --no-check --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/batch-fetch-avatars/index.test.ts supabase/functions/_shared/__tests__/avatar-storage-path.test.ts` ⇒ `ok | 7 passed | 0 failed`.
Arquivos de teste tocados nesta rodada: `supabase/functions/batch-fetch-avatars/index.test.ts` (único). Não tocado mas revalidado: `supabase/functions/_shared/__tests__/avatar-storage-path.test.ts` (4 passed).

Lista exata de arquivos (`git diff --name-only dia/2026-10-14...HEAD`, copiada do comando):
.tmp/relato.md
supabase/functions/_shared/__tests__/avatar-storage-path.test.ts
supabase/functions/_shared/evolution-helpers.ts
supabase/functions/_shared/evolution-types.ts
supabase/functions/_shared/evolution-webhook-handlers.ts
supabase/functions/_shared/evolution-webhook-messages.ts
supabase/functions/batch-fetch-avatars/index.test.ts
supabase/functions/batch-fetch-avatars/index.ts
(As 7 linhas além do `index.test.ts`+relato vêm da entrega anterior b4e4f88, já revisada; meu commit bbeafcd556 adiciona só os 190 do teste. Nenhum defeito novo: sem chamada a chamador alterado, sem toast/log duplicado, sem manifesto/CI/guardas tocados.)
