import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Texto de 120 caracteres, como o cartão pede. O `padEnd` garante o tamanho exato.
const TEXTO_120 = 'Relatório consolidado de atendimentos'.padEnd(120, ' de detalhe');

describe('primitivos de UI com texto longo (120 caracteres)', () => {
  it('o texto de prova tem 120 caracteres', () => {
    expect(TEXTO_120).toHaveLength(120);
  });

  it('Badge: o div raiz retém truncate + min-w-0 e o title guarda o texto inteiro', () => {
    render(<Badge title={TEXTO_120}>{TEXTO_120}</Badge>);

    // O texto é filho direto do `div`; `truncate` e `min-w-0` ficam no próprio wrapper,
    // sem inner span (inner span quebra gap-* e clipa botões de remoção).
    const pilula = screen.getByText(TEXTO_120).closest('div');
    expect(pilula).not.toBeNull();
    expect(pilula?.className).toContain('truncate');
    expect(pilula?.className).toContain('min-w-0');
    expect(pilula).toHaveAttribute('title', TEXTO_120);
  });

  it('Badge: rótulo curto renderiza o mesmo className (nenhuma classe depende do tamanho)', () => {
    const { container: curto } = render(<Badge>Ativo</Badge>);
    const { container: longo } = render(<Badge>{TEXTO_120}</Badge>);

    const classesCurto = curto.firstElementChild?.className;
    expect(classesCurto).toBe(longo.firstElementChild?.className);
    expect(classesCurto).toContain('truncate');
  });

  it('TabsTrigger: o trigger retém min-w-0 + whitespace-nowrap e o title guarda o texto inteiro', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a" title={TEXTO_120}>
            {TEXTO_120}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a">conteúdo</TabsContent>
      </Tabs>,
    );

    // O texto é filho direto do trigger (sem inner span); `min-w-0` + `whitespace-nowrap`
    // ficam no próprio botão — sem `truncate` no trigger para não clipar badges absolutos.
    const aba = screen.getByRole('tab', { name: TEXTO_120 });
    expect(aba.textContent).toBe(TEXTO_120);
    expect(aba.className).toContain('min-w-0');
    expect(aba.className).toContain('whitespace-nowrap');
    expect(aba.className).not.toContain('truncate');
    expect(aba).toHaveAttribute('title', TEXTO_120);
  });

  it('Card: a caixa do pai encolhe (min-w-0) e o título/descrição quebram linha', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="card-header">
          <CardTitle data-testid="card-title">{TEXTO_120}</CardTitle>
          <CardDescription data-testid="card-description">{TEXTO_120}</CardDescription>
        </CardHeader>
        <CardContent data-testid="card-content">conteúdo</CardContent>
        <CardFooter data-testid="card-footer">rodapé</CardFooter>
      </Card>,
    );

    for (const parte of ['card-header', 'card-content', 'card-footer']) {
      expect(screen.getByTestId(parte).className).toContain('min-w-0');
    }

    for (const texto of ['card-title', 'card-description']) {
      const no = screen.getByTestId(texto);
      expect(no.className).toContain('min-w-0');
      expect(no.className).toContain('break-words');
      expect(no.textContent).toBe(TEXTO_120);
    }
  });

  it('CardTitle: usa leading-tight (não leading-none) para não colar as linhas', () => {
    render(<CardTitle data-testid="titulo">Linha um de um título longo</CardTitle>);

    const titulo = screen.getByTestId('titulo');
    expect(titulo.className).toContain('leading-tight');
    expect(titulo.className).not.toContain('leading-none');
  });

  it('Label: usa leading-snug, não leading-none', () => {
    render(<Label data-testid="rotulo">{TEXTO_120}</Label>);

    const rotulo = screen.getByTestId('rotulo');
    expect(rotulo.className).toContain('leading-snug');
    expect(rotulo.className).not.toContain('leading-none');
  });

  it('Label: rótulo curto e rótulo longo renderizam o mesmo className', () => {
    const { container: curto } = render(<Label>Nome</Label>);
    const { container: longo } = render(<Label>{TEXTO_120}</Label>);

    // Nenhuma classe depende do tamanho do texto: a altura de um rótulo de uma linha
    // vem só do token `text-sm` (1.25rem no tailwind.config.ts), e `leading-snug`
    // (1.375 × 14px = 19,25px) é o valor mais próximo dele no tema.
    expect(curto.firstElementChild?.className).toBe(longo.firstElementChild?.className);
    expect(curto.firstElementChild?.className).toContain('text-sm');
  });
});
