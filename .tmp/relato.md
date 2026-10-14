Especialista: worker (geral)

NÃO CONCLUÍ a correção do comportamento: reabrir resolved|archived → open no inbound exige alterar a RPC ingest_inbound_message (migration), o que o cartão proíbe ("sem DDL/Edge Function/migration"). Esta entrega contém só este relato; a decisão é do Joaquim (autorizar trilha de banco separada ou manter o comportamento atual).

## O gap existe (prova só-leitura, sem migration)
- `grep -c "conversation_status"` nas duas migrations que definem a RPC vigente → `20260905050000_ingest_inbound_message_tx.sql:0` e `20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql:0`: a RPC nunca toca conversation_status (escreve só messages.status).
- Chamadores: `supabase/functions/whatsapp-webhook/index.ts:231` e `supabase/functions/_shared/evolution-webhook-messages.ts:460` chamam só essa RPC — ela é o único caminho do inbound para o banco.

## Pontos do revisor ([refazer 1])
- Ponto 1 (entrada allowlist órfã no check-test-inventory.mjs): arquivo revertido ao estado da base (merge-base 33a75289bc); `grep -c "ingest-inbound-reopen"` nele → 0; o diff da branch não o contém mais.
- Ponto 2 (sem teste nem correção): não há teste neste diff porque não há correção neste diff — a correção exige migration, vedada pelo cartão. Commitar teste que falha sem um código que não existe aqui seria nova inconsistência. O gap segue aberto e provado acima, só com leitura.
- Ponto 3 (relato dizia o que o diff não mostra; decisão do Joaquim): este relato afirma só o que o diff contém (só .tmp/relato.md, lista abaixo) e deixa a decisão explícita no topo. Nada do histórico da branch é apresentado como entrega desta rodada.

## Arquivos no diff
- `git diff dia/2026-10-14...HEAD --name-only` → `.tmp/relato.md` (único arquivo)
