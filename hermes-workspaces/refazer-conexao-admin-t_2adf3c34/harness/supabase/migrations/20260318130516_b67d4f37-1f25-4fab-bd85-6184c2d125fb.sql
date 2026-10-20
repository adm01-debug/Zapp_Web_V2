ALTER TABLE public.messages DROP CONSTRAINT messages_message_type_check;

ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check 
CHECK (message_type = ANY (ARRAY[
  'text', 'image', 'audio', 'video', 'document', 'sticker',
  'location', 'contact', 'poll', 'button', 'list', 'reaction',
  'vcard', 'ptt', 'link', 'template', 'interactive', 'order',
  'product', 'catalog'
]));