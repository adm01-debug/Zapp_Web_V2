Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 139s;OK lint 2s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 22:35, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  75 ++++--
 scripts/ci/check-test-inventory.mjs                |   8 +
 scripts/db-audit/absent-agents-presence.test.sh    | 285 +++++++++++++++++++++
 .../20261014010805_absent_agents_use_presence.sql  | 120 +++++++++
 4 files changed, 466 insertions(+), 22 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: scripts/ci/check-test-inventory.mjs, supabase/migrations/20261014010805_absent_agents_use_presence.sql; padrão sensível: caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:auth\.(uid|role)\(\), padrão:requireRole|isAdmin|


## O que mudou e por quê
- `supabase/migrations/20261014010805_absent_agents_use_presence.sql` (nova, 120 linhas): redefine `public.reassign_absent_agents` para decidir ausência pelo HEARTBEAT em `public.agent_presence` em vez de `user_sessions.last_activity_at` — proxy que quase nunca é atualizado (só a Edge detect-new-device / useDeviceDetection grave, e apenas quando telas de Segurança montam), motivo de "quase todo agente online contar como ausente".
  - Regra: está AUSENTE quando NÃO existe linha em `agent_presence` para o `profiles.user_id` com `updated_at > now() - inactive_minutes` E `status <> 'offline'` (o cartão pede "sem heartbeat fresco e não online" — `offline` é o pedido explícito de ocultar-se).
  - O SUBSTITUTO também passou a exigir heartbeat fresco: se só o critério do ausente mudasse, `user_sessions` nunca teria sessão recente e a fila nunca acharia sucessor.
  - `inactive_minutes` passa a governar a janela do heartbeat; default cai de 30 para 2 (o TTL do servidor expira presença em 90s, migration 20260925100542).
  - Mantidos intactos (conferido linha a linha contra o corpo vigente de 20260829040000): guard de papel admin/supervisor (ou service_role), `SECURITY DEFINER` + `SET search_path = public, pg_temp`, o registro em `conversation_events` (`absence_reassign`) e a trava contra sequestro de contato — o UPDATE em `contacts` segue disparando `trg_prevent_contact_assignee_hijack` (20260924203300), que libera admin/supervisor (authenticated) e service_role. ACL declara a assinatura exata: REVOKE de PUBLIC+anon, GRANT a authenticated+service_role.
- `scripts/ci/check-test-inventory.mjs` (ALLOWLIST, 1 linha + justificativa): indispensável para o fechar/CI aceitar um `.test.sh` novo; mesmo padrão e mesma justificativa dos 17 harnesses de docker já listados ali (não existe `.test.sh` do assunto para estender).
- `scripts/db-audit/absent-agents-presence.test.sh` (novo): Postgres 17 descartável, aplica a MIGRATION REAL e roda como os papéis reais (authenticated admin, authenticated sem papel, anon, PUBLIC). Indispensável e dentro da área: a skill do meu perfil (`area-sql-banco`) exige a prova nesse formato, o cartão autoriza Postgres descartável, não existe `.test.sh` do assunto para estender e a prova não toca produção nem o banco real.

## Prova (vermelho antes, verde depois)
`bash scripts/db-audit/absent-agents-presence.test.sh` → 23 PASS:
```
[PASS] RED: criterio antigo trata quem tem heartbeat como ausente (b3 perde os 5 contatos)
[PASS] RED: quem tem heartbeat foi para o substituto escolhido por user_sessions (b4 = 9)
[PASS] GREEN: b3 (heartbeat fresco, sem user_sessions) NAO perde a carteira
[PASS] GREEN: retorno conta 4 contatos (b2=2, b7=1 offline, b6=1 parado)
[PASS] GREEN: ausente1 (sem heartbeat) realocado para o candidato fresco b4
[PASS] GREEN: offline explicito b7 realocado (nao online)
[PASS] GREEN: heartbeat parado b6 realocado (frescor importa)
[PASS] GREEN: substituto fresco b4 recebeu os 4
[PASS] GREEN: fila q2 sem candidato fresco NAO move nada (b5 mantem 2)
[PASS] gatilho: b3 (nao movido) mantem updated_at original (5)
[PASS] gatilho: so as 4 linhas movidas tiveram updated_at regravado
[PASS] FSM: reatribuicao nao muda conversation_status (segue 'open')
[PASS] GREEN: eventos gravados = 4 ('absence_reassign')
[PASS] GREEN: evento aponta origem/destino corretos
[PASS] Authenticated nao-admin e barrado (raise do guard)
[PASS] inactive_minutes NULL -> 22023
[PASS] inactive_minutes negativo -> 22023
[PASS] GREEN: default de inactive_minutes e 2
[PASS] ACL: authenticated executa
[PASS] ACL: service_role executa
[PASS] ACL: anon NAO executa
[PASS] ACL: PUBLIC NAO executa
[PASS] Rollback roda: volta default 30 e o criterio antigo

TODOS OS BLOCOS PASSARAM
```
BLOCO A (RED) instala o corpo ANTERIOR verbatim (20260829040000) e chama a RPC: um agente com heartbeat fresco e sem `user_sessions` é tratado como ausente e perde 5 contatos. BLOCO B (GREEN) aplica o arquivo REAL da migration: o mesmo agente mantém a carteira; ausente sem linha, offline explícito e heartbeat parado são realocados para o único candidato fresco; fila sem candidato fresco não move nada.

