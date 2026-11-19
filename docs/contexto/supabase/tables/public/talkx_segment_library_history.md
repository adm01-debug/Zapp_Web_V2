# public.talkx_segment_library_history

> Talk X (X103): retrato da biblioteca de segmentos por dia (chave counted_on). No mes corrente o dia e o de hoje; nos meses fechados e o ultimo dia do mes. Grava os MESMOS numeros dos KPIs (estoque total/crm360, uso real, entregues e conversoes). Leitura para admin/supervisor; escrita so pela rotina talkx_refresh_segment_library_history.

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
| 1 | `counted_on` | `date` | não |  |  |  |
| 2 | `total_segments` | `integer` | não | `0` |  |  |
| 3 | `active_segments` | `integer` | não | `0` |  | Talk X (X103): segmentos USADOS no mes — citados por campanha que INICIOU envio (started_at nao nulo). Rascunho nao conta. |
| 4 | `crm360_segments` | `integer` | não | `0` |  |  |
| 5 | `deliveries` | `integer` | não | `0` |  |  |
| 6 | `conversions` | `integer` | não | `0` |  |  |
| 7 | `captured_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_segment_library_history_active_segments_check | CHECK | `CHECK (active_segments >= 0)` |  |  | sim |
| talkx_segment_library_history_conversions_check | CHECK | `CHECK (conversions >= 0)` |  |  | sim |
| talkx_segment_library_history_crm360_segments_check | CHECK | `CHECK (crm360_segments >= 0)` |  |  | sim |
| talkx_segment_library_history_deliveries_check | CHECK | `CHECK (deliveries >= 0)` |  |  | sim |
| talkx_segment_library_history_pkey | PRIMARY KEY | `PRIMARY KEY (counted_on)` |  |  | sim |
| talkx_segment_library_history_total_segments_check | CHECK | `CHECK (total_segments >= 0)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_segment_library_history_pkey | btree | counted_on | sim | sim |  | `CREATE UNIQUE INDEX talkx_segment_library_history_pkey ON public.talkx_segment_library_history USING btree (counted_on)` |


## Policies (RLS)

### `talkx_segment_library_history_select`

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
