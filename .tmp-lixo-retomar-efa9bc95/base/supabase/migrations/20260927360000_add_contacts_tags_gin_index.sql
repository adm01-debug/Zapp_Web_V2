CREATE INDEX idx_contacts_tags_gin ON public.contacts USING GIN (tags);
