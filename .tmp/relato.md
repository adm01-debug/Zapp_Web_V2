Especialista: workersql
Area: worker (sql) (area-sql-banco)

## O que fiz
Hardening do contrato da tabela public.email_templates (ET1, migration 20261012112503), fechando o furo
apontado: a policy de UPDATE (email_templates_update_owner_or_staff_shared) repete USING em WITH CHECK,
entao o staff que edita a linha COMPARTILHADA de outro podia trocar `created_by` no mesmo UPDATE —
reatribuia a autoria e o dono anterior perdia o modelo (exploravel depois: o novo "dono" poe
is_shared=false e esconde a linha de todos).

Migration nova e ADITIVA:
- supabase/migrations/20261013010747_email_templates_hardening.sql
  1. `guard_email_templates()` (BEFORE INSERT OR UPDATE) + gatilho homonimo:
     - UPDATE: rejeita (ERRCODE 42501, 'email_templates_author_immutable') qualquer troca de created_by;
     - is_shared=true so staff: bloqueia a TRANSICAO para true (INSERT, ou UPDATE que liga) quando
       !is_admin_or_supervisor(auth.uid()); editar linha ja compartilhada NAO e barrado;
     - a guarda vale so para auth.role()='authenticated' (service_role/back-office livre, como em
       20260929590000_multiplix_mutability_guard.sql);
  2. CHECK `email_templates_body_not_blank` (corpo vazio barrado; nome em branco ja e barrado pela ET1).
- scripts/db-audit/email-templates-rls.test.sh: BLOCO C (o defeito reproduzido ANTES e provado fechado
  depois, com os papeis reais dono/staff/outro + anon) e BLOCO D (rollback do hardening extraido do
  proprio arquivo, executado, e reaplicacao idempotente). Arquivo ja registrado no db-guard pelo
  cartao-avo (commit de0635599) — nao toquei no workflow de CI.

## Prova (saida real, do teste que roda com os papeis reais)
Vermelho SEM a correcao (migration trocada por um stub sem gatilho):
  RC_VERMELHO=1
  [FAIL] C1 staff nao reatribui a autoria da linha de outro (guardado): deveria falhar, mas passou
Verde COM a correcao:
  RC_VERDE=0 ; == TODOS OS PASSOS PASSARAM ==
  [PASS] C1..C6 autoria imutavel (staff/outro nao reatribuem; dono edita/exclui; staff edita o corpo)
  [PASS] C7 service_role segue livre para back-office
  [PASS] C8/C9 agente comum nao marca is_shared (UPDATE) nem nasce compartilhado (INSERT)
  [PASS] C10 staff marca is_shared no proprio modelo
  [PASS] C11/C12 corpo vazio e nome em branco barrados por CHECK
  [PASS] D1..D3 rollback remove gatilho+funcao e nao derruba a tabela
  [PASS] D4..D6 reaplicar recria gatilho, funcao e CHECK (idempotente)
Migration aplicada no banco LOCAL do cartao:
  `APLICADA no banco LOCAL 'v2-26101221510dae' (producao nao foi tocada)`.

## Escolhas (registradas como o cartao pede)
- Autoria: RAISE em vez de `NEW.created_by := OLD.created_by` — nao mascara a tentativa de escalada e
  segue o precedente do multiplix. Efeito identico: created_by nunca difere do OLD.
- is_shared: barra so a transicao para true; o dono comum continua editando o proprio modelo que ja
  estava compartilhado (senao eu quebraria a ET1 — foi o que o primeiro rascunho fez e o teste C3 pega).
- Corpo vazio: usei CHECK e NAO removi o `default ''` da ET1 (nao mexi em objeto existente); com o CHECK,
  omitir o corpo passa a ser rejeitado — o default fica inalcancavel de proposito.
- Nao alterei as 4 policies da ET1 (a barreira nova e o gatilho) e nao mexi em GRANT/ACL de objeto
  existente; so REVOKE da funcao nova (deny by default).

## Passada de efeito colateral
1. Gatilhos: o `set_email_templates_updated_at` (ET1) segue intacto; o gatilho novo so pode RAISE.
   Sem backfill (nenhum UPDATE/INSERT de dado nesta migration).
2. Tudo ou nada: roda em uma transacao (BEGIN/COMMIT do hermes-db-migrar).
3. Sem oraculo: a guarda nao consulta existencia de nada; erro igual para qualquer linha.
4. INSERT: `old.is_shared` e NULL -> coalesce(false), entao a regra de is_shared vale tambem no INSERT.
5. Regressao coberta: C3/C5 provam que dono e staff continuam editando; C7 prova que o back-office
   nao foi afetado.

## Nota sobre o alarme do juiz barato (types.ts)
O fechar acusou "src/integrations/supabase/types.ts alterado sem teste". Esse arquivo NAO e meu: ele veio
do cartao-avo (ET1), cujo commit 2d3b95d22 criou a tabela e os types gerados — eu so trouxe a faixa dele
para este workspace, como o cartao manda. O MEU teste (o que prova este cartao) esta no commit 2c775dcc9:
scripts/db-audit/email-templates-rls.test.sh, BLOCOS C/D. Nada em src/ foi tocado por mim.

## Fora do meu alcance / observacao
- src/integrations/supabase/types.ts ja traz as colunas da tabela (types gerados) — nada a mudar no front.
- Nao editei a migration da ET1 (correcao = migration nova).
