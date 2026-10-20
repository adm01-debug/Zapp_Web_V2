/**
 * Registro ÚNICO dos mocks de dependências dos testes de comportamento de alerta.
 *
 * Os arquivos de teste importam este módulo (efeito colateral) em vez de repetir o mesmo bloco de
 * `vi.mock(...)`. A repetição era exatamente o que o SonarCloud contava como duplicação em código
 * novo (6,6% no PR #1261, limite 3%): o andaime de mock é idêntico em todos os hooks de alerta, e
 * cada arquivo novo re-adicionava o mesmo bloco. Aqui ele vive uma vez só.
 */
import { vi } from 'vitest';

vi.mock('@/utils/notificationSounds', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).notificationSoundsMock(),
);
vi.mock('@/integrations/supabase/client', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).supabaseMock(),
);
vi.mock('@/hooks/auth/useAuth', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).authMock(),
);
vi.mock('@/lib/logger', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).loggerMock(),
);
vi.mock('@/lib/notificationDedupe', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).dedupeMock(),
);
vi.mock('sonner', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).sonnerMock(),
);
vi.mock('@/hooks/ui/use-toast', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).toastMock(),
);
vi.mock('@/hooks/system/useNotificationSettings', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).settingsMock(),
);
