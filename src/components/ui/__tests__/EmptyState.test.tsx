import { describe, expect, it } from 'vitest';
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

    // E não existe preset de runtime com esse nome: o valor acima é só o
    // falecido id do menu, não uma configuração do componente.
    expect(removido).toBe('pipeline');
  });
});
