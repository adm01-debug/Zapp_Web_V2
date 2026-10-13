-- templates_global_e_save_business_hours
-- Rollback: solta a RPC save_business_hours e remove as duas policies restritivas que exigem staff para is_global; as policies originais de message_templates ficam intactas.
-- Rollback (SQL executável, na ordem):
--   drop policy if exists message_templates_is_global_insert_requer_staff on public.message_templates;
--   drop policy if exists message_templates_is_global_update_requer_staff on public.message_templates;
--   drop function if exists public.save_business_hours(uuid, jsonb);
--
-- Dois defeitos de banco, um arquivo (cartao templates-global-e-business-hours):
--
-- 1) message_templates.is_global so podia ser marcado por admin/supervisor. Hoje as policies
--    "Users can create/update their own templates" so olham para user_id = auth.uid(); qualquer
--    agente autenticado faz INSERT com is_global = true (user_id = si mesmo) e a policy de SELECT
--    "user_id = auth.uid() OR is_global = true" passa a entregar o template para a organizacao
--    inteira. O formulario nao expoe o campo, mas a API aceita — e a RLS e a unica barreira do
--    PostgREST. Correcao por RLS: policies RESTRICTIVE (somam por AND com as permissivas) exigindo
--    staff quando is_global for true, no INSERT e no UPDATE. Nenhuma policy existente e trocada.
--
-- 2) Horario comercial atomico: o app salvava dia a dia (upsert em laco no cliente). Falha no
--    5o dia deixava 4 aplicados e 3 nao — estado misto. A RPC save_business_hours(connection, days)
--    valida TUDO antes de escrever (uma funcao = uma transacao: falha = nada aplicado) e NAO cria
--    nem toca away_messages (o cliente criava a mensagem de ausencia de brinde no mesmo fluxo).
--    Quem gerencia a conexao = admin/supervisor (unica autoridade para business_hours); a funcao e
--    SECURITY DEFINER, entao a checagem e explicita e vem antes de qualquer escrita.

-- ── 1) is_global exige staff (admin/supervisor) ─────────────────────────────
DROP POLICY IF EXISTS message_templates_is_global_insert_requer_staff ON public.message_templates;
CREATE POLICY message_templates_is_global_insert_requer_staff
  ON public.message_templates
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (is_global IS NOT TRUE OR public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS message_templates_is_global_update_requer_staff ON public.message_templates;
CREATE POLICY message_templates_is_global_update_requer_staff
  ON public.message_templates
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (is_global IS NOT TRUE OR public.is_admin_or_supervisor(auth.uid()));

-- ── 2) RPC de horario comercial atomica ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_business_hours(
  p_connection_id uuid,
  p_days jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_day jsonb;
  v_dow text;
  v_open text;
  v_close text;
  v_dups integer;
BEGIN
  -- Quem chama: so admin/supervisor (autoridade real sobre business_hours). Negar por padrao.
  IF v_caller IS NULL OR NOT public.is_admin_or_supervisor(v_caller) THEN
    RAISE EXCEPTION 'sem_permissao_para_salvar_horario' USING ERRCODE = '42501';
  END IF;

  -- Entrada: array JSON nao vazio; a conexao precisa existir.
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' OR jsonb_array_length(p_days) = 0 THEN
    RAISE EXCEPTION 'p_days_deve_ser_array_nao_vazio' USING ERRCODE = '22023';
  END IF;
  -- Teto duro: no maximo 7 dias (garante loop limitado e evita lote arbitrario).
  IF jsonb_array_length(p_days) > 7 THEN
    RAISE EXCEPTION 'p_days_tem_mais_de_7_dias' USING ERRCODE = '22023';
  END IF;
  IF p_connection_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.whatsapp_connections WHERE id = p_connection_id) THEN
    RAISE EXCEPTION 'conexao_nao_encontrada' USING ERRCODE = '22023';
  END IF;

  -- ── VALIDACAO COMPLETA ANTES DE ESCREVER (tudo-ou-nada) ───────────────────
  -- LIMIT 7 alem do teto acima: loop com numero de voltas fixo e auditavel.
  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days) LIMIT 7 LOOP
    IF jsonb_typeof(v_day) <> 'object' THEN
      RAISE EXCEPTION 'dia_deve_ser_objeto' USING ERRCODE = '22023';
    END IF;

    v_dow   := v_day ->> 'day_of_week';
    v_open  := v_day ->> 'open_time';
    v_close := v_day ->> 'close_time';

    IF v_dow IS NULL OR v_dow !~ '^[0-6]$' THEN
      RAISE EXCEPTION 'day_of_week_invalido' USING ERRCODE = '22023';
    END IF;
    -- HH:MM estrito (24h, dois digitos): o banco guarda time sem fuso.
    IF v_open IS NULL OR v_open !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'open_time_invalido' USING ERRCODE = '22023';
    END IF;
    IF v_close IS NULL OR v_close !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'close_time_invalido' USING ERRCODE = '22023';
    END IF;

    -- is_open opcional: ausente = mantem aberto (default da tabela). Quando aberto, exige intervalo.
    IF coalesce((v_day ->> 'is_open')::boolean, true) THEN
      IF v_open::time >= v_close::time THEN
        RAISE EXCEPTION 'intervalo_invalido' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  -- dia da semana repetido: o ON CONFLICT nao pode afetar a mesma linha duas vezes.
  SELECT count(*) INTO v_dups FROM (
    SELECT (e ->> 'day_of_week')::int AS d
      FROM jsonb_array_elements(p_days) e
     GROUP BY 1 HAVING count(*) > 1
  ) repetidos;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'day_of_week_repetido' USING ERRCODE = '22023';
  END IF;

  -- ── APLICA (dentro da transacao da funcao) ────────────────────────────────
  -- Upsert dos dias enviados. NAO remove dias ausentes (paridade com o comportamento
  -- atual) e NAO toca away_messages (efeito colateral do fluxo antigo removido).
  INSERT INTO public.business_hours AS bh
    (whatsapp_connection_id, day_of_week, is_open, open_time, close_time)
  SELECT p_connection_id,
         (e ->> 'day_of_week')::int,
         coalesce((e ->> 'is_open')::boolean, true),
         (e ->> 'open_time')::time,
         (e ->> 'close_time')::time
    FROM jsonb_array_elements(p_days) e
  ON CONFLICT (whatsapp_connection_id, day_of_week) DO UPDATE
     SET is_open    = EXCLUDED.is_open,
         open_time  = EXCLUDED.open_time,
         close_time = EXCLUDED.close_time;
END;
$$;

-- ACL pela assinatura exata: fecha para PUBLIC/anon, abre so para authenticated.
REVOKE ALL ON FUNCTION public.save_business_hours(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_hours(uuid, jsonb) TO authenticated;
