-- f35_multiplix_audiences
-- versão 20261001261230 reservada para hermes-bloco-c-multiplix-enums-fila-eventos-aud-26100120014cfb em 2026-10-01T20:36:28-03:00 (hermes-db-migrar --nova)

-- rollback: DROP TABLE IF EXISTS public.multiplix_audience_members;
-- rollback: DROP TABLE IF EXISTS public.multiplix_audiences;
-- rollback: DROP FUNCTION IF EXISTS public.multiplix_audiences_validate_shared_roles();
-- F35 · Multiplix — publicos (audiencias) do modelo de dados v2 (bloco C do plano
-- docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md, linha 71).
-- DDL de classe contrato: cria `multiplix_audiences` + `multiplix_audience_members`
-- e o contrato de acesso (RLS) das duas. Nenhuma linha existe antes; nada de backfill.
--
-- DECISOES MEDIDAS NO REPO (nao assumidas):
--  1. `kind` e TEXT + CHECK ('rule','static_list'), NAO enum. O F30 (medido em
--     supabase/migrations/20261001201230_f30_multiplix_enums_modelo_v2.sql) cria 5 tipos e
--     nao enumera `kind` — criar um enum aqui seria um 6o tipo fora do F30. A distincao
--     regra dinamica x lista estatica e o proprio CHECK.
--  2. `owner_id` e o `profiles.id`, NAO `auth.uid()`. Medido: as RLS do modulo comparam
--     `created_by = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)`
--     (20260929580000_multiplix_policies_consolidation.sql:41), nao `= auth.uid()`.
--     `owner_id` fica NULLABLE, espelhando `multiplix_dispatches.created_by` (v1). RESSALVA:
--     linha com owner_id NULL e sem papel compartilhado e inalcancavel por qualquer policy
--     de leitura (nao e brecha, e lixo); o F31 torna `created_by` NOT NULL no mesmo bloco.
--  3. `shared_with_roles` casa por PAPEL, com `has_role(auth.uid(), <role>::public.app_role)`.
--     Assinatura REAL, medida no banco e no repo:
--     `public.has_role(_user_id uuid, _role app_role)` (supabase/migrations/
--     20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql:17). Nao se usa
--     `user_has_permission` aqui: a convencao do modulo/repo e `has_role`
--     (26 migrations usam has_role, 4 usam has_permission) e o dono decidiu literalmente.
--  4. Catalogo de `app_role` MEDIDO no banco canonico (tnnnlkbymytvtqngbbqh):
--     admin, supervisor, agent, special_agent (4 valores — nao 3). O trigger abaixo le
--     `enum_range(NULL::public.app_role)`, entao acompanha o catalogo sozinho.
--  5. RLS (decisao do dono, aplicada literalmente):
--       LEITURA  = dono  OU  quem tem um papel de `shared_with_roles` (visibilidade).
--       ESCRITA  = dono E staff (`is_admin_or_supervisor(auth.uid())`), espelhando o modulo
--                  (20260929580000 linhas 44-74: INSERT/UPDATE/DELETE de dispatches exigem
--                  staff E criador). Compartilhar e mecanismo de LEITURA — quem so tem o
--                  papel compartilhado nao ganha poder de escrita, coerente com o F20
--                  ("staff escreve so no proprio").
--  6. F20 estendido (F01/F02 de 20260929570000_multiplix_hardening_grants_rls_blocks.sql):
--     anon sem grant, authenticated sem TRUNCATE/REFERENCES/TRIGGER, FORCE ROW LEVEL SECURITY.
--     A parte de TESTE do F20 (`scripts/db-audit/multiplix-rls.test.sh`) nao vive numa
--     migration — ver relatorio.
--  7. Valor fora do catalogo em `shared_with_roles` (ex.: 'Admin') falharia em silencio (nunca
--     casaria um papel). CHECK nao aceita subquery, entao a validacao e por TRIGGER, cobrindo
--     INSERT e UPDATE, contra `enum_range(NULL::public.app_role)`. Com o trigger, o cast
--     `role_name::public.app_role` dentro das policies nao pode falhar em dado armazenado.
--
-- Sem `begin;`/`commit;` (a prova e a aplicacao embrulham a transacao).

-- ============ 1. tabela de publicos ============

CREATE TABLE public.multiplix_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL
    CONSTRAINT multiplix_audiences_kind_check CHECK (kind IN ('rule', 'static_list')),
  -- a regra cuando kind='rule'; para static_list fica '{}' e os alvos vivem em members
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- = public.profiles.id (ver decisao 2)
  owner_id uuid,
  shared_with_roles text[] NOT NULL DEFAULT '{}',
  last_used_at timestamp with time zone,
  cached_count integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_multiplix_audiences_owner_id ON public.multiplix_audiences(owner_id);

-- ============ 2. tabela de membros (lista estatica) ============

CREATE TABLE public.multiplix_audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid NOT NULL
    REFERENCES public.multiplix_audiences(id) ON DELETE CASCADE,
  -- empresa/contato do Singu (banco externo, sem FK — mesmo padrao de modules que apontam
  -- para o Singu por uuid solto, ex.: multiplix_recipients.company_id)
  singu_company_id uuid,
  singu_contact_id uuid,
  added_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_multiplix_audience_members_audience_id
  ON public.multiplix_audience_members(audience_id);

