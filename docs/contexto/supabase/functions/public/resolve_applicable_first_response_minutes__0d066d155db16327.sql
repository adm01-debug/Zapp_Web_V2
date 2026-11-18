CREATE OR REPLACE FUNCTION public.resolve_applicable_first_response_minutes(p_contact_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company text;
  v_job_title text;
  v_contact_type text;
  v_queue_id uuid;
  v_assigned_to uuid;
  v_company_minutes integer;
  v_job_title_minutes integer;
  v_contact_type_minutes integer;
  v_queue_minutes integer;
  v_agent_minutes integer;
  v_minutes integer;
  r record;
BEGIN
  SELECT c.company, c.job_title, c.contact_type, c.queue_id, c.assigned_to
  INTO v_company, v_job_title, v_contact_type, v_queue_id, v_assigned_to
  FROM public.contacts c
  WHERE c.id = p_contact_id;

  FOR r IN
    SELECT rule.first_response_minutes, rule.contact_id, rule.company,
           rule.job_title, rule.contact_type, rule.queue_id, rule.agent_id
    FROM public.sla_rules rule
    WHERE rule.is_active = true
    ORDER BY rule.priority DESC, rule.created_at, rule.id
  LOOP
    IF r.contact_id IS NOT NULL AND r.contact_id = p_contact_id THEN
      RETURN r.first_response_minutes;
    END IF;
    IF v_company_minutes IS NULL AND r.contact_id IS NULL
       AND r.company IS NOT NULL AND r.company = v_company THEN
      v_company_minutes := r.first_response_minutes;
    END IF;
    IF v_job_title_minutes IS NULL AND r.contact_id IS NULL AND r.company IS NULL
       AND r.job_title IS NOT NULL AND r.job_title = v_job_title THEN
      v_job_title_minutes := r.first_response_minutes;
    END IF;
    IF v_contact_type_minutes IS NULL AND r.contact_id IS NULL AND r.company IS NULL
       AND r.job_title IS NULL AND r.contact_type IS NOT NULL
       AND r.contact_type = v_contact_type THEN
      v_contact_type_minutes := r.first_response_minutes;
    END IF;
    IF v_queue_minutes IS NULL AND r.contact_id IS NULL
       AND r.queue_id IS NOT NULL AND r.queue_id = v_queue_id THEN
      v_queue_minutes := r.first_response_minutes;
    END IF;
    IF v_agent_minutes IS NULL AND r.contact_id IS NULL
       AND r.agent_id IS NOT NULL AND r.agent_id = v_assigned_to THEN
      v_agent_minutes := r.first_response_minutes;
    END IF;
  END LOOP;

  v_minutes := coalesce(v_company_minutes, v_job_title_minutes, v_contact_type_minutes,
                        v_queue_minutes, v_agent_minutes);
  IF v_minutes IS NOT NULL THEN
    RETURN v_minutes;
  END IF;

  SELECT sc.first_response_minutes
  INTO v_minutes
  FROM public.sla_configurations sc
  WHERE sc.is_active = true AND sc.is_default = true
  LIMIT 1;

  RETURN coalesce(v_minutes, 5);
END;
$function$
