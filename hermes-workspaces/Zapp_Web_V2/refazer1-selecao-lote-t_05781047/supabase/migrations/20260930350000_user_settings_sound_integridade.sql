-- user_settings_sound_integridade
-- versão 20260930350000 reservada para hermes-banco-sound-volume-not-null-check-tipos-2609301720587c em 2026-09-30T17:21:11-03:00 (hermes-db-migrar --nova)
--
-- Etapa 6 do plano de alertas: fecha as duas lacunas de integridade de som em
-- public.user_settings (NOT NULL no volume + vocabulário fechado nos cinco tipos).
--
-- rollback: ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_message_sound_type_valid;
-- rollback: ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_mention_sound_type_valid;
-- rollback: ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_sla_sound_type_valid;
-- rollback: ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_goal_sound_type_valid;
-- rollback: ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_transcription_sound_type_valid;
-- rollback: ALTER TABLE public.user_settings ALTER COLUMN sound_volume DROP NOT NULL;
-- rollback: COMMENT ON COLUMN public.user_settings.sound_volume IS 'Volume dos alertas do sistema, 10-100 (default 70; mesmo intervalo do Slider do painel e do DEFAULT_SETTINGS do front). Mudo = sound_enabled.';
-- rollback: (os COMMENTs dos cinco *_sound_type voltam ao anterior, ou ficam ausentes, sem efeito funcional.)
--
-- ============================================================================
-- Estado anterior (verificado no banco canônico ANTES deste DDL)
-- ============================================================================
--   * `sound_volume` integer DEFAULT 70, ainda NULLABLE, com a CHECK 10-100 já
--     VALIDADA (20260929830000). Aquela migration deixou NULL de propósito:
--     "o hook usa o default 70 quando a coluna é nula".
--   * `message/mention/sla/goal/transcription_sound_type` text NULLABLE, com
--     default, e SEM nenhuma CHECK.
--
-- ============================================================================
-- Por que fechar agora
-- ============================================================================
--   1) NULL em `sound_volume` é um estado REDUNDANTE: a coluna tem DEFAULT 70, e o
--      único leitor (`useNotificationSettings`, linha 74) mapeia null -> 70. "Sem
--      preferência" e "70" sempre significaram a mesma coisa — a coluna aceitava
--      dois estados para um conceito. Com NOT NULL + DEFAULT + CHECK 10-100 o
--      invariante fica total e o valor lido não depende mais de fallback do front.
--   2) Sem CHECK, um tipo de som gravado por fora (SQL, service_role, integração)
--      vira lixo silencioso — é o mesmo argumento que motivou a CHECK do volume. O
--      front só conhece 'beep' | 'chime' | 'bell' | 'alert' | 'soft'
--      (`SoundTypeOption` em useNotificationSettings.ts:8 e `SoundType` em
--      soundConfigs.ts:1 — o MESMO conjunto), e os cinco defaults do banco já estão
--      nele. Nenhum leitor trata valor fora desse conjunto. (O vocabulário da aba
--      "Sons", que usa default/pop/ding/bubble/none, é de um painel morto e nunca
--      chega ao banco.)
--
-- ============================================================================
-- Nenhum escritor grava NULL — pré-condição do SET NOT NULL
-- ============================================================================
--   * a tabela só tem o trigger `update_user_settings_updated_at` (bumpa updated_at);
--   * `handle_new_user()` cria apenas `profiles` — não existe trigger de signup
--     inserindo em user_settings;
--   * no app, os únicos caminhos que mandam `sound_volume` escrevem
--     `clampSoundVolume(...)` (10–100) ou `DEFAULT_SETTINGS.soundVolume` (70):
--     useNotificationSettings.ts:139 e :190.
--
-- Estado verificado antes do DDL (2 linhas no banco canônico):
--   sound_volume nulos = 0; tipos nulos = 0; valores fora do vocabulário = 0.
-- Logo é aplicável sem backfill.
--
-- Classe CONTRATO (SET NOT NULL + ADD CONSTRAINT): o hermes-tarefa-mergear aplica
-- depois do merge e do deploy, para a produção não rodar código velho contra schema
-- novo. Aqui o código em produção já é compatível nas duas pontas (a escrita sempre
-- mandou 10–100 e um tipo do conjunto), então a ordem é garantia, não risco.
-- ============================================================================

ALTER TABLE public.user_settings
  ALTER COLUMN sound_volume SET NOT NULL;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_message_sound_type_valid
  CHECK (message_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID;

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_message_sound_type_valid;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_mention_sound_type_valid
  CHECK (mention_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID;

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_mention_sound_type_valid;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_sla_sound_type_valid
  CHECK (sla_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID;

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_sla_sound_type_valid;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_goal_sound_type_valid
  CHECK (goal_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID;

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_goal_sound_type_valid;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_transcription_sound_type_valid
  CHECK (transcription_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID;

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_transcription_sound_type_valid;

COMMENT ON COLUMN public.user_settings.sound_volume IS
  'Volume dos alertas do sistema, NOT NULL, 10-100 (default 70; mesmo intervalo do Slider do painel e do DEFAULT_SETTINGS do front). Mudo = sound_enabled.';

COMMENT ON COLUMN public.user_settings.message_sound_type IS
  'Som de mensagem nova: beep | chime | bell | alert | soft (vocabulario unico do front: SoundTypeOption / SoundType).';

COMMENT ON COLUMN public.user_settings.mention_sound_type IS
  'Som de mencao: beep | chime | bell | alert | soft.';

COMMENT ON COLUMN public.user_settings.sla_sound_type IS
  'Som de violacao de SLA: beep | chime | bell | alert | soft.';

COMMENT ON COLUMN public.user_settings.goal_sound_type IS
  'Som de meta atingida: beep | chime | bell | alert | soft.';

COMMENT ON COLUMN public.user_settings.transcription_sound_type IS
  'Som de transcricao pronta: beep | chime | bell | alert | soft.';
