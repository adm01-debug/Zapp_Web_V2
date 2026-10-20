\pset pager off
SELECT 'PUB' AS k, tablename AS v FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename LIKE 'team%' ORDER BY 2;
SELECT 'REPLIDENT' AS k, c.relname AS v, c.relreplident FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('team_messages','team_message_reactions','team_conversations') ORDER BY 2;
SELECT 'POLICY' AS k, tablename, policyname, cmd, permissive, roles::text FROM pg_policies WHERE schemaname='public' AND tablename IN ('team_messages','team_message_reactions','team_conversations') ORDER BY tablename, cmd, policyname;
