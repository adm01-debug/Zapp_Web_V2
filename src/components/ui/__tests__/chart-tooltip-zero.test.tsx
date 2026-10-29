import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// O recharts nao mede no jsdom (ResponsiveContainer fica 0x0 e nao pinta os
// filhos); trocamos so o container por um div para o ChartTooltipContent real
// ser montado dentro do ChartContext, que e quem ele consome.
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Box, Tooltip: () => null, Legend: () => null };
});

import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';

const config = { enviados: { label: 'Enviados', color: 'hsl(var(--primary))' } };

function renderTooltip(payloadItems: unknown[]) {
  // O payload real do recharts tem dezenas de campo obrigatorios; o teste monta
  // so os campos que o ChartTooltipContent le (dataKey, name, value, payload.fill).
  const props = {
    active: true,
    payload: payloadItems,
  } as unknown as React.ComponentProps<typeof ChartTooltipContent>;
  return render(
    <ChartContainer config={config}>
      <ChartTooltipContent {...props} />
    </ChartContainer>,
  );
}

describe('ChartTooltipContent — valor zero e payload sem fill', () => {
  it('exibe o valor 0 do ponto (nao esconde a serie zerada)', () => {
    renderTooltip([
      { dataKey: 'enviados', name: 'enviados', value: 0, payload: { fill: 'hsl(var(--primary))' } },
    ]);

    // Sem a correcao (item.value &&) o "0" e falsy e a linha do valor some.
    expect(screen.getAllByText('Enviados').length).toBeGreaterThan(0);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('nao quebra quando o ponto nao traz payload.fill', () => {
    renderTooltip([{ dataKey: 'enviados', name: 'enviados', value: 3 }]);

    // Sem o guard item.payload?.fill isso lanca TypeError na renderizacao.
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('mostra as duas series quando ha dois pontos no mesmo tooltip', () => {
    renderTooltip([
      { dataKey: 'enviados', name: 'enviados', value: 0, payload: { fill: 'hsl(var(--primary))' } },
      { dataKey: 'entregues', name: 'entregues', value: 4, payload: { fill: 'hsl(var(--success))' } },
    ]);

    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('nao emite warning de key duplicada quando duas series repetem o dataKey', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTooltip([
      { dataKey: 'enviados', name: 'enviados', value: 0, payload: { fill: 'hsl(var(--primary))' } },
      { dataKey: 'enviados', name: 'reenviados', value: 5, payload: { fill: 'hsl(var(--success))' } },
    ]);

    // Sem a chave composta o React avisa "Encountered two children with the same key".
    const mensagens = spy.mock.calls.map((c) => String(c[0]));
    expect(mensagens.some((m) => m.includes('same key'))).toBe(false);
    spy.mockRestore();
  });
});
