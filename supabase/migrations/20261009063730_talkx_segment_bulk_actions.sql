-- talkx_segment_bulk_actions
-- Rollback: drop function if exists public.talkx_segment_bulk_action(text, uuid[], text);
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_segment_bulk_action(text, uuid[], text);
--
-- TL-135a2 / X114 (Talk X · F09 Segmentos · tela 02 "biblioteca") — FATIA DE BANCO: a RPC das
-- AÇÕES EM MASSA da biblioteca de segmentos, com resultado POR SEGMENTO.
--
--   public.talkx_segment_bulk_action(p_action text, p_segment_ids uuid[], p_tag text)
--
-- Ações de biblioteca (X101/X114), todas por item:
--   'draft'      rascunhar  -> status='draft' (as regras PUBLICADAS não mudam)
--   'activate'   publicar/ativar -> status='active' e sai do arquivo (archived_at=null)
--   'deactivate' inativar   -> status='inactive'                [passa pela guarda de uso]
--   'archive'    arquivar   -> archived_at=now(), status='inactive' [N22: excluir = arquivar]
--   'tag'        adicionar tag -> tags = tags || p_tag (idempotente; p_tag é obrigatório)
--
-- A CHAMADA DEVOLVE UMA LINHA POR SEGMENTO PEDIDO (nunca uma linha só para o lote):
--   segment_id, action, succeeded, status, archived_at, tags, error_code, error_message.
-- Cada item roda em SUA PRÓPRIA SUBTRANSAÇÃO (BEGIN ... EXCEPTION WHEN OTHERS): o item recusado
-- vira uma linha succeeded=false com o SQLSTATE e a mensagem do erro, e o lote CONTINUA — o
-- primeiro erro não interrompe a lista (critério 2 do cartão). A resposta de um item que falhou
-- traz o estado ATUAL da linha (inalterada), para o front não mostrar mudança que não houve.
--
-- A GUARDA DE USO DE X101 NÃO É REESCRITA AQUI
-- A guarda é o gatilho talkx_segments_usage_guard (migration 20261009054459 / TL-129), que recusa
-- arquivar, inativar ou excluir segmento usado por campanha scheduled/sending/paused e devolve o
-- nome da campanha. Esta RPC apenas faz o UPDATE e deixa o GATILHO decidir: erro P0001
-- 'talkx_segment_in_use: ... campanha "<nome>" ...' volta na linha daquele segmento. Nenhuma regra
-- de uso é duplicada em PL/pgSQL — não há como divergir do banco. 'draft' e 'tag' não mexem em
-- status/arquivamento, então a guarda não os alcança (e não devem ser barrados: a campanha já
-- agendada mantém o público gerado — ver X110).
--
-- QUEM PODE CHAMAR (SECURITY DEFINER, dono = postgres: RLS NÃO se aplica dentro dela)
--   1. chamador authenticated com perfil ATIVO e papel admin/supervisor (A12/X101: as ações de
--      biblioteca de segmentos são de admin/supervisor, como as de campanha em 20261002381230);
--   2. para CADA linha, o predicado de autorização da própria RLS de talkx_segments
--      (created_by = perfil do chamador OR admin/supervisor). Com o portão (1) sempre verdadeiro o
--      item (2) passa; ele fica como defesa em profundidade caso o portão seja afrouxado um dia.
--   Item que não existe e item fora do alcance respondem IGUAL ('talkx_segment_not_found',
--   P0002) — sem oráculo de existência.
--
-- SEM DML NESTA MIGRATION: nenhuma linha de talkx_segments é alterada ao aplicar; as ações em
-- massa só rodam quando a RPC é chamada pelo cliente. Por isso o rollback é o DROP da função
-- (o DROP leva junto os GRANTs dela). O que o cliente já tiver feito pelas chamadas da RPC NÃO
-- é desfeito pelo rollback (é dado de negócio, como em qualquer update da tela).
--
-- Classe: aditiva (CREATE FUNCTION nova + GRANT). Idempotente: CREATE OR REPLACE + REVOKE/GRANT.

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
  v_limite_lote      constant integer := 200;
  v_tag_max          constant integer := 40;
begin
  -- 1. Quem chama ---------------------------------------------------------------
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

  -- X101/A12: as ações de biblioteca de segmentos são de admin/supervisor. O gate roda ANTES de
  -- qualquer leitura/escrita e vale para o LOTE inteiro (negado por padrão).
  if coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true then
    raise exception 'talkx_segment_role_required' using errcode = '42501';
  end if;

  -- 2. Entrada (tudo validado ANTES de qualquer escrita: erro de entrada = nada aplicado) ----
  if p_action is null or p_action not in ('draft', 'activate', 'deactivate', 'archive', 'tag') then
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
    -- p_tag só existe para a ação 'tag'; mandar tag em outra ação é erro de contrato (falha
    -- fechada: melhor recusar do que voltar "sucesso" sem ter gravado a tag).
    raise exception 'invalid_talkx_segment_bulk_payload' using errcode = '22023';
  end if;

  -- Ids duplicados são processados UMA vez e a ordem de processamento é por id crescente
  -- (mesma ordem de trava em todas as chamadas: evita deadlock entre dois lotes concorrentes).
  select array_agg(distinct pedido.id order by pedido.id) into v_ids
    from unnest(p_segment_ids) as pedido(id);

  -- 3. Item por item, cada um na sua subtransação -------------------------------------------
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

      -- Sem oráculo: inexistente e "existe mas fora do alcance" respondem IGUAL (o texto não
      -- carrega o id nem o motivo).
      if not found
         or (v_seg.created_by is distinct from v_actor_profile_id
             and coalesce(public.is_admin_or_supervisor(auth.uid()), false) is not true) then
        raise exception 'talkx_segment_not_found' using errcode = 'P0002';
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

      elsif p_action = 'deactivate' then
        -- Passa pela guarda de uso (status 'inactive' é "sair de cena").
        update public.talkx_segments s
           set status = 'inactive',
               updated_at = v_now
         where s.id = v_id
        returning s.* into v_seg;

      elsif p_action = 'archive' then
        -- Passa pela guarda de uso. Re-arquivar quem já está arquivado é no-op (archived_at e
        -- status não mudam) e por isso NÃO é barrado pela guarda — repetir a ação não vira erro.
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
        -- A subtransação desfez só ESTE item; o lote continua. v_seg segue com a linha lida
        -- antes da tentativa (inalterada), então a resposta mostra o estado real.
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
  'Talk X (X114 / TL-135): ações em massa da biblioteca de segmentos (draft, activate, deactivate, archive, tag) com resultado POR SEGMENTO. Cada item roda na sua subtransação e a guarda de uso de X101 (gatilho talkx_segments_usage_guard) decide arquivar/inativar, devolvendo o nome da campanha no error_message do item. Exige admin/supervisor (A12).';

-- Nasce fechada: EXECUTE só para o cliente autenticado. (O dono é postgres; o REVOKE de PUBLIC
-- é pela ASSINATURA EXATA, 3 argumentos — um overload novo nasceria aberto se não fosse assim.)
revoke all on function public.talkx_segment_bulk_action(text, uuid[], text) from public, anon, authenticated;
grant execute on function public.talkx_segment_bulk_action(text, uuid[], text) to authenticated;
