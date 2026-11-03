-- CREATE OR REPLACE public.encrypt_gmail_token(text): search_path public -> public, extensions

-- CREATE OR REPLACE public.decrypt_gmail_token(bytea): idem + RAISE quando app.encryption_key ausente

-- Fonte de verdade: supabase/migrations/20260827130000_fix_gmail_crypto_search_path_and_missing_key.sql
