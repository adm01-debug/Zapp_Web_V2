DROP TRIGGER IF EXISTS trg_sicoob_reply ON public.messages

DROP FUNCTION IF EXISTS public.notify_sicoob_on_reply()

COMMENT ON TABLE public.messages IS
  'Mensagens de todas as origens. O trigger trg_sicoob_reply (Sicoob Bridge) foi removido em 29/09/2026.'
