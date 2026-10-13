Especialista: Edgar (area-edge-api)

## Sensibilidade
- O diff toca caminho com `service_role`: no modo `verify` a sessão temporária que o GoTrue cria para conferir a senha é revogada com `admin.auth.admin.signOut(access_token, "local")` (mesmo client service_role que já roda as RPCs de política/lockout; nenhuma credencial nova).
- Nenhuma proteção afrouxada: o caso NEGADO está provado por teste — `mode` desconhecido responde 400; rede negada 403; conta bloqueada 423; senha errada/conta inativa 401 (mesma recusa do login). O `mode` ausente continua sendo login.
- Nenhuma referência ao banco/endpoint de produção: só o client injetado pelas deps; testes usam fakes.
- Escopo `local` de propósito: revoga SÓ a sessão temporária — `global` derrubaria a sessão real (AAL2) do usuário, que é o oposto do que o cartão quer.
- O que muda para quem chama: `{email,password}` (ou `mode:"login"`) segue idêntico — 200 com tokens. O novo `mode:"verify"` responde 200 `{ok:true}` SEM token nenhum.

## O que mudou e por quê
- supabase/functions/auth-login/index.ts: o corpo aceita `mode` (`"login"` | `"verify"`, ausente = `"login"`); `mode` inválido = 400 antes de qualquer efeito. No modo `verify`, após o GoTrue aceitar a senha, a sessão temporária é revogada (`signOut(access_token,"local")`) e a resposta é `{ok:true}` — sem `access_token`/`refresh_token`. Se a revogação falhar, 503 (falha fechada): não devolve "senha ok" com sessão órfã viva. O login normal mantém a ordem e o corpo de antes (tentativas zeradas antes de responder com tokens).
- supabase/functions/auth-login/index.test.ts: `fakeAdmin` ganhou o seam `auth.admin.signOut` (registra jwt+escopo e permite scriptar erro) e 8 testes novos do modo `verify`.

## Prova
- arquivos alterados (3, sendo 1 de teste): `supabase/functions/auth-login/index.ts`, `supabase/functions/auth-login/index.test.ts` (8 casos de teste novos do modo `verify`), `.tmp/relato.md`.
- vermelho antes: `git show HEAD~1:.../index.ts > index.ts && deno test --config scripts/ci/deno.json supabase/functions/auth-login/index.test.ts` → `FAILED | 18 passed | 3 failed` (falham exatamente os 3 comportamentos novos: `verify: senha correta devolve {ok:true}`, `verify: falha ao revogar responde 503`, `mode desconhecido responde 400`).
- verde depois: `deno test --config scripts/ci/deno.json supabase/functions/auth-login/index.test.ts` → `ok | 21 passed | 0 failed`.
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (183s)` (OK db_guard, OK tipos, OK lint, OK migrations; banco local não verificado nesta execução — o cartão não mexe em banco).

## O que testei do modo `verify` (recusas idênticas ao login)
- senha correta → 200 `{ok:true}`, corpo sem tokens, `signOut` chamado uma vez com escopo `local`, tentativas zeradas.
- senha errada (GoTrue 4xx) → 401 `Invalid login credentials` + `record_failed_login`; nenhum `signOut`.
- conta inativa/recusada pelo GoTrue (4xx) → 401 igual ao login.
- conta bloqueada → 423 sem tocar o GoTrue nem `signOut`.
- rede negada → 403 antes de qualquer efeito (nenhuma RPC além da política, nenhum rate limit, nenhum signOut).
- `mode` desconhecido → 400.
- `mode:"login"` explícito → 200 com tokens e SEM `signOut`.

## O que NÃO fiz e por quê
- O front que passa a usar o modo `verify` e o retorno a AAL2 é o cartão filho t_5dcccf78 (área do hugo), que depende deste. Não toquei em `src/**`.
- Não mexi em migrations nem no contrato do login normal — fora do escopo do cartão.
