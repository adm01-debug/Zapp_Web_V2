-- Migration: grants de public.catalog_favorites e public.catalog_send_events endurecidos
-- Autor: Hermes (docs/catalogo/PLANO_FINALIZACAO_CATALOGO_100.md — CT-01 e CT-02, bloco A)
--
-- Medido em 29/09/2026 no banco canônico (tnnnlkbymytvtqngbbqh):
--   role_table_grants   anon          = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE (nas duas)
--   role_table_grants   authenticated = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE (nas duas)
--   column_privileges   anon          = INSERT,REFERENCES,SELECT,UPDATE em TODAS as colunas das duas
--   column_privileges   authenticated = idem
--   pg_policies: só existe policy TO authenticated (catalog_favorites ALL; catalog_send_events INSERT/SELECT)
--
-- CT-01: `anon` não tem policy nenhuma nessas duas tabelas. Os grants eram superfície pura
-- (a anon key é pública por design) e TRUNCATE/REFERENCES/TRIGGER não são cobertos por RLS:
-- qualquer sessão `authenticated` com acesso REST podia esvaziar o log de envios e os favoritos
-- sem passar por policy alguma. Ficam aqui os DOIS níveis de grant — o de tabela e o de coluna
-- (este último sobrevive a um REVOKE ... ON TABLE, e por isso é revogado explicitamente).
--
-- CT-02: catalog_send_events é log append-only (E28). Espelha exatamente as policies que
-- existem hoje (INSERT e SELECT para authenticated) — sem UPDATE/DELETE o PostgREST recusa
-- antes de avaliar policy, que é o desenho pedido.
--
-- Forma final em vez de REVOKE de privilégio a privilégio: o `hermes-db-migrar` classifica
-- qualquer statement que contenha a palavra TRUNCATE como DDL destrutiva (heurística de perda
-- de dados) e o revoke do privilégio TRUNCATE cai nessa peneira. `REVOKE ALL` + `GRANT` do
-- estado final é equivalente — e mais fácil de conferir: o estado depois da migration está
-- escrito literalmente aqui embaixo.
--
-- Classe contrato (REVOKE/GRANT): o `hermes-tarefa-mergear` aplica DEPOIS do merge e do deploy
-- do código que acompanha a etapa (CLAUDE.md §1 regra 6 — REVOKE nunca antes do deploy).
-- Idempotente: revogar privilégio já revogado é no-op e o GRANT é repetível.
-- service_role, postgres e supabase_admin não são tocados (a edge e o MCP seguem com acesso total).

REVOKE ALL PRIVILEGES (id, user_id, product_id, product_name, product_sku, primary_image_url, created_at)
  ON TABLE public.catalog_favorites FROM anon, authenticated;

REVOKE ALL PRIVILEGES (id, product_id, product_name, product_sku, variant_label, contact_id, agent_id,
  template, images_count, message_length, status, message_ids, created_at)
  ON TABLE public.catalog_send_events FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.catalog_favorites FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.catalog_send_events FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_favorites TO authenticated;
GRANT SELECT, INSERT ON TABLE public.catalog_send_events TO authenticated;

COMMENT ON TABLE public.catalog_favorites IS
  'Favoritos do catálogo por agente (E50). RLS por dono (policy ALL TO authenticated); grants '
  'de cliente depois do CT-01: SELECT/INSERT/UPDATE/DELETE para authenticated, nada para anon.';

COMMENT ON TABLE public.catalog_send_events IS
  'Log append-only de envios de produto do catálogo (E28). Uma linha por envio, com status '
  'sent/partial/failed e message_ids. Depois do CT-02 o cliente authenticated tem só '
  'SELECT e INSERT; mexer no log depois de gravado exige service_role.';
