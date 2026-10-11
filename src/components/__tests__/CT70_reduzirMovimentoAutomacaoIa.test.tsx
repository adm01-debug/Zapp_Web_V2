/**
 * CT-70 — reduzir movimento nos módulos de Automação/IA.
 *
 * Mesma violação corrigida no catálogo (CT-70 do WhatsAppTemplatesManager),
 * replicada nos 6 pontos de entrada de lista dos módulos de Automação/IA.
 * Duas provas:
 *  1. contrato de fonte — cada arquivo com `framer-motion` importa e chama
 *     `useReducedMotion`, e condiciona a entrada da lista (`initial={`).
 *  2. comportamento — com `prefers-reduced-motion: reduce` ligado (via o
 *     singleton que o próprio framer-motion lê) a entrada animada some,
 *     renderizando o estado final. Sem a flag, o contrário.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AutomationCard } from '@/components/automations/AutomationCard';
import type { AutomationRow } from '@/components/automations/useAutomations';

// ── controle do "reduzir movimento" ──────────────────────────────────────
// `useReducedMotion` lê um singleton inicializado uma única vez: trocar o
// matchMedia no meio do arquivo não funciona. Aqui só o hook é substituído
// (o resto do framer-motion segue real, então as asserções são sobre o DOM
// que ele de fato produz).
const reduceMotion = { value: false };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

// ── contrato de fonte ────────────────────────────────────────────────────
const arquivos = [
  'ai/ChurnPredictionDashboard.tsx',
  'ai/AutoTicketClassifier.tsx',
  'chatbot/ChatbotFlowsView.tsx',
  'knowledge/KnowledgeBaseView.tsx',
  'whatsapp-flows/WhatsAppFlowsBuilder.tsx',
  'automations/AutomationCard.tsx',
];
const raizComponentes = path.resolve(__dirname, '..');
const fonte = (rel: string) => readFileSync(path.join(raizComponentes, rel), 'utf8');

describe('CT-70 Automação/IA — contrato de fonte', () => {
  it.each(arquivos)('%s importa e chama useReducedMotion', (rel) => {
    const src = fonte(rel);
    expect(src).toMatch(/import\s*\{[^}]*\buseReducedMotion\b[^}]*\}\s*from\s*'framer-motion'/);
    expect(src).toMatch(/=\s*useReducedMotion\(\)/);
  });

  it.each(arquivos)('%s condiciona a entrada da lista ao prefersReducedMotion', (rel) => {
    expect(fonte(rel)).toMatch(/initial=\{prefersReducedMotion \? false :/);
  });
});

// ── comportamento (componente REAL) ──────────────────────────────────────
const automation: AutomationRow = {
  id: 'a1',
  name: 'Boas-vindas',
  description: 'Manda o menu inicial',
  is_active: true,
  trigger_type: 'keyword',
  trigger_config: {},
  actions: [],
  created_by: null,
  last_triggered_at: null,
  trigger_count: 0,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
};

const renderCard = () =>
  render(
    <AutomationCard
      automation={automation}
      onToggle={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
    />
  );

describe('CT-70 Automação/IA — comportamento (AutomationCard)', () => {
  beforeEach(() => {
    reduceMotion.value = false;
  });

  it('sem redução, o card entra com fade (opacidade 0 no 1º paint)', () => {
    reduceMotion.value = false;
    const { container } = renderCard();

    const card = container.firstChild as HTMLElement;
    expect(card.style.opacity).toBe('0');
  });

  it('com redução, o card já nasce no estado final (sem opacidade inicial)', () => {
    reduceMotion.value = true;
    const { container } = renderCard();

    const card = container.firstChild as HTMLElement;
    expect(card.style.opacity).not.toBe('0');
    expect(card.style.transform).not.toContain('translateY');
    // o card continua na tela — só a animação foi pulada
    expect(screen.getByText('Boas-vindas')).toBeInTheDocument();
  });
});
