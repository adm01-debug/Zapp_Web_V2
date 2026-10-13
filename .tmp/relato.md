Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013210002_realtime_canais_privados.sql` (nova): cria
  `public.can_access_realtime_topic(text)` (STABLE, SECURITY DEFINER, `search_path=public,pg_temp`)
  e duas policies em `realtime.messages` (SELECT = assinar/receber; INSERT = enviar broadcast),
  ambas `TO authenticated`, com `using/with check`:
  `can_access_realtime_topic(realtime.topic()) AND can_access_realtime_topic(topic)`.
  Regra por tópico: `typing:<uuid>` e `conversation:<uuid>` → `is_contact_visible_to_user(uuid, auth.uid())`;
  `team-typing-<uuid>` e `team-presence-<uuid>` → `is_team_conversation_member(auth.uid(), uuid)`.
  Qualquer outro tópico / id malformado / `auth.uid()` nulo → `false` (nega por padrão, sem erro — mesma
  resposta para caso existente e inexistente, sem oráculo). `anon` não entra em policy nenhuma.
- `supabase/tests/realtime_canais_privados.sql` (novo): prova a autorização no banco LOCAL, com os 3 papéis
  REAIS (`SET ROLE authenticated/anon/service_role`), fixtures sintéticas em transação com `ROLLBACK` no fim.

## Prova
- vermelho antes (banco local SEM a migration — nenhuma policy em `realtime.messages`):
  `zapp-db-local psql . v2-2610130244cc8a < supabase/tests/realtime_canais_privados.sql`
  → `ERROR:  T1: viewer deveria enxergar o canal typing do contato visivel` (EXIT=3)
- verde depois (`hermes-db-migrar supabase/migrations/20261013210002_realtime_canais_privados.sql`
  → `APLICADA no banco LOCAL 'v2-2610130244cc8a'`; mesma prova):
  → todas as 16 asserções `ok` (T1–T16) e `== VERDE: autorizacao Realtime por topico ==` (EXIT=0)
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (210s)` (o banco_local do `--rapido`
  é pulado sem o nome do conjunto, é o comportamento normal do fechar).

O que as asserções provam, papel por papel:
- authenticated/VIEWER: vê só os 3 tópicos acessíveis (contato visível, `conversation:`, `team-typing-`
  da sua equipe); assinatura em canal alheio devolve 0 linhas (T7); envia no canal permitido (T8) e é
  negado (42501) no canal de outro agente (T9) e da equipe alheia (T10).
- authenticated/OUTRO agente: 0 linhas e INSERT negado no canal do contato do viewer — é a forja do
  `contact_typing` que o cartão cita (T11–T12).
- anon: 0 linhas e envio negado (T13–T14).
- service_role: enxerga todas as linhas (BYPASSRLS) e envia sem depender das policies (T15–T16) — o
  webhook segue funcionando.

## Efeitos colaterais (passada antes de fechar)
- Nenhuma tabela nova (nada de RLS a lembrar de ligar); nenhum DML/backfill (nenhum gatilho de `updated_at`);
  uma única migration = atômica.
- Nenhum GRANT/papel/ACL de objeto existente foi tocado: só `revoke all` + `grant execute` na função NOVA
  (`from public, anon` → `to authenticated, service_role`). Nada de DROP/TRUNCATE/DELETE.
- Nada de identificador/URL/contagem do banco real aparece no diff nem aqui.

## O que NÃO fiz e por quê
- Não toquei no front: marcar os canais como `private: true` (é o que faz a Realtime consultar a RLS) é das
  trilhas PD-69/PD-70 (telas/hooks). Esta migration só fecha o lado do banco; enquanto o canal for público,
  a Realtime não consulta RLS — está dito no cabeçalho da migration.
- Não criei `scripts/db-audit/*.test.sh` porque o cartão limitou ARQUIVOS QUE PODE TOCAR a
  `supabase/migrations/**` + `supabase/tests/**`. A prova ficou em `supabase/tests/` (que são scripts de prova
  rodados à mão — não há runner de CI para eles, então não há registro pendente em `db-guard.yml`).
- Interpretação dos tópicos verificada no código da branch: `conversation.id` É o id do contato
  (`src/adapters/inboxAdapter.ts:102`), então `typing:<conversationId>` (ChatPanel) e `typing:<contactId>`
  (cartão) são o mesmo valor.

CONCLUÍ: a migration e a prova estão commitadas (`git log -1` = e4671d14d) e a autorização Realtime por
tópico passa nos 3 papéis reais.
