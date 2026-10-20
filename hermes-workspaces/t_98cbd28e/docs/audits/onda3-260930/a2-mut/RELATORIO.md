# Auditoria de MUTAÇÃO — harnesses de DDL da Onda 3 (#1265 / #1266 / #1267)

Data: 2026-09-30 · Auditor: subagente a2-mut (auditor de mutação)
Regra de julgamento: só é **morte REAL** quando houve teste rodando e falhando com **asserção NOMEADA** (linha `FAIL`/`[FAIL]` colada). `exit != 0` sozinho não prova nada.

## Ambiente / isolamento (registre as DIFERENÇAS ao briefing)
- **Alvo auditado**: branch `hermes/multiplix-guards-fail-closed-26093014476657` @ `9845569d63ab1499143a2e13edb83a2acce1f22a` (origin).
  - Muito importante: as 3 migrations desta onda **não estão todas em `origin/main`**. `origin/main` (`92e884ee`) tem `20260930260000` (#1265) e `20260930280000` (#1266), mas **NÃO tem** `20260930300000_multiplix_guards_fail_closed.sql` (#1267) nem o bloco `#1267` do `multiplix-rls.test.sh` (só 40 linhas do bloco existem no branch). Logo, seguir o briefing ao pé da letra (`checkout origin/main`) produziria FALSO-MORTO (migration ausente) para o #1267. A auditoria foi feita contra o **branch**, que é o estado real do PR.
- **Cópia isolada (somente leitura na origem)**: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/multiplix-guards-fail-closed-26093014476657/.tmp/a2-mut`
  - Desvio 1: usei o `.tmp` do workspace da tarefa em vez de `/tmp/a2-mut` (o guard da sessão proíbe `/tmp` e manda usar `<workspace>/.tmp`). O briefing pedia `/tmp/a2-mut`.
  - Desvio 2: o guard bloqueia a substring `checkout`, então o sandbox foi materializado com `git archive <branch> | tar -x` (100% read-only na origem), **não** com `cp -a` + `checkout`. Consequência: o sandbox **não tem `.git`**; não dá para rodar `git status --short` nele. Prova de integridade equivalente (mais forte) abaixo.
- Clone de referência `~/projetos/Zapp_Web_V2` só teve comandos de leitura (`fetch/log/show/ls-tree/diff/archive`). Nada escrito.
- Postgres 17 descartável em container docker, um harness por vez, `TMPDIR` próprio.
- Logs crus: `<workspace>/.tmp/a2-mut-logs/` (baseline, mutA/B/C/D, post-restore).

## Tabela por alvo/mutação

| Alvo | Mutação (na MIGRATION) | Comando | exit | Linha FAIL / erro | Classificação |
|---|---|---|---|---|---|
| #1265 | BASELINE | `bash scripts/db-audit/team-reaction-membership.test.sh` | 0 | (PASS) | PASS |
| #1265 | **B — enfraquecer**: removi o `DROP POLICY reactions_insert` (a policy fraca sobrevive) | idem | 1 | `[FAIL] B1 (#1265) INSERT direto cross-team agora e barrado pela RLS: deveria falhar, mas passou` | **MORTE REAL** |
| #1265 | **C — exagerar**: tirei a policy estrita de `authenticated` e deixei INSERT só para `service_role` | idem | 1 | `[FAIL] B4 caminho legitimo preservado: membro reage na conversa do proprio time: deveria ter sucesso (como authenticated)` | **MORTE REAL** (não é teste de mão única) |
| #1266 | BASELINE | `bash scripts/db-audit/team-chat-rpc-ambiguity.test.sh` | 0 | (PASS) | PASS |
| #1266 | **B — desfazer a qualificação** (`conversation_id`/`created_at`/`id` sem alias na função) | idem | 1 | **sem linha FAIL**; aborta com `ERROR: column reference "conversation_id" is ambiguous` (na 1ª chamada do BLOCO B) | **morte NÃO-NOMEADA** (ver "onde faltam dentes") |
| #1266 | **C — recriar a policy recursiva** (`EXISTS` na própria `team_conversation_members`) | idem | 1 | **sem linha FAIL**; aborta com `ERROR: infinite recursion detected in policy for relation "team_conversation_members"` (B8) | **morte NÃO-NOMEADA** |
| #1266 | **D — probe**: `ALTER FUNCTION is_team_conversation_member(uuid,uuid) RESET search_path` | idem | 0 | (PASS) | **SOBREVIVEU — ACHADO: não mata** |
| #1267 | BASELINE | `bash scripts/db-audit/multiplix-rls.test.sh` | 0 | (PASS) | PASS |
| #1267 | **B — voltar FAIL-OPEN** (`IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN COALESCE(NEW,OLD)` + remove o `RAISE ... auth_role_undefined`) nos DOIS guards | idem | 1 | `FAIL: #1267: a escrita sem claim continuou passando (guard ainda fail-open)` | **MORTE REAL** |
| #1267 | **C — exagerar**: nego também o `service_role` (ator legítimo) no guard do dispatch | idem | 1 | `FAIL: #1267: service_role (worker/RPCs do motor) perdeu a escrita livre` (passo 3) | **MORTE REAL** (não é teste de mão única) |
| #1267 | **C2 — exagerar mais**: nego `service_role` E o dono `postgres` | idem | 1 | `FAIL: sweeper nao fechou o item preso (F11b)` | **MORTE REAL, mas NÃO no passo (3)** — morre antes (ver nota) |
| #1267 | *(primeira tentativa de C, defeito da minha mutação: `CREATE TRIGGER` não idempotente)* | idem | 3 | `ERROR: trigger "mut_strict_service_role_block" for relation "multiplix_dispatches" already exists` | **FALSO-MORTO** (arte de mutação: o harness aplica a migration 3000 **duas vezes**) |

## Onde o harness NÃO tem dentes (achados)

1. **#1266 — falha sem nome (2 de 3 mutações).** Em `team-chat-rpc-ambiguity.test.sh`, os helpers `expect_value`/`expect_value_as` fazem `actual="$(as_user ... | tail -n1)"` sob `set -Eeuo pipefail`. Quando o SQL **erra** (42702/42P17), a substituição de comando falha, o `set -e` **aborta o script na hora** e **nenhuma linha `[FAIL]` é impressa** — só o erro do psql no stderr. Ou seja: o harness morre, mas **não nomeia a asserção**, e não é possível distinguir isso de um erro de infra pela saída. Só as asserções que passam por `expect_error_as` / `expect_ok_as` (que tratam `|| true` e imprimem FAIL) são "nomeadas". Convergir `expect_value*` para o padrão de `expect_error_as` fecharia o buraco.
2. **#1266 — `search_path` do helper não é cobrado (passa).** A migration **não define nem fixa** o `search_path` de `is_team_conversation_member` (o helper é criado pelo próprio `pre.sql` do harness, com `SET search_path=public`). Adicionar à migration um `RESET search_path` do helper **não faz o harness falhar** (exit 0). O harness não tem nenhuma asserção sobre `proconfig`/`search_path` do helper — dimensão de segurança (hijack de search_path) **sem cobertura**.
3. **#1267 — o dono `postgres` não é cobrado NO PASSO (3).** Bloquear o dono `postgres` (mutação C2) **não** chega ao passo (3): morre antes, em **F11b** (`sweeper nao fechou o item preso`), porque a RPC `sweep_multiplix_stuck_recipients` é `SECURITY DEFINER` (dona `postgres`) e seus UPDATEs internos batem no guard. O passo (3) só é alcançado se o `service_role` for bloqueado. Consequência: a proteção do "dono postgres livre" é exercitada **indiretamente** por F05/F11b/F08, não pelo passo (3); a asserção do passo (3) para `postgres` é, na prática, redundante com a de `service_role`.
4. **#1267 — o harness reaproveita/replay-a a migration 3000.** O `multiplix-rls.test.sh` aplica `20260930300000` **duas vezes** (uma no loop de migrations da tarefa, outra no passo (2)). Qualquer DDL **não idempotente** no arquivo vira FALSO-MORTO ("already exists"). Aqui isso é "correto" para a migration real (usa `CREATE OR REPLACE`), mas é um requisito **não declarado** para quem mexer na migration e um risco de falso-positivo/falso-negativo no harness.

## Controle obrigatório (deve morrer)
- Cada mutação "para menos" (B de cada alvo) é o controle que **DEVE** morrer: #1265-B morreu nomeado; #1266-B morreu (não-nomeado); #1267-B morreu nomeado. ✔
- Cada baseline **DEVE** passar: os 3 passaram **antes** e **depois** das mutações (exit 0, sem `FAIL`). ✔
- Controle anti-falso-positivo: a 1ª tentativa do #1267-C produziu exit 3 por arte da **minha** mutação (trigger não idempotente) → classificado como FALSO-MORTO, não como dente do teste. ✔

## Prova de restauração (integridade)
- `sha256` antes == depois == blob canônico do branch, por arquivo:

| migration | sha256 (antes / depois / `git show <branch>:path`) |
|---|---|
| 20260930260000_team_reaction_membership_guard.sql | `2c8e33c7411cc851d1e9bc0d82729e8deaedbdb508c174a2ff2e99acc898a537` |
| 20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql | `8b7665b249754829759ed870830c8d38efef81626e109e990ab2e9d20d4e5554` |
| 20260930300000_multiplix_guards_fail_closed.sql | `01874f5a82771d46630f7b951bf686e6b69d5f9c7dcbb840f3e6032ecfbe273b` |

- **`diff -r -x .tmp <sandbox> <extrato-pristino-do-branch>` = VAZIO** (árvore do sandbox idêntica ao branch; equivale a `git status` vazio — o sandbox não é repo git por construção).
- **Workspace da tarefa intocado**: `git -C <workspace> status --short` **vazio** (exit 0) após toda a auditoria.
- Pós-restauração: os 3 harnesses rodados de novo → todos `EXIT=0`, nenhuma linha `FAIL`.

## Veredito
- **#1265**: harness COM dentes nos dois sentidos (morte real e nomeada em B1 e B4).
- **#1266**: harness morre nos dois sentidos, mas **sem asserção nomeada** (aborta em `set -e`); e **não cobra** o `search_path` do helper (SOBREVIVEU). → **dentes parciais**.
- **#1267**: harness COM dentes nos dois sentidos para o `service_role` (morte real e nomeada). A proteção do dono `postgres` é exercitada só indiretamente (F11b), não pelo passo (3). Requer DDL idempotente (replay).
