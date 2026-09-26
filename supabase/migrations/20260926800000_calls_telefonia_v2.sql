-- =====================================================================
-- Telefonia v2 — contrato de dados (ADITIVO)
-- Plano: docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md (Apêndice A/B)
-- Fase 2, etapas 19–25. Versão 20260926800000 — reversionada pela TERCEIRA vez:
-- 20260926190000 -> 20260926210000 (PR #885, colisão com E17/#872) -> 20260926300000
-- (PR #897, colisão com restrict_gmail_accounts_cascade) -> 20260926800000
-- (colisão #3: max(version) avançou para 20260926420000 enquanto a correção de
-- segurança #3 — 20260926900000_fix_set_call_agent_notes_null_profile.sql — era
-- preparada; 300000 ficaria atrás do que já está no banco). max(version)
-- conferido ao vivo antes desta versão: 20260926420000 — 800000 dá margem grande
-- de propósito, e ainda fica ABAIXO de 900000 (a correção de segurança #3, que
-- deve aplicar depois desta). Conteúdo abaixo idêntico ao original — só o
-- cabeçalho mudou (rename puro).
--
-- Regras respeitadas: só aditivo; nenhum DROP de coluna/tabela; nenhum UPDATE
-- em massa de histórico; backfill com contagem registrada no ledger.
-- Medições no banco oficial antes de escrever (26/09/2026):
--   calls: 21 linhas · 10 com whatsapp_connection_id · 11 com agent_id ·
--   0 com answered_at+ended_at · status existentes: ringing (19), ended (2).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas aditivas (etapa 19)
-- ---------------------------------------------------------------------
alter table public.calls
  add column if not exists channel text,
  add column if not exists provider_call_id text,
  add column if not exists peer_number text,
  add column if not exists peer_name text,
  add column if not exists answered_by uuid references public.profiles(id),
  add column if not exists end_reason text,
  add column if not exists agent_notes text,
  add column if not exists recording_status text not null default 'none',
  add column if not exists talk_seconds integer;

-- ---------------------------------------------------------------------
-- 2. CHECKs novos (NOT VALID + VALIDATE, como o plano manda)
-- ---------------------------------------------------------------------
alter table public.calls drop constraint if exists calls_channel_check;
alter table public.calls add constraint calls_channel_check
  check (channel is null or channel in ('voip', 'whatsapp')) not valid;

alter table public.calls drop constraint if exists calls_recording_status_check;
alter table public.calls add constraint calls_recording_status_check
  check (recording_status in ('none', 'pending', 'available', 'failed')) not valid;

alter table public.calls drop constraint if exists calls_end_reason_check;
alter table public.calls add constraint calls_end_reason_check
  check (end_reason is null or end_reason in (
    'completed', 'hangup_local', 'hangup_remote', 'no_answer', 'busy', 'busy_here',
    'cancelled', 'cancelled_remote', 'declined', 'failed', 'timeout'
  )) not valid;

-- Divergência deliberada do plano (registrada em docs/design/TELEFONIA_STATUS.md):
-- `calls_status_check` já existe no banco e aceita só ringing/answered/ended/missed/busy/failed.
-- A máquina de estados (Apêndice C) e a tabela 2.7 do plano gravam também `cancelled`
-- (cancelada por nós antes de atender) e `declined` (recusada por nós). A alteração abaixo
-- AMPLIA o domínio (superconjunto) — nada é removido, nenhuma linha existente é invalidada
-- e nenhum dado é reescrito.
alter table public.calls drop constraint if exists calls_status_check;
alter table public.calls add constraint calls_status_check
  check (status = any (array[
    'ringing', 'answered', 'ended', 'missed', 'busy', 'failed', 'cancelled', 'declined'
  ])) not valid;

-- ---------------------------------------------------------------------
-- 3. Backfill com evidência (etapa 19) — contagens no ledger
-- ---------------------------------------------------------------------
update public.calls
   set channel = case when whatsapp_connection_id is not null then 'whatsapp' else 'voip' end
 where channel is null;

update public.calls
   set talk_seconds = greatest(0, extract(epoch from (ended_at - answered_at))::int)
 where talk_seconds is null
   and answered_at is not null
   and ended_at is not null;

alter table public.calls validate constraint calls_channel_check;
alter table public.calls validate constraint calls_recording_status_check;
alter table public.calls validate constraint calls_end_reason_check;
alter table public.calls validate constraint calls_status_check;

-- ---------------------------------------------------------------------
-- 4. Índices (etapa 19)
-- ---------------------------------------------------------------------
create index if not exists calls_agent_started_idx
  on public.calls (agent_id, started_at desc, id desc);

create unique index if not exists calls_channel_provider_call_unique
  on public.calls (channel, provider_call_id)
  where provider_call_id is not null;

-- ---------------------------------------------------------------------
-- 5. Realtime (etapa 24): `calls` não estava publicada (medido em 26/09/2026)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls'
     ) then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Gravações (etapa 25 / D3)
--    Nenhum bucket de gravação existe (`audio-memes, audio-messages, avatars,
--    custom-emojis, stickers, team-chat-files, whatsapp-media`) e não há
--    BITRIX_WEBHOOK_URL configurado. Sem fonte comprovada, nada de policy de
--    Storage nesta migration: `recording_status` fica 'none'.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 7. RPCs (Apêndice B)
-- =====================================================================

-- B.1 busca paginada do histórico, com escopo decidido DENTRO do banco.
-- Não foi incluído `company_name` do Apêndice B.1: não existe tabela
-- `public.companies` nem `contacts.company_id` neste banco (medido em 26/09/2026).
create or replace function public.search_my_calls(
  p_scope text default 'mine',
  p_channel text default null,
  p_direction text default null,
  p_result text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_q text default null,
  p_limit integer default 8,
  p_offset integer default 0
)
returns table (
  id uuid,
  channel text,
  direction text,
  status text,
  end_reason text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  talk_seconds integer,
  peer_number text,
  peer_name text,
  contact_id uuid,
  contact_name text,
  contact_phone text,
  contact_avatar_url text,
  agent_id uuid,
  answered_by uuid,
  recording_status text,
  agent_notes text,
  notes text,
  total_count bigint
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with eu as (
    select pr.id as profile_id
      from public.profiles pr
     where pr.user_id = auth.uid()
  ),
  efetivo as (
    select case
             when p_scope = 'all' and public.is_admin_or_supervisor(auth.uid()) then 'all'
             else 'mine'
           end as escopo
  ),
  base as (
    select c.*,
           ct.name as c_nome,
           ct.phone as c_telefone,
           ct.avatar_url as c_avatar
      from public.calls c
      left join public.contacts ct on ct.id = c.contact_id
      cross join efetivo e
      cross join eu
     where (e.escopo = 'all' or c.agent_id = eu.profile_id)
       and (p_channel is null or c.channel = p_channel)
       and (p_direction is null or c.direction = p_direction)
       and (p_from is null or c.started_at >= p_from)
       and (p_to is null or c.started_at < p_to)
       and (p_result is null or (
              (p_result = 'completed'
                and c.status in ('ended', 'completed') and c.answered_at is not null)
           or (p_result = 'missed' and (
                 c.status = 'missed'
              or (c.status in ('ended', 'completed') and c.answered_at is null
                  and c.direction = 'inbound')))
           or (p_result = 'no_answer'
                and c.status in ('ended', 'completed') and c.answered_at is null
                and c.direction = 'outbound')
           or (p_result = 'busy' and c.status = 'busy')
           or (p_result = 'failed' and c.status = 'failed')
           or (p_result = 'cancelled' and c.status = 'cancelled')
           or (p_result = 'declined' and c.status = 'declined')
           or (p_result = 'in_progress'
                and c.status in ('answered', 'ongoing') and c.ended_at is null)
           or (p_result = 'ringing' and c.status = 'ringing' and c.ended_at is null)
       ))
       and (
         p_q is null or btrim(p_q) = ''
         or (
           length(regexp_replace(p_q, '\D', '', 'g')) >= 4
           and coalesce(c.peer_number, ct.phone) ilike '%' || regexp_replace(p_q, '\D', '', 'g') || '%'
         )
         or coalesce(c.peer_name, ct.name) ilike '%' || btrim(p_q) || '%'
       )
  )
  select b.id,
         b.channel,
         b.direction,
         b.status,
         b.end_reason,
         b.started_at,
         b.answered_at,
         b.ended_at,
         b.talk_seconds,
         coalesce(b.peer_number, b.c_telefone) as peer_number,
         coalesce(b.peer_name, b.c_nome) as peer_name,
         b.contact_id,
         b.c_nome as contact_name,
         b.c_telefone as contact_phone,
         b.c_avatar as contact_avatar_url,
         b.agent_id,
         b.answered_by,
         b.recording_status,
         b.agent_notes,
         b.notes,
         count(*) over () as total_count
    from base b
   order by b.started_at desc, b.id desc
   limit least(greatest(coalesce(p_limit, 8), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_my_calls is
  'Histórico de ligações do usuário (escopo mine; all só para admin/supervisor, decidido aqui). Plano Telefonia 100 etapas, Apêndice B.1.';

-- B.2 indicadores sobre o MESMO universo de escopo/período/canal (nunca sobre a página)
create or replace function public.my_calls_kpi(
  p_scope text default 'mine',
  p_channel text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  total integer,
  outbound integer,
  inbound integer,
  missed_inbound integer,
  answered integer,
  avg_talk_seconds numeric
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with eu as (
    select pr.id as profile_id from public.profiles pr where pr.user_id = auth.uid()
  ),
  efetivo as (
    select case
             when p_scope = 'all' and public.is_admin_or_supervisor(auth.uid()) then 'all'
             else 'mine'
           end as escopo
  )
  select coalesce(count(*), 0)::int,
         coalesce(count(*) filter (where c.direction = 'outbound'), 0)::int,
         coalesce(count(*) filter (where c.direction = 'inbound'), 0)::int,
         coalesce(count(*) filter (
           where c.direction = 'inbound'
             and (c.status = 'missed'
                  or (c.status in ('ended', 'completed') and c.answered_at is null))
         ), 0)::int,
         coalesce(count(*) filter (where c.answered_at is not null), 0)::int,
         avg(c.talk_seconds) filter (where c.talk_seconds is not null)
    from public.calls c
    cross join efetivo e
    cross join eu
   where (e.escopo = 'all' or c.agent_id = eu.profile_id)
     and (p_channel is null or c.channel = p_channel)
     and (p_from is null or c.started_at >= p_from)
     and (p_to is null or c.started_at < p_to);
$$;

comment on function public.my_calls_kpi is
  'Indicadores de ligações no escopo/período/canal (total, realizadas, recebidas, perdidas recebidas, atendidas, média de conversa). Apêndice B.2.';

-- B.3 persistência idempotente da chamada VoIP (uma linha por chamada, sempre o mesmo id)
create or replace function public.upsert_my_call(
  p_id uuid,
  p_direction text,
  p_status text default null,
  p_channel text default 'voip',
  p_peer_number text default null,
  p_peer_name text default null,
  p_contact_id uuid default null,
  p_provider_call_id text default null,
  p_answered_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_end_reason text default null,
  p_talk_seconds integer default null
)
returns uuid
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile uuid;
  v_id uuid;
begin
  select pr.id into v_profile from public.profiles pr where pr.user_id = auth.uid();
  if v_profile is null then
    raise exception 'perfil nao encontrado para o usuario autenticado' using errcode = '42501';
  end if;
  if p_direction not in ('inbound', 'outbound') then
    raise exception 'direcao invalida' using errcode = '22023';
  end if;

  insert into public.calls (
    id, agent_id, direction, status, channel, peer_number, peer_name, contact_id,
    provider_call_id, started_at, answered_at, ended_at, end_reason, talk_seconds
  ) values (
    p_id, v_profile, p_direction, coalesce(p_status, 'ringing'), coalesce(p_channel, 'voip'),
    p_peer_number, p_peer_name, p_contact_id, p_provider_call_id, now(),
    p_answered_at, p_ended_at, p_end_reason, p_talk_seconds
  )
  on conflict (id) do update set
    status = coalesce(excluded.status, public.calls.status),
    peer_number = coalesce(excluded.peer_number, public.calls.peer_number),
    peer_name = coalesce(excluded.peer_name, public.calls.peer_name),
    contact_id = coalesce(excluded.contact_id, public.calls.contact_id),
    provider_call_id = coalesce(excluded.provider_call_id, public.calls.provider_call_id),
    answered_at = coalesce(excluded.answered_at, public.calls.answered_at),
    ended_at = coalesce(excluded.ended_at, public.calls.ended_at),
    end_reason = coalesce(excluded.end_reason, public.calls.end_reason),
    answered_by = coalesce(
      public.calls.answered_by,
      case when excluded.answered_at is not null then v_profile else null end
    ),
    talk_seconds = coalesce(
      excluded.talk_seconds,
      case
        when coalesce(excluded.ended_at, public.calls.ended_at) is not null
         and coalesce(excluded.answered_at, public.calls.answered_at) is not null
        then greatest(0, extract(epoch from (
               coalesce(excluded.ended_at, public.calls.ended_at)
               - coalesce(excluded.answered_at, public.calls.answered_at)
             ))::int)
        else public.calls.talk_seconds
      end
    )
  where public.calls.agent_id = v_profile
  returning public.calls.id into v_id;

  if v_id is null then
    raise exception 'chamada pertence a outro agente' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

comment on function public.upsert_my_call is
  'Insere/atualiza a chamada do próprio agente (nunca de outro). agent_id é imutável. Apêndice B.3.';

-- B.4 anotação humana, separada do `notes` automático do provedor.
-- SECURITY DEFINER de propósito (divergência registrada no ledger): a policy de UPDATE de
-- `public.calls` só permite o DONO, então o admin/supervisor do Apêndice B.4 não
-- conseguiria gravar por uma função SECURITY INVOKER. Em vez de ampliar a policy de escrita
-- da tabela (afetaria qualquer caminho de código), a autorização fica fechada aqui dentro:
-- dono da chamada OU admin/supervisor. search_path fixo, nada de SQL dinâmico.
create or replace function public.set_call_agent_notes(p_call_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile uuid;
  v_owner uuid;
begin
  select pr.id into v_profile from public.profiles pr where pr.user_id = auth.uid();
  select c.agent_id into v_owner from public.calls c where c.id = p_call_id;
  if not found then
    raise exception 'chamada nao encontrada' using errcode = 'P0002';
  end if;
  if not (v_owner = v_profile or public.is_admin_or_supervisor(auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.calls set agent_notes = p_notes where id = p_call_id;
end;
$$;

comment on function public.set_call_agent_notes is
  'Grava somente agent_notes (anotação humana) na chamada do dono ou por admin/supervisor. Apêndice B.4.';

-- B.5-eventos: record_incoming_call_event com diff MÍNIMO (etapa 23):
--   + channel='whatsapp', provider_call_id, peer_number, peer_name nas duas inserções;
--   + no ON CONFLICT: agent_id e notes NÃO são mais sobrescritos (COALESCE preserva o primeiro),
--     e talk_seconds é calculado quando ended_at chega com answered_at presente.
create or replace function public.record_incoming_call_event(
  p_contact_id uuid,
  p_whatsapp_connection_id uuid,
  p_status text,
  p_is_video boolean,
  p_provider_event_id text default null,
  p_should_notify boolean default false
)
returns table (call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_agent_id uuid;
  v_agent_user_id uuid;
  v_contact_name text;
  v_contact_phone text;
  v_contact_connection_id uuid;
  v_event_id text := nullif(btrim(p_provider_event_id), '');
  v_call_id uuid;
  v_persisted_status text;
  v_notification_id uuid;
  v_notification_candidate uuid;
  v_notification_created boolean := false;
  v_call_duplicate boolean := false;
  v_row_count integer := 0;
  v_existing_notification record;
BEGIN
  IF p_status NOT IN ('ringing', 'answered', 'ended', 'missed', 'busy', 'failed') THEN
    RAISE EXCEPTION 'invalid incoming call status' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NOT NULL AND char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION 'provider event id exceeds 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_should_notify AND p_status <> 'ringing' THEN
    RAISE EXCEPTION 'only ringing calls can create notifications' USING ERRCODE = '22023';
  END IF;

  SELECT c.assigned_to, c.name, c.phone, c.whatsapp_connection_id
    INTO v_agent_id, v_contact_name, v_contact_phone, v_contact_connection_id
  FROM public.contacts AS c
  WHERE c.id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incoming call contact not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contact_connection_id IS DISTINCT FROM p_whatsapp_connection_id THEN
    RAISE EXCEPTION 'incoming call connection does not match contact' USING ERRCODE = '23514';
  END IF;

  IF v_agent_id IS NOT NULL THEN
    SELECT p.user_id INTO v_agent_user_id
    FROM public.profiles AS p
    WHERE p.id = v_agent_id;
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.calls AS existing
      WHERE existing.whatsapp_connection_id = p_whatsapp_connection_id
        AND existing.provider_event_id = v_event_id
    ) INTO v_call_duplicate;

    INSERT INTO public.calls (
      contact_id, whatsapp_connection_id, agent_id, direction, status,
      started_at, answered_at, ended_at, notes, provider_event_id,
      channel, provider_call_id, peer_number, peer_name
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, 'inbound', p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
      v_event_id,
      'whatsapp', v_event_id, v_contact_phone, v_contact_name
    )
    ON CONFLICT (whatsapp_connection_id, provider_event_id)
      WHERE provider_event_id IS NOT NULL
    DO UPDATE SET
      contact_id = EXCLUDED.contact_id,
      -- preserva a atribuição histórica: o primeiro agente visto fica
      agent_id = COALESCE(public.calls.agent_id, EXCLUDED.agent_id),
      status = CASE
        WHEN public.calls.status IN ('ended', 'missed', 'busy', 'failed')
          THEN public.calls.status
        WHEN public.calls.status = 'answered' AND EXCLUDED.status = 'ringing'
          THEN public.calls.status
        ELSE EXCLUDED.status
      END,
      answered_at = COALESCE(public.calls.answered_at, EXCLUDED.answered_at),
      ended_at = COALESCE(public.calls.ended_at, EXCLUDED.ended_at),
      -- `notes` é metadado do provedor: o primeiro valor vence, nunca é reescrito
      notes = COALESCE(public.calls.notes, EXCLUDED.notes),
      channel = COALESCE(public.calls.channel, EXCLUDED.channel),
      provider_call_id = COALESCE(public.calls.provider_call_id, EXCLUDED.provider_call_id),
      peer_number = COALESCE(public.calls.peer_number, EXCLUDED.peer_number),
      peer_name = COALESCE(public.calls.peer_name, EXCLUDED.peer_name),
      talk_seconds = COALESCE(
        public.calls.talk_seconds,
        CASE
          WHEN COALESCE(public.calls.ended_at, EXCLUDED.ended_at) IS NOT NULL
           AND COALESCE(public.calls.answered_at, EXCLUDED.answered_at) IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 COALESCE(public.calls.ended_at, EXCLUDED.ended_at)
                 - COALESCE(public.calls.answered_at, EXCLUDED.answered_at)
               ))::int)
          ELSE NULL
        END
      )
    RETURNING id, status INTO v_call_id, v_persisted_status;
  ELSE
    INSERT INTO public.calls (
      contact_id, whatsapp_connection_id, agent_id, direction, status,
      started_at, answered_at, ended_at, notes,
      channel, peer_number, peer_name
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, 'inbound', p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
      'whatsapp', v_contact_phone, v_contact_name
    ) RETURNING id, status INTO v_call_id, v_persisted_status;
  END IF;

  IF p_should_notify AND v_persisted_status = 'ringing' AND v_agent_user_id IS NOT NULL THEN
    v_notification_candidate := CASE
      WHEN v_event_id IS NULL THEN gen_random_uuid()
      ELSE md5(
        'zapp:incoming-call:v1:' || p_whatsapp_connection_id::text || ':' || v_event_id
      )::uuid
    END;

    INSERT INTO public.notifications (id, user_id, type, title, message, metadata)
    VALUES (
      v_notification_candidate,
      v_agent_user_id,
      'incoming_call',
      CASE WHEN p_is_video THEN '📹 Chamada de vídeo recebida' ELSE '📞 Chamada de voz recebida' END,
      COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato') || ' está ligando para você',
      jsonb_strip_nulls(jsonb_build_object(
        'contact_id', p_contact_id,
        'contact_name', COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato'),
        'phone', v_contact_phone,
        'is_video', p_is_video,
        'call_status', v_persisted_status,
        'whatsapp_connection_id', p_whatsapp_connection_id,
        'call_id', v_call_id,
        'event_id', v_event_id
      ))
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_notification_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_notification_created := v_row_count = 1;
    IF NOT v_notification_created THEN
      v_notification_id := v_notification_candidate;
      SELECT n.user_id, n.type, n.metadata INTO v_existing_notification
      FROM public.notifications AS n
      WHERE n.id = v_notification_candidate;
      IF NOT FOUND
        OR v_existing_notification.user_id IS DISTINCT FROM v_agent_user_id
        OR v_existing_notification.type IS DISTINCT FROM 'incoming_call'
        OR v_existing_notification.metadata->>'event_id' IS DISTINCT FROM v_event_id THEN
        RAISE EXCEPTION 'incoming call notification identity conflict' USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_call_id,
    v_notification_id,
    v_notification_created,
    v_call_duplicate OR (
      p_should_notify AND v_agent_user_id IS NOT NULL
      AND v_event_id IS NOT NULL AND NOT v_notification_created
    );
END;
$function$;

-- ---------------------------------------------------------------------
-- 8. ACL das funções novas (SECURITY INVOKER: nada de execução anônima)
-- ---------------------------------------------------------------------
revoke all on function public.search_my_calls(text, text, text, text, timestamptz, timestamptz, text, integer, integer) from public;
revoke all on function public.search_my_calls(text, text, text, text, timestamptz, timestamptz, text, integer, integer) from anon;
revoke all on function public.my_calls_kpi(text, text, timestamptz, timestamptz) from public;
revoke all on function public.my_calls_kpi(text, text, timestamptz, timestamptz) from anon;
revoke all on function public.upsert_my_call(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz, text, integer) from public;
revoke all on function public.upsert_my_call(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz, text, integer) from anon;
revoke all on function public.set_call_agent_notes(uuid, text) from public;
revoke all on function public.set_call_agent_notes(uuid, text) from anon;

grant execute on function public.search_my_calls(text, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated;
grant execute on function public.my_calls_kpi(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.upsert_my_call(uuid, text, text, text, text, text, uuid, text, timestamptz, timestamptz, text, integer) to authenticated;
grant execute on function public.set_call_agent_notes(uuid, text) to authenticated;
