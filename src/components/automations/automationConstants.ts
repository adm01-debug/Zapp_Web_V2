import { MessageSquare, Tag, Clock, Users, AlertCircle, CheckCircle2 } from 'lucide-react';

export const TRIGGER_TYPES = [
  { type: 'new_message', label: 'Nova Mensagem', icon: MessageSquare, description: 'Quando uma nova mensagem é recebida' },
  { type: 'keyword', label: 'Palavra-chave', icon: Tag, description: 'Quando uma mensagem contém palavras específicas' },
  { type: 'time_inactive', label: 'Tempo Inativo', icon: Clock, description: 'Quando não há resposta por X minutos' },
  { type: 'business_hours', label: 'Fora do Horário', icon: Clock, description: 'Quando mensagem chega fora do expediente' },
];

export const ACTION_TYPES = [
  { type: 'send_message', label: 'Enviar Mensagem', icon: MessageSquare, description: 'Envia uma mensagem automática' },
  { type: 'assign_agent', label: 'Atribuir Agente', icon: Users, description: 'Atribui a conversa a um agente' },
  { type: 'send_notification', label: 'Enviar Notificação', icon: AlertCircle, description: 'Envia notificação para a equipe' },
  { type: 'close_conversation', label: 'Fechar Conversa', icon: CheckCircle2, description: 'Marca a conversa como resolvida' },
];

// Chaves conhecidas como pertencentes a tipos específicos. Chaves sem dono
// conhecido (incluindo parâmetros futuros do executor) são preservadas na troca;
// somente dados comprovadamente incompatíveis com o novo tipo são removidos.
const ACTION_CONFIG_OWNERS: Record<string, string[]> = {
  message: ['send_message', 'send_notification'],
  agent_id: ['assign_agent'],
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

// A função de tags foi removida do sistema (decisão do dono). Os tipos que só
// existiam para ela deixaram de ser oferecidos no editor, mas os registros já
// gravados continuam no banco — não apagamos nada. Estas duas listas são a
// fonte única do que a tela sabe oferecer; `isObsoleteAutomation` usa essa
// mesma fonte para RECONHECER o registro antigo (gatilho ou ação que não consta
// da lista atual) e marcá-lo na lista, em vez de renderizar um badge vazio ou
// deixar o operador reativar uma ação que não existe mais.
const KNOWN_TRIGGER_TYPES = new Set(TRIGGER_TYPES.map((t) => t.type));
const KNOWN_ACTION_TYPES = new Set(ACTION_TYPES.map((a) => a.type));

export const OBSOLETE_AUTOMATION_LABEL = 'Obsoleta (tag removida)';

export function isObsoleteAutomation(automation: {
  trigger_type?: unknown;
  actions?: unknown;
}): boolean {
  if (typeof automation.trigger_type !== 'string' || !KNOWN_TRIGGER_TYPES.has(automation.trigger_type)) {
    return true;
  }
  const actions = Array.isArray(automation.actions) ? automation.actions : [];
  return actions.some((action) => {
    const type = (action as { type?: unknown } | null)?.type;
    return typeof type !== 'string' || !KNOWN_ACTION_TYPES.has(type);
  });
}
