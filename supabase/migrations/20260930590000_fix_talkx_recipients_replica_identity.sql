-- talkx_recipients está em supabase_realtime com column list (26 de 29 colunas;
-- personalized_message, delivery_claim_token e delivery_last_claim_token excluídos
-- por segurança). PostgreSQL proíbe REPLICA IDENTITY FULL em tabela com column list
-- em publicação, causando 42P10 em qualquer DELETE/UPDATE em messages que dispara
-- ON DELETE SET NULL via talkx_recipients_reply_message_id_fkey.
-- Mudança para DEFAULT (PK como identity): eventos UPDATE no Realtime continuam
-- entregando todos os valores novos das colunas listadas; o que se perde são old-values,
-- que nenhum subscriber desta tabela utiliza hoje.
ALTER TABLE public.talkx_recipients REPLICA IDENTITY DEFAULT;
