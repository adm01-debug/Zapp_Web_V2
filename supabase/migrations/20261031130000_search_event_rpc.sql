-- search_event_rpc
-- A migration de eventos criou a tabela, mas o frontend passou a chamar esta RPC
-- sem que ela tivesse sido versionada. O evento da busca e o clique precisam
-- compartilhar um ID opaco para o clique atualizar a linha, sem contar outra busca.
-- O texto da busca é usado apenas em memória para validação e comprimento; nunca é
-- persistido, incluído em retorno, ou escrito em mensagem de erro.
--
-- Rollback:
--   drop function if exists public.log_search_event(text, integer, boolean, uuid, text);
--   drop index if exists public.search_events_user_event_id_key;
--   alter table public.search_events drop column if exists client_event_id;
--   create policy "Users can register their own search events" on public.search_events
--     for insert to authenticated with check (user_id = (select auth.uid()));
--   grant insert on table public.search_events to authenticated;

alter table public.search_events
  add column client_event_id uuid;

update public.search_events
   set client_event_id = gen_random_uuid()
 where client_event_id is null;

alter table public.search_events
  alter column client_event_id set default gen_random_uuid(),
  alter column client_event_id set not null;

create unique index search_events_user_event_id_key
  on public.search_events (user_id, client_event_id);

-- A tabela deixa de aceitar INSERT direto do cliente: isso impediria a RPC de
-- aplicar o mesmo filtro de PII e a correlação idempotente de busca/clique.
drop policy if exists "Users can register their own search events" on public.search_events;
revoke insert on table public.search_events from authenticated;

create or replace function public.log_search_event(
  p_term text,
  p_result_count integer,
  p_clicked boolean,
  p_event_id uuid default null,
  p_result_kind text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_term text := btrim(coalesce(p_term, ''));
  v_term_length integer;
  v_had_results boolean;
  v_event_id uuid;
  v_result_kind text;
begin
  -- A RPC é exclusivamente para uma sessão de usuário. SECURITY DEFINER ignora
  -- a RLS da tabela, então a identidade vem apenas das claims validadas do JWT.
  if auth.role() is distinct from 'authenticated' or v_user_id is null then
    raise exception 'not authorized'
      using errcode = '42501';
  end if;

  v_term_length := char_length(v_term);
  if p_result_count is null
     or p_result_count < 0
     or v_term_length < 3
     or v_term_length > 200 then
    return;
  end if;

  -- Segunda barreira de privacidade. Não gravar nem ecoar e-mail, telefone/CPF/
  -- CNPJ ou token, ainda que um cliente alterado ignore o filtro local.
  if position('@' in v_term) > 0
     or length(regexp_replace(v_term, '[^0-9]', '', 'g')) >= 7
     or v_term ~ '[A-Za-z0-9._~+/=-]{32,}' then
    return;
  end if;

  v_had_results := p_result_count > 0;
  if p_clicked is true and not v_had_results then
    return;
  end if;
  -- Defaults preservam compatibilidade transitória com clientes antigos; novas
  -- versões sempre enviam o UUID para correlacionar busca e clique sem heurística.
  v_event_id := coalesce(p_event_id, gen_random_uuid());
  v_result_kind := case
    when p_clicked is not true then null
    when p_result_kind in ('message', 'contact', 'transcription', 'action', 'crm', 'other') then p_result_kind
    else 'other'
  end;

  insert into public.search_events
    (user_id, client_event_id, term_length, had_results, result_kind, clicked)
  values
    (v_user_id, v_event_id, v_term_length, v_had_results,
     v_result_kind,
     coalesce(p_clicked, false))
  on conflict (user_id, client_event_id) do update
     set clicked = true,
         result_kind = excluded.result_kind
   where excluded.clicked is true
     and excluded.result_kind is not null
     and public.search_events.clicked is false
     and public.search_events.had_results = excluded.had_results
     and public.search_events.term_length = excluded.term_length;
end;
$function$;

revoke all on function public.log_search_event(text, integer, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.log_search_event(text, integer, boolean, uuid, text)
  to authenticated;

comment on function public.log_search_event(text, integer, boolean, uuid, text) is
  'Registra evento agregado da busca sem persistir o termo; o UUID opaco correlaciona o clique com a busca e torna a atualização idempotente.';
