-- ct091_contact_protection_policy
-- Rollback: desfaz a RPC e a tabela nova de politica de protecao de contatos, na ordem inversa.
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.get_my_protection_policy();
--   DROP TABLE IF EXISTS public.contact_protection_policy;
--
-- CT-091 (plano CONTATOS_POR_JORNADA, bloco "Protecao dos dados", depende de 085).
-- A protecao de contatos (bloquear copia, bloquear impressao, marca d'agua,
-- mascarar contato, limite de fichas por hora) deixa de ser decisao do navegador
-- e passa a ser regra do sistema, vinda do banco.
--
-- ESCOPO: o plano pede "organizacao/papel". Este schema NAO tem modelo de
-- organizacao (nao existe tabela public.organizations — conferido no catalogo);
-- o unico eixo de escopo que existe e o papel (public.app_role: admin,
-- supervisor, agent). Entao o escopo aqui e por PAPEL, com uma linha de escopo
-- global (scope_role IS NULL) como padrao do sistema. Nao invento uma coluna de
-- organizacao sem tabela que a sustente.
--
-- PADRAO = tudo ligado: sem nenhuma linha, get_my_protection_policy() devolve
-- bloquear_copia/impressao = true, marca_dagua = true, mascarar_contato = true e
-- limite_fichas_hora = 100. A migration semeia a linha global exatamente com esses
-- valores; a funcao ainda aplica o mesmo COALESCE(..., true) como rede de seguranca.
--
-- SO ADMINISTRADOR ALTERA: quatro policies com public.has_role(auth.uid(), 'admin') (uma por
-- comando, sem FOR ALL) e leitura tambem restrita ao admin. has_role e SECURITY DEFINER com
-- search_path fixo (helper do repo, ja usado por 14 migrations). Os demais papeis leem a
-- politica efetiva pela RPC get_my_protection_policy() (SECURITY DEFINER), nunca pela
-- tabela crua.
--
-- Não logamos IP, telefone nem dado de contato aqui: e configuracao de sistema.

CREATE TABLE IF NOT EXISTS public.contact_protection_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_role public.app_role,
  bloquear_copia boolean NOT NULL DEFAULT true,
  bloquear_impressao boolean NOT NULL DEFAULT true,
  marca_dagua boolean NOT NULL DEFAULT true,
  mascarar_contato boolean NOT NULL DEFAULT true,
  limite_fichas_hora integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_protection_policy_limite_check CHECK (limite_fichas_hora >= 0)
);

COMMENT ON TABLE public.contact_protection_policy IS
  'CT-091: politica de protecao de contatos. scope_role NULL = padrao global; linha por papel sobrepoe. Só o admin altera.';
COMMENT ON COLUMN public.contact_protection_policy.scope_role IS
  'Papel ao qual a politica se aplica (app_role). NULL = politica global (padrao do sistema).';
COMMENT ON COLUMN public.contact_protection_policy.limite_fichas_hora IS
  'Maximo de fichas de contato que o usuario pode abrir por hora (0 = sem fichas).';

-- Uma unica linha por escopo; NULLS NOT DISTINCT faz o escopo global ser unico.
CREATE UNIQUE INDEX IF NOT EXISTS contact_protection_policy_scope_role_uidx
  ON public.contact_protection_policy (scope_role) NULLS NOT DISTINCT;

-- Padrao do sistema: linha global com tudo ligado. Idempotente (nao duplica).
INSERT INTO public.contact_protection_policy (scope_role)
SELECT NULL::public.app_role
WHERE NOT EXISTS (
  SELECT 1 FROM public.contact_protection_policy WHERE scope_role IS NULL
);

ALTER TABLE public.contact_protection_policy ENABLE ROW LEVEL SECURITY;

-- Ninguem anonimo, nem PUBLIC, le ou escreve a tabela crua (a RPC e SECURITY DEFINER).
REVOKE ALL ON TABLE public.contact_protection_policy FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contact_protection_policy
  TO authenticated, service_role;

-- Uma policy por comando (sem FOR ALL) — todas exigem admin.
DROP POLICY IF EXISTS "Admins can view contact protection policy" ON public.contact_protection_policy;
CREATE POLICY "Admins can view contact protection policy"
  ON public.contact_protection_policy FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert contact protection policy" ON public.contact_protection_policy;
CREATE POLICY "Admins can insert contact protection policy"
  ON public.contact_protection_policy FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update contact protection policy" ON public.contact_protection_policy;
CREATE POLICY "Admins can update contact protection policy"
  ON public.contact_protection_policy FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete contact protection policy" ON public.contact_protection_policy;
CREATE POLICY "Admins can delete contact protection policy"
  ON public.contact_protection_policy FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Politica efetiva do usuario logado: linha do seu papel, senao a linha global,
-- senao o padrao embutido (tudo ligado). Sem argumento — le auth.uid().
CREATE OR REPLACE FUNCTION public.get_my_protection_policy()
RETURNS TABLE (
  bloquear_copia boolean,
  bloquear_impressao boolean,
  marca_dagua boolean,
  mascarar_contato boolean,
  limite_fichas_hora integer,
  origem text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'get_my_protection_policy: usuario nao autenticado'
      USING ERRCODE = '42501';
  END IF;

  -- Papel do usuario; com mais de um papel vale o de maior privilegio (ordem do enum).
  SELECT ur.role INTO v_role
    FROM public.user_roles ur
   WHERE ur.user_id = v_uid
   ORDER BY ur.role
   LIMIT 1;

  RETURN QUERY
  SELECT COALESCE(rp.bloquear_copia,     gp.bloquear_copia,     true),
         COALESCE(rp.bloquear_impressao, gp.bloquear_impressao, true),
         COALESCE(rp.marca_dagua,        gp.marca_dagua,        true),
         COALESCE(rp.mascarar_contato,   gp.mascarar_contato,   true),
         COALESCE(rp.limite_fichas_hora, gp.limite_fichas_hora, 100),
         CASE WHEN rp.id IS NOT NULL THEN 'papel'
              WHEN gp.id IS NOT NULL THEN 'global'
              ELSE 'padrao' END
    FROM (SELECT 1) AS d
    LEFT JOIN public.contact_protection_policy rp ON rp.scope_role = v_role
    LEFT JOIN public.contact_protection_policy gp ON gp.scope_role IS NULL;
END
$$;

COMMENT ON FUNCTION public.get_my_protection_policy() IS
  'CT-091: devolve a politica de protecao de contatos efetiva do usuario logado (papel > global > padrao).';

REVOKE ALL ON FUNCTION public.get_my_protection_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_protection_policy() TO authenticated, service_role;
