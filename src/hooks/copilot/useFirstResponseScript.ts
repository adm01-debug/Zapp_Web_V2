/**
 * CV-094 — Script de primeira resposta.
 */
import { useMemo } from 'react';

export interface FirstResponseScript {
  script: string;
  variables: Record<string, string>;
  rendered: string;
}

const SCRIPTS = {
  business_hours: { script: 'Olá, {{nome}}! 😊 Bem-vindo à Promo Brindes! Sou {{vendedor}} e estou aqui para te ajudar. Como posso te auxiliar hoje?' },
  after_hours: { script: 'Olá, {{nome}}! 🌙 Recebemos sua mensagem fora do horário comercial. Nosso atendimento é de segunda a sexta das 8h às 18h. Mas já deixei sua dúvida anotada e retorno amanhã cedo! 😊' },
  returning_client: { script: 'Olá, {{nome}}! Que saudade! 😊 Bem-vindo de volta à Promo Brindes. Como posso te ajudar hoje?' },
};

function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

export function useFirstResponseScript({ isFirstMessage, contactName = 'cliente', agentName = 'nossa equipe', isReturningClient = false }: { isFirstMessage: boolean; contactName?: string; agentName?: string; isReturningClient?: boolean }): FirstResponseScript | null {
  return useMemo(() => {
    if (!isFirstMessage) return null;
    const template = isReturningClient ? SCRIPTS.returning_client : isBusinessHours() ? SCRIPTS.business_hours : SCRIPTS.after_hours;
    const variables: Record<string, string> = { nome: contactName, vendedor: agentName };
    const rendered = template.script.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
    return { script: template.script, variables, rendered };
  }, [isFirstMessage, contactName, agentName, isReturningClient]);
}
