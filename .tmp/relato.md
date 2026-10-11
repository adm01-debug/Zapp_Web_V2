Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011190932_automation_runtime.sql` (nova, aditiva): cria a base idempotente
  do motor de automações — `public.automation_events` (fila de gatilhos), `public.automation_executions`
  (log com chave natural `(automation_id, contact_id, trigger_ref)`), o índice de apoio em
  `public.automations`, RLS + política explícita de leitura para staff, e os dois gatilhos de entrada.
- `supabase/tests/automation_runtime_events.sql` (novo): T1..T10 + C1/C2 em Postgres descartável,
  aplicando o ARQUIVO REAL da migration e rodando como papel real (`authenticated`, `anon`, `service_role`).

Decisões de contrato (para o cartão do executor):
- `trigger_type` segue o vocabulário JÁ existente em `public.automations.trigger_type` e no editor do
  painel (`src/components/automations/automationConstants.ts`): `new_message`, `keyword`, `tag_added`.
  NÃO criei `message_received`: o executor casa automação por `trigger_type`, e a fila tem de falar o
  mesmo idioma do resto do sistema.
- **Achado que mudou o desenho:** `public.tags`/`public.contact_tags` NÃO existem mais — foram dropadas
  por `20260927410000_drop_legacy_tags_tables.sql`, e a tag de contato passou a ser o array
  `public.contacts.tags text[]` (escrito por `src/hooks/inbox/useContactQuickActions.ts`). A 1ª aplicação
  no banco local falhou exatamente com `ERROR: relation "public.contact_tags" does not exist`; por isso o
  gatilho de tag é `AFTER UPDATE OF tags ON public.contacts`, enfileirando SÓ os valores acrescentados
  (diferença OLD→NEW, caixa-insensível: 'vip' e 'VIP' são a mesma tag).
- **Anti-laço:** mensagem é ESTRUTURAL — o gatilho só enfileira `sender = 'contact'`; automação envia como
  `sender = 'agent'`, logo nunca se realimenta. Tag é SWITCH: a ação `add_tag` do motor deve rodar com
  `SET LOCAL zapp.suppress_automation_events = 'on'` (provado em T7) — o cartão do executor precisa honrar isso.
- **Idempotência:** índice único `(trigger_type, trigger_ref, contact_id)` na fila + UNIQUE em execuções;
  `ON CONFLICT DO NOTHING`. Limite intencional e documentado: a MESMA tag não enfileira duas vezes para o
  mesmo contato (uma automação de `tag_added` roda uma vez por tag por contato) — é a chave natural do cartão.

## Prova
- vermelho antes: `psql -v sem_migration=1 < supabase/tests/automation_runtime_events.sql` →
  `ERROR: relation "public.automation_events" does not exist` (rc=3).
- verde depois: mesmo arquivo com a migration →
  `NOTICE: T1 OK: ...` … `NOTICE: T10 OK: nulo, apagada, tags NULL e keywords malformado tratados sem evento indevido`
  `NOTICE: C1 OK: rollback removeu tabelas, funções e gatilhos` / `C2 OK: reaplicar a migration é idempotente` (rc=0).
- Rollback: 7 linhas extraídas do bloco `-- Rollback (completo)` do próprio arquivo, EXECUTADAS em C1 e
  reaplicadas em C2. A migration foi aplicada no banco LOCAL da tarefa por `hermes-db-migrar`
  (`APLICADA no banco LOCAL 'v2-2610111602b52d'`, COMMIT); produção não foi tocada.

## Passada de efeito colateral
1. Gatilhos das tabelas tocadas (conferido no banco local): `messages` já tem
   `trg_gamification_on_message_sent`, `trg_guard_message_provenance_fields`,
   `trg_guard_message_delivery_internal_fields`, `trg_messages_sla_first_response`, `update_messages_updated_at`;
   `contacts` tem 13 (auditoria, auto-assign, normalize, FSM, updated_at…). **Nenhum deles grava em
   `automation_events`** (grep: só a minha migration referencia a tabela). Os meus são AFTER INSERT/UPDATE e
   não alteram a linha de origem — aditivos.
2. Tudo ou nada: migration roda numa transação (`hermes-db-migrar` imprime BEGIN…COMMIT); cada função faz
   um INSERT por evento, sem estado parcial.
3. Sem oráculo: não há função de consulta/validação aqui.
4. Permissão só a pedida: GRANT/REVOKE/RLS/policies apenas nas DUAS tabelas novas; nenhum objeto existente
   mudou de ACL, coluna ou dado. O único toque em tabela existente é um índice ADITIVO em `automations`.
5. Entrada inválida: T10 cobre contact nulo, mensagem apagada, `OLD.tags` NULL/duplicado e
   `trigger_config.keywords` fora do formato array (não derruba o INSERT).
6. Teste por comportamento com papel real (T9), não por deparse de `pg_policies` (a checagem de deparse é só
   uma guarda extra de `USING(true)`).

## O que NÃO fiz e por quê
- `src/integrations/supabase/types.ts` NÃO editado à mão: no repositório ele é gerado pelo workflow
  `types-sync`/`db-live-guard` contra o banco (commits `chore(db): sincronizar artefatos derivados`).
- `supabase_realtime`: as tabelas novas ficam FORA da publication (fila interna, não é do cliente).
- `scripts/db-audit/*.test.sh`: não criei nenhum; a prova ficou em `supabase/tests/` (caminho permitido pelo
  cartão e com precedente em `r2_db_022_provenance_trigger.sql`). `node scripts/ci/check-test-inventory.mjs`
  não acusa órfão novo (só 3 pré-existentes da base).

SAÍDA DO TESTE (verde, rc=0): T1..T10 OK + C1 OK + C2 OK.
