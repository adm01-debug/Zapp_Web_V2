# Bootstrap oficial do Supabase

Estes quatro arquivos são cópias integrais, sem mudança de SQL, de `supabase/supabase@4a9b2b6860805d11b76b59ff29b8803925f2ec38`, diretório `docker/volumes/db`. `sources.json` registra URL, commit, blob Git, SHA-256 e tamanho de cada fonte. A licença Apache 2.0 do mesmo projeto está em `../main/LICENSE.supabase`.

`webhooks.sql` cria o papel usado por `roles.sql`; por isso são montados nessa ordem nos init-scripts reais da imagem PostgreSQL. `jwt.sql` configura a expiração e `realtime.sql` cria o schema interno do serviço. Auth, Storage e Realtime continuam responsáveis por suas migrations oficiais; estes arquivos não substituem tabelas, políticas ou RPCs do aplicativo.

O controlador aguarda as estruturas reais `auth.sessions`, `auth.identities`, `storage.buckets`, `storage.objects`, `realtime.messages` e `realtime.topic()`, além do estado saudável dos serviços. Só então aplica a cadeia ativa de migrations do checkout. Nenhum banco remoto é consultado para gerar esta base.
