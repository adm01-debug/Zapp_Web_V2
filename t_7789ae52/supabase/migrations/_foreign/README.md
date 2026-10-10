# `_foreign/` — migrations que NAO pertencem a este banco

**Criado em:** 27/08/2026
**Origem da decisao:** `docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md`, achado **A-05**

## O que e isto

Estes arquivos estavam em `supabase/migrations/` mas manipulam objetos que **nao existem**
no banco deste projeto (`tnnnlkbymytvtqngbbqh.supabase.co`). Eles pertencem ao
**Supabase self-hosted / Evolution** (`supabase.atomicabr.com.br`).

O diretorio comeca com `_`, entao o glob do `supabase db push` (`supabase/migrations/*.sql`)
nao os alcanca. Nenhum conteudo foi perdido.

## Prova de que sao estrangeiras

```sql
SELECT to_regclass('public.outbound_message_queue'),   -- NULL
       to_regclass('public.empresas'),                 -- NULL
       to_regclass('public.evolution_messages_wpp2'),  -- NULL
       to_regclass('public.evolution_webhook_events'); -- NULL
```

Re-executado em 27/08/2026: as quatro retornam `NULL` no destino.
O header de `20260611120000` diz explicitamente *"ja APLICADO no banco self-hosted
(supabase.atomicabr.com.br) em 11/06/2026"*.

## Por que isto era urgente

Um `supabase db push` com estes arquivos no caminho causaria dano real, nao apenas falha:

| Arquivo | Dano no destino |
|---|---|
| `20260612150000_audit_index_cleanup.sql` | `DROP INDEX idx_contacts_name_trgm` e `idx_contacts_company_trgm` — **ambos existem no destino** em `public.contacts`. Foram escritos para `evolution_contacts` do self-hosted; os nomes colidem. |
| `20260612120000_rate_limit_admin_criar_usuario.sql` | Cria `admin_criar_usuario_painel()` SECURITY DEFINER com `INSERT INTO auth.users`. O corpo plpgsql nao e validado no `CREATE`, entao a funcao seria criada mesmo com `perfis_usuarios` e `is_admin_painel()` inexistentes. Superficie de ataque nova. |
| `20260612141500_purge_processed_webhook_events_cron.sql` | `SELECT cron.unschedule('purge-processed-webhook-events')` em job inexistente -> excecao. |
| `20260612160000_fk_indexes_and_cleanup.sql` | `DROP INDEX` em `audio_memes` e `stickers`, tabelas que existem no destino. |
| `20260612110000_index_cleanup_and_autovacuum.sql` | `DROP INDEX CONCURRENTLY idx_email_threads_account` — existe no destino. |

## O que fazer com eles

Migrar para o repositorio do Supabase self-hosted / Evolution e apagar daqui.
**Nao apagar antes disso** — este e o unico lugar onde estao versionados.

## Arquivos

- `20260611120000_fix_media_security_file_size.sql`
- `20260612110000_index_cleanup_and_autovacuum.sql`
- `20260612120000_rate_limit_admin_criar_usuario.sql`
- `20260612140000_add_missing_performance_indexes.sql`
- `20260612141500_purge_processed_webhook_events_cron.sql`
- `20260612150000_audit_index_cleanup.sql`
- `20260612160000_fk_indexes_and_cleanup.sql`
