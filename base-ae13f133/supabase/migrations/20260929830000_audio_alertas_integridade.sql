-- Integridade do volume dos alertas do sistema (public.user_settings.sound_volume).
--
-- 1) Trava a faixa no banco, a mesma do controle no painel (Slider 10-100) e do
--    clamp do front: valor fora da faixa passa a ser RECUSADO na escrita, em vez
--    de virar lixo silencioso (até aqui o front só clampa na leitura, então um
--    valor gravado por fora — SQL, service_role, integração — ficava no banco).
-- 2) Corrige o COMMENT, que dizia "0-100" enquanto o contrato real é 10-100:
--    "mudo" é o `sound_enabled`, não volume 0 (0 lido viraria 10 no front).
--
-- Nenhuma linha viola a faixa: verificado no banco canônico (2 linhas, min=70, max=70).
-- NULL continua permitido de propósito — o hook usa o default 70 quando a coluna é nula.
--
-- Classe CONTRATO (ADD CONSTRAINT + VALIDATE + COMMENT): o hermes-tarefa-mergear
-- aplica depois do merge e do deploy, para a produção não rodar código velho
-- contra schema novo.

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_sound_volume_range
  CHECK (sound_volume BETWEEN 10 AND 100) NOT VALID;

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_sound_volume_range;

COMMENT ON COLUMN public.user_settings.sound_volume IS
  'Volume dos alertas do sistema, 10-100 (default 70; mesmo intervalo do Slider do painel e do DEFAULT_SETTINGS do front). Mudo = sound_enabled.';
