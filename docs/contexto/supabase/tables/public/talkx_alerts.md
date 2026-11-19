# public.talkx_alerts

> X033: alertas do motor Talk X. Um alerta aberto por (tipo, campanha); fechado sozinho quando o sinal deixa de disparar (resolved_at). Escrito por talkx_engine_alerts (service_role), lido por admin/supervisor.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `kind` | `text` | não |  |  |  |
| 3 | `campaign_id` | `uuid` | sim |  |  |  |
| 4 | `payload` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 5 | `opened_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `resolved_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_alerts_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_alerts_kind_check | CHECK | `CHECK (kind = ANY (ARRAY['stalled_campaign'::text, 'stale_lease'::text, 'outcome_unknown'::text, 'high_failure_rate'::text, 'cron_degraded'::text, 'purge_failed'::text]))` |  |  | sim |
| talkx_alerts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_alerts_campaign_idx | btree | campaign_id, opened_at | não | sim |  | `CREATE INDEX talkx_alerts_campaign_idx ON public.talkx_alerts USING btree (campaign_id, opened_at DESC)` |
| talkx_alerts_open_dedup | btree | kind | sim | sim | `(resolved_at IS NULL)` | `CREATE UNIQUE INDEX talkx_alerts_open_dedup ON public.talkx_alerts USING btree (kind, COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (resolved_at IS NULL)` |
| talkx_alerts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_alerts_pkey ON public.talkx_alerts USING btree (id)` |


## Policies (RLS)

### `talkx_alerts_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
