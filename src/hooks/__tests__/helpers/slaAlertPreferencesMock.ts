/**
 * Mock do hook de preferências de alerta de SLA para os testes de `useSLANotifications`.
 *
 * O hook real lê `sla_alert_preferences` por react-query; nos testes de comportamento do alerta a
 * preferência é só um interruptor de entrada — como o mock de "Abrir conversa"
 * (`alertContactMock`), ela entra mockada: sem consulta em voo, sem timer do provider e sem
 * exigir `QueryClientProvider` no andaime dos testes que montam o hook.
 */
import { vi } from 'vitest';
import {
  DEFAULT_SLA_ALERT_PREFERENCES,
  type SlaAlertPreferences,
} from '@/hooks/sla/slaAlertPreferences';

/** Preferências vigentes: o teste desliga o aviso trocando `enabled` aqui. */
export const slaAlertPreferencesCfg: { preferences: SlaAlertPreferences } = {
  preferences: { ...DEFAULT_SLA_ALERT_PREFERENCES },
};

/** Volta ao default da tabela (tudo ligado) entre um teste e outro. */
export function resetSlaAlertPreferences() {
  slaAlertPreferencesCfg.preferences = { ...DEFAULT_SLA_ALERT_PREFERENCES };
}

export function slaAlertPreferencesMock() {
  return {
    useSlaAlertPreferences: () => ({
      preferences: slaAlertPreferencesCfg.preferences,
      isLoading: false,
      isError: false,
      isSaving: false,
      save: vi.fn(),
      refetch: vi.fn(),
    }),
  };
}

vi.mock('@/hooks/sla/useSlaAlertPreferences', async () =>
  (await import('@/hooks/__tests__/helpers/slaAlertPreferencesMock')).slaAlertPreferencesMock(),
);
