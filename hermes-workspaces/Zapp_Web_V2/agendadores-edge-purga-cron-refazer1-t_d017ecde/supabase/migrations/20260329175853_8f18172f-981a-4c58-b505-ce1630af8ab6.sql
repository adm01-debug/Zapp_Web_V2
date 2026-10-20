-- First migration: just add the enum value
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'special_agent';
