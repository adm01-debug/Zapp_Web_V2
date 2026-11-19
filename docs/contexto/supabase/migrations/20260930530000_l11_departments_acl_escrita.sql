REVOKE INSERT, UPDATE ON public.departments FROM authenticated

REVOKE INSERT (whatsapp_api_key, whatsapp_instance_id),
       UPDATE (whatsapp_api_key, whatsapp_instance_id)
  ON public.departments FROM authenticated

GRANT INSERT (id, name, is_active, whatsapp_mode, created_at, updated_at)
  ON public.departments TO authenticated

GRANT UPDATE (id, name, is_active, whatsapp_mode, created_at, updated_at)
  ON public.departments TO authenticated
