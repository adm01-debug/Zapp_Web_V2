import type { WhatsAppTemplate } from '@/hooks/integrations/useWhatsAppTemplates';

/** Monta o `template` no formato da Evolution v2 (componente `body` com as variáveis, na ordem). */
export function montarTemplateEvolution(template: Pick<WhatsAppTemplate, 'name' | 'language'>, valores: string[]) {
  return {
    name: template.name,
    language: template.language,
    components: valores.length > 0
      ? [{ type: 'body', parameters: valores.map((text) => ({ type: 'text', text })) }]
      : [],
  };
}
