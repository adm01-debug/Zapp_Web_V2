-- E16 (PLANO_MELHORIAS_50): remove índice duplicado em talkx_template_versions.
-- idx_talkx_template_versions_template_version (template_id, version_number DESC)
-- é redundante com a unique talkx_template_versions_template_id_version_number_key
-- (template_id, version_number ASC) — mesma cobertura de colunas; um btree serve
-- ORDER BY ... DESC via backward scan sem custo relevante. 0 linhas na tabela e
-- 0 idx_scan em ambos hoje (Talk X em desenvolvimento ativo) — sem risco de plano
-- de query pior em produção.
DROP INDEX IF EXISTS public.idx_talkx_template_versions_template_version;
