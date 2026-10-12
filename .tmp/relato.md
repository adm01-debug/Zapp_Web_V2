Especialista: Edgar (area-edge-api)

## Sensibilidade
- Padrões sensíveis tocados: `service_role` (o handler usa o client admin para ler `profiles` e chamar `revoke_auth_sessions`), revogação de sessão (`auth.sessions`) e a decisão de entrada. O `service_role` NÃO foi ampliado: usa o mesmo client admin já existente; nenhuma policy, grant ou `EXECUTE` mudou — `revoke_auth_sessions(text,uuid,uuid,uuid,uuid)` já era `service_role`-only desde a migration `20261004181921` e é a MESMA primitiva do trigger `trg_revoke_sessions_on_profile_deactivate` e da Edge `revoke-auth-sessions`.
- Nenhuma proteção afrouxada e prova do caso NEGADO: o caminho negado (perfil inativo/ausente/`is_active` nulo) devolve o mesmo 401 e o mesmo corpo da senha errada, sem token, e o teste `perfil inativo: corpo e status IDÊNTICOS à senha errada` compara os dois corpos. Não há regressão de enumeração de contas.
- Nenhuma referência a banco/endpoint de produção. Sem segredo; nenhum dado de cliente.
- O que muda para quem chama: para perfil ativo, nada (mesmo 200/sessão). Para perfil inativo/ausente, o login passa a ser recusado com 401 (antes entrava).

## O que mudou e por quê (3 arquivos no diff, 1 deles de teste)
- `supabase/functions/auth-login/index.ts` (código): depois de `signInWithPassword` dar certo, resolvo o perfil por `profiles.user_id = signIn.user.id` (igualdade EXATA num índice UNIQUE/FK; nunca por `profiles.email`, nullable e sem UNIQUE). Perfil ausente, `is_active = false` ou `is_active` nulo (`!== true`) → revogo as sessões do usuário via `revoke_auth_sessions('global', …)` e devolvo o MESMO 401 da senha errada (mesmo `record_failed_login` e mesmo corpo de lockout). Falha na consulta do perfil → revogo e devolvo 500 (fail-closed). A consulta fica DEPOIS do GoTrue para inativo e senha errada terem custo de tempo comparável (sem oráculo).
- `supabase/functions/auth-login/index.test.ts` (teste): 6 casos novos — ausente (sem linha), `is_active` false, `is_active` nulo, erro na consulta (500), perfil ativo entra com 200 sem revogação, e comparação de corpo/status idênticos à senha errada; os casos inativos também provam a revogação (`revoke_auth_sessions` global com o id do auth) e o caminho exato `profiles`/`user_id`.
- `.tmp/relato.md` (este relato).
- Concentrei o ramo de senha errada e o ramo inativo no mesmo helper `recordFailure`, para os dois serem indistinguíveis; a resposta de erro de senha não mudou.

## Prova
- vermelho antes: `deno test --config scripts/ci/deno.json supabase/functions/auth-login/index.test.ts` (com o `index.ts` original, via `git stash`) → `FAILED | 13 passed | 6 failed` — os 6 casos novos caem (o inativo entrava com 200).
- verde depois: mesmo comando → `ok | 19 passed | 0 failed`.

## O que NÃO fiz e por quê
- Não adicionei migration: a revogação usa primitiva que já existe.
- Não mexi em `_shared` nem no front; o contrato de resposta (200/401/423/503) é o mesmo do arquivo.
