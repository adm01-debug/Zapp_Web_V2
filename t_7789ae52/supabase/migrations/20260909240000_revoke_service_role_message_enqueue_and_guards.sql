BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Supabase grants service_role EXECUTE on new functions through default
-- privileges. These entry points are authenticated-only or trigger-internal;
-- the delivery worker only needs claim/complete/fail and the explicit closure
-- RPC. Revoke the implicit grants without changing function definitions.
REVOKE EXECUTE ON FUNCTION public.enqueue_outbound_message(
  uuid, uuid, text, text, text, uuid, uuid
) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.guard_message_delivery_internal_fields()
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.guard_conversation_closure_request_id()
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.guard_conversation_event_closure_id()
  FROM service_role;

COMMIT;
