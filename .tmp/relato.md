Especialista: worker (auth) (area-auth-seguranca)

## Números do diff (conferidos)
`git diff --stat 96dd72dc5f HEAD` = **4 arquivos**: `supabase/migrations/20261009203548_...` e o rollback do pai (2 commits cherry-pick do t_37e0dde7, não são trabalho novo), a migration NOVA `20261013085500_talkx_n102_window_fixes.sql` e o teste NOVO `scripts/db-audit/talkx-n102-window-open-access.test.mjs`. **1 arquivo de teste, 3 casos de teste novos** (BLOCO A vermelho, BLOCO B verde, BLOCO C rollback).

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
- `node --test scripts/db-audit/talkx-n102-window-open-access.test.mjs` (VERSIONADO no diff; Postgres 17 descartável via docker, base REAL 20261009203548 + a migration nova, sob roles reais):
```
✔ BLOCO A (vermelho): com so a base, authenticated executa a RPC de campanha alheia (295ms)
✔ BLOCO B (verde): a migration tira o EXECUTE de authenticated e mantem so service_role (722ms)
✔ BLOCO C (rollback): as linhas -- Rollback restauram a ACL anterior, e reaplicar e idempotente (595ms)
ℹ tests 3  ℹ pass 3  ℹ fail 0
```
O teste cobre os caminhos pedidos: `anon`/`authenticated` sem EXECUTE, `authenticated` recebendo `permission denied for function` (42501) e `service_role` executando (retorna `true`); e confere `prosecdef` + `search_path=public, pg_temp`.
Sem a migration nova o BLOCO A falha (a base deixa `authenticated` executar) — é o vermelho antes/verde depois.
- `node scripts/db-audit/check-migration-drift.mjs` → `arquivos validos em supabase/migrations: 833; DESTINO_URL ausente - estrutura local validada` (exit 0).

## Sobre o teste versionado
O teste da fatia está versionado no diff (`scripts/db-audit/talkx-n102-window-open-access.test.mjs`), coberto pelo passo existente `node --test scripts/db-audit/*.test.mjs` do `db-guard.yml` (não fica órfão no `check-test-inventory`). O `.test.sh` de banco do cartão-irmão t_5d0f8628 continua sendo dele.

## O que NÃO fiz e por quê
- Não redefini a função (cast `jsonb->date[]` e fuso) — fatias separadas (t_a631f82f / t_59210b33).
- Não escrevi o `.test.sh` versionado de `scripts/db-audit/` — é do cartão-irmão t_5d0f8628; a prova desta fatia é o `.test.mjs` do BLOCO acima.
- Não mexi no baseline `known-violations.json` da chave `rpc:talkx_campaign_window_open:*` — é do guard de CI (worker ci), não desta fatia.