## Verificação do repositório
`zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (150s)`; OK db_guard 0s, OK tipos 149s, OK lint 0s, OK migrations 1s (banco_local fora do alcance do fechar, que chama sem nome de conjunto).

## Passada de efeito colateral
1. Gatilho `update_contacts_updated_at` (BEFORE UPDATE, migration 20260315172343): o `UPDATE` do RPC é o próprio fim da RPC (reatribuir), não um backfill em massa — só as 4 linhas movidas ganham `updated_at` novo e as 5 do agente presente ficam com a data original; provado no harness (`gatilho: b3 ... updated_at original`, `so as 4 linhas movidas ...`). O gatilho de FSM (20260905090000) só reage a mudança de `conversation_status`, que a reatribuição não faz (`FSM: ... segue 'open'`). A trava `trg_prevent_contact_assignee_hijack` (20260924203300) segue ativa e é quem autoriza admin/supervisor e service_role.
2. Tudo ou nada: cada chamada move contatos + eventos na mesma transação; falha no meio desfaz tudo.
3. Sem oráculo: RPC é admin/supervisor-only; a mesma negação vale para quem não tem papel.
4. Permissão só a pedida: o único REVOKE/GRANT é o do cartão ("grants explícitos"), sobre a assinatura que já existia — não cria overload nem muda acesso de ninguém.
5. Entrada inválida testada: `inactive_minutes` NULL e negativo → SQLSTATE 22023, sem mover nada.
6. Teste por comportamento com papel real; sem depender de deparse de `pg_policies`/`pg_get_functiondef`.

## Notas de integração (fora do escopo deste cartão)
- Sobreposição: o cartão irmão da fila (`v2/fix-db-reassign-open-conversations-dry-r-2610131359eaf5`, migration 20261013235905) também redefine `reassign_absent_agents` (só abertas + capacidade + `p_dry_run`, assinatura `(integer, boolean)`). Ao integrar os dois, o corpo vencedor precisa juntar as duas mudanças — quem integrar por último deve mesclar, não sobrescrever (o meu critério de ausência + o filtro de abertas deles).
- Front: `src/hooks/crm/useAgentReassignment.ts` ainda passa `inactive_minutes` default 30 (arquivo de hooks, fora da minha área) — ajustar o default dele é de outro cartão.
- `scripts/ci/check-test-inventory.mjs` (novo, 1 linha + justificativa): registra o harness novo na ALLOWLIST de `.test.sh`, como todos os 17 harnesses de Postgres descartável (docker) já registrados ali — o runner do `db-guard.yml` não tem docker, por isso `agente não edita workflow` e o passo fica para o dono do workflow. `node scripts/ci/check-test-inventory.mjs` deixa de citar o meu arquivo (seguem 6 órfãos PRÉ-EXISTENTES de outros cartões: department-invite-contract-audit-vocabulary, ia-usage-outbox-duravel, talkx-conversion-defaults, team-chat-department-transfer-guards, team-chat-media-contract, team-direct-conversation-race — fora do meu escopo).
- A suíte `supabase/tests/absent_agents_use_presence.sql` não foi entregue: depende do schema completo do Supabase local e o `zapp-db-local up` não ficou de pé nesta máquina (0 migrations aplicadas). A prova é o harness acima, que aplica a migration REAL.
