Especialista: worker (sql) (area-sql-banco)

Cartao de extracao READ-ONLY: nenhum arquivo de codigo criado ou alterado.

FONTE LITERAL
- Arquivo real: supabase/migrations/20261011000012_talkx_template_save_rpc.sql
  (o nome citado no cartao, 20261010XXXXXX_..., e mascara; o real e esse).
- Origem: cartao t_a3551220, branch v2/talkx-salvar-template-rpc-26101009316dde.
- ATENCAO: esse arquivo AINDA NAO esta na base dia/2026-10-13 (branch nao integrada).
  `grep save_talkx_template` em supabase/migrations da base atual retorna 0.
  Leia pelo commit: git show 9fe8ad8743:supabase/migrations/20261011000012_talkx_template_save_rpc.sql

1) ASSINATURA LITERAL DA FUNCAO
CREATE OR REPLACE FUNCTION public.save_talkx_template(
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
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp

Ordem POSICIONAL dos 11 argumentos (para chamada por posicao):
  1 p_template_id uuid
  2 p_expected_updated_at timestamptz
  3 p_name text
  4 p_content text
  5 p_category text
  6 p_status text
  7 p_media_url text
  8 p_media_type text
  9 p_tags text[]
 10 p_custom_variables text[]
 11 p_note text
Retorna: uuid = id da versao de historico criada (talkx_template_versions.id).

2) CONTRATO DE ACL (exatamente como a migration faz)
REVOKE ALL ON FUNCTION public.save_talkx_template(
  uuid, timestamptz, text, text, text, text, text, text, text[], text[], text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_talkx_template(
  uuid, timestamptz, text, text, text, text, text, text, text[], text[], text
) TO authenticated, service_role;

3) VERSAO GRAVADA (o que o teste de t_c745d776 deve conferir)
- Linha viva: public.talkx_templates (id = p_template_id). A funcao faz APENAS UPDATE
  nessa tabela; nunca INSERT.
- Historico: public.talkx_template_versions.
- Coluna do numero da versao: version_number (integer).
- Expressao literal do numero:
    SELECT COALESCE(MAX(version_number), 0) + 1
      FROM public.talkx_template_versions WHERE template_id = p_template_id;
  -> 1a gravacao = version_number 1; cada salvar seguinte = MAX + 1.
- A linha de historico e criada ANTES do UPDATE da linha viva e guarda o estado
  ANTERIOR (v_template.*) + a nota p_note; o conteudo novo vai para a linha viva.
- A nota vai em talkx_template_versions.note na versao criada.

4) OPTIMISTIC LOCKING (semantica literal, para o teste de concorrencia)
- SELECT * INTO v_template FROM public.talkx_templates WHERE id = p_template_id FOR UPDATE;
- Nao achou:  RAISE EXCEPTION 'talkx_template_not_found' USING ERRCODE = 'P0002';
- v_current_updated_at := v_template.updated_at;
- Divergiu:   IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at
                THEN RAISE EXCEPTION 'optimistic_lock_failed' USING ERRCODE = '40001';
  -> SQLSTATE 40001 (serialization_failure); nao e 409 nem texto livre.

5) DEMAIS ERROS / ESTADOS (literal)
- auth.role() <> 'authenticated' OU auth.uid() IS NULL
      -> 'authentication_required', ERRCODE 42501.
- get_profile_id_for_user(auth.uid()) IS NULL
      -> 'authenticated_profile_not_found', ERRCODE 42501.
- Sucesso: RETURN v_version_id (uuid da versao de historico).

6) COLUNA ADICIONADA PELA MIGRATION (afeta o INSERT do teste)
ALTER TABLE public.talkx_template_versions
  ADD COLUMN IF NOT EXISTS note text;
Rollback: drop function ... save_talkx_template(...); alter table ... drop column if exists note;

Colunas de talkx_template_versions no INSERT (ordem literal do arquivo):
  template_id, version_number, name, description, content, category, status,
  media_url, media_type, tags, custom_variables, saved_by, created_at, note
- saved_by = get_profile_id_for_user(auth.uid()) (ator autenticado)
- created_at = statement_timestamp()

7) PARA O CARTAO DE TESTE
- Historico guarda o estado anterior; o "salvo" fica na linha viva do template.
- O guard canonico guard_talkx_template_update exige historico batendo com OLD,
  created_at = statement_timestamp() e saved_by = get_profile_id_for_user(auth.uid());
  o teste deve rodar como authenticated real (nao postgres).

PROVA DA EXTRACAO
git show 9fe8ad8743:supabase/migrations/20261011000012_talkx_template_save_rpc.sql
(conteudo literal do arquivo; copiado sem alteracao). Nenhum arquivo de projeto escrito.
