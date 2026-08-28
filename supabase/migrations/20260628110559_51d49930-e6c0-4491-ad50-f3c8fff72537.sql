ALTER PUBLICATION supabase_realtime ADD TABLE public.queues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.queues REPLICA IDENTITY FULL;
ALTER TABLE public.queue_members REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;