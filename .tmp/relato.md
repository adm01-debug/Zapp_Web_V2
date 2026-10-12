Especialista: senior (area-sql-banco)

Ponto 1 — comentarios do SQL contradiziam a reabertura de `resolved`
O que mudei: em `supabase/migrations/20261011094027_assume_return_conversation.sql`, corrigi o comentario de contrato para dizer que `resolved` e encerrado que pode ser reaberto por Assumir, gravando `open`; `archived` permanece bloqueado.
Prova vermelha: a mutacao F copia o comportamento antigo de bloquear `resolved`; o teste registra `ERROR: conversation_not_active` e `[FAIL] MUTACAO F: admin assume conversa resolved e reabre como open...`.
Prova verde: no SQL real, `TMPDIR="$PWD/.tmp" bash scripts/db-audit/assume-return-conversation.test.sh` saiu 0 e mostrou `[OK] DEPOIS: admin assume conversa resolved e reabre como open = true|...|open` e `[OK] DEPOIS: auditoria da reabertura guarda previous_status resolved = resolved|open`.

Ponto 2 — faltava teste de Assumir em `archived`
O que mudei: em `scripts/db-audit/assume-return-conversation.test.sh`, adicionei a assercao real `assumir conversa arquivada (conversation_not_active)` chamando `public.assume_conversation('$C_ARCH')` contra Postgres 17 descartavel.
Prova verde: o teste saiu 0 e mostrou `[OK] DEPOIS: assumir conversa arquivada (conversation_not_active)`; se a RPC reabrisse `archived`, essa chamada `check_error` falharia porque o erro esperado nao ocorreria.

Ponto 3 — aviso do juiz `backfill_dispara_gatilho`
O que mudei: nao adicionei backfill. A migration nova cria apenas as duas RPCs; ela nao atualiza linhas existentes fora da chamada por contato. Mantive no teste a prova contra o risco: antes/depois de `updated_at` compara a linha alvo com uma linha vizinha e exige que apenas a linha por PK mude.
Prova: no teste real saiu `[OK] DEPOIS: updated_at avanca so na linha tocada (1 linha por PK) = true|true`; isto prova que o UPDATE da RPC nao dispara gatilho em massa/backfill indevido.

Ponto 4 — rollback precisava ser exato e executavel
O que mudei: em `supabase/migrations/20261011094027_assume_return_conversation.sql`, troquei o texto generico por rollback declarando que as duas linhas SQL abaixo removem exatamente os objetos criados; mantive as duas linhas executaveis `drop function if exists ...` no topo.
Prova: o teste extraiu e aplicou o rollback do proprio arquivo e registrou `[OK] ROLLBACK: functions removidas = <null>|<null>` e `[OK] ROLLBACK: contrato volta ao estado anterior`.

Ponto 5 — aviso do juiz `fora_do_escopo` / inventario do teste novo
O que mudei: mantive o diff de produto restrito a migration, teste de banco e tipos gerados; `scripts/db-audit/assume-return-conversation.test.sh` e o teste de banco pedido pelo cartao. Acrescentei tambem `.github/workflows/db-guard.yml` porque o proprio `hermes-tarefa-fechar` recusou o fechamento dizendo: `.test.sh novo sem passo no CI: scripts/db-audit/assume-return-conversation.test.sh`. O passo novo registra exatamente este teste de banco no DB Guard offline e o proprio diff traz comentario justificando a excecao. Nao ha env novo: o job ja expoe `POSTGRES_TEST_IMAGE` global e o script le essa variavel.
Prova: `node --test scripts/ci/check-test-inventory.mjs` nao aponta mais `scripts/db-audit/assume-return-conversation.test.sh` como orfao. O comando ainda sai 1 por tres orfaos preexistentes fora deste cartao: `department-invite-contract-audit-vocabulary.test.sh`, `talkx-conversion-defaults.test.sh`, `team-chat-media-contract.test.sh`.

Arquivos alterados (`git diff --name-only dia/2026-10-12...HEAD`):
- .github/workflows/db-guard.yml
- .tmp/relato.md
- scripts/db-audit/assume-return-conversation.test.sh
- src/integrations/supabase/types.ts
- supabase/migrations/20261011094027_assume_return_conversation.sql

Verificacoes executadas:
- `TMPDIR="$PWD/.tmp" bash scripts/db-audit/assume-return-conversation.test.sh` — exit 0; contrato real, rollback extraido do arquivo, archived bloqueado, resolved reaberto e mutacao F falhando como esperado.
- `bash -n scripts/db-audit/assume-return-conversation.test.sh` — exit 0.
- `zapp-verify . --rapido` — exit 0: `VERIFY: VERDE SEM BANCO`; o banco foi coberto pelo teste Docker acima.
- `node --test scripts/ci/check-test-inventory.mjs` — exit 1 somente por 3 testes orfaos preexistentes fora deste cartao; o teste novo deste cartao nao aparece mais na lista.
- `git diff --stat dia/2026-10-12...HEAD` — 5 arquivos, 907 insercoes e 29 remocoes; 1 arquivo de teste; diff abaixo de 90000 caracteres.

Commit: HEAD (fix(db): reabre conversa resolvida ao assumir)
