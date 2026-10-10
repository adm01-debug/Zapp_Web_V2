import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('a11y: SLADashboard — título principal é h1', () => {
  it('o componente usa h1 para o título do dashboard (não h2)', () => {
    const source = readFileSync(
      join(__dirname, '../SLADashboard.tsx'),
      'utf-8',
    );
    // Antes da correção, o título "Dashboard de SLA" era <h2>.
    // Como é o nível principal da página (sem h1 anterior), deve ser <h1>.
    expect(source).toContain('<h1');
    expect(source).toContain('Dashboard de SLA');
    expect(source).not.toMatch(/<h2[^>]*>.*Dashboard de SLA/);
  });
});