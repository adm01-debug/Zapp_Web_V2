CREATE OR REPLACE FUNCTION public.talkx_segment_block_in_use()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_segment_id      uuid;
  v_saindo_de_cena  boolean;
  v_campaign_name   text;
  v_campaign_status text;
begin
  if tg_op = 'DELETE' then
    v_segment_id     := old.id;
    v_saindo_de_cena := true;
  else
    v_segment_id := new.id;
    -- so barrar o ATO de sair de cena: arquivar agora ou inativar agora. Renomear,
    -- marcar favorito ou gravar rascunho de um segmento ja arquivado seguem livres.
    v_saindo_de_cena := (new.archived_at is not null and old.archived_at is null)
                     or (new.status = 'inactive' and old.status is distinct from 'inactive');
    if not v_saindo_de_cena then
      return new;
    end if;
  end if;

  select c.name, c.status
    into v_campaign_name, v_campaign_status
    from public.talkx_campaigns c
   where c.status in ('scheduled','sending','paused')
     and (
       c.segment_id = v_segment_id
       or exists (
         select 1 from public.talkx_campaign_segments cs
          where cs.campaign_id = c.id
            and cs.segment_id  = v_segment_id
       )
     )
   order by c.created_at
   limit 1;

  if v_campaign_name is not null then
    raise exception
      'talkx_segment_in_use: o segmento % esta em uso pela campanha "%" (%) e nao pode ser arquivado, inativado nem excluido',
      v_segment_id, v_campaign_name, v_campaign_status
      using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$
