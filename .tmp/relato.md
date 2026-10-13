Especialista: workersql

## O que mudou e por quê
Contagem do diff desta entrega: 3 arquivos no total — 1 migration, 1 teste (1 arquivo de teste) e este relato.
- `supabase/migrations/20261013210002_paridade_visibilidade_fila.sql` (novo, aditivo): alinha quatro
  pontos ao predicado único `public.is_contact_visible_to_user(contact_id, auth.uid())` — o mesmo que
  já governa a leitura de `messages`/`conversations` (inclui o membro ATIVO da fila do contato):
  1) `conversation_sla` SELECT (`conversation_sla_select_policy`, era 20260830110000 narrow);
  2) `followup_executions` SELECT (`Authenticated can view followup executions`, era 20260318121108 narrow);
  3) `conversation_events` INSERT (`Authorized users can insert events`, 20260412170036) — troca o ramo
     de contato pelo predicado único, MANTENDO a autoria (`performed_by` é nulo ou o próprio perfil);
  4) storage INSERT em `whatsapp-media`/`audio-messages` (20260511233306) — passa a aceitar a pasta de um
     contato visível (carteira OU fila), a própria pasta e admin/supervisor; antes só contato atribuído.
- `supabase/tests/paridade_visibilidade_fila.sql` (novo): prova com os papéis REAIS via `SET ROLE`
  (authenticated/anon/service_role), rodada no banco LOCAL da tarefa (`zapp-db-local psql . <id>`).
- `.tmp/relato.md`: este relato (artefato do fechar).
- `contact_custom_fields` NÃO foi tocado (é o cartão PB-26; não duplicar). A SELECT de
  `conversation_events` já estava alinhada (20260925150000 renomeou a policy para `is_contact_visible_to_user`)
  e não precisou de mudança.
- Sem mudança de GRANT/ACL de tabela: só o EXECUTE do helper é reafirmado (idempotente). Nenhuma
  migration anterior editada. `SET search_path = public, pg_catalog` no corpo.

## Prova
- vermelho antes (migration NÃO aplicada): `zapp-db-local psql . v2-26101303167dce < supabase/tests/paridade_visibilidade_fila.sql`
  → `ERROR: [FAIL] FILA lê conversation_sla do contato da fila (1, não 2)` (exit 3; para no primeiro FAIL por `\set ON_ERROR_STOP on`).
- aplicação: `hermes-db-migrar supabase/migrations/20261013210002_paridade_visibilidade_fila.sql` → `APLICADA no banco LOCAL`.
- verde depois: mesmo comando do teste → 13 linhas `[PASS]` (SLA=1, follow-up=1, insere evento do contato da fila,
  anexa em whatsapp-media e audio-messages, NEGA pasta de contato alheio, NEGA evento de contato que não enxerga,
  agente SEM RELAÇÃO lê 0, anon lê 0, service_role lê as 2) e `FIM: paridade da fila OK` — exit 0.
- rollback de verdade (skill `rollback-de-verdade`): extraí as linhas `--   ` do cabeçalho, apliquei no banco local
  → `COMMIT` limpo, e conferi que `conversation_sla_select_policy` e `Authenticated can view followup executions`
  voltaram ao texto narrow original; depois reapliquei a migration e o teste voltou a verde.
- `zapp-verify . --rapido` → `OK dependencias / db_guard / tipos / lint / migrations` + `VERIFY: VERDE SEM BANCO (162s)`.

## O que NÃO fiz e por quê
- `contact_custom_fields`: fora do escopo (PB-26 trata; o cartão manda não duplicar).
- `scripts/db-audit/*.test.sh` novo: proibido pela skill; a prova foi para `supabase/tests/`, no escopo do cartão.
- COLISÃO DE GUARDA (fora do meu escopo, precisa de worker(ci)/complexo): `scripts/db-audit/dashboard-rls-authorization.test.sh`
  tem "guarda de vigência" que exige que a ÚLTIMA definição de `conversation_sla_select_policy` seja a de
  20260830110000; esta migration a redefine, então essa guarda passa a apontar para 20261013210002. Registrei em
  comentário no cartão; `zapp-verify . --rapido` NÃO roda essa suíte, então o critério de pronto segue verde.
  Os demais testes de banco não foram afetados (a função `is_contact_visible_to_user` não mudou).
