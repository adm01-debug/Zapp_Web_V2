alter table public.ai_usage_logs
  add column if not exists request_id uuid,
  add column if not exists job_id uuid,
  add column if not exists attempt smallint

create index if not exists idx_ai_usage_logs_request_id
  on public.ai_usage_logs (request_id)

create index if not exists idx_ai_usage_logs_job_id
  on public.ai_usage_logs (job_id)
  where job_id is not null

comment on column public.ai_usage_logs.request_id is
  'IA-051: uuid opaco da operação de IA (cliente/worker). Nunca dado pessoal.'

comment on column public.ai_usage_logs.job_id is
  'IA-051: job da fila (ai_jobs.id) que originou a execução, quando houver.'

comment on column public.ai_usage_logs.attempt is
  'IA-051: tentativa do job (ai_jobs.attempt_count) no momento da execução.'
