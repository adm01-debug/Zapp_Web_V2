-- Reconcilia custom_variables com prefixo de digito em talkx_templates e talkx_template_versions.
-- Esta migration é companion de 20260909210000: a lógica foi extraída para cá porque
-- 20260909210000 já está registrada no ledger de produção e não seria reaplicada.
-- As tabelas e colunas necessárias são garantidas pelas migrations anteriores.
DO $
BEGIN
  -- Reconciliar custom_variables com digito na posicao inicial (legado do editor anterior)
  -- Renomeia variaveis E atualiza placeholders no content atomicamente.
  -- Mapeamento livre de colisao: se '_' || old ja existe no array, usa '__' || old, etc.
  DECLARE
    _row    RECORD;
    _new_vars text[];
    _content  text;
    _old_var  text;
    _new_var  text;
    _i        int;
  BEGIN
    FOR _row IN
      SELECT id, content, custom_variables
      FROM public.talkx_templates
      WHERE EXISTS (
        SELECT 1 FROM unnest(COALESCE(custom_variables, '{}'::text[])) AS cv
        WHERE cv ~ '^[0-9]'
      )
    LOOP
      _new_vars := _row.custom_variables;
      _content  := _row.content;
      FOR _i IN 1..COALESCE(array_length(_row.custom_variables, 1), 0) LOOP
        _old_var := _row.custom_variables[_i];
        IF _old_var ~ '^[0-9]' THEN
          _new_var := left('_' || _old_var, 64);
          -- Evitar colisao com valor ja existente no array
          WHILE _new_var = ANY(_new_vars) AND _new_vars[_i] <> _new_var LOOP
            _new_var := left('_' || _new_var, 64);
          END LOOP;
          _new_vars[_i] := _new_var;
          -- Atualizar placeholder correspondente no content
          _content := replace(_content, '{{' || _old_var || '}}', '{{' || _new_var || '}}');
        END IF;
      END LOOP;
      UPDATE public.talkx_templates
      SET custom_variables = _new_vars,
          content = _content
      WHERE id = _row.id;
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='talkx_template_versions' AND column_name='custom_variables') THEN
        FOR _i IN 1..COALESCE(array_length(_row.custom_variables, 1), 0) LOOP
          _old_var := _row.custom_variables[_i];
          IF _old_var ~ '^[0-9]' THEN
            _new_var := left('_' || _old_var, 64);
            WHILE _new_var = ANY(_new_vars) AND _new_vars[_i] <> _new_var LOOP
              _new_var := left('_' || _new_var, 64);
            END LOOP;
            UPDATE public.talkx_template_versions
            SET custom_variables = ARRAY(
                  SELECT CASE WHEN cv = _old_var THEN _new_var ELSE cv END
                  FROM unnest(custom_variables) AS cv
                ),
                content = replace(content, '{{' || _old_var || '}}', '{{' || _new_var || '}}')
            WHERE template_id = _row.id
              AND _old_var = ANY(custom_variables);
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END;

  -- Reparar talkx_template_versions independentemente (vars de dígito removidas do template pai)
  DECLARE
    _vrow   RECORD;
    _vnvars text[];
    _vcont  text;
    _voldv  text;
    _vnewv  text;
    _vi     int;
  BEGIN
    FOR _vrow IN
        SELECT id, content, custom_variables
        FROM public.talkx_template_versions
        WHERE EXISTS (
          SELECT 1 FROM unnest(COALESCE(custom_variables, '{}'::text[])) AS cv WHERE cv ~ '^[0-9]'
        )
      LOOP
      _vnvars := _vrow.custom_variables;
      _vcont  := _vrow.content;
      FOR _vi IN 1..COALESCE(array_length(_vrow.custom_variables, 1), 0) LOOP
        _voldv := _vrow.custom_variables[_vi];
        IF _voldv ~ '^[0-9]' THEN
          _vnewv := left('_' || _voldv, 64);
          WHILE _vnewv = ANY(_vnvars) AND _vnvars[_vi] <> _vnewv LOOP
            _vnewv := left('_' || _vnewv, 64);
          END LOOP;
          _vnvars[_vi] := _vnewv;
          _vcont := replace(_vcont, '{{' || _voldv || '}}', '{{' || _vnewv || '}}');
        END IF;
      END LOOP;
        UPDATE public.talkx_template_versions
        SET custom_variables = _vnvars, content = _vcont WHERE id = _vrow.id;
      END LOOP;
  END;

END;
$;
