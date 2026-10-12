Especialista: complexo (backend-zapp-como-provar; area: banco/RPC)

NÃO CONCLUÍ: fechamento sem código — a correção exige migration e o cartão proíbe (juiz: PROIBIÇÃO). Decisão do Joaquim pendente.

## A lacuna existe (provada com código real)
- `bash scripts/db-audit/ingest-inbound-reopen-conversation.test.sh` → `== BLOCO A: definicao anterior (defeito) ==` + `[PASS] antes: resolved + inbound novo` / `[PASS] antes: archived + inbound novo`: ingest_inbound_message (20260905070000) nunca toca conversation_status; conversa resolved|archived continua assim após inbound. Os dois webhooks (evolution-webhook-messages.ts:460 e whatsapp-webhook/index.ts:231) chamam só essa RPC — ela é o único caminho.

## A correção provada (removida deste fechamento, guardada na história da branch)
- Commit anterior desta branch continha (sha 5b020d411cb2c9e54beec7b10211d070cea40a32): supabase/migrations/20261012100000_ingest_inbound_message_reopen_conversation.sql (reabre resolved|archived -> open só em outcome inserted; mesma assinatura e grants service_role; rollback completo executável) + scripts/db-audit/ingest-inbound-reopen-conversation.test.sh + entrada na ALLOWLIST de check-test-inventory.mjs.
- Verde medido antes de remover: `[PASS] depois: resolved + inbound novo`, `[PASS] depois: archived + inbound novo`, `[PASS] redelivery (updated) nao reabre`, `[PASS] contato novo fica open`, `[PASS] reabertura carimba conversation_status_changed_at` + `OK: reabertura automatica resolved|archived -> open validada`; `hermes-db-migrar` → `APLICADA no banco LOCAL`; rollback executado no banco local (`CREATE FUNCTION`/`REVOKE`/`GRANT`, `position('conversation_status' in prosrc) = 0`, 1 assinatura).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (171s)`.

## O que falta (dono: Joaquim)
- Autorizar ou recusar a migration de repositório (banco local + futuro deploy; produção nunca tocada por este cartão). Se autorizar, o commit removido pode ser reaplicado do histórico da branch.
