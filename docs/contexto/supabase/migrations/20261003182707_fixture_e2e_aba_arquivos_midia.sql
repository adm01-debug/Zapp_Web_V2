insert into public.messages (
  contact_id, sender, content, message_type,
  media_url, media_type, media_mimetype, media_filename, media_size, created_at
)
select
  '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid,
  'contact',
  '[Imagem] fixture E2E da aba Arquivos (etapa 49; nao remover)',
  'image',
  'https://tnnnlkbymytvtqngbbqh.supabase.co/storage/v1/object/public/whatsapp-media/5b6f6f71-916f-4537-9638-647485aba7db/e2e-files-tab-1791054089114.png',
  'image',
  'image/png',
  'e2e-files-tab.png',
  68,
  now()
where not exists (
  select 1 from public.messages
   where contact_id = '04dff4dc-c6b1-4283-ac22-bd8639804759'::uuid
     and media_filename = 'e2e-files-tab.png'
)
