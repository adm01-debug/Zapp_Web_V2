/**
 * UK-14 — contrato do primitivo `tabs` (21 consumidores diretos).
 *
 * Prova o Radix Tabs do projeto: papel `tablist`/`tab`/`tabpanel`, o item ativo
 * anuncia `aria-selected`, ativação por ponteiro e por teclado (seta) troca o
 * painel exibido, e o conteúdo inativo fica fora da árvore acessível
 * (`hidden`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

afterEach(cleanup);

function Exemplo() {
  return (
    <Tabs defaultValue="visao">
      <TabsList aria-label="Seções">
        <TabsTrigger value="visao">Visão geral</TabsTrigger>
        <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
      </TabsList>
      <TabsContent value="visao">Conteúdo da visão</TabsContent>
      <TabsContent value="segmentos">Conteúdo dos segmentos</TabsContent>
    </Tabs>
  );
}

describe('tabs — contrato do primitivo (UK-14)', () => {
  it('expõe tablist, tabs e o painel do item ativo', () => {
    render(<Exemplo />);

    expect(screen.getByRole('tablist', { name: 'Seções' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo da visão');
  });

  it('só o item ativo tem aria-selected=true', () => {
    render(<Exemplo />);

    expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Segmentos' })).toHaveAttribute('aria-selected', 'false');
  });

  it('ativar por ponteiro troca o painel exibido', () => {
    render(<Exemplo />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Segmentos' }));

    expect(screen.getByRole('tab', { name: 'Segmentos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo dos segmentos');
  });

  it('a seta move a seleção para o próximo tab (ativação automática)', async () => {
    render(<Exemplo />);
    const primeiro = screen.getByRole('tab', { name: 'Visão geral' });
    primeiro.focus();

    // O Radix lê o `keyCode` da seta (não só `key`).
    fireEvent.keyDown(primeiro, { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39 });

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Segmentos' })).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo dos segmentos');
  });
});
