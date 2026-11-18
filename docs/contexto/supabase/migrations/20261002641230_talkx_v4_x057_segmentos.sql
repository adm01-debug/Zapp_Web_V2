create table if not exists public.talkx_campaign_segments (
  campaign_id uuid     not null references public.talkx_campaigns(id) on delete cascade,
  segment_id  uuid     not null references public.talkx_segments(id)  on delete cascade,
  position    smallint not null check (position between 1 and 10),
  status      text     not null default 'pending'
                       check (status in ('pending', 'sending', 'paused', 'done')),
  paused_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, segment_id),
  constraint talkx_campaign_segments_campaign_position_key unique (campaign_id, position)
)

comment on table public.talkx_campaign_segments is
  'Talk X (X057): segmentos de uma campanha, em ordem (position 1..10). A ordem define qual segmento "ganha" quando o mesmo contato aparece em mais de um.'

alter table public.talkx_recipients
  add column if not exists segment_id uuid

comment on column public.talkx_recipients.segment_id is
  'Talk X (X057): segmento de origem do destinatario — o PRIMEIRO segmento da campanha que contem o contato.'

create index if not exists idx_talkx_recipients_campaign_segment_status
  on public.talkx_recipients (campaign_id, segment_id, status)

alter table public.talkx_campaign_segments enable row level security

drop policy if exists "Admins can view all campaign segments" on public.talkx_campaign_segments

create policy "Admins can view all campaign segments"
  on public.talkx_campaign_segments for select
  using (public.is_admin_or_supervisor(auth.uid()))

drop policy if exists "Users can view own campaign segments" on public.talkx_campaign_segments

create policy "Users can view own campaign segments"
  on public.talkx_campaign_segments for select
  using (exists (
    select 1 from public.talkx_campaigns c
     where c.id = campaign_id
       and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
  ))

drop policy if exists "Users can create campaign segments" on public.talkx_campaign_segments

create policy "Users can create campaign segments"
  on public.talkx_campaign_segments for insert
  with check (
    public.is_admin_or_supervisor(auth.uid())
    and exists (
      select 1 from public.talkx_campaigns c
       where c.id = campaign_id
         and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
    )
  )

drop policy if exists "Users can update own campaign segments" on public.talkx_campaign_segments

create policy "Users can update own campaign segments"
  on public.talkx_campaign_segments for update
  using (exists (
    select 1 from public.talkx_campaigns c
     where c.id = campaign_id
       and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
       and public.is_admin_or_supervisor(auth.uid())
  ))

drop policy if exists "Users can delete own draft campaign segments" on public.talkx_campaign_segments

create policy "Users can delete own draft campaign segments"
  on public.talkx_campaign_segments for delete
  using (exists (
    select 1 from public.talkx_campaigns c
     where c.id = campaign_id
       and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
       and public.is_admin_or_supervisor(auth.uid())
       and c.status = 'draft'
  ))

grant select, insert, update, delete on public.talkx_campaign_segments to authenticated

grant select, insert, update, delete on public.talkx_campaign_segments to service_role

insert into public.talkx_campaign_segments (campaign_id, segment_id, position, status)
select c.id,
       c.segment_id,
       1,
       case c.status
         when 'sending' then 'sending'
         when 'paused'  then 'paused'
         when 'done'    then 'done'
         else 'pending'
       end
  from public.talkx_campaigns c
 where c.segment_id is not null
on conflict (campaign_id, segment_id) do nothing

alter publication supabase_realtime add table public.talkx_campaign_segments
