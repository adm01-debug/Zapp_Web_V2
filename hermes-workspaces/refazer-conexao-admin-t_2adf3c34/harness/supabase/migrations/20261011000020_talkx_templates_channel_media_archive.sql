-- Rollback: devolve public.talkx_templates ao estado anterior: dropa as 2 constraints e as 8 colunas criadas por esta migration. Nenhuma coluna, constraint ou politica existente e tocada (em especial talkx_templates_media_type_check fica como esta).
-- Rollback (SQL executável, na ordem):
--   alter table public.talkx_templates drop constraint if exists talkx_templates_channel_check;
--   alter table public.talkx_templates drop constraint if exists talkx_templates_icon_check;
--   alter table public.talkx_templates drop column if exists channel;
--   alter table public.talkx_templates drop column if exists icon;
--   alter table public.talkx_templates drop column if exists interactive;
--   alter table public.talkx_templates drop column if exists media_file_name;
--   alter table public.talkx_templates drop column if exists media_size_bytes;
--   alter table public.talkx_templates drop column if exists media_width;
--   alter table public.talkx_templates drop column if exists media_height;
--   alter table public.talkx_templates drop column if exists archived_at;
--
-- N-126a (fonte X083, parte 1 de 2): public.talkx_templates ganha oito colunas de
-- metadados do template — canal, icone, midia da mensagem interativa, nome/tamanho/
-- dimensoes do arquivo e marca de arquivamento. E SO aditiva: nenhuma coluna,
-- constraint ou politica existente e alterada ou removida nesta migration.
--
-- media_type JA existe (supabase/migrations/20260908120000_talkx_segments_templates_events.sql)
-- com CHECK em ('image','video','document','audio'); esta migration NAO recria essa
-- constraint nem a coluna — apenas reaproveita a existente.
--
-- Colunas novas (nome                | tipo        | regra):
-- channel          | text        | NOT NULL DEFAULT 'whatsapp', CHECK so 'whatsapp'
-- icon             | text        | CHECK no maximo 16 caracteres
-- interactive      | jsonb       | -
-- media_file_name  | text        | -
-- media_size_bytes | bigint      | -
-- media_width      | integer     | -
-- media_height     | integer     | -
-- archived_at      | timestamptz | NULL por padrao = nao arquivado
--
-- Idempotente: ADD COLUMN IF NOT EXISTS e DROP CONSTRAINT IF EXISTS antes de cada ADD,
-- entao reaplicar o arquivo nao quebra.

-- ============================================================================

alter table public.talkx_templates
  add column if not exists channel          text not null default 'whatsapp',
  add column if not exists icon             text,
  add column if not exists interactive      jsonb,
  add column if not exists media_file_name  text,
  add column if not exists media_size_bytes bigint,
  add column if not exists media_width      integer,
  add column if not exists media_height     integer,
  add column if not exists archived_at      timestamptz;

alter table public.talkx_templates drop constraint if exists talkx_templates_channel_check;
alter table public.talkx_templates
  add constraint talkx_templates_channel_check check (channel = 'whatsapp');

alter table public.talkx_templates drop constraint if exists talkx_templates_icon_check;
alter table public.talkx_templates
  add constraint talkx_templates_icon_check check (icon is null or char_length(icon) <= 16);
