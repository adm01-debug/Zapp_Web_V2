Especialista: workersql

O que fiz
- Migration 20261013051239 (ADITIVA) reescreve public.merge_contacts_atomic: preenche cada campo VAZIO do
  principal com o do secundario (COALESCE por campo; p_merged_fields continua com prioridade). Antes o
  secundario era APAGADO e os campos dele (e-mail, empresa, cargo, tags...) sumiam junto.
- O secundario deixa de ser DELETE fisico e vira SOFT-DELETE: deleted_at=now(), deletion_reason='merged',
  merged_into_id e merged_at. Por isso a auditoria nao grava mais 'purge' nesta operacao.
- phone do secundario e liberado sem quebrar o ingest (escolha registrada, item 2 do cartao): o original
  (ja normalizado para digitos) vai para a nova coluna merged_phone e phone recebe uma sentinela SO
  digitos, unica e de 21 digitos, gerada por sequencia. O gatilho trg_normalize_contact_phone reduz phone
  a [0-9] em todo INSERT/UPDATE, entao a sentinela tem de ser numerica e unica; 21 digitos (acima do
  maximo E.164, 15) nunca casa com telefone real. O ingest_inbound_message busca por phone_variants SEM
  filtrar deleted_at: como o telefone real deixa de existir na linha mesclada, um inbound novo cria um
  contato NOVO vivo em vez de ressuscitar o mesclado.
- As FKs (mensagens, notas, campos personalizados, conversas, etc.) sao movidas para o principal SEM
  duplicar: para cada indice unico que inclui contact_id, as linhas do secundario que ja existem no
  principal sob a mesma chave sao descartadas antes do UPDATE (cobre conversation_memory e talkx_blacklist,
  unicos por contato, alem de contact_custom_fields, contact_tags, favorite_contacts, message_reactions...).
  Durante a realocacao o gatilho update_*_updated_at da tabela filha e DESLIGADO (so ele) e reabilitado no
  fim: mover o contato NAO e editar o registro, entao a data de atividade das linhas movidas e preservada
  (ponto 2 do juiz / efeito colateral de 06/10). Se algo falhar, o rollback desfaz o DISABLE.
- Nova tabela append-only public.contact_merge_audit (primary_id, merged_id, merged_at, performed_by,
  performed_by_db_role) SEM chave estrangeira: o rastro "quem foi mesclado em quem" sobrevive a um expurgo
  fisico posterior (CT-086, t_49a0faab) que ainda nao existe no repo. RLS ligada, REVOKE de anon/PUBLIC,
  SELECT so para admin/supervisor, INSERT/UPDATE/DELETE bloqueados por policy.
- src/services/contact-merge.service.ts: contrato tipado do retorno (merged_contacts, already_merged,
  moved_relations). Assinatura da RPC inalterada.
- Idempotencia: chamada repetida com o mesmo par vira no-op (retorna already_merged, nao reescreve
  merged_phone). Secundario ja mesclado em OUTRO principal (ou soft-deleted sem ser mesclagem) e recusado
  com 22023 (fail-closed); o principal soft-deleted tambem e recusado.

Como provei (banco LOCAL v2-2610130206b4f6, migrations reais, como o papel real)
- VERMELHO ANTES: com a RPC antiga (20261006205100) o secundario e apagado e o e-mail dele nao chega ao
  principal -> secundario_ainda_existe=0, email_no_principal=NULL.
- VERDE DEPOIS (supabase/tests/contact_merge_preserva_dados.sql, commitado, tudo em BEGIN..ROLLBACK,
  como service_role/authenticated): T1 dados preservados + soft-delete com rastro + phone liberado + FKs
  movidas sem duplicar + auditoria gravada; T2 idempotente; T3 agente comum negado (42501); T4 EXECUTE so
  authenticated/service_role; T5 recusa fail-closed; T6 updated_at preservado nas linhas movidas e no
  contato alheio, com o gatilho reabilitado. Rollback: linhas '-- Rollback:' no topo da migration.
- Commit: 4 arquivos, 1 de teste:
  supabase/migrations/20261013051239_merge_contacts_preserva_dados.sql,
  supabase/tests/contact_merge_preserva_dados.sql (o unico de teste),
  src/services/contact-merge.service.ts, .tmp/relato.md.

Juiz (2 pontos): (1) contagem de arquivos — corrigida aqui (4 arquivos, 1 de teste). (2) updated_at: ATENDIDO,
e nao era alarme falso — o gatilho update_*_updated_at das tabelas filhas foi desligado durante o movimento
(reabilitado no fim) e o T6 prova linha antes/depois (mensagem movida e contato nao envolvido mantem
'2001-01-01'; gatilho reabilitado). O UPDATE em contacts toca SO as linhas do merge (WHERE id = ANY(...)),
por desenho — nao ha backfill em massa.

Fora do meu escopo (registrado, nao bloqueia): o expurgo e do CT-086 (t_49a0faab), que deve manter a
trilha via contact_merge_audit. A tela de mesclagem (CT-085) nao precisa mudar: a assinatura da RPC nao
mudou. NOTA para t_0ded8fb1: ja existe a suite contact_merge_preserva_dados.sql; a dele (merge_contacts_*.sql)
nao precisa repetir estes casos.

Prova (saida real de `zapp-db-local psql . v2-2610130206b4f6 < supabase/tests/contact_merge_preserva_dados.sql`):
ROLLBACK
NOTICE:  T1 OK: dados preservados, soft-delete com rastro, phone liberado, FKs movidas sem duplicar, auditoria gravada
NOTICE:  T2 OK: 2a chamada no-op, trilha e telefone original intactos
NOTICE:  T3 OK: agente comum negado (42501)
NOTICE:  T4 OK: EXECUTE restrito a authenticated + service_role
NOTICE:  T5 OK: recusado como esperado (contact_merge_secondary_not_active)
NOTICE:  T6 OK: updated_at preservado (mensagem movida e contato alheio) e gatilho reabilitado
