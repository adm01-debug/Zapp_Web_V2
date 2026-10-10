-- talkx_n102a_ddl_send_weekdays_respect_dnd
-- Rollback: remove o setting dnd_hours e as duas colunas (respect_dnd, send_weekdays) criados por esta migration.
-- Rollback (SQL executável, na ordem):
--   delete from public.talkx_settings where key = 'dnd_hours';
--   alter table public.talkx_campaigns drop column if exists respect_dnd;
--   alter table public.talkx_campaigns drop column if exists send_weekdays;
--
-- N-102a (fatia de DDL): a janela de envio do Talk X precisa guardar os dias da
-- semana (send_weekdays) e o respeito ao horário "não perturbe" (respect_dnd +
-- setting dnd_hours). Esta migration entrega SOMENTE o DDL, extraído do commit
-- 2c186a48 (branch v2/t-0c04d5b6-n102-janela-envio); as funções/RPC da janela vêm
-- nas fatias b e c. Só aditiva e idempotente (ADD COLUMN IF NOT EXISTS e
-- ON CONFLICT). Não altera GRANT/REVOKE, policy nem papel nenhum: o acesso às
-- colunas novas segue o GRANT já existente da tabela talkx_campaigns.
--
ALTER TABLE public.talkx_campaigns
  ADD COLUMN IF NOT EXISTS send_weekdays smallint[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS respect_dnd boolean NOT NULL DEFAULT true;

INSERT INTO public.talkx_settings (key, value, description)
VALUES ('dnd_hours',
        '{"start":"22:00","end":"08:00","sundays":true,"holidays":[]}',
        'Janela "não perturbe": envios só fora deste horário quando respect_dnd=true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;
