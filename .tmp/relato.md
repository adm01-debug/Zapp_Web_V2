Especialista: Edgar (area-edge-api)

## Sensibilidade
- Toca o padrão `service_role` (client admin para `resolve_network_policy` e `revoke_auth_sessions`) e a primitiva de revogação de sessão. Ambos já existiam; nenhum protegido novo.
- Nenhuma proteção afrouxada: o caminho NEGADO é provado por teste (rede negada e conta inativa devolvem 403 genérico e revogam). Nada de produção, nada de segredo no código.
- O que muda para quem chama: nova Edge `post-login-gate`, autenticada (verify_jwt default). Quem não a chamar continua como antes (risco residual na ADR).

## Fatos do diff
- Commit único com 4 arquivos: `docs/adr/ADR-007-porteiro-pos-login.md`, `supabase/functions/post-login-gate/index.test.ts`, `supabase/functions/post-login-gate/index.ts` e `.tmp/relato.md`.
- 1 arquivo de teste (`index.test.ts`), 10 casos de teste novos.

## O que mudou e por quê
- `supabase/functions/post-login-gate/index.ts` (novo): Edge autenticada que, para o usuário já logado por Google/OTP/password grant, decide a política de rede na fronteira canônica (`resolve_network_policy`, endpoint `post-login-gate`), confere `profiles.is_active` do próprio chamador e: permitido → `{allowed:true}`; negado → encerra a sessão (`revoke_auth_sessions`, self-only) e devolve a mesma recusa genérica do login (`403 {"error":"Access denied"}`). Indecidível (503) não revoga.
- `supabase/functions/post-login-gate/index.test.ts` (novo): 10 testes offline; GoTrue, o client admin e o leitor de `profiles` são injetados.
- `docs/adr/ADR-007-porteiro-pos-login.md` (novo): decisão + risco residual explícito (ator que não chama o porteiro segue lendo pelo PostgREST até o `exp` do JWT; janela do token; coordenação com PD-03/PD-01).

## Prova
- verde depois: `deno test --config scripts/ci/deno.json supabase/functions/post-login-gate/index.test.ts` → `ok | 10 passed | 0 failed (30ms)`
- cobertura do aceite: "rede negada encerra a sessão social" provado nos testes de 403 (revoga com `p_scope=local` e `p_target_session_id` da sessão); conta inativa provado no teste de `is_active=false` (revoga); permitido não revoga (teste `{allowed:true}` com `revoke_calls=0`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (304s)` (dependencias, db_guard, tipos, lint, migrations: OK; banco não tocado).
- commit único: `feat(auth): porteiro pos-login encerra sessao social de rede negada ou conta inativa` (mensagem no HEAD da branch `v2/porteiro-pos-login-google-codigo-26101312286495`).

## O que NÃO fiz e por quê
- Não mexi no front (chamada do porteiro após o login social/OTP) nem em `supabase/config.toml`: fora dos arquivos do cartão. A entrada em `config.toml` não é necessária (verify_jwt default = true). A chamada no cliente é de outra área e fica registrada como achado.
- Não tratei `banned_until`/ban: é PD-03 (`t_cd4627c5`), para não duplicar o decisor.
- Sem migration: o cartão pedia Edge + ADR; `resolve_network_policy` e `revoke_auth_sessions` já existem no banco.
