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

// Campos que cada tipo de GATILHO exige no `trigger_config` (jsonb). Só os tipos
// que realmente têm condição declaram campo: `new_message` e `business_hours`
// disparam por si (mensagem nova / fora do expediente) e não ganham campo
// inventado. O formato das chaves segue o que o card de persistência
// (R2-MOD-002) já validou para `keyword` (`keywords`).
export type TriggerConfigInput = 'keywords' | 'number' | 'text';

export interface TriggerConfigField {
  key: string;
  label: string;
  placeholder: string;
  input: TriggerConfigInput;
  /** Mensagem de erro quando o campo obrigatório está vazio. */
  required: string;
}

export const TRIGGER_CONFIG_FIELDS: Record<string, TriggerConfigField[]> = {
  new_message: [],
  keyword: [
    {
      key: 'keywords',
      label: 'Palavras-chave (separadas por vírgula)',
      placeholder: 'Ex: oi, preço, orçamento',
      input: 'keywords',
      required: 'Informe ao menos uma palavra-chave',
    },
  ],
  time_inactive: [
    {
      key: 'minutes',
      label: 'Minutos sem resposta',
      placeholder: '30',
      input: 'number',
      required: 'Informe os minutos de inatividade',
    },
  ],
  tag_added: [
    {
      key: 'tag_id',
      label: 'Tag',
      placeholder: 'Ex: lead-quente',
      input: 'text',
      required: 'Informe a tag que dispara a automação',
    },
  ],
  business_hours: [],
};

// Chaves conhecidas como pertencentes a um tipo de gatilho. Mesmo critério do
// `ACTION_CONFIG_OWNERS`: só sai da configuração a chave comprovadamente
// exclusiva de outro gatilho; chave sem dono (parâmetro que o executor possa
// usar, como `match`) é preservada na troca.
const TRIGGER_CONFIG_OWNERS: Record<string, string[]> = {
  keywords: ['keyword'],
  minutes: ['time_inactive'],
  tag_id: ['tag_added'],
};

export function triggerConfigFields(triggerType: string): TriggerConfigField[] {
  return TRIGGER_CONFIG_FIELDS[triggerType] ?? [];
}

export function filterTriggerConfig(triggerType: string, config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([configKey]) => {
      const owners = TRIGGER_CONFIG_OWNERS[configKey];
      return owners === undefined || owners.includes(triggerType);
    })
  );
}

/** Devolve a mensagem de erro do primeiro campo obrigatório vazio, ou null. */
export function validateTriggerConfig(triggerType: string, config: Record<string, unknown>): string | null {
  for (const field of triggerConfigFields(triggerType)) {
    const value = config[field.key];
    if (field.input === 'keywords') {
      if (!Array.isArray(value) || value.length === 0) return field.required;
      continue;
    }
    if (field.input === 'number') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return field.required;
      continue;
    }
    if (typeof value !== 'string' || value.trim() === '') return field.required;
  }
  return null;
}

export function filterActionConfig(actionType: string, config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([configKey]) => {
      const owners = ACTION_CONFIG_OWNERS[configKey];
      return owners === undefined || owners.includes(actionType);
    })
  );
}
