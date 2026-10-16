/**
 * CV-073: Competitor battlecard hook — detects competitor mentions and provides talking points.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

export interface BattlecardEntry {
  id: string;
  competitorPattern: RegExp | string;
  strengthPoints: string[];
  comparisonQuestions: string[];
}

export interface UseBattlecardOptions {
  messages: string[];
  onBattlecardTriggered?: (battlecard: BattlecardEntry) => void;
}

const DEFAULT_BATTLECARDS: BattlecardEntry[] = [
  {
    id: 'generic-price',
    competitorPattern: 'mais barato',
    strengthPoints: [
      'Gravação de alta qualidade inclusa no preço (sem cobrança adicional de arte)',
      'Prazo de entrega garantido em contrato com multa por atraso',
      'Frete grátis para pedidos acima do mínimo',
      'Amostra gratuita antes da aprovação do pedido',
      'Atendimento pós-venda e suporte durante evento',
    ],
    comparisonQuestions: [
      'O preço deles inclui a gravação ou é cobrado à parte?',
      'Qual é o prazo garantido e o que acontece se atrasar?',
      'O frete está incluso nesse valor?',
      'Eles oferecem amostra antes de fechar?',
    ],
  },
  {
    id: 'generic-supplier',
    competitorPattern: 'outro fornecedor',
    strengthPoints: [
      'Portfólio exclusivo de produtos personalizados para brindes corporativos',
      'Qualidade de material certificada (ISO/normas ABNT)',
      'Histórico de clientes satisfeitos com casos documentados',
      'Processo de aprovação com prova digital antes da produção',
      'Suporte dedicado durante toda a jornada de compra',
    ],
    comparisonQuestions: [
      'Você já trabalhou com eles antes? Como foi a experiência?',
      'Eles têm referências de outros clientes que você possa consultar?',
      'Como é o processo de aprovação da arte deles?',
      'O que acontece se o produto chegar diferente do combinado?',
    ],
  },
  {
    id: 'generic-site',
    competitorPattern: 'outro site',
    strengthPoints: [
      'Atendimento personalizado (não só e-commerce): consultor dedicado ao seu projeto',
      'Sem surpresas no frete — calculado antes do fechamento',
      'Suporte via WhatsApp direto com especialista em brindes',
      'Garantia de qualidade com troca sem burocracia',
      'Prazo realista e monitorável — não estimativas genéricas',
    ],
    comparisonQuestions: [
      'Em sites, você consegue tirar dúvidas rapidamente com alguém?',
      'Como eles lidam com problemas de qualidade ou atraso?',
      'O frete no site é calculado antes ou surpresa na finalização?',
      'Você consegue amostra física antes de fechar pedido grande?',
    ],
  },
];

function findMatchingBattlecard(
  messages: string[],
  battlecards: BattlecardEntry[],
): BattlecardEntry | null {
  if (messages.length === 0) return null;
  const combined = messages.slice(-5).join(' ').toLowerCase();

  for (const card of battlecards) {
    const pattern = card.competitorPattern;
    if (typeof pattern === 'string') {
      if (combined.includes(pattern.toLowerCase())) return card;
    } else {
      if (pattern.test(combined)) return card;
    }
  }
  return null;
}

export function useBattlecard(options: UseBattlecardOptions): {
  battlecard: BattlecardEntry | null;
  dismiss: () => void;
} {
  const { messages, onBattlecardTriggered } = options;
  const [battlecard, setBattlecard] = useState<BattlecardEntry | null>(null);
  const onTriggeredRef = useRef(onBattlecardTriggered);
  onTriggeredRef.current = onBattlecardTriggered;

  const battlecards = useMemo(() => DEFAULT_BATTLECARDS, []);

  useEffect(() => {
    const matched = findMatchingBattlecard(messages, battlecards);
    setBattlecard(prev => {
      if (matched?.id !== prev?.id) {
        if (matched && onTriggeredRef.current) {
          onTriggeredRef.current(matched);
        }
        return matched;
      }
      return prev;
    });
  }, [messages, battlecards]);

  const dismiss = useCallback(() => {
    setBattlecard(null);
  }, []);

  return { battlecard, dismiss };
}
