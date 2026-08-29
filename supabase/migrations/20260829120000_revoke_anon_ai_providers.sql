-- Revogar privileges desnecessarios de anon em ai_providers
-- TRUNCATE bypassa Row Level Security em PostgreSQL — vulnerabilidade real, nao apenas ma pratica.
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER nao tem uso legitimo por anon.
-- SELECT mantido para compatibilidade (RLS ja bloqueia via policy admin-only).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.ai_providers
  FROM anon;
