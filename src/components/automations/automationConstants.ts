import { MessageSquare, Tag, Clock, Users, AlertCircle, CheckCircle2 } from 'lucide-react';

export const TRIGGER_TYPES = [
  { type: 'new_message', label: 'Nova Mensagem', icon: MessageSquare, description: 'Quando uma nova mensagem é recebida' },
  { type: 'keyword', label: 'Palavra-chave', icon: Tag, description: 'Quando uma mensagem contém palavras específicas' },
  { type: 'time_inactive', label: 'Tempo Inativo', icon: Clock, description: 'Quando não há resposta por X minutos' },
  { type: 'tag_added', label: 'Tag Adicionada', icon: Tag, description: 'Quando uma tag é adicionada ao contato' },
  { type: 'business_hours', label: 'Fora do Horário', icon: Clock, description: 'Quando mensagem chega fora do expediente' },
];

export const ACTION_TYPES = [
  { type: 'send_message', label: 'Enviar Mensagem', icon: MessageSquare, description: 'Envia uma mensagem automática' },
  { type: 'assign_agent', label: 'Atribuir Agente', icon: Users, description: 'Atribui a conversa a um agente' },
  { type: 'add_tag', label: 'Adicionar Tag', icon: Tag, description: 'Adiciona uma tag ao contato' },
  { type: 'send_notification', label: 'Enviar Notificação', icon: AlertCircle, description: 'Envia notificação para a equipe' },
  { type: 'close_conversation', label: 'Fechar Conversa', icon: CheckCircle2, description: 'Marca a conversa como resolvida' },
];

// R2-MOD-002 (#99): contrato de configuração obrigatória por tipo de ação.
// O editor só coleta `message`; os demais parâmetros vêm da configuração já
// persistida. Salvar sem eles produziria uma ação incompleta, então é bloqueado.
export const REQUIRED_ACTION_CONFIG: Record<string, string[]> = {
  send_message: ['message'],
  assign_agent: ['agent_id'],
  add_tag: ['tag_id'],
  send_notification: ['message'],
  close_conversation: [],
};

// Chaves aceitas por tipo, incluindo parâmetros opcionais. Esta lista é usada
// somente ao trocar o tipo para remover configuração que pertence à ação antiga;
// a validação de presença continua usando REQUIRED_ACTION_CONFIG.
export const ALLOWED_ACTION_CONFIG: Record<string, string[]> = {
  send_message: ['message', 'delay_seconds'],
  assign_agent: ['agent_id', 'delay_seconds'],
  add_tag: ['tag_id', 'delay_seconds'],
  send_notification: ['message', 'priority', 'delay_seconds'],
  close_conversation: ['delay_seconds'],
};

export function filterActionConfig(actionType: string, config: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_ACTION_CONFIG[actionType] ?? [];
  return Object.fromEntries(Object.entries(config).filter(([configKey]) => allowed.includes(configKey)));
}
