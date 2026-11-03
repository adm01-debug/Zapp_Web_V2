select cron.schedule('cleanup-link-preview-cache', '0 3 * * *', 'SELECT public.cleanup_link_preview_cache()');
