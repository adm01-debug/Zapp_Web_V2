CREATE OR REPLACE FUNCTION public.purge_gmail_account_data(p_account_id uuid, p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_account public.gmail_accounts; v_mask text;
  v_att bigint:=0; v_msg bigint:=0; v_thr bigint:=0; v_draft bigint:=0; v_details jsonb;
BEGIN
  IF public.is_admin(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_account FROM public.gmail_accounts WHERE id=p_account_id FOR UPDATE;
  IF NOT FOUND OR v_account.is_active IS TRUE OR p_confirm IS DISTINCT FROM v_account.email_address THEN RAISE EXCEPTION 'purge_not_allowed' USING ERRCODE='22023'; END IF;
  DELETE FROM public.email_attachments a WHERE a.email_message_id IN (SELECT m.id FROM public.email_messages m WHERE m.gmail_account_id=p_account_id);
  GET DIAGNOSTICS v_att=ROW_COUNT;
  DELETE FROM public.email_messages WHERE gmail_account_id=p_account_id;
  GET DIAGNOSTICS v_msg=ROW_COUNT;
  DELETE FROM public.email_threads WHERE gmail_account_id=p_account_id;
  GET DIAGNOSTICS v_thr=ROW_COUNT;
  IF to_regclass('public.email_drafts') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.email_drafts WHERE gmail_account_id=$1' USING p_account_id;
    GET DIAGNOSTICS v_draft=ROW_COUNT;
  END IF;
  v_mask:=left(split_part(v_account.email_address,'@',1),1)||'***@***';
  v_details:=jsonb_build_object('account_id',p_account_id,'email_masked',v_mask,'deleted',jsonb_build_object('email_attachments',v_att,'email_messages',v_msg,'email_threads',v_thr,'email_drafts',v_draft),'total_rows',v_att+v_msg+v_thr+v_draft);
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,details) VALUES (auth.uid(),'gmail_account_data_purged','gmail_account',p_account_id,v_details);
  RETURN v_details;
END;
$function$
