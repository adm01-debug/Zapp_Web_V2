import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Guarda de remoção: `src/hooks/system/useVersions.ts` fazia UPDATE cego de snapshot
// em qualquer tabela via fromTable(entityType), fora da trava das RPCs de papel.
// Este teste falha se o hook ou o seu export no barrel voltarem.
describe('useVersions removido (sem restore cego de snapshot)', () => {
  it('o arquivo do hook não existe mais no projeto', () => {
    expect(existsSync(resolve(process.cwd(), 'src/hooks/system/useVersions.ts'))).toBe(false);
  });

  it('o barrel de hooks/system não exporta useVersions', async () => {
    const barrel = await import('@/hooks/system');
    expect(Object.keys(barrel)).not.toContain('useVersions');
  });
});
