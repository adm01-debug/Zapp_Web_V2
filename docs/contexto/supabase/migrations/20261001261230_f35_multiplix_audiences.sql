CREATE TABLE public.multiplix_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL
    CONSTRAINT multiplix_audiences_kind_check CHECK (kind IN ('rule', 'static_list')),
    definition jsonb NOT NULL DEFAULT '{}'::jsonb,
    owner_id uuid,
  shared_with_roles text[] NOT NULL DEFAULT '{}',
  last_used_at timestamp with time zone,
  cached_count integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
)

CREATE INDEX idx_multiplix_audiences_owner_id ON public.multiplix_audiences(owner_id)

CREATE TABLE public.multiplix_audience_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id uuid NOT NULL
    REFERENCES public.multiplix_audiences(id) ON DELETE CASCADE,
      singu_company_id uuid,
  singu_contact_id uuid,
  added_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
)

CREATE INDEX idx_multiplix_audience_members_audience_id
  ON public.multiplix_audience_members(audience_id)

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
$$

DROP TRIGGER IF EXISTS trg_multiplix_audiences_validate_shared_roles
  ON public.multiplix_audiences

CREATE TRIGGER trg_multiplix_audiences_validate_shared_roles
  BEFORE INSERT OR UPDATE ON public.multiplix_audiences
  FOR EACH ROW
  EXECUTE FUNCTION public.multiplix_audiences_validate_shared_roles()

DROP TRIGGER IF EXISTS update_multiplix_audiences_updated_at
  ON public.multiplix_audiences

CREATE TRIGGER update_multiplix_audiences_updated_at
  BEFORE UPDATE ON public.multiplix_audiences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column()

REVOKE ALL ON TABLE public.multiplix_audiences FROM anon

REVOKE ALL ON TABLE public.multiplix_audience_members FROM anon

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_audiences FROM authenticated

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.multiplix_audience_members FROM authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_audiences TO authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.multiplix_audience_members TO authenticated

ALTER TABLE public.multiplix_audiences ENABLE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_audiences FORCE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_audience_members ENABLE ROW LEVEL SECURITY

ALTER TABLE public.multiplix_audience_members FORCE ROW LEVEL SECURITY

DROP POLICY IF EXISTS "Users can view own or shared audiences" ON public.multiplix_audiences

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
  )

DROP POLICY IF EXISTS "Users can create audiences" ON public.multiplix_audiences

CREATE POLICY "Users can create audiences" ON public.multiplix_audiences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )

DROP POLICY IF EXISTS "Users can update own audiences" ON public.multiplix_audiences

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
  )

DROP POLICY IF EXISTS "Users can delete own audiences" ON public.multiplix_audiences

CREATE POLICY "Users can delete own audiences" ON public.multiplix_audiences
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    AND owner_id = (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid() LIMIT 1)
  )

DROP POLICY IF EXISTS "Users can view members of accessible audiences" ON public.multiplix_audience_members

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
  )

DROP POLICY IF EXISTS "Users can insert members into own audiences" ON public.multiplix_audience_members

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
  )

DROP POLICY IF EXISTS "Users can update members of own audiences" ON public.multiplix_audience_members

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
  )

DROP POLICY IF EXISTS "Users can delete members of own audiences" ON public.multiplix_audience_members

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
  )
