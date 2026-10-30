-- talkx_segment_bulk_actions
-- Rollback: drop function if exists public.talkx_segment_bulk_action(text, uuid[], text); drop index if exists public.idx_talkx_segments_tags; alter table public.talkx_segments drop constraint if exists talkx_segments_status_check; alter table public.talkx_segments disable trigger update_talkx_segments_updated_at; update public.talkx_segments set status = 'inactive' where status = 'draft'; alter table public.talkx_segments enable trigger update_talkx_segments_updated_at; alter table public.talkx_segments add constraint talkx_segments_status_check check (status in ('active','inactive')); alter table public.talkx_segments drop column if exists tags, drop column if exists archived_at;
-- Rollback (SQL executável, na ordem inversa):
--   drop function if exists public.talkx_segment_bulk_action(text, uuid[], text);
--   drop index if exists public.idx_talkx_segments_tags;
--   alter table public.talkx_segments drop constraint if exists talkx_segments_status_check;
--   alter table public.talkx_segments disable trigger update_talkx_segments_updated_at;
--   update public.talkx_segments set status = 'inactive' where status = 'draft';
--   alter table public.talkx_segments enable trigger update_talkx_segments_updated_at;
--   alter table public.talkx_segments add constraint talkx_segments_status_check check (status in ('active','inactive'));
--   alter table public.talkx_segments drop column if exists tags, drop column if exists archived_at;
--
-- TL-135a2 / X114 (Talk X · F09 Segmentos · biblioteca) — RPC guardada para ações em massa.
-- A migration é autossuficiente na base do dia: além da RPC, garante os campos mínimos usados
-- pelas ações da biblioteca (tags, archived_at e status='draft'). Ela NÃO traz a migration TL-129
-- inteira: não cria tabela de versões, RPCs de publicação nem outros objetos fora desta fatia.
--
-- Ações aceitas:
--   'draft'    -> status='draft' sem mexer em rules (rascunho não altera a regra publicada)
--   'activate' -> status='active' e archived_at=null (publicar/ativar/sair do arquivo)
--   'archive'  -> status='inactive' e archived_at=now() (arquivar/sair de cena)
--   'tag'      -> adiciona p_tag em tags, idempotente
--
-- Guarda X101 por item: antes de arquivar, a RPC verifica se o segmento é usado por campanha
-- scheduled/sending/paused pela coluna talkx_campaigns.segment_id ou pela lista
-- talkx_campaign_segments. O item bloqueado retorna P0001/talkx_segment_in_use e o lote continua.
-- Itens inexistentes ou fora do alcance retornam o mesmo P0002/talkx_segment_not_found.
--
-- Rollback: remove a RPC e as colunas/índice/check adicionados. Dados de negócio gravados por
-- chamadas posteriores à RPC (tags/archived_at) são removidos junto com as colunas; status 'draft'
-- criado depois é rebaixado para 'inactive' porque o CHECK anterior não aceitava draft.

alter table public.talkx_segments
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists archived_at timestamptz;

create index if not exists idx_talkx_segments_tags
  on public.talkx_segments using gin (tags);

alter table public.talkx_segments drop constraint if exists talkx_segments_status_check;
alter table public.talkx_segments
  add constraint talkx_segments_status_check
  check (status in ('draft','active','inactive'));

