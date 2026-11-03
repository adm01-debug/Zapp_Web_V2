CREATE OR REPLACE FUNCTION public.fn_capture_csat_replies(p_limit integer DEFAULT 50)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limit integer;
  v_captured integer := 0;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_csat_limit' using errcode = '22023';
  end if;
  v_limit := least(p_limit, 500);

  -- Resposta = mensagem ENTRANTE (sender 'contact'), texto de um dígito 1..5,
  -- dentro da janela de 72 h do convite. A mais antiga da janela é a resposta.
  -- Idempotente: só linhas ainda 'sent' e sem nota entram; rodar de novo captura 0.
  with respostas as (
    select distinct on (s.id)
           s.id               as survey_id,
           btrim(m.content)::integer as rating,
           m.created_at       as responded_at
      from public.csat_surveys s
      join public.messages m
        on m.contact_id = s.contact_id
       and m.sender = 'contact'
       and coalesce(m.is_deleted, false) = false
       and btrim(m.content) ~ '^[1-5]$'
       and m.created_at >= s.send_at
       and m.created_at <= s.send_at + interval '72 hours'
     where s.status = 'sent'
       and s.rating is null
       and s.responded_at is null
     order by s.id, m.created_at
     limit v_limit
  )
  update public.csat_surveys s
     set rating       = r.rating,
         responded_at = r.responded_at,
         status       = 'responded'
    from respostas r
   where s.id = r.survey_id
     and s.status = 'sent'
     and s.rating is null
     and s.responded_at is null;
  get diagnostics v_captured = row_count;
  return v_captured;
end;
$function$
