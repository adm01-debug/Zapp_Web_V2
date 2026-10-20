- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 9s;OK lint 0s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (10/10 20:58, gerados por máquina: valem mais que números escritos à mão)
```
 .github/workflows/db-guard.yml                     |  12 ++
 .../anon-privileges-contact-messages.test.sh       | 155 +++++++++++++++++++++
 ...020_revoke_anon_privileges_contact_messages.sql |  39 ++++++
 3 files changed, 206 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: .github/workflows/db-guard.yml, supabase/migrations/20261011003020_revoke_anon_privileges_contact_messages.sql; padrão sensível: caminho:\.githu, caminho:supabase/migrations/, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:\bTRUNCATE\b, padrão:auth\.(uid|role)\(\)

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011003020_revoke_anon_privileges_contact_messages.sql: `REVOKE ALL PRIVILEGES ON TABLE ... FROM anon` nas 17 tabelas do achado SEC-RLS_CONTATOS_MENSAGENS-05 (conversation_events, contact_custom_fields, contact_identity_map, conversation_closures, conversation_memory, conversation_sla, conversation_snoozes, conversation_tasks, favorite_contacts, pinned_conversations, message_reactions, message_templates, scheduled_messages, campaign_contacts, contact_purchases, sicoob_contact_mapping, ai_conversation_tags). Essas tabelas concediam ao papel `anon` os 8 privilegios de tabela (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN). Nao e exploravel hoje pelo PostgREST (toda policy do escopo exige auth.uid(), nulo para anon, e o PostgREST nao emite TRUNCATE), mas TRUNCATE ignora RLS e nenhuma policy o barra: e o P2 de defesa em profundidade do report. Revogar de `anon` alinha ao padrao ja aplicado em contacts/messages/contact_notes.
- scripts/db-audit/anon-privileges-contact-messages.test.sh: prova descartavel (postgres:17-alpine) que reproduz a ACL legada, aplica a migration e confere anon=0 privilegios, authenticated/service_role intactos, RLS ligada, idempotencia e que a linha de rollback do cabecalho restaura a ACL.

## Prova
- vermelho antes: fixture legada com `GRANT ALL ... TO anon` (o estado do achado). `bash scripts/db-audit/anon-privileges-contact-messages.test.sh` no BLOCO A:
  `[PASS] A1 anon tem os 8 privilegios, um a um, nas 17 tabelas (estado legado)` (136 = 17x8) e `[PASS] A2 anon tem TRUNCATE nas 17 tabelas (ignora RLS)` (17). Sem a migration, B1 leria 136.
- verde depois (mesmo comando, apos aplicar a migration no mesmo container):
  `[PASS] B1 anon tem ZERO privilegios nas 17 tabelas`, `[PASS] B2 bool_and: anon nao tem nenhum dos 8 privilegios em nenhuma das 17`, `[PASS] B3 authenticated segue com os 8 privilegios, um a um, nas 17 (intocado)`, `[PASS] B4 service_role segue com os 8 privilegios, um a um, nas 17 (intocado)`, `[PASS] B5 RLS continua ligada nas 17 tabelas`, `[PASS] B6 reaplicar mantem anon com zero privilegio (idempotente)`, `[PASS] B7 rollback restaura os 8 privilegios de anon nas 17 tabelas` → `[OK] anon sem privilegio de tabela nas 17 tabelas do achado; rollback restaura`.
- banco local da tarefa (migrations reais): `hermes-db-migrar <arquivo>` → `APLICADA no banco LOCAL 'v2-2610102042c8e0'`; consulta `information_schema.role_table_grants` -> `anon_grants_17 = 0`, `authed_grants_17 = 119` (authenticated intocado).
- rollback executado de verdade: a linha do cabecalho (`--   grant select, insert, ... to anon;`) roda no proprio teste (B7), nao e prosa.
- zapp-verify: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (82s)`.

## Passada de efeitos colaterais
- So o papel `anon` e afetado; `authenticated` e `service_role` seguem com as mesmas ACLs (provado em B3/B4).
- Nenhuma policy, RLS, funcao, coluna, GRANT de outro objeto ou papel foi tocado — o diff so tem REVOKE FROM anon.
- Atomico: BEGIN/COMMIT em torno do REVOKE; falha nao aplica nada.
- Idempotente: REVOKE de privilegio inexistente e no-op (provado em B6).

## Critério "nenhuma tela legítima quebrou (todas usam auth, não anon)"
- Consulta no banco local (migrations reais): das 17 tabelas, as policies somam `59` e TODAS sao `TO authenticated`; `policies_TO_anon_ou_public = 0`. Ou seja, `anon` nunca teve acesso a linha nenhuma — a revogacao so remove privilegios de tabela que ninguem usava, sem tirar acesso de quem tem.
- Os 30 arquivos que consomem essas tabelas (src/hooks/**, src/components/**, src/services/contact.service.ts) rodam sobre o cliente autenticado do app (src/integrations/supabase/client.ts); nao ha leitura pre-login/anon dessas tabelas.

## O que NÃO fiz e por quê
- Nao toquei supabase/schema-manifest.json nem scripts/db-audit/grants-baseline.json: sao retratos do banco oficial, atualizados na integracao a partir do banco real; a migration e local.
- Arquivos a mais que os do cartao, e por que foram indispensaveis: `scripts/db-audit/anon-privileges-contact-messages.test.sh` e a prova do critério ("rodar um teste em Postgres descartável" — a skill area-sql-banco fixa a prova de banco em scripts/db-audit); sem ele o cartao nao teria como demonstrar anon=0. `.github/workflows/db-guard.yml` foi exigido pelo proprio juiz do fechar: um `.test.sh` novo sem passo no CI e reprovado como orfao por `check-test-inventory`, que roda no db-guard; o passo adicionado e a unica forma de o teste existir de verdade. Ambos aditivos, sem tocar testes/steps alheios.
- Nao mexi em nenhuma policy: o achado e de ACL (privilegio de tabela), nao de RLS.
