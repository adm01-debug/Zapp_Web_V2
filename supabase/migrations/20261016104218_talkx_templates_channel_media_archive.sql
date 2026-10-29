-- Rollback: desfaz esta migration sem tocar no que ja existia. Dropa as 2 constraints
-- criadas aqui e as 6 colunas criadas aqui. channel e archived_at NAO sao dropadas:
-- pertencem a migration 20261011000020 (anterior), que continua valida.
-- Rollback (SQL executável, na ordem):
--   alter table public.talkx_templates drop constraint if exists talkx_templates_channel_media_check;
--   alter table public.talkx_templates drop constraint if exists talkx_templates_thumbnail_check;
--   alter table public.talkx_templates drop column if exists channel_icon;
--   alter table public.talkx_templates drop column if exists media_kind;
--   alter table public.talkx_templates drop column if exists media_file_path;
--   alter table public.talkx_templates drop column if exists thumbnail_path;
--   alter table public.talkx_templates drop column if exists duration_seconds;
--   alter table public.talkx_templates drop column if exists cta_buttons;
--
-- N-126a [refazer 1] (fonte X083, parte 2 de 2): public.talkx_templates ganha as oito
-- colunas de canal/midia/arquivamento no formato final — canal, icone do canal, tipo e
-- caminho da midia, thumbnail, duracao, botoes de acao e marca de arquivamento.
-- E SO aditiva: nenhuma coluna, constraint ou politica existente e alterada ou removida
-- nesta migration.
--
-- channel e archived_at JA existem (supabase/migrations/20261011000020_..._archive.sql);
-- aqui sao reafirmados com IF NOT EXISTS (vira no-op onde a anterior ja aplicou) para a
-- migration ser autocontida. As CHECKs novas tem nomes novos e nao conflitam com as da
-- anterior (talkx_templates_channel_check, talkx_templates_icon_check), que ficam como estao.
--
-- Colunas (nome              | tipo        | regra):
-- channel          | text        | NOT NULL DEFAULT 'whatsapp', CHECK so 'whatsapp'
-- channel_icon     | text        | -
-- media_kind       | text        | CHECK em ('image','video','document','audio') ou NULL
-- media_file_path  | text        | -
-- thumbnail_path   | text        | CHECK so quando ha media_file_path
-- duration_seconds | integer     | -
-- cta_buttons      | jsonb       | -
-- archived_at      | timestamptz | NULL por padrao = nao arquivado
--
-- Idempotente: ADD COLUMN IF NOT EXISTS e DROP CONSTRAINT IF EXISTS antes de cada ADD,
-- entao reaplicar o arquivo nao quebra.
--
-- ============================================================================

alter table public.talkx_templates
  add column if not exists channel          text not null default 'whatsapp',
  add column if not exists channel_icon     text,
  add column if not exists media_kind       text,
  add column if not exists media_file_path  text,
  add column if not exists thumbnail_path   text,
  add column if not exists duration_seconds integer,
  add column if not exists cta_buttons      jsonb,
  add column if not exists archived_at      timestamptz;

alter table public.talkx_templates drop constraint if exists talkx_templates_channel_media_check;
alter table public.talkx_templates
  add constraint talkx_templates_channel_media_check
  check (channel = 'whatsapp' and (media_kind is null or media_kind in ('image','video','document','audio')));

alter table public.talkx_templates drop constraint if exists talkx_templates_thumbnail_check;
alter table public.talkx_templates
  add constraint talkx_templates_thumbnail_check
  check (thumbnail_path is null or media_file_path is not null);
