alter table public . warroom_alerts add column if not exists dedupe_key text

create unique index if not exists ux_warroom_alerts_dedupe_key on public . warroom_alerts ( dedupe_key ) where dedupe_key is not null

comment on column public . warroom_alerts . dedupe_key is 'R2-MOD-074: chave idempotente do incidente que originou o alerta (ux_warroom_alerts_dedupe_key, unico parcial). Reexecucao do mesmo incidente cai em 23505 e nao gera novo alerta.'
