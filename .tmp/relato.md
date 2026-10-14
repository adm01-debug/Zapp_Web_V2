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
- scripts/db-audit/email-templates-rls.test.sh: BLOCO C (defeito REPRODUZIDO em C0 antes do
  hardening e provado fechado depois, com os 3 papeis — dono/staff/outro) e BLOCO D (rollback
  do hardening extraido do proprio arquivo, executado, e reaplicacao idempotente). Arquivo ja
  registrado no db-guard pelo cartao-avo (commit de0635599) — nao toquei no workflow de CI.

## Prova (saida real, do teste que roda com os papeis reais)
Vermelho reproduzivel DENTRO do teste (C0, so com a RLS da ET1, antes do hardening):
  [PASS] C0 staff troca a autoria da linha de outro (defeito: PASSA com a RLS da ET1)
Verde COM a correcao (o mesmo UPDATE, depois do hardening):
  [PASS] C1 staff nao reatribui a autoria da linha de outro (guardado)
Run completo: exit 0, `== TODOS OS PASSOS PASSARAM ==`
  Passos C com os 3 papeis: C0 (staff reatribui pre-fix) + autoria restaurada como postgres;
  C1/C2 (staff barrado; autoria do OWNER); C2b/C2c (JWT_OTHER: 0 linhas; autoria intacta);
  C3/C4 (dono edita/exclui o proprio); C5/C6 (staff edita o corpo; autoria preservada);
  C7 service_role livre; C8/C9/C10 is_shared so staff; C11/C12 CHECKs de corpo/nome;
  D1..D3 rollback remove gatilho+funcao sem derrubar a tabela; D4..D6 reaplicacao idempotente.
Nota complementar: o vermelho via stub (migration trocada por stub sem gatilho, fora do teste:
  `[FAIL] C1 staff nao reatribui a autoria da linha de outro (guardado): deveria falhar, mas passou`)
  foi experimento manual da rodada anterior; o C0 o substitui como prova reproduzivel no teste.
Migration aplicada no banco LOCAL do cartao:
  `APLICADA no banco LOCAL 'v2-26101221510dae' (producao nao foi tocada)`.

## Pontos da recusa (refazer 1)
- Ponto 1: passo C0 em scripts/db-audit/email-templates-rls.test.sh, logo apos o B32 e ANTES de
  `psql_file "$hardening"`: staff troca created_by da linha compartilhada do OWNER e PASSA
  (expect '1'); autoria restaurada como postgres (com conferencia) e so entao o hardening e
  aplicado. Cabecalho do BLOCO C e comentario corrigidos para C0. Prova: as 2 linhas [PASS] C0 acima.
- Ponto 2: passos C2b (JWT_OTHER tenta trocar created_by da linha compartilhada do OWNER:
  0 linhas) e C2c (autoria segue do OWNER) no BLOCO C — o terceiro papel na prova.
  Prova: `[PASS] C2b outro nao reatribui a autoria da linha de outro (0 linhas)` e
  `[PASS] C2c autoria preservada apos a tentativa do outro`.
- Ponto 3: comentario do C2 corrigido — quem e atomico e o UPDATE rejeitado pelo gatilho
  (falhou inteiro), nao a migration.
- Ponto 4: este relato — vermelho reproduzivel em C0, passos C listados com os 3 papeis,
  nota do stub mantida como complementar.

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

## Arquivos do diff deste cartao (6 no total, 1 de teste)
| # | arquivo | origem |
|---|---------|--------|
| 1 | supabase/migrations/20261013010747_email_templates_hardening.sql | meu (NOVO) |
| 2 | scripts/db-audit/email-templates-rls.test.sh | meu (BLOCOS C/D — o 1 arquivo de teste) |
| 3 | .tmp/relato.md | meu (documento) |
| 4 | supabase/migrations/20261012112503_email_templates_rls.sql | cartao-avo (faixa trazida) |
| 5 | .github/workflows/db-guard.yml | cartao-avo (faixa trazida) |
| 6 | src/integrations/supabase/types.ts | cartao-avo (faixa trazida) |

## Nota sobre o alarme do juiz barato (arquivos fora da lista)
O fechar apontou .github/workflows/db-guard.yml, scripts/db-audit/email-templates-rls.test.sh e
src/integrations/supabase/types.ts como fora de "ARQUIVOS QUE PODE TOCAR". Explicacao:
- O proprio cartao ordena "traga a FAIXA inteira" do cartao-avo (ET1). Essa faixa (commits
  11237960d..de0635599) ja inclui db-guard.yml (registro do test.sh no CI) e types.ts (types gerados da
  tabela nova). Eu NAO os editei: `git log --name-only a09410e0a..HEAD` mostra que meus commits so tocam
  a migration nova, o scripts/db-audit/email-templates-rls.test.sh e o .tmp/relato.md.
- scripts/db-audit/email-templates-rls.test.sh e o alvo de extensao deste cartao (e onde esta a prova do
  furo: BLOCOS C/D). Sem ele nao ha como provar o defeito.

## Nota sobre o alarme do juiz barato (types.ts)
O fechar acusou "src/integrations/supabase/types.ts alterado sem teste". Esse arquivo NAO e meu: ele veio
do cartao-avo (ET1), cujo commit 2d3b95d22 criou a tabela e os types gerados — eu so trouxe a faixa dele
para este workspace, como o cartao manda. O MEU teste (o que prova este cartao) esta no commit 2c775dcc9:
scripts/db-audit/email-templates-rls.test.sh, BLOCOS C/D. Nada em src/ foi tocado por mim.

## Fora do meu alcance / observacao
- src/integrations/supabase/types.ts ja traz as colunas da tabela (types gerados) — nada a mudar no front.
- Nao editei a migration da ET1 (correcao = migration nova).
