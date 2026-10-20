import { User, Building2, Tag, Sparkles, Calendar, Hash, LucideIcon } from 'lucide-react';

export interface TemplateVariable {
  key: string;
  label: string;
  icon: LucideIcon;
  example: string;
}

export const AVAILABLE_VARIABLES: TemplateVariable[] = [
  { key: 'nome', label: 'Nome do contato', icon: User, example: 'João Silva' },
  { key: 'primeiro_nome', label: 'Primeiro nome', icon: User, example: 'João' },
  { key: 'empresa', label: 'Empresa', icon: Building2, example: 'Tech Corp' },
  { key: 'cargo', label: 'Cargo', icon: Tag, example: 'Gerente Comercial' },
  { key: 'saudacao', label: 'Saudação', icon: Sparkles, example: 'Bom dia' },
  { key: 'data_atual', label: 'Data atual', icon: Calendar, example: '06/01/2026' },
  { key: 'protocolo', label: 'Protocolo', icon: Hash, example: '#2026010600123' },
  { key: 'atendente', label: 'Nome do atendente', icon: User, example: 'Maria Santos' },
];

export function replaceVariables(
  content: string,
  contactData?: { name?: string; company?: string; job_title?: string },
  customValues?: Record<string, string>
): string {
  const now = new Date();
  const hour = now.getHours();
  let saudacao = 'Bom dia';
  if (hour >= 12 && hour < 18) saudacao = 'Boa tarde';
  if (hour >= 18 || hour < 6) saudacao = 'Boa noite';

  const firstName = contactData?.name?.split(' ')[0] || '';
  const protocol = `#${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;

  const defaultValues: Record<string, string> = {
    nome: contactData?.name || '',
    primeiro_nome: firstName,
    empresa: contactData?.company || '',
    cargo: contactData?.job_title || '',
    saudacao,
    data_atual: now.toLocaleDateString('pt-BR'),
    protocolo: protocol,
    atendente: 'Atendente',
  };

  const values = { ...defaultValues, ...customValues };
  let result = content;
  Object.entries(values).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value);
  });
  return result;
}

export function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2).toLowerCase()))];
}
