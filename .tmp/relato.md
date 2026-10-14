Especialista: worker (sql) (area-sql-banco)

## Verificação

- `zapp-verify . --rapido` → `OK dependencias 2s / OK db_guard 0s / OK tipos 150s / OK lint 3s / OK migrations 1s` + `VERIFY: VERDE SEM BANCO (156s)`. Sem nome de conjunto o verify PULA o `banco_local` (é assim que o fechar o chama); a prova de banco deste cartão é a suíte abaixo, que aplica o ARQUIVO REAL da migration em PostgreSQL 17 descartável.
- `bash scripts/db-audit/contacts-soft-delete-and-status.test.sh` → todas as asserções `[PASS]`, terminando em `Contacts F1 (soft-delete, Sicoob, status, grants) PostgreSQL 17 behavioral contract: PASS` / `EXIT=0`.

## O que mudou e por quê

LGPD art. 37: hoje ninguém sabe QUEM mudou nome, e-mail ou telefone de um contato, nem QUANDO (nem o admin).

- `supabase/migrations/20261014011104_contact_audit_log.sql` (NOVO):
  - `public.contact_audit_log` append-only, `contact_id` SEM FK de propósito (a purga não pode apagar a trilha — mesma decisão de `contact_deletion_audit`): `action`, `old_values`/`new_values` jsonb, `changed_fields` text[], `changed_by` = `auth.uid()`, `changed_by_profile` = `profiles.id`, `changed_by_db_role` = `session_user`, `changed_at`; 3 CHECKs de forma (action válida; insert↔old NULL / update↔os dois / delete↔new NULL; lista de campos não vazia).
  - Trigger `AFTER INSERT OR UPDATE OR DELETE` em `public.contacts` → `public.audit_contact_change()` SECURITY DEFINER com `SET search_path = pg_catalog, public`; só grava quando um campo AUDITADO muda de fato (`IS DISTINCT FROM`), então reescrever a mesma linha não polui a trilha.
  - Campos auditados: name, nickname, surname, job_title, company, contact_type, assigned_to, queue_id, conversation_status. `tags` ficam FORA, e `deleted_at`/endereço/coordenadas também (já têm trilha própria: 20260930170000 e 20260929150000) — sem duplicar eixo.
  - PII (telefone/e-mail/observações): o valor NUNCA é gravado. A trilha diz QUE o campo mudou (`changed_fields`) e guarda o marcador `'[redigido]'`; o CHECK `contact_audit_log_pii_redigido_check` recusa qualquer outro conteúdo nessas chaves, inclusive de escrita futura (o valor cru só existe dentro da função, para detectar a mudança).
  - RLS ligada + `REVOKE ALL` de PUBLIC/anon/authenticated/service_role; `GRANT SELECT` para authenticated e `SELECT, INSERT` para service_role — sem UPDATE/DELETE: ninguém apaga a trilha. Escrita direta pela API é negada (ACL + policies `false` de defesa em profundidade); só o trigger escreve.
  - Leitura: `public.is_admin_or_supervisor(auth.uid()) OR public.is_contact_visible_to_user(contact_id, auth.uid())` — o MESMO predicado da policy de SELECT de `public.contacts` (regra não duplicada, nenhum acesso novo a contato). O braço do admin é separado porque o helper de visibilidade só responde para contato que AINDA existe; sem ele a trilha de um contato purgado ficaria invisível para todos — achado da minha própria prova (ver vermelho 2).
- `src/integrations/supabase/types.ts`: bloco `contact_audit_log` (Row/Insert/Update, `Relationships: []`), em ordem alfabética, sem editar entrada existente.
- `scripts/db-audit/contacts-soft-delete-and-status.test.sh`: 30 asserções novas — RLS ligada; trigger por linha em INSERT/UPDATE/DELETE (tgtype 29); ACL papel por papel (anon sem nada, authenticated só SELECT, service_role sem UPDATE/DELETE, PUBLIC sem privilégio); INSERT/UPDATE/DELETE com de/para e autor; telefone trocado só como `[redigido]` (posição do número no jsonb = 0); UPDATE sem mudança auditada não gera linha; soft-delete não entra nesta trilha; contato purgado com trilha sobrevivente; leitura como authenticated dono, admin, sem vínculo, anon e service_role; os 3 CHECKs recusando linha forjada; idempotência (sem tabela/trigger/CHECK duplicado) e o **Rollback do cabeçalho rodando de verdade**. A dependência `is_contact_visible_to_user` é extraída BYTE A BYTE do arquivo real (mesmo mecanismo do bloco de Rollback), não recriada à mão. Estendi um `.test.sh` já ligado ao `db-guard.yml` de propósito: `.test.sh` novo ficaria órfão no `check-test-inventory.mjs`, e o workflow não é arquivo deste cartão.

## Prova (vermelho → verde)

- vermelho 1, sem a migration: `bash scripts/db-audit/contacts-soft-delete-and-status.test.sh` → `...: line 67: .../20261014011104_contact_audit_log.sql: No such file or directory` / `EXIT_VERMELHO=1`.
- vermelho 2, com a migration e a policy de um braço só: `[FAIL] auditoria RLS: admin ve a trilha de qualquer contato: esperado 'true|true', obtido 'true|false'` → revelou a trilha do contato purgado invisível; corrigi a policy e o cabeçalho.
- verde: a suíte acima, `EXIT=0` (linha de resumo na seção Verificação).

## Juiz barato (avisos e por que não procedem)

- "código alterado sem nenhum teste novo/alterado": aponta `src/integrations/supabase/types.ts` (tipagem do schema, arquivo citado pelo cartão). O teste é a suíte de banco ALTERADA neste mesmo commit, com prova vermelho→verde acima.
- "diff não traz evidência de zapp-verify --rapido verde": a saída está na seção Verificação, gerada neste workspace depois do commit.

## Efeitos colaterais conferidos

Nenhum GRANT, papel, coluna, policy ou função existente de `public.contacts` foi tocado — a migration é aditiva e idempotente. O trigger é AFTER, retorna NULL e grava na MESMA transação (falha = nada aplicado). Sem oráculo: só o autor com acesso ao contato (ou admin) lê as linhas. Rollback executável testado, não só declarado.

## O que NÃO fiz e por quê

- Não estendi a trilha a `tags`, `deleted_at`, endereço/coordenadas: cada um tem trilha própria.
- Não mexi em `supabase/schema-manifest.json` nem `docs/DB-INVENTORY.md`: fora dos arquivos do cartão, atualizados pelo fluxo do catálogo.
- Não criei o painel de auditoria nem RPC de listagem (camada de tela): entrego tabela + trigger + RLS.
