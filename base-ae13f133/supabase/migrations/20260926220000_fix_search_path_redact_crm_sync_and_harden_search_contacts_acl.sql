-- Item 1: redact_crm_sync_on_contact_delete() falha em TODO delete de contato porque
-- digest() (pgcrypto) vive no schema `extensions` no self-hosted, fora do search_path da função.
ALTER FUNCTION public.redact_crm_sync_on_contact_delete()
  SET search_path TO 'public', 'extensions', 'pg_temp';

-- Item 2: consolida ACL de search_contacts independente da ordem de replay das duas
-- migrations duplicadas (20260926152000 vs 20260926160000, PR#862 vs PR#859).
-- Self-hosted Supabase usa ALTER DEFAULT PRIVILEGES que concede EXECUTE a `anon`
-- diretamente (não via PUBLIC), então REVOKE FROM PUBLIC sozinho não basta.
REVOKE EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,timestamptz,text,text,integer,integer)
  TO authenticated, service_role;
