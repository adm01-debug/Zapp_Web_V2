import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';

const readSource = (relPath: string) => {
  const base = new URL(import.meta.url).pathname;
  return readFileSync(join(dirname(base), relPath), 'utf-8');
};

describe('Acessibilidade — ícones e botões com aria-label', () => {
  it('ObjectionDetector: ícone de dúvida tem aria-label', () => {
    const content = readSource('../ObjectionDetector.tsx');
    expect(content).toContain('aria-label="Dúvida sobre objeção"');
  });

  it('ToolPanel: botão de fechar tem aria-label', () => {
    const content = readSource('../ai-tools/ToolPanel.tsx');
    expect(content).toContain('aria-label="Fechar painel"');
  });

  it('SentimentTab: botões de métrica têm aria-label via config', () => {
    const content = readSource('../ai-tools/SentimentTab.tsx');
    expect(content).toContain('aria-label={config.label}');
  });

  it('SummaryResult: botão de ouvir resumo tem aria-label', () => {
    const content = readSource('../summary/SummaryResult.tsx');
    expect(content).toContain('aria-label={label}');
  });

  it('AISuggestions: botão de fechar tem aria-label', () => {
    const content = readSource('../AISuggestions.tsx');
    expect(content).toContain('aria-label="Fechar sugestões"');
  });
});