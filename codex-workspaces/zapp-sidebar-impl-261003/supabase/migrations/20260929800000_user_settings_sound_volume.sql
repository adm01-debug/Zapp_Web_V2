-- ============================================================================
-- Notificacoes -- volume dos ALERTAS do sistema passa a ser persistido
-- (coluna `sound_volume`)
-- ============================================================================
-- O volume dos alertas do sistema (mensagem nova, mencao, SLA, meta, chamada
-- entrando) existia SO no front: `NotificationSettings.soundVolume`, com default
-- 70, consumido por `playNotificationSound(..., settings.soundVolume)`
-- (useSLANotifications, useGoalNotifications, NotificationTypeCards) e pelo
-- `IncomingCallAlert`. Nao havia coluna correspondente em `public.user_settings`,
-- e o hook `useNotificationSettings` nao selecionava, nao mapeava e nao gravava o
-- campo.
--
-- Efeito pratico: o slider "Volume" do painel de notificacoes
-- (`NotificationSettingsPanel`) atualizava apenas a copia em memoria (update
-- otimista do react-query) e o valor voltava para 70 a cada reload/login — depois
-- do F5, "Testar som", alertas e chamadas entrantes tocavam no volume errado.
--
-- Correcao minima: a coluna que faltava, com o mesmo default do front (70) e no
-- mesmo padrao aditivo das demais colunas de som da tabela
-- (20251228182332_*: `message_sound_type text DEFAULT 'chime'`, etc.). A faixa do
-- controle (10-100 no slider) continua sendo do front, que tambem clampa valor
-- invalido lido do banco.
--
-- Classe ADITIVA (coluna nova, nullable, com default): aplicada na tarefa.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sound_volume integer DEFAULT 70;

COMMENT ON COLUMN public.user_settings.sound_volume IS
  'Volume dos alertas do sistema, 0-100 (default 70, igual ao DEFAULT_SETTINGS do front)';
