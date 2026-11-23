import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';

export interface ContactSourceInfo {
  /** Nome da origem dos dados exibido no selo do cabeçalho. */
  label: string;
  /** Se o CRM externo (Singu) está habilitado e configurado. */
  crmEnabled: boolean;
}

/**
 * ZD-013 — origem dos dados do módulo Contatos.
 *
 * O selo "Origem dos dados" no cabeçalho reflete o estado real da integração
 * CRM (Singu). Quando a integração está ligada, exibe "Singu CRM"; caso
 * contrário, exibe o estado indisponível. Nada é inventado: a leitura vem do
 * MESMO gate que o resto do módulo usa (`useCRMIntegrationEnabled`).
 */
export function useContactSource(): ContactSourceInfo {
  const crmEnabled = useCRMIntegrationEnabled();
  return {
    label: crmEnabled ? 'Singu CRM' : 'Zapp CRM',
    crmEnabled,
  };
}
