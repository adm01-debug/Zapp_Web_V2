-- Corrige forward-only a FK saved_by criada no runtime com NO ACTION.
-- A versao 20260909210000 ja esta registrada e nunca deve ser reescrita.

DO $migration$
DECLARE
  v_saved_by_attnum smallint;
  v_profile_id_attnum smallint;
BEGIN
  SELECT attnum INTO v_saved_by_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.talkx_template_versions'::regclass
    AND attname = 'saved_by'
    AND NOT attisdropped;

  SELECT attnum INTO v_profile_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.profiles'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  IF v_saved_by_attnum IS NULL OR v_profile_id_attnum IS NULL THEN
    RAISE EXCEPTION 'talkx_history_saved_by_fk_columns_missing'
      USING ERRCODE = '42703';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.talkx_template_versions'::regclass
      AND constraint_row.conname = 'talkx_template_versions_saved_by_fkey'
      AND NOT (
        constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'public.profiles'::regclass
        AND constraint_row.conkey = ARRAY[v_saved_by_attnum]::smallint[]
        AND constraint_row.confkey = ARRAY[v_profile_id_attnum]::smallint[]
        AND constraint_row.confdeltype = 'n'
      )
  ) THEN
    ALTER TABLE public.talkx_template_versions
      DROP CONSTRAINT talkx_template_versions_saved_by_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.talkx_template_versions'::regclass
      AND constraint_row.conname = 'talkx_template_versions_saved_by_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'public.profiles'::regclass
      AND constraint_row.conkey = ARRAY[v_saved_by_attnum]::smallint[]
      AND constraint_row.confkey = ARRAY[v_profile_id_attnum]::smallint[]
      AND constraint_row.confdeltype = 'n'
  ) THEN
    ALTER TABLE public.talkx_template_versions
      ADD CONSTRAINT talkx_template_versions_saved_by_fkey
      FOREIGN KEY (saved_by) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  ALTER TABLE public.talkx_template_versions
    VALIDATE CONSTRAINT talkx_template_versions_saved_by_fkey;
END;
$migration$;

COMMENT ON CONSTRAINT talkx_template_versions_saved_by_fkey
  ON public.talkx_template_versions IS
  'Preserva o snapshot quando o perfil autor e removido; saved_by torna-se NULL.';
