Especialista: worker (testes) (area-testes-do-produto)

# Recon (leitura apenas): assinatura, tabela, coluna de versao e version_number do RPC save_talkx_template

Cartao t_6bbf43c6. Nenhum arquivo de codigo/migration tocado; unico arquivo alterado e este relato.

## Fontes usadas
- Fonte primaria (card t_a3551220): a migration `supabase/migrations/20261011000012_talkx_template_save_rpc.sql`, lida via `git show 34ee3b9485:...` (mesmo conteudo de `9fe8ad8743`).
- ATENCAO (bloqueio de integracao, nao de recon): essa migration NAO esta na base `dia/2026-10-13`. Comprovado:
  - `git cat-file -e dia/2026-10-13:supabase/migrations/20261011000012_talkx_template_save_rpc.sql` -> nao existe.
  - varredura de TODOS os refs locais: so `v2/talkx-salvar-template-rpc-26101009316dde` contem o arquivo.
  - migration mais nova em `dia/2026-10-13` = `20261009000118_revoke_whatsapp_connections_anon_grants.sql`.
  - `git grep save_talkx_template dia/2026-10-13` so acha docs/plano, nunca SQL.
  Ou seja: o teste da t_c745d776 so passa com a migration aplicada no banco local (a propria prova red->green do cartao ja assume isso).
- Fonte 3 (schema do banco): o banco local NAO estava de pe neste host (`pg_isready` -> `/var/run/postgresql:5432 - no response`). Em vez de subir stack (caro), confirmei o schema pelas migrations canonicas da base:
  - `supabase/migrations/20260909130000_talkx_template_versions_custom_variables.sql:9` -> `CREATE TABLE IF NOT EXISTS public.talkx_template_versions`
  - `supabase/migrations/20260909210000_canonicalize_talkx_template_history.sql:201-217` -> colunas + `version_number integer NOT NULL` + `UNIQUE (template_id, version_number)`.

## BLOCO DE FATOS CORPORIVEIS (pronto para o proximo worker)

(1) Assinatura literal da funcao (fonte: migration 20261011000012, trecho `CREATE OR REPLACE FUNCTION public.save_talkx_template(...)`):
```
public.save_talkx_template(
  p_template_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_content text,
  p_category text,
  p_status text,
  p_media_url text,
  p_media_type text,
  p_tags text[],
  p_custom_variables text[],
  p_note text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
```
Assinatura para GRANT/REVOKE (mesma ordem):
`save_talkx_template(uuid, timestamptz, text, text, text, text, text, text, text[], text[], text)`

(2) Tabela alvo:
- Linha viva (UPDATE): `public.talkx_templates`
- Historico/versao (INSERT do snapshot ANTERIOR + a nota): `public.talkx_template_versions`

(3) Coluna de versoes: `public.talkx_template_versions.version_number` (integer, NOT NULL; UNIQUE (template_id, version_number)). Coluna de nota adicionada pela migration: `talkx_template_versions.note` (text).

(4) Expressao exata que produz `version_number` (dentro da RPC, antes do INSERT do historico):
```sql
SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
FROM public.talkx_template_versions
WHERE template_id = p_template_id;
```
A RPC retorna `v_version_id` (uuid da linha de historico criada).

## Fatos extras uteis ao teste (todos da mesma migration)
- Retorno: `uuid` = id da versao de historico criada (`RETURNING id INTO v_version_id`).
- Ordem: INSERT no historico com o estado ANTERIOR (`v_template.*`) + `note`; depois UPDATE da linha viva (`updated_at = now()`). `v_saved_at := statement_timestamp()`.
- Optimistic locking: `SELECT * INTO v_template ... WHERE id = p_template_id FOR UPDATE`.
  - nao achou -> `RAISE EXCEPTION 'talkx_template_not_found' USING ERRCODE = 'P0002'`
  - `v_template.updated_at IS DISTINCT FROM p_expected_updated_at` -> `RAISE EXCEPTION 'optimistic_lock_failed' USING ERRCODE = '40001'`
- Auth: `auth.role() <> 'authenticated'` ou `auth.uid() IS NULL` -> `'authentication_required'` ERRCODE `42501`; `get_profile_id_for_user(auth.uid())` NULL -> `'authenticated_profile_not_found'` ERRCODE `42501`.
- ACL: `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role`.
- Requisito do guard canonico (20260909210000): a linha de historico precisa ter `created_at = statement_timestamp()`, `saved_by = public.get_profile_id_for_user(auth.uid())` e colunas iguais a OLD, senao `guard_talkx_template_update` recusa (42501). A RPC atende por construcao — o teste pode usar isso como caso de negacao.

## O que NAO fiz e por que
- Nao editei nenhum arquivo de codigo/migration (o cartao manda leitura apenas). O unico arquivo alterado neste commit e o proprio `.tmp/relato.md` (rastreado no repo; o fechar exige arvore limpa).
- Nao subi o stack local nem rodei `psql` (banco local fora do ar; fonte 3 coberta pelas migrations canonicas, citadas acima com arquivo:linha). Nao ha verificacao de banco a colar aqui alem do schema lido.
- Nada foi enviado a lugar nenhum; nenhum dado real usado.
