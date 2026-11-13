import type { WhatsAppTemplate } from '@/hooks/integrations/useWhatsAppTemplates';

/**
 * Converte o template LOCAL (`whatsapp_templates`) no corpo que a Meta espera em
 * `create-template` (Evolution v2 → `/template/create`): cabeçalho e rodapé de
 * texto opcionais e o corpo. A aprovação (ou a recusa, com o motivo) é da Meta.
 */
export function montarTemplateMeta(t: Pick<WhatsAppTemplate, 'name' | 'category' | 'language' | 'content' | 'header_text' | 'footer_text'>) {
  const components: Array<Record<string, unknown>> = [];
  if (t.header_text?.trim()) components.push({ type: 'HEADER', format: 'TEXT', text: t.header_text.trim() });
  components.push({ type: 'BODY', text: t.content });
  if (t.footer_text?.trim()) components.push({ type: 'FOOTER', text: t.footer_text.trim() });
  return { name: t.name, category: t.category.toUpperCase(), language: t.language, components };
}
