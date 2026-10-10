-- Fix A-01: dois BEFORE UPDATE em profiles com guards sobrepostos.
-- on_profile_update_prevent_escalation ('o') disparava ANTES de
-- prevent_privilege_escalation ('p') por ordem alfabética.
-- O primeiro revertia silenciosamente NEW.role := OLD.role.
-- Resultado: OLD.role IS DISTINCT FROM NEW.role tornava-se FALSE no segundo,
-- e a exceção 'Only administrators can modify role...' NUNCA era lançada.
-- Fix: remover o trigger silencioso. Apenas prevent_privilege_escalation permanece.
DROP TRIGGER IF EXISTS on_profile_update_prevent_escalation ON public.profiles;

-- Fix A-02: dois BEFORE UPDATE em user_devices chamando a mesma função.
-- on_device_update_last_seen e update_user_devices_last_seen ambos executam
-- update_device_last_seen() definindo NEW.last_seen_at = now().
-- Resultado: execução dupla, mesmo efeito, desperdício.
DROP TRIGGER IF EXISTS update_user_devices_last_seen ON public.user_devices;
