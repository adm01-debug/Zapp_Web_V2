-- remove_orphan_searchbox_flag
-- versão 20260930210000 reservada para hermes-limpeza-flag-searchbox-4b-260930124171e9 em 2026-09-30T12:42:11-03:00 (hermes-db-migrar --nova)

-- Onda 2 da auditoria adversarial: a flag 'mapa.searchbox-autocomplete' ficou ÓRFÃ quando o
-- item 4b removeu o ramo legado do picker (a UI virou ramo único). Zero leitores: nenhum src/,
-- Edge Function, workflow ou .env consulta a chave — só a migration 20260925211500 que a criou
-- e docs históricos a mencionam. Removemos a linha para o banco não carregar um gate morto.
delete from public.feature_flags
 where key = 'mapa.searchbox-autocomplete';
