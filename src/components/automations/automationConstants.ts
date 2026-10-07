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

// Chaves conhecidas como pertencentes a tipos específicos. Chaves sem dono
// conhecido (incluindo parâmetros futuros do executor) são preservadas na troca;
// somente dados comprovadamente incompatíveis com o novo tipo são removidos.
const ACTION_CONFIG_OWNERS: Record<string, string[]> = {
  message: ['send_message', 'send_notification'],
  agent_id: ['assign_agent'],
  tag_id: ['add_tag'],
  priority: ['send_notification'],
};

// Tipos que este editor consegue configurar pelo campo de mensagem. Fonte única:
// o dono da chave `message` é `ACTION_CONFIG_OWNERS.message` (mesma tabela que o
// filtro usa), então o editor não inventa contrato novo — só deixa de esconder um
// campo cuja chave já é declarada válida para o tipo escolhido.
export const MESSAGE_ACTION_TYPES: string[] = ACTION_CONFIG_OWNERS.message;

export function filterActionConfig(actionType: string, config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([configKey]) => {
      const owners = ACTION_CONFIG_OWNERS[configKey];
      return owners === undefined || owners.includes(actionType);
    })
  );
}
