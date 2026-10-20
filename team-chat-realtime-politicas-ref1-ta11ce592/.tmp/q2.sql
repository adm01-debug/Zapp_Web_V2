\pset pager off
\pset format unaligned
SELECT tablename||' :: '||policyname||' :: '||cmd||' :: USING='||coalesce(qual,'-')||' :: CHECK='||coalesce(with_check,'-') FROM pg_policies
WHERE schemaname='public' AND tablename IN ('team_messages','team_message_reactions')
ORDER BY tablename, cmd, policyname;
