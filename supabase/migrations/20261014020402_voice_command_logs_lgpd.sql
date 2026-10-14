-- voice_command_logs: retencao LGPD — limite de tamanho, exclusao pelo titular e expurgo por prazo
-- Rollback: remove tudo o que esta migration cria, na ordem inversa, sem tocar em dado nenhum:
-- Rollback (SQL executavel, na ordem):
--   DROP FUNCTION IF EXISTS public.purge_voice_command_logs(integer, integer);
--   DROP POLICY IF EXISTS "Users can delete own voice logs" ON public.voice_command_logs;
--   ALTER TABLE public.voice_command_logs DROP CONSTRAINT IF EXISTS voice_command_logs_response_length_check;
--   ALTER TABLE public.voice_command_logs DROP CONSTRAINT IF EXISTS voice_command_logs_transcript_length_check;

-- Migration idempotente: pode rodar sobre uma base que ja recebeu a versao anterior
-- (20261014020120) sem erro — a constraint so entra se ainda nao existir, a policy e
-- recriada e a funcao usa CREATE OR REPLACE.

-- 1) Limite de tamanho (LGPD: minimizacao). Transcricao e resposta ficam em no
--    maximo 2000 caracteres.
--    NOT VALID de proposito: a constraint NAO revalida as linhas ja gravadas (nao
--    quebra o historico nem dispara gatilho algum); passa a valer para todo INSERT e
--    todo UPDATE novo. A validacao retroativa (VALIDATE CONSTRAINT) fica para o cartao
--    de expurgo, depois que o prazo tiver removido o historico acima do limite.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.voice_command_logs'::regclass
       AND conname = 'voice_command_logs_transcript_length_check') THEN
    ALTER TABLE public.voice_command_logs
      ADD CONSTRAINT voice_command_logs_transcript_length_check
      CHECK (char_length(transcript) <= 2000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.voice_command_logs'::regclass
       AND conname = 'voice_command_logs_response_length_check') THEN
    ALTER TABLE public.voice_command_logs
      ADD CONSTRAINT voice_command_logs_response_length_check
      CHECK (response IS NULL OR char_length(response) <= 2000) NOT VALID;
  END IF;
END $$;

-- 2) Direito de exclusao do titular: o usuario autenticado apaga SOMENTE os proprios
--    registros (a policy de SELECT ja restringe a leitura; faltava a de DELETE).
DROP POLICY IF EXISTS "Users can delete own voice logs" ON public.voice_command_logs;
CREATE POLICY "Users can delete own voice logs"
  ON public.voice_command_logs
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 3) Expurgo por prazo (LGPD — PD-13: 90 dias para logs de atividade desta familia),
--    EM LOTE (LIMIT) e REPETIVEL: cada chamada apaga no maximo p_limit linhas vencidas,
--    em lotes, e chamar de novo ate retornar deleted = 0 drena o restante.
--    SECURITY DEFINER + search_path fixo + EXECUTE so para service_role: mesmo padrao
--    de public.purge_talkx_expired_data. O DELETE roda como o dono da tabela, entao
--    nao depende de RLS (que so vale para o titular).
CREATE OR REPLACE FUNCTION public.purge_voice_command_logs(
  p_retention_days integer DEFAULT 90,
  p_limit integer DEFAULT 1000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_deleted integer;
  v_total bigint := 0;
  v_batches integer := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_retention_days IS NULL OR p_retention_days NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'invalid_voice_purge_days: %', p_retention_days USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_voice_purge_limit: %', p_limit USING ERRCODE = '22023';
  END IF;

  -- Teto de 100 lotes por chamada: nunca roda sem fim; o que sobrar fica para a
  -- proxima chamada (por isso "repetivel"). 'batches' conta so lotes com exclusao.
  LOOP
    DELETE FROM public.voice_command_logs
     WHERE id IN (
       SELECT id FROM public.voice_command_logs
        WHERE created_at < now() - make_interval(days => p_retention_days)
        ORDER BY created_at
        LIMIT p_limit
     );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    EXIT WHEN v_deleted = 0;
    v_total := v_total + v_deleted;
    v_batches := v_batches + 1;
    EXIT WHEN v_deleted < p_limit OR v_batches >= 100;
  END LOOP;

  RETURN jsonb_build_object(
    'table', 'voice_command_logs',
    'retention_days', p_retention_days,
    'deleted', v_total,
    'batches', v_batches
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_voice_command_logs(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_voice_command_logs(integer, integer) TO service_role;
