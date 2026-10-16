-- contact_tags_atomic
-- Rollback: dropa as duas RPCs novas; nenhuma tabela, coluna, gatilho ou ACL existente é tocada.
-- Rollback (SQL executável, na ordem):
--   revoke all on function public.add_contact_tag(uuid, text) from public, anon, authenticated, service_role;
--   drop function if exists public.add_contact_tag(uuid, text);
--   revoke all on function public.remove_contact_tag(uuid, text) from public, anon, authenticated, service_role;
--   drop function if exists public.remove_contact_tag(uuid, text);
--
-- Item de contatos / tags atômicas — defeito: `useContactQuickActions.writeTags` e
-- `contact-bulk.service` fazem leitura-depois-escrita em `contacts.tags` no cliente
-- (SELECT tags -> monta array -> UPDATE tags). Duas sessões que leem o mesmo estado e
-- escrevem de volta perdem uma das mudanças (lost update), e nada garante idempotência:
-- a mesma tag entra duas vezes se a comparação falha. Além disso o PostgREST não tem
-- como auditar a mudança por tag.
-- Correção: RPCs SECURITY DEFINER que fazem a leitura-escrita DENTRO de um único UPDATE
-- (a linha é travada e o array é relido na versão mais nova sob READ COMMITTED — sem
-- lost update), com idempotência por comparação sem diferenciar caixa, normalização
-- (btrim, teto de 40 caracteres, recusa de vazio), autorização pela MESMA régua do
-- contato (`require_contact_edit_permission`) e trilha em `audit_logs` sem dado pessoal.
-- Convenção de caixa: igual à do repositório (`src/lib/tags.ts` -> `normalizeTag` = trim;
-- `useContactQuickActions.hasTag` compara sem diferenciar caixa) — NÃO rebaixo a caixa
-- gravada (preserva 'VIP', 'Bloqueado' e 'wa:<id>:<Nome>'), rebaixo só na COMPARAÇÃO de
-- idempotência. A tag de WhatsApp continua com a RPC própria (`add_wa_tag_if_not_exists`).
--
-- Sem BEGIN/COMMIT: o gateway aplica a migration numa única transação; qualquer erro desfaz tudo.

-- 1) Adiciona uma tag ao contato. Idempotente: se a tag (sem diferenciar caixa) já existe,
--    não duplica, não altera `updated_at` e não gera auditoria.
CREATE OR REPLACE FUNCTION public.add_contact_tag(p_contact_id uuid, p_tag text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tag  text;
  v_tags text[];
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  -- Mesma régua de autorização das demais RPCs de contato: recusa contato inexistente
  -- e contato que o usuário não pode editar, sempre com o MESMO erro (42501).
  PERFORM public.require_contact_edit_permission(p_contact_id);

  v_tag := btrim(COALESCE(p_tag, ''));
  IF v_tag = '' THEN
    RAISE EXCEPTION 'contact_tag_empty' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_tag) > 40 THEN
    RAISE EXCEPTION 'contact_tag_too_long' USING ERRCODE = '22023';
  END IF;

  -- Leitura-escrita atômica: o append e o teste de idempotência rodam na MESMA sentença.
  -- Sob READ COMMITTED, se outra transação já tocou a linha, o Postgres reavalia a
  -- condição e o SET sobre a versão mais nova — os dois appends sobrevivem e a
  -- comparação de idempotência enxerga o valor recém-gravado.
  UPDATE public.contacts AS c
     SET tags = COALESCE(c.tags, '{}'::text[]) || ARRAY[v_tag],
         updated_at = now()
   WHERE c.id = p_contact_id
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(COALESCE(c.tags, '{}'::text[])) AS t(existing)
       WHERE lower(t.existing) = lower(v_tag)
     )
  RETURNING c.tags INTO v_tags;

  IF v_tags IS NULL THEN
    -- Nada foi atualizado: a tag já estava lá (idempotente). Devolve o estado atual.
    SELECT COALESCE(c.tags, '{}'::text[]) INTO v_tags
    FROM public.contacts AS c
    WHERE c.id = p_contact_id;
    RETURN v_tags;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, details)
  VALUES (
    'contact_tag_added', 'contact', p_contact_id, auth.uid(),
    jsonb_build_object('tag', v_tag)
  );

  RETURN v_tags;
END;
$$;

-- 2) Remove uma tag do contato (todas as variantes de caixa). Idempotente: se não existe,
--    nada muda e não gera auditoria.
CREATE OR REPLACE FUNCTION public.remove_contact_tag(p_contact_id uuid, p_tag text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tag  text;
  v_tags text[];
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_contact_edit_permission(p_contact_id);

  v_tag := btrim(COALESCE(p_tag, ''));
  IF v_tag = '' THEN
    RAISE EXCEPTION 'contact_tag_empty' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_tag) > 40 THEN
    RAISE EXCEPTION 'contact_tag_too_long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contacts AS c
     SET tags = ARRAY(
           SELECT t.existing
           FROM unnest(COALESCE(c.tags, '{}'::text[])) AS t(existing)
           WHERE lower(t.existing) <> lower(v_tag)
         ),
         updated_at = now()
   WHERE c.id = p_contact_id
     AND EXISTS (
       SELECT 1
       FROM unnest(COALESCE(c.tags, '{}'::text[])) AS t(existing)
       WHERE lower(t.existing) = lower(v_tag)
     )
  RETURNING c.tags INTO v_tags;

  IF v_tags IS NULL THEN
    SELECT COALESCE(c.tags, '{}'::text[]) INTO v_tags
    FROM public.contacts AS c
    WHERE c.id = p_contact_id;
    RETURN v_tags;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, details)
  VALUES (
    'contact_tag_removed', 'contact', p_contact_id, auth.uid(),
    jsonb_build_object('tag', v_tag)
  );

  RETURN v_tags;
END;
$$;

-- 3) ACL mínima: nada para PUBLIC/anon; EXECUTE só para quem pode editar contato.
REVOKE ALL ON FUNCTION public.add_contact_tag(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_contact_tag(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.remove_contact_tag(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_contact_tag(uuid, text) TO authenticated, service_role;