create or replace function public.talkx_segment_bulk_action(
  p_action text,
  p_segment_ids uuid[],
  p_tag text default null
)
returns table (
  segment_id    uuid,
  action        text,
  succeeded     boolean,
  status        text,
  archived_at   timestamptz,
  tags          text[],
  error_code    text,
  error_message text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_profile_id uuid;
  v_ids              uuid[];
  v_id               uuid;
  v_seg              public.talkx_segments%rowtype;
  v_tag              text;
  v_now              timestamptz := statement_timestamp();
  v_campaign_name    text;
  v_campaign_status  text;
  v_limite_lote      constant integer := 200;
  v_tag_max          constant integer := 40;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select profile.id into v_actor_profile_id
    from public.profiles profile
   where profile.user_id = auth.uid()
     and profile.is_active = true
   limit 1
   for share;

  if v_actor_profile_id is null then
    raise exception 'active_profile_not_found' using errcode = '42501';
  end if;

  if coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true then
    raise exception 'talkx_segment_role_required' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('draft', 'activate', 'archive', 'tag') then
    raise exception 'invalid_talkx_segment_bulk_action' using errcode = '22023';
  end if;

  if p_segment_ids is null or cardinality(p_segment_ids) = 0 then
    raise exception 'talkx_segment_bulk_empty_ids' using errcode = '22023';
  end if;

  if cardinality(p_segment_ids) > v_limite_lote then
    raise exception 'talkx_segment_bulk_too_many_ids' using errcode = '22023';
  end if;

  if exists (select 1 from unnest(p_segment_ids) as pedido(id) where pedido.id is null) then
    raise exception 'invalid_talkx_segment_id' using errcode = '22023';
  end if;

  if p_action = 'tag' then
    v_tag := nullif(btrim(coalesce(p_tag, '')), '');
    if v_tag is null or length(v_tag) > v_tag_max then
      raise exception 'invalid_talkx_segment_tag' using errcode = '22023';
    end if;
  elsif p_tag is not null then
    raise exception 'invalid_talkx_segment_bulk_payload' using errcode = '22023';
  end if;

  select array_agg(distinct pedido.id order by pedido.id) into v_ids
    from unnest(p_segment_ids) as pedido(id);

  foreach v_id in array v_ids loop
    segment_id    := v_id;
    action        := p_action;
    succeeded     := false;
    status        := null;
    archived_at   := null;
    tags          := null;
    error_code    := null;
    error_message := null;
    v_seg         := null;

    begin
      select s.* into v_seg
        from public.talkx_segments s
       where s.id = v_id
       for update;

      if not found
         or (v_seg.created_by is distinct from v_actor_profile_id
             and coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true) then
        raise exception 'talkx_segment_not_found' using errcode = 'P0002';
      end if;

      if p_action = 'archive' and v_seg.archived_at is null then
        select c.name, c.status
          into v_campaign_name, v_campaign_status
          from public.talkx_campaigns c
         where c.status in ('scheduled', 'sending', 'paused')
           and (
             c.segment_id = v_id
             or exists (
               select 1
                 from public.talkx_campaign_segments cs
                where cs.campaign_id = c.id
                  and cs.segment_id = v_id
             )
           )
         order by c.created_at
         limit 1;

        if v_campaign_name is not null then
          raise exception
            'talkx_segment_in_use: campanha "%" (%) usa este segmento',
            v_campaign_name, v_campaign_status
            using errcode = 'P0001';
        end if;
      end if;

      if p_action = 'draft' then
        update public.talkx_segments s
           set status = 'draft',
               updated_at = v_now
         where s.id = v_id
        returning s.* into v_seg;

      elsif p_action = 'activate' then
        update public.talkx_segments s
           set status = 'active',
               archived_at = null,
               updated_at = v_now
         where s.id = v_id
        returning s.* into v_seg;

      elsif p_action = 'archive' then
        update public.talkx_segments s
           set archived_at = coalesce(s.archived_at, v_now),
               status = 'inactive',
               updated_at = v_now
         where s.id = v_id
        returning s.* into v_seg;

      elsif p_action = 'tag' then
        if not (v_tag = any(v_seg.tags)) then
          update public.talkx_segments s
             set tags = s.tags || v_tag,
                 updated_at = v_now
           where s.id = v_id
          returning s.* into v_seg;
        end if;
      end if;

      succeeded := true;

    exception
      when others then
        succeeded     := false;
        error_code    := sqlstate;
        error_message := sqlerrm;
    end;

    status      := v_seg.status;
    archived_at := v_seg.archived_at;
    tags        := v_seg.tags;

    return next;
  end loop;

  return;
end;
$function$;

comment on function public.talkx_segment_bulk_action(text, uuid[], text) is
  'Talk X (TL-135a2): ações em massa da biblioteca de segmentos (draft, activate, archive, tag) com resultado por segmento e guarda X101 por item contra arquivar segmento usado por campanha scheduled/sending/paused.';

revoke all on function public.talkx_segment_bulk_action(text, uuid[], text) from public, anon, authenticated;
grant execute on function public.talkx_segment_bulk_action(text, uuid[], text) to authenticated;
