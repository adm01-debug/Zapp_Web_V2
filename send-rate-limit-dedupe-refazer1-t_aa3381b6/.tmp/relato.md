Especialista: edgar
## O que mudou e por quê
- supabase/functions/send-rate-limit-alert/index.ts:229-248: o patch do update do alerta aberto passou a gravar SEMPRE alert_type/severity/title do estado atual; removido o `if (escalating)` que congelava os campos no estado antigo. `shouldNotify` continua = escalating (notificação só na criação ou na escalada).
- supabase/functions/send-rate-limit-alert/__tests__/dedupe.test.ts:263: teste novo "dedupe: update sem escalada persiste alert_type/severity/title do estado atual" (blocked=true cria, blocked=false atualiza sem escalada e sem nova notificação).
## Prova
- vermelho antes (sem o fix, só com o teste novo): `deno test ... dedupe.test.ts` → `FAILED | 5 passed | 1 failed` + `error: Error: update deveria gravar o estado atual (warning): rate_limit_blocked`
- verde depois (com o fix): `deno test ... dedupe.test.ts index.test.ts` → `ok | 16 passed | 0 failed (183ms)`
- `zapp-verify <ws> --rapido` → `VERIFY: VERDE SEM BANCO (207s)` (OK db_guard, tipos 99s, lint 107s, migrations 1s; banco_local AVISO sem conjunto — cartão edge-only, sem migration)
- patch de entrega `.tmp/refazer1.patch` (3 hunks, só os 2 arquivos acima): `patch -p1 --dry-run` → `PATCH-DRYRUN-OK`
## Pontos do revisor
- Ponto 1: resolvido — index.ts:229-248 grava alert_type/severity/title do estado atual em todo update do ramo existente; sem escalada não há mais downgrade silencioso nem congelamento (o update agora reflete a chamada atual). Teste que prova: dedupe.test.ts:263 (falha sem o fix com `rate_limit_blocked` persistido, passa com o fix gravando `rate_limit_warning`/`medium`/título atual e sem nova notificação).
- Ponto 2: atendido — a primeira linha deste relato é exatamente `Especialista: edgar`.
## Arquivos (lista exata — `diff -rq` contra a ponta do trabalho anterior mostra só estes 2)
- supabase/functions/send-rate-limit-alert/index.ts
- supabase/functions/send-rate-limit-alert/__tests__/dedupe.test.ts
## O que NÃO fiz e por quê
- NÃO criei branch/commit nem rodei `hermes-tarefa-fechar`: nesta sessão `hermes-tarefa-iniciar`/`hermes-tarefa-fechar` saem com exit 75 (CONGELADO sem MODO_V2) e a guarda bloqueia `git worktree`/`clone`/`branch`/`apply` para meu perfil. Trabalhei em cópia-arquivo da ponta do trabalho anterior (commit 15367507eb) e entrego o diff como `.tmp/refazer1.patch` (dry-run OK) para o integrador aplicar sobre a base `dia/2026-10-14`.
- NÃO toquei em deployment-manifest.json, migrations, nem no teste `_adv_edge_legacy_producers` (não existe arquivo com esse nome no módulo; nenhum produtor novo foi criado).
- FAIXA DO PAI: nenhum commit de outro cartão foi trazido; o patch contém exclusivamente a correção deste refazer sobre o trabalho anterior 15367507eb.
