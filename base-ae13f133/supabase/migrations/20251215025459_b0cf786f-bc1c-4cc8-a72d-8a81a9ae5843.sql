-- Add new columns to contacts table
ALTER TABLE public.contacts 
ADD COLUMN nickname text,
ADD COLUMN surname text,
ADD COLUMN job_title text,
ADD COLUMN company text;