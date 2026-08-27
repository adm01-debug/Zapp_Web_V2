-- ============================================================================
-- FIX: regra max_file_size (25MB) estava morta no pipeline de mídia
-- ============================================================================
-- Data: 11/06/2026 · Zap Webb v2.0 · Promo Brindes
-- Origem: stress test de 827 simulações (auditoria de funcionalidades)
--
-- Bugs corrigidos:
--   1. fn_trg_security_check_media_queue (camada 1, BEFORE INSERT na
--      media_download_queue) não passava p_file_size := NEW.file_length ao
--      fn_validate_media_security — um arquivo de 95MB era aceito (status=pending).
--   2. fn_process_pending_scans (camada 2, cron #41) também não selecionava nem
--      passava file_length — o mesmo arquivo era marcado scan_status='clean'.
--   3. Ao bloquear na camada 1, o trigger setava status='blocked' mas deixava
--      scan_status='pending_scan' para sempre (estado inconsistente).
--
-- Validação pós-fix (re-teste no banco):
--   · INSERT 95MB  → status=blocked + scan_status=blocked + quarentena + alerta size_exceeded
--   · INSERT .exe  → blocked consistente nas duas colunas
--   · Camada 2 re-validando oversize → blocked
--   · JPG limpo    → segue clean (sem falso positivo)
--
-- OBS: já APLICADO no banco self-hosted (supabase.atomicabr.com.br) em
-- 11/06/2026. Este arquivo versiona o patch para reprodutibilidade.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_trg_security_check_media_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_result JSONB;
  v_ext TEXT;
BEGIN
  -- Extract extension from direct_path
  v_ext := regexp_replace(COALESCE(NEW.direct_path, ''), '^.*\.([a-zA-Z0-9]+)(\?.*)?$', '.\1');
  IF v_ext = NEW.direct_path THEN v_ext := NULL; END IF;

  v_result := fn_validate_media_security(
    p_mimetype := NEW.mimetype,
    p_extension := v_ext,
    p_file_size := NEW.file_length,           -- FIX 11/06/2026: regra max_file_size estava morta na camada 1
    p_message_id := NEW.message_id,
    p_instance := NEW.instance_name,
    p_remote_jid := NEW.remote_jid,
    p_media_meta := jsonb_build_object('media_key', NEW.media_key, 'direct_path', NEW.direct_path)
  );

  IF NOT (v_result->>'allowed')::boolean THEN
    NEW.status := 'blocked';
    NEW.scan_status := 'blocked';             -- FIX 11/06/2026: ficava pending_scan para sempre
    NEW.scan_result := v_result->>'reasons';
    NEW.scanned_at := now();
    NEW.error_message := v_result->>'reasons';
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_process_pending_scans(p_batch_size integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_processed INT := 0;
  v_blocked INT := 0;
  v_clean INT := 0;
  v_rec RECORD;
  v_result JSONB;
BEGIN
  FOR v_rec IN
    SELECT id, message_id, instance_name, mimetype, direct_path, media_key, file_length, remote_jid
    FROM media_download_queue
    WHERE scan_status = 'pending_scan'
      AND status IN ('pending', 'processing', 'done')
    ORDER BY id DESC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    v_processed := v_processed + 1;

    UPDATE media_download_queue SET scan_status = 'scanning' WHERE id = v_rec.id;

    v_result := fn_validate_media_security(
      p_mimetype := v_rec.mimetype,
      p_extension := regexp_replace(COALESCE(v_rec.direct_path, ''), '^.*\.([a-zA-Z0-9]+)(\?.*)?$', '.\1'),
      p_file_size := v_rec.file_length,       -- FIX 11/06/2026: camada 2 tambem nao validava tamanho
      p_message_id := v_rec.message_id,
      p_instance := v_rec.instance_name,
      p_remote_jid := v_rec.remote_jid
    );

    IF NOT (v_result->>'allowed')::boolean THEN
      UPDATE media_download_queue SET scan_status = 'blocked', scan_result = v_result->>'reasons', scanned_at = now(), status = 'blocked', error_message = 'SECURITY: ' || (v_result->>'reasons') WHERE id = v_rec.id;
      v_blocked := v_blocked + 1;
    ELSE
      UPDATE media_download_queue SET scan_status = 'clean', scan_result = 'type_check: OK', scanned_at = now() WHERE id = v_rec.id;
      v_clean := v_clean + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'clean', v_clean, 'blocked', v_blocked, 'scanned_at', now());
END;
$fn$;
