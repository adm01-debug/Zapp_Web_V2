Especialista: senior

Ponto 1 — comentarios do SQL contradiziam a reabertura de `resolved`
O que mudou: em `supabase/migrations/20261011094027_assume_return_conversation.sql`, o contrato das RPCs registra que conversa `resolved` pode ser reaberta por Assumir, gravando `open`, enquanto `archived` continua bloqueada.
Prova: `TMPDIR="$PWD/.tmp" bash scripts/db-audit/assume-return-conversation.test.sh` chama as RPCs reais; no trabalho anterior saiu 0 com `[OK] DEPOIS: admin assume conversa resolved e reabre como open = true|...|open` e `[OK] DEPOIS: auditoria da reabertura guarda previous_status resolved = resolved|open`. Neste refazer final eu rodei o mesmo teste novamente; resultado listado em "Verificacoes executadas".

Ponto 2 — faltava teste de Assumir em `archived`
O que mudou: em `scripts/db-audit/assume-return-conversation.test.sh`, a assercao `assumir conversa arquivada (conversation_not_active)` chama `public.assume_conversation('$C_ARCH')` contra Postgres descartavel.
Prova: o teste de banco real continua exercitando esse caminho; se a RPC reabrisse `archived`, a chamada `check_error` falharia por nao receber o erro esperado.

Ponto 3 — aviso do juiz `backfill_dispara_gatilho`
O que mudou: nao adicionei backfill. A migration cria as duas RPCs e o teste preserva a prova de que a chamada toca so a linha alvo por PK.
Prova: o teste compara `updated_at` antes/depois da linha alvo e de uma linha vizinha e exige mudanca apenas na conversa alterada pela RPC.

Ponto 4 — rollback exato e executavel
O que mudou: em `supabase/migrations/20261011094027_assume_return_conversation.sql`, o rollback no topo remove exatamente as duas funcoes criadas (`assume_conversation(uuid)` e `return_conversation_to_queue(uuid)`).
Prova: o teste extrai o bloco `-- Rollback:` do proprio arquivo, aplica no Postgres descartavel e confere que as funcoes foram removidas.

Ponto 5 — env do passo novo no DB Guard
O que mudou: em `.github/workflows/db-guard.yml`, no passo `Simular assumir e devolver conversa por fila`, acrescentei apenas o env `ASSUME_RETURN_TEST_POSTGRES_IMAGE: ${{ env.POSTGRES_TEST_IMAGE }}`. O script le `ASSUME_RETURN_TEST_POSTGRES_IMAGE`, entao o DB Guard passa a usar a mesma imagem pinada do job, como o passo vizinho `TALK_ME_TEST_POSTGRES_IMAGE`.
Prova: o diff mostra somente esse env no passo; `node --test scripts/ci/check-test-inventory.mjs` mantem `scripts/db-audit/assume-return-conversation.test.sh` registrado no workflow. O comando ainda pode listar orfaos preexistentes fora deste cartao, mas nao este teste.

Arquivos alterados (`git diff --name-only dia/2026-10-13...HEAD`):
- .github/workflows/db-guard.yml
- .tmp/relato.md
- scripts/db-audit/assume-return-conversation.test.sh
- src/integrations/supabase/types.ts
- supabase/migrations/20261011094027_assume_return_conversation.sql

Conferencia de escopo:
- 5 arquivos no diff, sendo 1 teste de banco: `scripts/db-audit/assume-return-conversation.test.sh`.
- Nao mexi nos pontos 1 a 3 aprovados alem de reaplicar o commit de partida; a unica correcao deste refazer final e o env do passo de CI.

Verificacoes executadas:
- `bash -n scripts/db-audit/assume-return-conversation.test.sh` — exit 0.
- `TMPDIR="$PWD/.tmp" bash scripts/db-audit/assume-return-conversation.test.sh` — exit 0; mostrou `[OK] DEPOIS: admin assume conversa resolved e reabre como open = true|...|open`, `[OK] DEPOIS: assumir conversa arquivada (conversation_not_active)`, `[OK] ROLLBACK: functions removidas = <null>|<null>` e `[OK] MUTACAO F: bloquear resolved no assumir faz o contrato FALHAR (resolved precisa reabrir)`.
- `node --test scripts/ci/check-test-inventory.mjs` — exit 1 por 6 orfaos preexistentes fora deste cartao (`department-invite-contract-audit-vocabulary`, `ia-usage-outbox-duravel`, `talkx-conversion-defaults`, `team-chat-department-transfer-guards`, `team-chat-media-contract`, `team-direct-conversation-race`); o teste deste cartao, `assume-return-conversation.test.sh`, nao aparece na lista.
- `zapp-verify . --rapido` — exit 0: `VERIFY: VERDE SEM BANCO (241s)`; banco local coberto pelo teste Docker acima.
- `git diff --stat dia/2026-10-13...HEAD` — 5 arquivos, 910 insercoes e 108 remocoes; 1 arquivo de teste.