-- ============ 3. trigger: valida shared_with_roles contra o catalogo app_role ============
-- O CHECK de coluna nao aceita subquery; o catalogo vive em pg_enum, nao em tabela. Entao a
-- validacao e um trigger BEFORE INSERT OR UPDATE (cobre os dois, sem filtro de coluna, para
-- pegar qualquer caminho que escreva o array).

CREATE OR REPLACE FUNCTION public.multiplix_audiences_validate_shared_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  invalido text;
BEGIN
  IF NEW.shared_with_roles IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.role_name
    INTO invalido
    FROM unnest(NEW.shared_with_roles) AS s(role_name)
   WHERE NOT EXISTS (
           SELECT 1
             FROM unnest(enum_range(NULL::public.app_role)) AS v(role_enum)
            WHERE v.role_enum::text = s.role_name
         )
   LIMIT 1;

  IF invalido IS NOT NULL THEN
    RAISE EXCEPTION
      'multiplix_audiences.shared_with_roles: papel "%" fora do catalogo app_role. Validos: %',
      invalido,
      (SELECT string_agg(v.role_enum::text, ', ' ORDER BY v.role_enum::text)
         FROM unnest(enum_range(NULL::public.app_role)) AS v(role_enum))
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_multiplix_audiences_validate_shared_roles
  ON public.multiplix_audiences;
CREATE TRIGGER trg_multiplix_audiences_validate_shared_roles
  BEFORE INSERT OR UPDATE ON public.multiplix_audiences
  FOR EACH ROW
  EXECUTE FUNCTION public.multiplix_audiences_validate_shared_roles();

DROP TRIGGER IF EXISTS update_multiplix_audiences_updated_at
  ON public.multiplix_audiences;
CREATE TRIGGER update_multiplix_audiences_updated_at
  BEFORE UPDATE ON public.multiplix_audiences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 4. grants + FORCE RLS (F20 -> F01/F02) ============
-- No Supabase as tabelas novas nascem com default privilege para anon e authenticated.
-- anon nao usa o modulo; TRUNCATE/REFERENCES/TRIGGER nao tem caso de uso e TRUNCATE nao
-- passa por RLS. authenticated fica com o minimo que as policies usam.
REVOKE ALL ON TABLE public.multiplix_audiences FROM anon;
REVOKE ALL ON TABLE public.multiplix_audience_members FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_audiences FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_audience_members FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_audiences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_audience_members TO authenticated;

ALTER TABLE public.multiplix_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_audiences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_audience_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.multiplix_audience_members FORCE ROW LEVEL SECURITY;

-- ============ 5. policies: multiplix_audiences ============
-- Leitura: dono OU papel compartilhado. Escrita: dono E staff (ver decisao 5).

DROP POLICY IF EXISTS "Users can view own or shared audiences" ON public.multiplix_audiences;
CREATE POLICY "Users can view own or shared audiences" ON public.multiplix_audiences
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1
        FROM unnest(multiplix_audiences.shared_with_roles) AS shared(role_name)
       WHERE public.has_role(auth.uid(), shared.role_name::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Users can create audiences" ON public.multiplix_audiences;
CREATE POLICY "Users can create audiences" ON public.multiplix_audiences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "Users can update own audiences" ON public.multiplix_audiences;
CREATE POLICY "Users can update own audiences" ON public.multiplix_audiences
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS "Users can delete own audiences" ON public.multiplix_audiences;
CREATE POLICY "Users can delete own audiences" ON public.multiplix_audiences
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  );

-- ============ 6. policies: multiplix_audience_members ============
-- O acesso aos membros e herdado do publico pai (mesma regra, via EXISTS).

DROP POLICY IF EXISTS "Users can view members of accessible audiences" ON public.multiplix_audience_members;
CREATE POLICY "Users can view members of accessible audiences" ON public.multiplix_audience_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.multiplix_audiences ma
       WHERE ma.id = multiplix_audience_members.audience_id
         AND (
           ma.owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
           OR EXISTS (
             SELECT 1
               FROM unnest(ma.shared_with_roles) AS shared(role_name)
              WHERE public.has_role(auth.uid(), shared.role_name::public.app_role)
           )
         )
    )
  );

DROP POLICY IF EXISTS "Users can insert members into own audiences" ON public.multiplix_audience_members;
CREATE POLICY "Users can insert members into own audiences" ON public.multiplix_audience_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.multiplix_audiences ma
       WHERE ma.id = multiplix_audience_members.audience_id
         AND ma.owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Users can update members of own audiences" ON public.multiplix_audience_members;
CREATE POLICY "Users can update members of own audiences" ON public.multiplix_audience_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.multiplix_audiences ma
       WHERE ma.id = multiplix_audience_members.audience_id
         AND ma.owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  )
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.multiplix_audiences ma
       WHERE ma.id = multiplix_audience_members.audience_id
         AND ma.owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Users can delete members of own audiences" ON public.multiplix_audience_members;
CREATE POLICY "Users can delete members of own audiences" ON public.multiplix_audience_members
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.multiplix_audiences ma
       WHERE ma.id = multiplix_audience_members.audience_id
         AND ma.owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
    )
  );
