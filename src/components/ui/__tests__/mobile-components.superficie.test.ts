/**
 * UK-10 — o `MobileDrawer` (overlay próprio com `role="dialog" aria-modal="true"`
 * sem fechar no Esc, sem armadilha de foco e sem devolver o foco ao gatilho) foi
 * REMOVIDO em vez de reescrito: nenhum arquivo o importava. O menu do celular é o
 * `MobileDrawerMenu`, componente diferente.
 *
 * Guarda de regressão do contrato do módulo: falha se alguém reintroduzir o overlay
 * morto. O módulo real é importado (não se lê texto do arquivo).
 */
import { describe, expect, it } from 'vitest';
import * as mobileComponents from '@/components/ui/mobile-components';

describe('mobile-components — superfície do módulo (UK-10)', () => {
  it('não expõe mais o MobileDrawer', () => {
    expect('MobileDrawer' in mobileComponents).toBe(false);
  });

  it('continua expondo o BottomNavigation, usado pelo MobileShell', () => {
    expect(typeof mobileComponents.BottomNavigation).toBe('function');
  });
});
