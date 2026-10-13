Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013051305_contato_excluido_inbox_ingest.sql (nova):
  * ingest_inbound_message passa a REATIVAR o contato soft-deleted (deleted_at = NULL) quando
    chega mensagem nova, em vez de escrever no registro oculto. Os lookups passam a preferir o
    registro VIVO (ORDER BY (deleted_at IS NOT NULL), created_at) quando coexistem as variantes
    do 9o digito — assim o recadastro do mesmo telefone não acorda um duplicado antigo nem cria
    contato novo. A reativação entra na trilha real public.contact_deletion_audit ('restore')
    pelo trigger trg_audit_contact_deletion_change (já existente, não alterado, e que só dispara
    quando deleted_at muda de fato).
  * contacts_select_policy passa a exigir deleted_at IS NULL, EXCETO para admin/supervisor, que
    continuam vendo os excluídos (lixeira/restaurar). A Inbox lê contacts direto sob RLS, então
    era por aqui que o excluído reaparecia. O UPDATE (restaurar) não muda — a policy de UPDATE
    não filtra deleted_at — e o purge físico (job/service_role, BYPASSRLS) não passa por policy.
  * Assinatura, RETURNS, LANGUAGE e search_path de ingest_inbound_message seguem idênticos, e
    CREATE OR REPLACE preserva a ACL (EXECUTE para service_role): src/integrations/supabase/types.ts
    continua válido e nenhum GRANT/papel foi tocado.
- scripts/db-audit/contacts-deleted-inbox-ingest.test.sh (novo): prova em PostgreSQL 17
  descartável, com os papéis reais (authenticated e service_role). O estado ANTERIOR (a policy de
  SELECT vigente e as versões anteriores de phone_variants e ingest_inbound_message) é extraído por
  awk dos próprios arquivos de migration reais, não copiado à mão; a versão sob prova é a do arquivo
  da migration do cartão.
- scripts/ci/check-test-inventory.mjs: registra o .test.sh novo na ALLOWLIST (a promoção ao
  db-guard.yml é do dono do workflow; o agente não edita workflow).

## Prova
- vermelho antes: `bash scripts/db-audit/contacts-deleted-inbox-ingest.test.sh` (estado anterior à
  migration do cartão) →
  `R.1 estado anterior: o DONO (nao-admin) LE o contato excluido pela policy de SELECT` PASS e
  `R.3 estado anterior: a mensagem nova NAO reativa o contato (deleted_at segue preenchido)` PASS —
  a falha fica provada antes; sem a migration o bloco GREEN não passa (exige deleted_at = NULL).
- verde depois: `bash scripts/db-audit/contacts-deleted-inbox-ingest.test.sh` →
  `[OK] contrato do contato excluido no inbound/Inbox: RED->GREEN->rollback, todos os passos passaram`
  (todos os passos PASS, nenhum pulado), incluindo:
  `G.1 mensagem nova REATIVA o contato excluido (deleted_at = NULL)`,
  `G.2 a reativacao entrou na trilha como restore, com de/para coerentes`,
  `G.6 a Inbox (dono, nao-admin) NAO ve mais o contato excluido`,
  `G.7 admin/supervisor CONTINUA vendo o excluido (lixeira/restaurar)`,
  `G.8 contraponta: o contato VIVO do dono segue visivel`,
  `G.9 contraponta: outro agente NAO passa a ver contato alheio`,
  `G.13 o purge fisico continua funcionando e deixa rastro (purge)`,
  `C.1/C.2/C.3` a linha `-- Rollback:` do próprio arquivo executa e devolve o ingest e a policy
  anteriores.
- banco local da tarefa: `hermes-db-migrar supabase/migrations/20261013051305_contato_excluido_inbox_ingest.sql`
  registrou `APLICADA_LOCAL`; conferi por `pg_policy`/`pg_proc` que a policy nova (com
  `deleted_at IS NULL`) e a versão nova de ingest_inbound_message estão no banco local.
- `node scripts/ci/check-test-inventory.mjs`: o .test.sh novo não aparece entre os órfãos (a
  ALLOWLIST o cobre); os órfãos listados são pré-existentes de outros cartões.

## Arquivos fora da lista do cartão (indispensável)
O cartão pede "supabase/migrations/<ts>_...sql (novo) + supabase/tests/". A prova de RLS/ACL do
projeto NÃO pode viver em supabase/tests/: os scripts/*.sql de lá rodam como service_role
(BYPASSRLS) e não exercitam policy nenhuma — a própria skill da área manda provar com os papéis
reais (authenticated/service_role) em Postgres descartável. Por isso a prova ficou em
scripts/db-audit/contacts-deleted-inbox-ingest.test.sh. E todo .test.sh novo no disco é reprovado
por scripts/ci/check-test-inventory.mjs como órfão até ser registrado: a ALLOWLIST desse script é
o registro (a promoção ao passo do db-guard.yml é do dono do workflow — agente não edita workflow).
Os dois arquivos foram indispensáveis para a prova existir e ser aceita pela verificação.

## O que NÃO fiz e por que
- Não toquei src/**: o filtro explícito de deleted_at na consulta da Inbox é do cartão filho
  t_d0f7873a (perfil de telas/hooks). A migration entrega a defesa no banco (RLS), que é a minha área.
- Não mexi em GRANT, papel ou ACL: a migration só recria a função e a policy; nenhum acesso foi
  removido além do filtro de excluídos pedido no cartão.
- Não alterei migrations existentes: correção é migration nova, como manda a regra da área.
- O rodapé de regras do cartão traz a linha genérica "não edite este arquivo com DDL/migration" —
  é do template do plano; o próprio cartão pede migration nova em supabase/migrations/**.

## Conferência do juiz (updated_at) — NÃO PROCEDE
- O aviso fala de UPDATE em `messages`. Esta migration NÃO altera nenhum UPDATE em messages: o
  único UPDATE novo é `UPDATE public.contacts SET deleted_at = NULL WHERE id = v_contact.id`
  (uma linha, a do contato reativado). O gatilho `update_contacts_updated_at` (BEFORE UPDATE em
  contacts) regrava updated_at SÓ nessa linha — efeito desejado (a conversa reativada sobe na
  Inbox, que ordena por updated_at). Nada é tocado em massa.
- O UPDATE em `messages` do ingest (`WHERE id = v_existing.id`) é pré-existente e não foi alterado.
- Provado no teste: `R.7 estado anterior: o contato excluido nao teve updated_at reescrito` PASS
  (antes), e depois `G.14 a reativacao reescreve updated_at SO da linha reativada` PASS com a
  contraponta `G.15 contraponta: nenhum outro contato teve updated_at reescrito` PASS.

