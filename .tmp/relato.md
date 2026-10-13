Especialista: worker (auth) (area-auth-seguranca)

## O que mudou e por quê
- `supabase/migrations/20261013085500_talkx_n102_window_fixes.sql` (NOVO, único arquivo desta fatia): tira o `EXECUTE` de `authenticated` em `public.talkx_campaign_window_open(uuid, timestamptz)` e o deixa só para `service_role` (`REVOKE ALL ... FROM PUBLIC, anon, authenticated;` + `GRANT EXECUTE ... TO service_role;`). Motivo: a base 20261009203548 criou a função `SECURITY DEFINER` e concedeu `EXECUTE` a `authenticated` sem checagem de ator (linhas 533-536 do arquivo base), então qualquer usuário autenticado podia chamar a RPC para a campanha de outro dono/tenant e inferir a janela (dias e horário de não perturbe). Não toquei a base 20261009203548 nem o corpo da função (as fatias de cast e de fuso cuidam disso).

## Decisão de desenho (por que "service_role só", opção A do cartão)
O único consumidor real da RPC é a Edge `talkx-scheduler`: `supabase/functions/talkx-scheduler/index.ts:278` chama `supabase.rpc('talkx_campaign_window_open', ...)`, e o cliente é criado com `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:125-130`) — ou seja, `service_role`. Não existe chamada por `authenticated` no front (`git grep -n "talkx_campaign_window_open" -- src` → nenhum) nem em outra Edge Function. A opção B (manter `authenticated` e redefinir a função com checagem de ator) foi descartada nesta fatia: exigiria redefinir o corpo inteiro (colidindo com as fatias de cast/fuso) e amarrar a RPC a um dono/tenant que a função hoje não usa; a opção A é menor privilégio e mantém o contrato do único chamador.

## Inclui commits do cartão-pai (não são trabalho novo)
O diff contra `dia/2026-10-13` (96dd72dc5f) traz, além do arquivo acima, 2 commits `cherry-pick` do cartão-pai t_37e0dde7 (preparação da base do N-102), conforme o handoff dele (`cherry_picks`): `feat(talkx): send_weekdays e DND na janela de envio (N-102)` (base 20261009203548) e `fix(migration): rollback executável ...`. Sem eles a base da função não existe no workspace e a prova abaixo não roda. Não editei esses arquivos.

## CRITÉRIO DE PRONTO — item por item
1. Base intacta: `git diff 96dd72dc5f HEAD --stat` só cria o arquivo novo + os 2 cherry-picks do pai; não há edição da base. (a base unica alteracao do cherry-pick de rollback foi do pai, não minha)
2. `check-secdef-public-execute` VERDE: prova no item "Prova" (NOTICE OK contra o banco com base+fix).
3. PG descartável com papéis REAIS: `anon`/`authenticated` sem EXECUTE; `authenticated` recebe 42501 ao chamar; `service_role` executa e retorna `true`. Saída literal no item "Prova".
4. `prosecdef` e `search_path`: preservados — `true | search_path=public, pg_temp`.

## Prova
Script de prova (não versionado — o `.test.sh` versionado é do cartão-irmão t_5d0f8628): `.tmp/prova-acesso.sh`, rodado em `postgres:17-alpine` descartável, aplicando a base REAL (20261009203548) e depois a migration nova, sob roles reais.

vermelho antes (só a base): a chamada por `authenticated` executa:
```
PASS: RED: na base, authenticated executa window_open de campanha alheia (furo reproduzido)
```

verde depois (base + migration nova):
```
PASS: GREEN: anon sem EXECUTE em window_open
PASS: GREEN: authenticated sem EXECUTE em window_open
PASS: GREEN: service_role com EXECUTE em window_open
PASS: GREEN: authenticated recebe 42501 (permission denied) ao chamar window_open
PASS: GREEN: service_role executa window_open (retorna true)
PASS: GREEN: SECURITY DEFINER com search_path fixo preservados (true|search_path=public, pg_temp)
NOTICE:  check-secdef-public-execute: OK (4 funcoes SECURITY DEFINER em public, nenhuma com PUBLIC/anon)
PASS: GREEN: check-secdef-public-execute OK
TODOS OS PASSES
```

## Sobre "teste no diff" (ponto do juiz barato — não procede)
O teste versionado desta correção é o `scripts/db-audit/talkx-n102-window.test.sh`, que o cartão-pai atribuiu ao cartão-irmão t_5d0f8628 (e cuja promoção ao `db-guard.yml` é do dono do workflow). Criar um segundo `.test.sh` em `scripts/db-audit/` nesta fatia quebraria `scripts/ci/check-test-inventory.mjs` (todo `.test.sh` precisa constar do `db-guard.yml` ou da ALLOWLIST), obrigando-me a editar dois arquivos fora do ONDE do cartão e a colidir com o arquivo do cartão-irmão. Por isso a prova desta fatia roda no script `.tmp/prova-acesso.sh` (saída literal acima: RED na base, GREEN após a migration) e o caso negativo fica para o teste versionado do t_5d0f8628.

## O que NÃO fiz e por quê
- Não redefini a função (cast `jsonb->date[]` e fuso) — fatias separadas (t_a631f82f / t_59210b33).
- Não escrevi o `.test.sh` versionado de `scripts/db-audit/` — é do cartão-irmão t_5d0f8628; a prova acima fica em `.tmp`.
- Não mexi no baseline `known-violations.json` da chave `rpc:talkx_campaign_window_open:*` — é do guard de CI (worker ci), não desta fatia.
