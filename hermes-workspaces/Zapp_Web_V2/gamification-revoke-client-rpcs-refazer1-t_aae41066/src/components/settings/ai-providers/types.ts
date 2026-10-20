import { Cloud, Brain, Zap, Webhook, Bot } from 'lucide-react';

export type ProviderType = 'lovable_ai' | 'openai_compatible' | 'google_gemini' | 'custom_webhook' | 'custom_agent';

export interface AIProvider {
  id: string;
  name: string;
  description: string | null;
  provider_type: ProviderType;
  api_endpoint: string | null;
  api_key_secret_name: string | null;
  model: string | null;
  system_prompt: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  is_default: boolean;
  use_for: string[];
  created_at: string;
}

export const PROVIDER_LABELS: Record<ProviderType, { label: string; icon: typeof Brain; color: string }> = {
  lovable_ai: { label: 'Lovable AI', icon: Cloud, color: 'bg-primary/15 text-primary' },
  openai_compatible: { label: 'OpenAI Compatível', icon: Brain, color: 'bg-success/15 text-success' },
  google_gemini: { label: 'Google Gemini', icon: Zap, color: 'bg-primary/15 text-primary' },
  custom_webhook: { label: 'Webhook Customizado', icon: Webhook, color: 'bg-warning/15 text-warning' },
  custom_agent: { label: 'Agente IA Externo', icon: Bot, color: 'bg-accent/30 text-accent-foreground' },
};

export const USE_FOR_OPTIONS = [
  { value: 'copilot', label: 'Copiloto' },
  { value: 'analysis', label: 'Análise de Conversa' },
  { value: 'summary', label: 'Resumo' },
  { value: 'tagging', label: 'Auto-tagging' },
  { value: 'auto_reply', label: 'Resposta Automática' },
];

export type ProviderFormData = Omit<AIProvider, 'id' | 'created_at'>;

export const EMPTY_FORM: ProviderFormData = {
  name: '',
  description: '',
  provider_type: 'openai_compatible',
  api_endpoint: '',
  api_key_secret_name: '',
  model: '',
  system_prompt: '',
  config: {},
  is_active: true,
  is_default: false,
  use_for: ['copilot'],
};
