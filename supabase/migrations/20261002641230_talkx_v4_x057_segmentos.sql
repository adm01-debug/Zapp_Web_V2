-- talkx_v4_x057_segmentos
-- versão 20261002641230 reservada para hermes-talkx-v4-x057-segmentos-2610021719d64e em 2026-10-02T17:20:29-03:00 (hermes-db-migrar --nova)
--
-- rollback: 1) alter publication supabase_realtime drop table if exists public.talkx_campaign_segments;
-- rollback: 2) alter publication supabase_realtime drop table if exists public.talkx_recipients; alter publication supabase_realtime add table public.talkx_recipients;  (republica sem a coluna nova)
-- rollback: 3) drop table if exists public.talkx_campaign_segments;   (remove a estrutura nova; nenhum dado de talkx_campaigns/talkx_recipients e perdido)
-- rollback: 4) drop index if exists public.idx_talkx_recipients_campaign_segment_status;
-- rollback: 5) alter table public.talkx_recipients drop column if exists segment_id;
--
-- X057 (Talk X V4, Fase 6) — parte ESTRUTURAL: permitir varios segmentos por campanha.
--
--   1. talkx_campaign_segments: a lista ORDENADA de segmentos de uma campanha
--      (position 1..10), com a mesma RLS de talkx_campaigns — espelhada por
--      campanha (a tabela nova nao tem created_by; a posse vem do dono da campanha).
--   2. talkx_recipients.segment_id: de qual segmento o destinatario veio.
--   3. Indice (campaign_id, segment_id, status) para a leitura por segmento.
--   4. Backfill: campanha existente que ja tem segment_id ganha 1 linha, na position 1.
--   5. Realtime: talkx_campaign_segments publicada e talkx_recipients republicada
--      (a publicacao envia a linha inteira, e a coluna nova precisa entrar no stream).
--
-- A parte de COMPORTAMENTO (save_talkx_campaign_draft aceitando segment_ids e
-- snapshot_talkx_campaign_audience resolvendo os segmentos em ordem) e uma
-- entrega separada: sao duas RPCs SECURITY DEFINER que formam o motor de
-- audiencia do disparo, e vao junto com o harness que prova os numeros do aceite.
-- Esta migration e aditiva e nao altera nenhuma funcao existente.

-- 1. A lista ordenada de segmentos por campanha ---------------------------------
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
);

comment on table public.talkx_campaign_segments is
  'Talk X (X057): segmentos de uma campanha, em ordem (position 1..10). A ordem define qual segmento "ganha" quando o mesmo contato aparece em mais de um.';

-- 2. De qual segmento veio cada destinatario ------------------------------------
alter table public.talkx_recipients
  add column if not exists segment_id uuid;

comment on column public.talkx_recipients.segment_id is
  'Talk X (X057): segmento de origem do destinatario — o PRIMEIRO segmento da campanha que contem o contato.';

-- 3. Indice para leitura por segmento -------------------------------------------
create index if not exists idx_talkx_recipients_campaign_segment_status
  on public.talkx_recipients (campaign_id, segment_id, status);

-- 4. RLS espelhando talkx_campaigns ---------------------------------------------
-- A posse e do dono da campanha (created_by), exatamente como em talkx_campaigns;
-- admins/supervisores veem tudo. As cinco policies espelham as cinco de campanhas,
-- incluindo a de delete, que so vale enquanto a campanha e rascunho.
alter table public.talkx_campaign_segments enable row level security;

drop policy if exists "Admins can view all campaign segments" on public.talkx_campaign_segments;
create policy "Admins can view all campaign segments"
  on public.talkx_campaign_segments for select
  using (public.is_admin_or_supervisor(auth.uid()));

drop policy if exists "Users can view own campaign segments" on public.talkx_campaign_segments;
create policy "Users can view own campaign segments"
  on public.talkx_campaign_segments for select
  using (exists (
    select 1 from public.talkx_campaigns c
     where c.id = campaign_id
       and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
  ));

drop policy if exists "Users can create campaign segments" on public.talkx_campaign_segments;
create policy "Users can create campaign segments"
  on public.talkx_campaign_segments for insert
  with check (
    public.is_admin_or_supervisor(auth.uid())
    and exists (
      select 1 from public.talkx_campaigns c
       where c.id = campaign_id
         and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
    )
  );

drop policy if exists "Users can update own campaign segments" on public.talkx_campaign_segments;
create policy "Users can update own campaign segments"
  on public.talkx_campaign_segments for update
  using (exists (
    select 1 from public.talkx_campaigns c
     where c.id = campaign_id
       and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
       and public.is_admin_or_supervisor(auth.uid())
  ));

drop policy if exists "Users can delete own draft campaign segments" on public.talkx_campaign_segments;
create policy "Users can delete own draft campaign segments"
  on public.talkx_campaign_segments for delete
  using (exists (
    select 1 from public.talkx_campaigns c
     where c.id = campaign_id
       and c.created_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)
       and public.is_admin_or_supervisor(auth.uid())
       and c.status = 'draft'
  ));

grant select, insert, update, delete on public.talkx_campaign_segments to authenticated;
grant select, insert, update, delete on public.talkx_campaign_segments to service_role;

-- 5. Backfill: campanha que ja tem segment_id ganha a linha 1 --------------------
-- O status acompanha o da campanha para a lista nao nascer mentindo sobre o que
-- ja foi disparado. Campanhas sem segmento (origem contacts/crm360) ficam de fora:
-- a tabela descreve segmentos, e nelas nao ha nenhum.
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
on conflict (campaign_id, segment_id) do nothing;

-- 6. Realtime --------------------------------------------------------------------
-- A publicacao manda a linha inteira; republicar talkx_recipients garante que a
-- coluna segment_id entre no stream dos assinantes que ja acompanham a tabela.
-- Statements diretos, como em todas as migrations do repo — que nao usam bloco do/begin.
alter publication supabase_realtime add table public.talkx_campaign_segments;
alter publication supabase_realtime drop table public.talkx_recipients;
alter publication supabase_realtime add table public.talkx_recipients;
