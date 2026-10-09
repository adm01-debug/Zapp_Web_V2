import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

type Variant = NonNullable<ComponentProps<typeof EmptyState>['variant']>;

describe('EmptyState — preset órfão `pipeline` (E12)', () => {
  it('o contrato de `variant` não aceita mais "pipeline"', () => {
    // O preset `pipeline` saiu de `emptyStateConfigs` (nenhum consumidor usava
    // `variant="pipeline"`). Se a chave voltasse ao objeto, a linha abaixo
    // compilaria e o tsc acusaria "Unused '@ts-expect-error' directive".
    // @ts-expect-error E12: `pipeline` deixou de ser um variant de EmptyState
    const removido: Variant = 'pipeline';

    expect(removido).toBe('pipeline');
  });

  it('não renderiza mais o preset de runtime "Pipeline vazio / Criar Deal"', () => {
    // Chama o componente real: com o preset antigo, essa renderização não lançava
    // e mostrava "Pipeline vazio" / "Criar Deal"; sem o preset, `pipeline` é um
    // variant inválido também em runtime.
    expect(() => {
      render(
        // @ts-expect-error E12: `pipeline` deixou de ser um variant de EmptyState
        <EmptyState variant="pipeline" />,
      );
    }).toThrow();
  });
});
