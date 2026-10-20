-- Add sentiment threshold column to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS sentiment_alert_threshold integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS sentiment_alert_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS sentiment_consecutive_count integer DEFAULT 2;

-- Add comment for documentation
COMMENT ON COLUMN public.user_settings.sentiment_alert_threshold IS 'Threshold percentage below which sentiment alerts are triggered (0-100)';
COMMENT ON COLUMN public.user_settings.sentiment_alert_enabled IS 'Whether sentiment alerts are enabled for this user';
COMMENT ON COLUMN public.user_settings.sentiment_consecutive_count IS 'Number of consecutive low sentiment analyses required to trigger alert';