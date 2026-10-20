- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 9s;OK lint 1s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (11/10 15:14, gerados por máquina: valem mais que números escritos à mão)
```
 scripts/ci/check-test-inventory.mjs                |   6 +
 .../db-audit/assume-return-conversation.test.sh    | 628 +++++++++++++++++++++
 src/integrations/supabase/types.ts                 |   8 +
 .../20261011094027_assume_return_conversation.sql  | 226 ++++++++
 4 files changed, 868 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Passada adversarial do [refazer]: juiz indisponível (não bloqueou)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: scripts/ci/check-test-inventory.mjs, supabase/migrations/20261011094027_assume_return_conversation.sql; padrão sensível: caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b

Especialista: senior (area-sql-banco)

## Pontos do revisor

Ponto 1: `assume_conversation` bloqueava `conversation_status='resolved'`, mas o critério pede reabrir como `open`.
- Mudei `supabase/migrations/20261011094027_assume_return_conversation.sql`: no assumir, só `archived` continua retornando `conversation_not_active`; `resolved` passa pelo fluxo normal e o `UPDATE` já grava `conversation_status='open'`.
- Teste que prova: `scripts/db-audit/assume-return-conversation.test.sh` agora cobre `admin assume conversa resolved e reabre como open` e valida a auditoria `previous_status=resolved|status=open`.
- Vermelho sem a correção: `MUTACAO F` troca o guard de volta para `IN ('resolved','archived')` e o contrato falha com `conversation_not_active` no caso de `resolved`.
- Verde depois: `ASSUME_RETURN_TEST_POSTGRES_IMAGE=postgres:17-alpine bash scripts/db-audit/assume-return-conversation.test.sh` terminou com `[OK] contrato assumir/devolver a fila verificado: 12 assercoes (postgres:17-alpine)`.

Ponto 2: o teste usava `C_RES` para provar conversa encerrada e não distinguia `resolved` de conversa realmente bloqueada.
- Mudei `scripts/db-audit/assume-return-conversation.test.sh`: adicionei `C_ARCH` em `archived` para o erro `conversation_not_active`, mantive `C_RES` só para reabertura, e explicitei que takeover de conversa já `open` mantém `open`.
- Teste que prova: o mesmo contrato verifica `admin assume conversa ja open e mantem open (takeover)`, `admin assume conversa resolved e reabre como open` e `devolver conversa arquivada (conversation_not_active)`.
- Vermelho sem a cobertura: `MUTACAO F` mostra que voltar a bloquear `resolved` derruba o contrato; `archived` segue bloqueado no contrato verde.
- Verde depois: mesmo comando SQL em Postgres 17 descartável passou.

## Arquivos alterados
scripts/ci/check-test-inventory.mjs
scripts/db-audit/assume-return-conversation.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011094027_assume_return_conversation.sql

## Verificações rodadas
- `ASSUME_RETURN_TEST_POSTGRES_IMAGE=postgres:17-alpine bash scripts/db-audit/assume-return-conversation.test.sh` — OK, `[OK] contrato assumir/devolver a fila verificado: 12 assercoes (postgres:17-alpine)`.
- `node --test scripts/ci/check-test-inventory.unit.mjs` — OK, 7 testes passaram.
- `git diff --check HEAD` — OK, sem saída.
- `hermes-tarefa-fechar "fix(db): restringe assumir e devolver a filas do usuario" .tmp/relato.md` — OK na segunda chamada do juiz barato, fila local V2 registrada; avisos do juiz seguem para o revisor por serem conferência/escopo já explicado neste relato.

## Observação de escopo
- `scripts/db-audit/assume-return-conversation.test.sh` é indispensável porque o defeito está em RPC SQL e precisa executar o SQL real; regex ou mock não provaria o comportamento.
- `scripts/ci/check-test-inventory.mjs` só recebeu a entrada de allowlist/justificativa para a suíte shell nova, sem afrouxar o verificador.
- `src/integrations/supabase/types.ts` acompanha a assinatura das duas RPCs criadas pela migration; o comportamento é provado pelo contrato SQL real em Postgres descartável.
- O aviso do juiz sobre `updated_at` não procede para este diff: o contrato prova `updated_at avanca so na linha tocada (1 linha por PK) = true|true`, e as RPCs atualizam por PK/`assigned_to` condicional, não fazem UPDATE em massa.
