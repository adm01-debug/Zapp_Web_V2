# Vault (somente nomes — valores nunca são exportados)

| nome | descrição | criado em |
|---|---|---|
| ai_jobs_cron_secret |  | 2026-10-02 09:55:46.471289+00:00 |
| ai_usage_outbox_drain_cron_secret |  | 2026-11-07 11:22:53.500487+00:00 |
| avatars_refresh_cron_secret | Credencial de maquina do cron avatars-refresh (pg_cron -> edge). Gerada in-db 2026-09-30. NUNCA logar. | 2026-09-30 19:08:33.596592+00:00 |
| connection_health_check_cron_secret | Credencial de maquina do cron connection-health-check (pg_cron -> edge). Gerada in-db 2026-09-30. NUNCA logar. | 2026-09-30 19:08:33.596592+00:00 |
| gmail_cron_secret | x-cron-secret para autenticar chamadas do pg_cron a edge gmail-cron-sync | 2026-08-29 14:37:04.613267+00:00 |
| gmail_encryption_key | Chave simetrica pgp_sym_encrypt dos tokens Gmail (gmail_accounts.*_encrypted). Gerada in-db 2026-08-27. NUNCA logar. | 2026-08-27 20:35:44.045073+00:00 |
| multiplix_cron_secret |  | 2026-09-27 13:15:36.266338+00:00 |
| multiplix_send_url |  | 2026-09-29 14:51:37.775897+00:00 |
| sicoob_service_role_key | Service role key do projeto oficial tnnnlkbymytvtqngbbqh — usada por notify_sicoob_on_reply para chamar a edge function sicoob-bridge-reply | 2026-08-27 19:34:11.065065+00:00 |
| talkx_anon_key | Zapp Web V2 anon key para pg_cron → talkx-scheduler | 2026-09-08 21:18:16.883903+00:00 |
| talkx_cron_secret |  | 2026-10-02 02:14:00.867726+00:00 |
| talkx_scheduler_url | URL da edge function talkx-scheduler para o pg_cron | 2026-09-08 21:16:47.087430+00:00 |
| talkx_send_url |  | 2026-10-02 04:02:22.139962+00:00 |
| zapp_anon_key | JWT anon do projeto Zapp Web V2 (tnnnlkbymytvtqngbbqh) — era hard-coded em cron.job jobid=4 | 2026-09-01 17:58:46.824129+00:00 |
