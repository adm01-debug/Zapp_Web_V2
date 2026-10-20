import { Users, MessageSquare, Clock, Sparkles, Bell, Palette } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  icon: typeof Users;
  action: string;
  actionRoute?: string;
  checkCondition: () => Promise<boolean>;
}

export const CHECKLIST_STEPS: ChecklistStep[] = [
  {
    id: 'profile',
    title: 'Complete seu perfil',
    description: 'Adicione seu nome e foto para seus clientes te reconhecerem',
    icon: Users,
    action: 'Completar perfil',
    actionRoute: 'agents',
    checkCondition: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      return !!(data?.name && data.name.length > 2);
    }
  },
  {
    id: 'connection',
    title: 'Conecte seu WhatsApp',
    description: 'Vincule seu número para começar a receber mensagens',
    icon: MessageSquare,
    action: 'Conectar WhatsApp',
    actionRoute: 'connections',
    checkCondition: async () => {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('id')
        .eq('status', 'connected')
        .limit(1);
      return (data?.length || 0) > 0;
    }
  },
  {
    id: 'hours',
    title: 'Configure horário de atendimento',
    description: 'Defina quando você está disponível para atender',
    icon: Clock,
    action: 'Configurar horários',
    actionRoute: 'settings',
    checkCondition: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from('user_settings')
        .select('business_hours_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.business_hours_enabled === true;
    }
  },
  {
    id: 'templates',
    title: 'Crie mensagens rápidas',
    description: 'Templates de resposta para agilizar seu atendimento',
    icon: Sparkles,
    action: 'Criar template',
    actionRoute: 'inbox',
    checkCondition: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from('message_templates')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      return (data?.length || 0) > 0;
    }
  },
  {
    id: 'notifications',
    title: 'Ative as notificações',
    description: 'Seja avisado quando novos clientes entrarem em contato',
    icon: Bell,
    action: 'Configurar alertas',
    actionRoute: 'settings',
    checkCondition: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from('user_settings')
        .select('browser_notifications_enabled, sound_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.browser_notifications_enabled === true || data?.sound_enabled === true;
    }
  },
  {
    id: 'theme',
    title: 'Personalize seu tema',
    description: 'Escolha entre tema claro ou escuro',
    icon: Palette,
    action: 'Personalizar',
    actionRoute: 'settings',
    checkCondition: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from('user_settings')
        .select('theme')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.theme !== null && data?.theme !== 'system';
    }
  },
];
