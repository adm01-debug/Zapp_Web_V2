Especialista: workersql

## O que mudou e por quê
- supabase/migrations/20261013210006_autoria_e_oraculo_de_papel.sql (novo):
  - F1 autoria — dois gatilhos BEFORE INSERT carimbam o autor a partir de auth.uid():
    conversation_closures.closed_by e conversation_events.performed_by. O caminho FSM
    (set_conversation_status) gravava closed_by NULL e o caminho de transferência gravava
    performed_by NULL, deixando a autoria ausente/forjável. Com JWT ausente
    (service_role/interno) o valor explícito é preservado, então o retrato de autoria
    das RPCs DEFINER e de backfills não muda. As funções de gatilho nascem com EXECUTE
    fechado para PUBLIC/anon/authenticated (regra 20261001191230).
  - F2 UPDATE — calls e email_messages ganham WITH CHECK explícito espelhando o USING
    (não reatribuir o dono). Correção do cartão aplicada como pedida; ver ressalva
    abaixo sobre o comportamento anterior.
  - F3 oráculo — has_role, is_admin_or_supervisor, is_admin e get_profile_role_for_check
    passam a usar public.secd_caller_ok (o mesmo helper já usado em 20261007004545):
    interno (sem JWT) e admin/supervisor passam; usuário comum só consulta o próprio
    uid. Fail-closed (retorna false / conjunto vazio), sem exceção que distinga id
    existente de inexistente — logo não há oráculo novo. ACL mantida: CREATE OR REPLACE
    preserva os grants; as quatro já eram EXECUTE de authenticated/service_role e
    negadas a anon/PUBLIC (conferido: anon=f, auth=t, svc=t).
- supabase/tests/autoria_e_oraculo_de_papel.sql (novo): prova F1/F2/F3 no banco local,
  exercitando RLS pelo papel real (set local role authenticated + request.jwt.claims),
  em uma transação com ROLLBACK no fim.

## Prova
- vermelho antes: `zapp-db-local psql . v2-2610130332ad03 -v ON_ERROR_STOP=1 < .tmp/vermelho_antes.sql`
  → `RED-F1 closed_by=NULL` / `RED-F1 performed_by=NULL` / `RED-F3 is_admin_or_supervisor(admin alheio)=true`
  (o script reverte a migration dentro da transação; .tmp não é commitado).
- verde depois: `zapp-db-local psql . v2-2610130332ad03 -v ON_ERROR_STOP=1 < supabase/tests/autoria_e_oraculo_de_papel.sql`
  → EXIT=0, 12 linhas `OK:` (F1a-d autoria carimbada e forja sobrescrita; F2b/F2d
  reatribuição negada por RLS e F2e/F2f alvo intacto; F3a-e agente não lê papel alheio
  sem oráculo; F3f-h admin lê qualquer papel; F3i-j interno segue lendo; F3k anon
  bloqueado; F3l nenhuma DEFINER da migration executável por anon).
- rollback executado: `... < .tmp/testa_rollback.sql` → `ROLLBACK OK: gatilhos/funcoes de
  autoria removidos` e `ROLLBACK OK: corpos antigos das funcoes de papel restaurados` (EXIT=0).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO`.

## Ressalva honesta (F2)
No Postgres, policy de UPDATE só com USING usa o USING como WITH CHECK implícito —
comprovei no vermelho-antes que a reatribuição de calls já era negada antes da mudança.
Então o WITH CHECK explícito pedido pelo cartão não fecha um furo existente: ele
documenta/audita a regra em pg_policies (era invisível). O que realmente fecha furo é
F1 (autoria) e F3 (oráculo). As duas provas que discriminam a correção são F1 e F3.

## Efeito colateral assumido
Com closed_by carimbado, o gatilho de gamificação (AFTER INSERT em conversation_closures)
passa a contar também os encerramentos do caminho FSM, que antes gravava NULL e não
contava. É o efeito esperado de "autoria ligada ao chamador"; o gatilho de gamificação
continua engolindo erro próprio com WARNING (não derruba o fechamento).

## O que NÃO fiz e por quê
- Não criei scripts/db-audit/*.test.sh novo (evita o inventário órfão do CI); a prova
  fica em supabase/tests/ como o cartão pede.
- Não toquei em grants/papéis além do necessário: nenhum GRANT novo, nenhum REVOKE novo.
- Não alterei as policies de INSERT de closures/eventos fora do pedido; a autoria já é
  garantida pelo gatilho independente de RLS.
