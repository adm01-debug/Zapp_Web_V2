Especialista: worker (sql) (area-sql-banco)

## O que mudou
1. `supabase/migrations/20261012215000_custom_fields_rls_visibility.sql`
   Recria as QUATRO policies de `public.contact_custom_fields` (SELECT, INSERT, UPDATE, DELETE,
   `TO authenticated`) trocando o predicado antigo
   "contato atribuido ao agente OU admin/supervisor" por
   `public.is_contact_visible_to_user(contact_id, auth.uid())` — o mesmo helper que o resto do
   sistema usa (ja aplicado em `conversation_analyses`/`ai_conversation_tags` pela
   20260930140000 e nas demais superficies de contato).
   Nomes das policies preservados; so o predicado muda (rollback = recriar as antigas).
   Motivo: quem enxerga o contato SO por FILA (`queue_members`) ou carteira concedida abria a
   tela de contato, mas os campos personalizados sumiam — SELECT/INSERT/UPDATE/DELETE barravam
   por nao conhecerem a fila.

2. `supabase/tests/custom_fields_rls_visibility.sql` (novo)
   T1-T9, so por leitura de catalogo: RLS ligada; 4 policies (uma por comando); helper presente
   no USING/WITH CHECK de cada uma; todas restritas ao papel `authenticated`; helper segue
   SECURITY DEFINER com o ramo de FILA; unicidade `(contact_id, field_name)` preservada.

## Efeitos colaterais (passada feita)
Operacao puramente DDL: nenhum UPDATE/INSERT em dado -> nenhum gatilho disparado, `updated_at`
intacto; uma transacao (gateway, sem BEGIN/COMMIT); nenhum GRANT, papel ou ACL alterado;
superconjunto ESTRITO do predicado atual (so ADICIONA fila/carteira; nao tira acesso de ninguem).

## Prova — banco local descartavel (conjunto `cfrls261012`, papel real auth/anon)
Vermelho antes (predicado antigo) -> verde depois (migration), nos DOIS niveis:

  [enforcamento, authenticated/anon]
  ERROR:  P2 FALHOU: agente da fila viu 0 campos (esperado 1)   [rc=3, predicado antigo]
  PROVA OK P1 (postgres): helper true pela fila
  PROVA OK P2 (authenticated/fila): SELECT viu 1 campo
  PROVA OK P3 (authenticated/fila): UPDATE afetou 1 linha
  PROVA OK P4 (authenticated/fila): INSERT permitido
  PROVA OK P5-PRE (postgres): helper false para o estranho
  PROVA OK P5a (authenticated/estranho): SELECT viu 0 campos
  PROVA OK P5b (authenticated/estranho): UPDATE afetou 0 linhas
  PROVA OK P6 (anon): SELECT devolveu 0 linhas                          [rc=0]

  [suite estrutural supabase/tests]
  ERROR:  cf_rls T3 FALHOU: SELECT nao usa is_contact_visible_to_user    [rc=3, antigo]
  NOTICE:  cf_rls: suite completa OK (T1-T9)                             [rc=0]

  [rollback executavel conferido]
  DROP POLICY / CREATE POLICY (x4) -> policies voltam ao predicado antigo; suite volta ao
  VERMELHO, provando que o `-- Rollback:` da migration roda e desfaz de verdade.

Comando: `zapp-db-local psql . cfrls261012 -v ON_ERROR_STOP=1 < <arquivo>`

## Verificacao
`zapp-verify . --rapido`: VERDE SEM BANCO — dependencias OK, db_guard OK, tipos OK, lint OK,
migrations OK (drift sem quebra); banco local nao verificado porque o nome do conjunto nao e
passado (comportamento padrao do --rapido). A prova de banco acima foi rodada a parte no
conjunto local.
