# feat(followup): runtime de follow-ups — fila de execuções e pendentes com conclusão

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261012124904_followup_runtime_fila_execucoes.sql` (novo):
  - `followup_executions.reason` (motivo) + `CHECK followup_executions_status_check`
    com o vocabulário `('pendente','enviado','concluido','cancelado','erro')` e default
    `'pendente'`; backfill idempotente do legado (`pending/active/paused/scheduled -> pendente`,
    `sent/delivered -> enviado`, `completed -> concluido`, `cancelled -> cancelado`,
    `failed/error -> erro`) preservando o valor antigo em `reason='status_legado:<valor>'`
    para o Rollback ser exato; índice parcial `idx_followup_executions_status_next_step`.
  - RLS: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policy de SELECT por
    `is_admin_or_supervisor(auth.uid()) OR is_contact_visible_to_user(contact_id, auth.uid())`
    (staff OU atendente do contato) — sem `USING (true)`.
  - RPCs `enroll_followup(contato, sequencia)`, `complete_followup(id)`, `cancel_followup(id, motivo)`
    (authenticated/service_role, autorização por visibilidade de contato) e
    `due_followups(limite)` (SOMENTE service_role); ACL por assinatura exata, negando anon/PUBLIC.
  - Gatilho `trg_followup_cancel_on_inbound` em `public.messages`: mensagem recebida
    (`sender='contact'`) cancela as execuções `pendente` daquele contato (`reason='resposta_do_contato'`).
- `scripts/db-audit/followup-runtime.test.sh` (novo): contrato em Postgres descartável, dois blocos
  no mesmo run — BLOCO A estado anterior (defeito), BLOCO B migration aplicada, BLOCO C a linha
  `-- Rollback:` executada — rodando como papel real (`set role authenticated/anon/service_role` +
  `request.jwt.claims`), nunca como postgres.
- `src/integrations/supabase/types.ts`: tipos gerados acompanham a migration (coluna `reason` e as
  4 funções novas).

## Prova
- vermelho antes (BLOCO A): `bash scripts/db-audit/followup-runtime.test.sh` →
  `[PASS] A.1 (DEFEITO) enroll_followup nao existe: nao ha fila de execucoes` /
  `[PASS] A.2 (DEFEITO) due_followups nao existe` /
  `[PASS] A.3 (DEFEITO) admin grava status invalido: nao ha CHECK de vocabulario` /
  `[PASS] A.5 (DEFEITO) nao existe a coluna reason (motivo)`.
- verde depois (BLOCO B/C, mesmo comando, mesma execução):
  `PASS: followup-runtime — fila de execucoes (enroll/complete/cancel/due) com autorizacao`
  seguido de `[PASS] B.10 o atendente do contato ve a execucao`, `[PASS] B.11 outro agente NAO ve`,
  `[PASS] B.13 anon NAO ve execucao nenhuma (RLS nega por padrao)`, `[PASS] B.15 authenticated NAO
  consome due_followups`, `[PASS] B.29 resposta do CONTATO cancela o follow-up do contato`,
  `[PASS] B.30 o follow-up de OUTRO contato segue pendente`, `[PASS] C.1..C.6` (rollback: RPCs/coluna/
  CHECK/gatilho removidos, default `pending` e policy antiga restaurados). Fim: `set -Eeuo pipefail`
  sem falha.
- banco real (local): `hermes-db-migrar supabase/migrations/20261012124904_followup_runtime_fila_execucoes.sql`
  → `APLICADA no banco LOCAL 'v2-261012094200b8' (produção não foi tocada)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (68s)` (tipos/db_guard/lint/migrations OK).

## O que NÃO fiz e por quê
- Não toquei `src/**` além de `types.ts`: a tela `FollowUpExecutionsHistory.tsx` hoje mapeia status em
  inglês (`active/completed/cancelled/paused`) e cai no fallback. Deixo o aviso em `kanban_comment`
  para o worker de telas ajustar o rótulo ao vocabulário novo (mudança de contrato do banco avisada, tela não é minha área).
- Não avancei o passo da sequência dentro de `complete_followup`: o cartão pede 4 funções; `complete_followup`
  conclui a execução e o avanço para o próximo passo é do runner (Edge), fora do escopo deste cartão.
- `src/integrations/supabase/types.ts` é arquivo GERADO (reflexo do schema). Não cabe teste unitário de tipo;
  a prova do banco é `scripts/db-audit/followup-runtime.test.sh` (vermelho antes / verde depois, no commit).
- `scripts/db-audit/followup-runtime.test.sh` é `.test.sh` NOVO: registrei na ALLOWLIST de
  `scripts/ci/check-test-inventory.mjs` (o mecanismo previsto para prova em container descartável; o
  passo de uma linha em `db-guard.yml` é do dono do workflow — área CI). `node scripts/ci/check-test-inventory.mjs`
  não aponta mais este arquivo como órfão (restam 3 órfãos pré-existentes de outros cartões).

Concluí o escopo do cartão (migration + RLS + RPCs + gatilho + contrato + tipos), com prova verde e
rollback executado.
