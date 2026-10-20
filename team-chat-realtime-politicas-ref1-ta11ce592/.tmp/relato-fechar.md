Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 1s;OK tipos 69s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (14/10 07:48, gerados por máquina: valem mais que números escritos à mão)
```
 scripts/ci/check-test-inventory.mjs                |   7 +
 .../team-chat-realtime-membership-guards.test.sh   | 448 +++++++++++++++++++++
 ...m_chat_realtime_reactions_membership_guards.sql |  86 ++++
 3 files changed, 541 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: scripts/ci/check-test-inventory.mjs, supabase/migrations/20261014101843_team_chat_realtime_reactions_membership_guards.sql; padrão sensível: caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:WITH CHECK, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b


## O que mudou e por quê
Cartão `team-chat-realtime-politicas`, parte de banco. Medi o banco LOCAL da tarefa (nunca a produção) e confirmei/descartei item a item.

- `supabase/migrations/20261014101843_team_chat_realtime_reactions_membership_guards.sql` (nova, aditiva):
  1. CONFIRMADO: `team_message_reactions` NÃO estava na publicação `supabase_realtime` (só `team_conversations`, `team_conversation_members`, `team_messages`, `team_message_receipts`). Entrou, com guarda de `duplicate_object`.
  2. CONFIRMADO: `team_messages` e `team_message_reactions` estavam com REPLICA IDENTITY `DEFAULT` (a e47 devolveu `team_messages` a DEFAULT). Os dois hooks assinam `event: '*'` com `filter: conversation_id=eq.<id>` (`useTeamMessages.ts`, `useTeamMessageReactions.ts`); com DEFAULT o DELETE leva só a PK, o filtro não casa e a RLS do Realtime não tem a linha antiga — a exclusão de outro membro não chega ao painel. As duas voltaram a `REPLICA IDENTITY FULL`. Custo justificado: o registro antigo passa a entrar no WAL só no UPDATE/DELETE dessas duas tabelas, que é raro no chat de equipe; o ganho é o painel receber o evento.
  3. PARCIAL: o UPDATE (`team_messages_update_own`) e o DELETE (`Senders can delete own messages`) checam SÓ `sender_id`. Medido com papel real: hoje o ex-membro NÃO edita nem apaga — quem barra é a policy de SELECT (que exige vínculo), porque o Postgres aplica a leitura ao UPDATE/DELETE (o teste prova: A.10–A.13). O furo é LATENTE: com uma leitura mais ampla o ex-membro volta a editar/apagar (A.6–A.9 provam isso). Os dois comandos ganharam `AND public.is_team_conversation_member(auth.uid(), conversation_id)`.
  4. CONFIRMADO: `team_message_reactions` tinha DUAS policies PERMISSIVE de SELECT (`reactions_select` + `team_message_reactions_select`) e DUAS de DELETE (`reactions_delete` + `team_message_reactions_delete`); PERMISSIVE soma por OR. Ficou uma por comando (as canônicas de 30/09 ficam; as reconstruídas de 20260902120000 saem). A de INSERT não foi tocada.
- `scripts/db-audit/team-chat-realtime-membership-guards.test.sh` (novo): prova em PostgreSQL 17 descartável (docker), com o PAPEL real `authenticated`, RLS ligada por tabela e o pré-estado fiel às policies medidas em `pg_policies`. Bloco A = defeitos/furo latente; bloco B = migration aplicada; bloco C = a linha `-- Rollback:` da migration roda e restaura o estado anterior.
- `scripts/ci/check-test-inventory.mjs`: entrada nova na ALLOWLIST de `.test.sh` (agente não edita workflow; o passo de uma linha em `db-guard.yml` fica para o dono do workflow).

## Prova
- verificação do repositório: `zapp-verify . --rapido` → `OK dependencias 2s; OK db_guard 0s; OK tipos 150s; OK lint 4s; OK migrations 0s` e `VERIFY: VERDE SEM BANCO (156s)` (o banco local é pulado sem o nome do conjunto — é assim que o fechar chama; a prova de banco deste cartão é o `.test.sh` abaixo).
- verde depois: `bash scripts/db-audit/team-chat-realtime-membership-guards.test.sh` → todos os blocos `[PASS]`, nenhum `[FAIL]`; fecha com `PASS: team chat — realtime e politicas de participacao. ...` e o bloco C `[PASS]` (rollback restaura publicação, REPLICA IDENTITY e as policies).
- vermelho antes: o mesmo teste, sem a migration, marca A.1/A.2/A.3/A.4 como defeito e A.6–A.9 como furo latente (com leitura ampliada o ex-membro edita e apaga).
- aplicação local: `hermes-db-migrar supabase/migrations/20261014101843_team_chat_realtime_reactions_membership_guards.sql` → `APLICADA no banco LOCAL 'v2-2610140706637d' (produção não foi tocada)`.
- inventário: `node scripts/ci/check-test-inventory.mjs` → a suíte nova não aparece entre os órfãos.

## Arquivos tocados (o diff tem exatamente estes 3)
- 1 migration nova: `supabase/migrations/20261014101843_team_chat_realtime_reactions_membership_guards.sql`
- 1 teste novo: `scripts/db-audit/team-chat-realtime-membership-guards.test.sh`
- 1 registro de CI: `scripts/ci/check-test-inventory.mjs` (ALLOWLIST de `.test.sh`)
Os dois últimos não estão na lista de arquivos do cartão; são indispensáveis:
- `scripts/db-audit/*.test.sh` é o padrão da casa para provar RLS como PAPEL REAL (docker + PostgreSQL 17 descartável) — os vizinhos `team-reaction-membership.test.sh` e `team-receipts-membership.test.sh` fazem exatamente isso. O replay local deste ramo NÃO carrega as tabelas de team chat de forma fiel (medido: `public.current_profile_id()` ausente e as policies duplicadas ausentes), então um `supabase/tests/*.sql` sobre o replay não provaria nada aqui. Sem o harness docker não há como provar publicação, REPLICA IDENTITY, RLS como `authenticated` nem rodar a linha `-- Rollback:`.
- `scripts/ci/check-test-inventory.mjs` é o registro mecânico obrigatório de todo `.test.sh` novo (a regra do repositório é "agente não edita workflow"; o passo de uma linha em `db-guard.yml` fica para o dono). Sem essa linha o inventário de CI reprova o teste como órfão.

## O que NÃO fiz e por quê
- Não toquei em `src/**`: as assinaturas do cliente (filtro por `conversation_id`) já estão certas; faltava o lado do banco.
- Não editei `db-guard.yml` (regra do repositório: agente não edita workflow) — registrei na ALLOWLIST.
- `check-test-inventory` acusa 6 testes órfãos que JÁ existiam no ramo base (team-chat-department-transfer-guards, team-chat-media-contract, team-direct-conversation-race e outros): não são deste cartão.
- Não mexi na policy de INSERT das reações nem em GRANT/papel: nada disso estava no pedido.
