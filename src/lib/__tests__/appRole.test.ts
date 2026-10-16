/**
 * Paridade V3 (E60) — guard runtime de AppRole.
 *
 * O defeito: `v as AppRole` aceitava QUALQUER string vinda do `<Select>` e a
 * mandava para a RPC `admin_set_role`. Aqui a lista dos 4 papéis da V2 é a
 * única fonte de verdade — valor fora dela é recusado.
 */
import { describe, it, expect } from 'vitest';
import { APP_ROLE_VALUES, isAppRole } from '../appRole';

describe('isAppRole — boundary de papel do admin', () => {
  it('aceita exatamente os 4 papéis da V2', () => {
    expect(APP_ROLE_VALUES).toEqual(['admin', 'supervisor', 'agent', 'special_agent']);
    for (const papel of APP_ROLE_VALUES) {
      expect(isAppRole(papel)).toBe(true);
    }
  });

  it('recusa string vazia e papel de outro produto', () => {
    // `''` é o que o Radix entrega quando o item selecionado é removido.
    expect(isAppRole('')).toBe(false);
    expect(isAppRole('owner')).toBe(false);
    expect(isAppRole('superadmin')).toBe(false);
    expect(isAppRole('dev')).toBe(false);
  });

  it('recusa valor com espaço/caixa diferente (sem trim e sem normalizar)', () => {
    expect(isAppRole('admin ')).toBe(false);
    expect(isAppRole(' admin')).toBe(false);
    expect(isAppRole('Admin')).toBe(false);
    expect(isAppRole('ADMIN')).toBe(false);
  });
});
