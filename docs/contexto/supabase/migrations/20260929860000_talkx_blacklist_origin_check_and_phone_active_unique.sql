alter table public.talkx_blacklist
  drop constraint if exists talkx_blacklist_origin_check

alter table public.talkx_blacklist
  add constraint talkx_blacklist_origin_check
  check (origin = any (array[
    'manual'::text,
    'optout'::text,
    'system'::text,
    'lgpd'::text,
    'list'::text,
    'auto_optout'::text
  ]))

create unique index if not exists talkx_blacklist_phone_active_unique
  on public.talkx_blacklist using btree (phone)
  where ((phone is not null) and (removed_at is null))
