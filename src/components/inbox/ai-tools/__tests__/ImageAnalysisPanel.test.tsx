import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageAnalysisPanel } from '../ImageAnalysisPanel';

const state = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/copilot', () => ({
  useImageAnalysis: () => state.current,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

type Estado = {
  description?: string;
  extractedText?: string[];
  dominantColors?: string[];
  keyElements?: string[];
  brandingOpportunity?: string;
  suggestedReply?: string;
  confidence?: number;
  isLoading?: boolean;
  error?: string | null;
  analyze?: ReturnType<typeof vi.fn>;
};

function montar(overrides: Estado = {}) {
  const analyze = overrides.analyze ?? vi.fn();
  state.current = {
    description: '',
    extractedText: [],
    dominantColors: [],
    keyElements: [],
    brandingOpportunity: '',
    suggestedReply: '',
    confidence: 0,
    isLoading: false,
    error: null,
    analyze,
    ...overrides,
  };
  return analyze;
}

const duasImagens = [
  { url: 'https://exemplo/1.jpg', label: 'Imagem enviada por Ana' },
  { url: 'https://exemplo/2.jpg', label: 'Imagem enviada pelo agente' },
];

beforeEach(() => {
  state.current = {};
});

describe('ImageAnalysisPanel — estado vazio', () => {
  it('avisa que nao ha imagem e nao oferece o botao de analise', () => {
    montar();
    render(<ImageAnalysisPanel images={[]} />);
    expect(screen.getByText('Nenhuma imagem nesta conversa para analisar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Analisar imagem/ })).toBeNull();
  });
});

describe('ImageAnalysisPanel — disparo da edge', () => {
  it('chama a edge com a URL da imagem e o contexto da conversa', () => {
    const analyze = montar();
    render(<ImageAnalysisPanel images={[duasImagens[0]]} conversationContext="cliente: quero um brinde" />);
    fireEvent.click(screen.getByRole('button', { name: /Analisar imagem/ }));
    expect(analyze).toHaveBeenCalledWith('https://exemplo/1.jpg', 'cliente: quero um brinde');
  });

  it('corta o contexto em 1000 caracteres (limite do schema da edge)', () => {
    const analyze = montar();
    const longo = 'x'.repeat(1500);
    render(<ImageAnalysisPanel images={[duasImagens[0]]} conversationContext={longo} />);
    fireEvent.click(screen.getByRole('button', { name: /Analisar imagem/ }));
    expect(analyze).toHaveBeenCalledWith('https://exemplo/1.jpg', 'x'.repeat(1000));
  });

  it('analisa a imagem escolhida quando a conversa tem mais de uma', () => {
    const analyze = montar();
    render(<ImageAnalysisPanel images={duasImagens} />);
    fireEvent.click(screen.getByTitle('Imagem enviada pelo agente'));
    fireEvent.click(screen.getByRole('button', { name: /Analisar imagem/ }));
    expect(analyze).toHaveBeenCalledWith('https://exemplo/2.jpg', undefined);
  });

  it('bloqueia o botao enquanto a analise esta em voo', () => {
    montar({ isLoading: true });
    render(<ImageAnalysisPanel images={[duasImagens[0]]} />);
    expect(screen.getByRole('button', { name: /Analisando imagem/ }).hasAttribute('disabled')).toBe(true);
  });
});

describe('ImageAnalysisPanel — resultado', () => {
  it('mostra os campos do contrato da edge', () => {
    montar({
      description: 'Caneca branca com logo',
      extractedText: ['ZAPP'],
      dominantColors: ['#ffffff'],
      keyElements: ['caneca'],
      brandingOpportunity: 'Boa para brinde de fim de ano',
      suggestedReply: 'Consigo essa caneca com a sua marca',
      confidence: 0.87,
    });
    render(<ImageAnalysisPanel images={[duasImagens[0]]} />);
    expect(screen.getByText('Caneca branca com logo')).toBeTruthy();
    expect(screen.getByText('ZAPP')).toBeTruthy();
    expect(screen.getByText('#ffffff')).toBeTruthy();
    expect(screen.getByText('caneca')).toBeTruthy();
    expect(screen.getByText('Boa para brinde de fim de ano')).toBeTruthy();
    expect(screen.getByText('Consigo essa caneca com a sua marca')).toBeTruthy();
    expect(screen.getByText(/Confiança da análise: 87%/)).toBeTruthy();
  });

  it('mostra o erro devolvido pela edge sem inventar texto generico', () => {
    montar({ error: 'Imagem nao pode ser analisada: bucket_not_allowed' });
    render(<ImageAnalysisPanel images={[duasImagens[0]]} />);
    expect(screen.getByRole('alert').textContent).toContain('bucket_not_allowed');
  });
});