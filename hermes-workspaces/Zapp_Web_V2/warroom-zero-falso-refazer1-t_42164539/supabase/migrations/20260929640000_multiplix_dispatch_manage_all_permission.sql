-- 20260929640000_multiplix_dispatch_manage_all_permission
-- Bloco A (F06) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
--
-- A edge multiplix-send autoriza start/pause/cancel por papel (admin OU
-- supervisor) sem olhar de quem e o disparo: qualquer staff inicia, pausa ou
-- cancela o disparo do colega (achado 6). A correcao combina duas coisas:
--   1. dono do disparo (created_by = profile do JWT) sempre pode operar;
--   2. quem NAO e dono precisa da permissao nomeada `multiplix.dispatch.manage_all`
--      — atribuida a admin, que passa a ser o unico papel com poder de operar
--      disparo alheio.
-- O service-role/cron seguem sem restricao (nao passam por este caminho).
--
-- A permissao entra no catalogo junto com a atribuicao a admin, no mesmo passo:
-- sem a linha em role_permissions a edge negaria 403 tambem para admin, o que
-- trocaria um IDOR por um modulo travado.

INSERT INTO public.permissions (name, description, category) VALUES
  ('multiplix.dispatch.manage_all', 'Multiplix: iniciar/pausar/cancelar disparo de outro operador', 'multiplix')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, permission.id
  FROM public.permissions AS permission
 WHERE permission.name = 'multiplix.dispatch.manage_all'
   AND NOT EXISTS (
     SELECT 1 FROM public.role_permissions AS existing
      WHERE existing.role = 'admin'::public.app_role
        AND existing.permission_id = permission.id
   );
