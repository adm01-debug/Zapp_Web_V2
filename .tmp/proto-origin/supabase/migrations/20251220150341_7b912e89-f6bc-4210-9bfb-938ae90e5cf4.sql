-- Add status columns to messages table for WhatsApp webhook
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS status_updated_at timestamp with time zone DEFAULT now();

-- Create index for faster status lookups by external_id
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON public.messages(external_id);

-- Enable realtime for messages table status updates
ALTER TABLE public.messages REPLICA IDENTITY FULL;