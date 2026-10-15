Especialista: workersql

Refazer 1 do merge de contatos (entrega 45a42f15b recusada; 5 pontos resolvidos abaixo, na ordem da recusa).

Ponto 1 — RPC atualizava o principal antes de liberar o phone do secundario (23505).
Mudei: supabase/migrations/20261013051239_merge_contacts_preserva_dados.sql — o soft-delete do
secundario (tombstone com sentinela + merged_phone) agora roda ANTES do UPDATE do principal
(o bloco foi movido de apos o movimento de FKs para logo apos o vínculo CRM). Os COALESCEs dos
demais campos continuam lendo os valores originais: o tombstone so troca phone/deleted_at/rastro
(name/email/empresa/etc. ficam intactos nas linhas tombstoned, lidas por id sem filtro de
deleted_at). Ordem nova: validacoes -> lock -> CRM -> tombstone -> UPDATE principal -> FKs -> audit.
Teste: T7 em supabase/tests/contact_merge_preserva_dados.sql (p_merged_fields com o phone DO
SECUNDARIO). Vermelho antes (RPC antiga): ERROR duplicate key value violates unique constraint
"contacts_phone_key". Verde depois: NOTICE T7 OK.

Ponto 2 — faltava positivo de mesclagem autenticada real (admin/supervisor); so havia positivo
service_role e negativo authenticated.
Mudei: supabase/tests/contact_merge_preserva_dados.sql — T8 cria auth.users + user_roles(admin),
chama a RPC como authenticated com JWT sub do admin e confere soft-delete + performed_by = admin.
Verde: NOTICE T8 OK: admin authenticated mesclou e gravou performed_by. (T7 acima cobre a outra
metade do ponto.)

Ponto 3 — COMMENT de contacts.merged_phone dizia que phone recebia 'merged:<uuid>'.
Mudei: mesma migration — COMMENT corrigido para sentinela numerica unica de 21 digitos
('9' + 20 digitos da sequencia). Sem teste de comportamento (metadado); conferido via
\d+ e pelo assert de sentinela do T7 (so digitos, 21 chars, distinta de merged_phone).

Ponto 4 — cabecalho do teste listava T1–T5 mas o arquivo rodava T6, com vars nao usadas (v_err).
Mudei: supabase/tests/contact_merge_preserva_dados.sql — cabecalho reescrito listando T1–T8 com a
descricao real de cada caso; removidos os 3 `v_err text` nao usados (bloco T1, T3 e T5).
Verde: suite inteira T1–T8 sem EXCEPTION (listagem abaixo).

Ponto 5 — deixar explicito no relato que o DELETE de dedup descarta do secundario a linha em
conflito (ex.: conversation_memory, contact_custom_fields com mesma chave), mantendo o valor
do principal.
Explicito: sim — na deduplicacao por indice unico que inclui a FK, a linha descartada (DELETE) e
sempre a do SECUNDARIO; a do principal prevalece e nada do principal e apagado. Casos medidos:
conversation_memory e UNIQUE por contato (desempata 1x1, fica a do principal) e
contact_custom_fields tem UNIQUE (contact_id, field_name) (mesma chave: fica a do principal;
chave so do secundario migra). Prova: asserts T1e/T1f (count origem=1, plano migrou, memoria=1)
verdes; comentario equivalente adicionado na propria RPC (bloco de dedup). O rastro da mesclagem
fica em contact_merge_audit.

Arquivos do MEU commit (git diff 45a42f15b...HEAD --name-only):
supabase/migrations/20261013051239_merge_contacts_preserva_dados.sql
supabase/tests/contact_merge_preserva_dados.sql
.tmp/relato.md
(Diff total do cartao vs base 96dd72dc5f inclui ainda src/services/contact-merge.service.ts, vindo
da entrega anterior 45a42f15b e mantido sem alteracao. Diff do meu commit: 12.286 chars.)

Comandos e resultados reais (banco local v2-mergerefazer1, stack propria deste refazer):
- Suite antes da correcao (RPC antiga + T7 novo): T1–T6 OK, T7 ERROR duplicate key contacts_phone_key.
- Suite apos a correcao: T1 OK, T2 OK, T3 OK (42501), T4 OK, T5 OK
  (contact_merge_secondary_not_active), T6 OK, T7 OK, T8 OK, ROLLBACK (nada persiste).
- Rollback da migration executado de verdade (DROPs + reaplicacao da 20261006205100): audit=0
  tabelas, colunas merged_*=0, RPC antiga sem merged_into_id; depois reapliquei a migration
  corrigida e a suite voltou a T1–T8 OK.
- Chamadores de merge_contacts_atomic (service + telas de permissao): contrato inalterado
  (args e retorno merged_contacts/already_merged/moved_relations), nenhum ajuste necessario.

Nota de ambiente: hermes-tarefa-iniciar/fechar e worktree estao bloqueados (modo V1 CONGELADO sem
MODO_V2; guard proibe worktree/branch nova), entao trabalhei sobre a branch existente do cartao
(v2/merge-contatos-preserva-dados-2610130206b4f6) e entrego via kanban com o sha do commit.
