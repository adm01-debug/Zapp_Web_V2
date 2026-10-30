/**
 * Registro do mock de `openContactChat` (ação "Abrir conversa" do SLA).
 *
 * Fica separado do `alertMocks` de propósito: o teste de sentimento
 * (`sentimentAlerts.navegacao.test.tsx`) observa o `openContactChat` REAL para provar o
 * contrato de navegação. Só os testes de SLA, que conferem o argumento entregue à ação,
 * importam este módulo.
 */
import { vi } from 'vitest';

vi.mock('@/components/catalog/useSendProduct', async () =>
  (await import('@/hooks/__tests__/helpers/alertBehaviorTestKit')).sendProductMock(),
);
