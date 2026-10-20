-- user_settings_controles_evento_notificacao
-- Rollback: ALTER TABLE public.user_settings DROP COLUMN IF EXISTS new_message_sound_enabled; ALTER TABLE public.user_settings DROP COLUMN IF EXISTS mention_sound_enabled; ALTER TABLE public.user_settings DROP COLUMN IF EXISTS sla_breach_sound_enabled;
-- versão 20261006155916 reservada para hermes-tres-controles-notificacao-nao-persistem-2610061256c820 (hermes-db-migrar --nova)
--
-- ============================================================================
-- Notificacoes -- os TRES controles de evento (Novas Mensagens, Mencoes e
-- Violacao de SLA) passam a ser persistidos (colunas *_sound_enabled)
-- ============================================================================
-- Achado R2-PLAT-003 (BACKLOG_VERIFICADO item 441): os tres botoes da secao
-- "Tipos de Notificacao" (`NotificationTypeSection`) so mudavam a copia em
-- memoria (update otimista do react-query). `NotificationSettings` tem
-- `newMessageSound`, `mentionSound` e `slaBreachSound` (default true), mas o
-- hook `useNotificationSettings` nao os selecionava, nao os mapeava e nao os
-- convertia em `dbUpdates`: um update contendo SO um dos tres nao chamava o
-- banco E a leitura repunha o default. Depois do F5 os tres voltavam a
-- habilitados.
--
-- Correcao minima: as tres colunas que faltavam, no mesmo padrao aditivo das
-- demais colunas booleanas de preferencia da tabela
-- (`browser_notifications_enabled boolean DEFAULT true`,
--  `quiet_hours_enabled boolean DEFAULT false`,
--  `transcription_notification_enabled boolean DEFAULT true`).
--
-- Mapeamento front <-> banco (1:1, o mesmo dos irmaos `*_sound_type`):
--   newMessageSound -> new_message_sound_enabled
--   mentionSound    -> mention_sound_enabled
--   slaBreachSound  -> sla_breach_sound_enabled
--
-- `NULL` e `true` significam a mesma coisa ("sem preferencia gravada"): e o
-- mesmo contrato de mapeamento dos outros quatro booleanos da tabela, que o
-- front resolve com `?? DEFAULT_SETTINGS.<campo>`. Por isso o default da coluna
-- e `true`, igual ao DEFAULT_SETTINGS do hook.
--
-- Classe ADITIVA (coluna nova, nullable, com default): aplicada na tarefa.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS new_message_sound_enabled boolean DEFAULT true;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS mention_sound_enabled boolean DEFAULT true;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sla_breach_sound_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.user_settings.new_message_sound_enabled IS
  'Som/aviso de "Novas Mensagens" (default true, igual a NotificationSettings.newMessageSound); NULL = sem preferencia gravada.';

COMMENT ON COLUMN public.user_settings.mention_sound_enabled IS
  'Som/aviso de "Menções" (default true, igual a NotificationSettings.mentionSound); NULL = sem preferencia gravada.';

COMMENT ON COLUMN public.user_settings.sla_breach_sound_enabled IS
  'Som/aviso de "Violação de SLA" (default true, igual a NotificationSettings.slaBreachSound); NULL = sem preferencia gravada.';
