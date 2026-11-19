SELECT cron.schedule('avatars-refresh','0 * * * *', <net.http_post p/ batch-fetch-avatars com Bearer do vault, timeout 150s>)
