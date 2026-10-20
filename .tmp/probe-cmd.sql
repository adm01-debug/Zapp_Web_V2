\! sed -n '/^-- CREATE OR REPLACE FUNCTION/,$p' /repo/supabase/migrations/20261007000554_talkx_cancel_em_voo_mantem_confirmacao.sql | sed 's/^-- \{0,1\}//' > /tmp/x.sql
\! wc -l /tmp/x.sql
SELECT 'fim-do-teste-de-interpolacao';
