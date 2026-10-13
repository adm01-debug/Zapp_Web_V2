Especialista: senior (area-edge-api + area-auth-seguranca)

Ponto 1 — rebase do trabalho aprovado na ponta atual preservando o que já entrou.
- O que fiz: trouxe o commit aprovado `f4e4ece101f4` com `git cherry-pick -n` e preservei exatamente a Edge pública nova em `supabase/functions/request-password-reset/index.ts`, o teste em `supabase/functions/request-password-reset/index.test.ts` e a entrada isolada de `supabase/config.toml`.
- Conflito resolvido: `.tmp/relato.md:1` estava em conflito com o relato de outro cartão já presente na ponta; removi o bloco alheio e deixei este relato do refazer. `supabase/config.toml:42-46` auto-mergeou sem conflito, mantendo as entradas existentes e adicionando somente `[functions.request-password-reset] verify_jwt = false`.
- Prova: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/request-password-reset/index.test.ts` → `ok | 9 passed | 0 failed (60ms)`.

Ponto 2 — não acrescentar nada além do aprovado.
- O que fiz: não mudei comportamento do commit aprovado; a função continua com resposta genérica anti-enumeração, lookup/insert via service role dentro da Edge, limites 3 por e-mail/hora e 10 por IP/hora, truncamento de motivo/user-agent e logs sem e-mail/IP/motivo.
- Prova: `git diff --name-only dia/2026-10-13...HEAD` lista só `.tmp/relato.md`, `supabase/config.toml`, `supabase/functions/request-password-reset/index.test.ts` e `supabase/functions/request-password-reset/index.ts`.

Ponto 3 — rodar o teste do cartão e `zapp-verify full .`.
- Teste do cartão: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/request-password-reset/index.test.ts` → `ok | 9 passed | 0 failed (60ms)`.
- `zapp-verify full .`: iniciado em background, mas ficou preso na fila global `zapp-sem pesado 3` depois de `OK db_guard 0s`; havia mais de dez verificações pesadas concorrentes no host. Matei só o processo deste cartão para não consumir slot parado. Falta rerodar `zapp-verify full .` quando a fila global liberar.

Arquivos alterados:
.tmp/relato.md
supabase/config.toml
supabase/functions/request-password-reset/index.test.ts
supabase/functions/request-password-reset/index.ts
