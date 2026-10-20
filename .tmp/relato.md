Especialista: senior (area-sql-banco)

Refazer 1 dos 3 pontos da recusa. Trouxe o trabalho anterior com cherry-pick dos commits 0cb904cfe + d45670117 (só os 4 arquivos do cartão, sem diff alheio); a migration estava correta e não foi alterada.

Ponto 1 — caso "devolver pelo responsável" não-admin: em checa_contrato (scripts/db-audit/assume-return-conversation.test.sh), logo após "membro da fila assume contato livre" (M1 assume C_TAKE), M1 chama return_conversation_to_queue sobre C_TAKE. Prova ok=true, assigned_to NULL, status waiting, queue_id mantida e 1 linha de auditoria com o motivo ("resolvido pelo dono") — 4 asserções novas. Teste: verde com a migration real ([OK] DEPOIS: dono nao-admin devolve a fila = true; estado = |waiting|<queue>; auditoria = 1; motivo gravado).

Ponto 2 — mutação da barreira do dono: MUTACAO D troca "IF v_contact.assigned_to <> v_profile_id AND NOT v_is_admin THEN" por "IF NOT v_is_admin THEN" (só admin devolveria) em cópia no TMPDIR, sem tocar o arquivo do repo. Teste: vermelho sem a barreira — o contrato FALHA exatamente no caso novo ([EVIDENCIA] [FAIL] MUTACAO D: dono nao-admin devolve a fila deveria ser true, obtido vazio; ERROR not_authorized) e a mutação é detectada ([OK] MUTACAO D: sem a barreira do dono o contrato FALHA). Prova que o caso do ponto 1 cobre a barreira.

Ponto 3 — relato bate com o teste: os casos provados são dono não-admin devolve (C_TAKE/M1), admin devolve (C_OWN), outro agente negado (42501), idempotência, corrida, anon/sem-JWT/inexistente. Comentário da ALLOWLIST atualizado de "3 mutacoes" para "4 mutacoes" (scripts/ci/check-test-inventory.mjs).

Arquivos (git diff --name-only dia/2026-10-11...HEAD, colado do comando):
scripts/ci/check-test-inventory.mjs
scripts/db-audit/assume-return-conversation.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011094027_assume_return_conversation.sql

Verificações (resultado real):
- bash scripts/db-audit/assume-return-conversation.test.sh → EXIT 0; "[OK] contrato assumir/devolver a fila verificado: 10 assercoes (postgres:17-alpine)"; DEPOIS, CORRIDA, ROLLBACK e mutações A–D verdes (log em .tmp/prova-refazer1.log).
- node scripts/db-audit/supabase-usage-guard.mjs → OK, nenhuma violação nova; check-migration-drift.mjs → 817 arquivos válidos.
- node scripts/ci/check-test-inventory.mjs → OK.
- zapp-verify . --rapido → VERDE SEM BANCO (tipos, lint, migrations e db_guard OK).
- Segunda passada: RPCs novas sem chamadores existentes (rg só acha o comentário da allowlist); nenhum arquivo de guarda/manifesto/CI alterado em lógica; rollback inalterado e já provado no contrato.

Juiz barato (types.ts sem teste novo): nao procede — o commit altera sim o teste do cartao (scripts/db-audit/assume-return-conversation.test.sh: 4 assercoes do dono + MUTACAO D); types.ts e o tipo gerado das RPCs, exigido pelo cartao e coberto pelo contrato de banco acima.

Juiz barato (arquivos fora da lista): nao procede — a propria recusa justifica os dois ('Os dois arquivos fora da lista (o .test.sh e a entrada na ALLOWLAST) estao justificados no relato'); o .test.sh e 'testes de banco' (categoria permitida) e a ALLOWLIST e exigida pela guarda de inventario.

Juiz barato (gatilho updated_at): nao procede — o UPDATE e por PK (1 linha) e o contrato prova com linha antes/depois ([OK] DEPOIS: updated_at avanca so na linha tocada (1 linha por PK) = true|true); nada de backfill em massa.
