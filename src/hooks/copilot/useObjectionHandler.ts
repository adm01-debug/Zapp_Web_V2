/**
 * CV-072 — Tratamento de objeção.
 *
 * Detecta tipo de objeção no texto do cliente e retorna roteiro de resposta.
 * Metodologia B·R·I·N·D·E: acolher → perguntar causa → responder com valor → checar.
 */
import { useMemo } from 'react';

export type ObjeçãoType =
  | 'preco'
  | 'prazo'
  | 'quantidade_minima'
  | 'concorrente'
  | 'chefe'
  | 'qualidade'
  | 'frete'
  | 'generica';

export interface ObjectionResult {
  detected: boolean;
  type: ObjeçãoType | null;
  isSmokescreen: boolean;
  treatmentSteps: string[];
  suggestedReply: string;
}

const OBJECTION_TRIGGERS: Record<ObjeçãoType, string[]> = {
  preco: ['caro', 'preço alto', 'muito caro', 'sai mais barato', 'orçamento', 'apertado', 'tá salgado'],
  prazo: ['prazo', 'demora', 'urgente', 'quando fica', 'tempo', 'preciso antes'],
  quantidade_minima: ['mínimo', 'minimo', 'poucas', 'menos unidades', 'só preciso', 'quantidade pequena'],
  concorrente: ['outro fornecedor', 'cotei', 'comparei', 'outra empresa'],
  chefe: ['meu chefe', 'diretor', 'gerente', 'aprovação', 'preciso consultar', 'vou verificar com'],
  qualidade: ['qualidade', 'durável', 'resistente', 'material', 'acabamento'],
  frete: ['frete', 'custo de envio', 'despesa de entrega', 'quanto custa enviar'],
  generica: ['vou pensar', 'deixa eu ver', 'não sei', 'talvez', 'depois', 'vou decidir'],
};

const OBJECTION_SCRIPTS: Record<ObjeçãoType, { steps: string[]; reply: string }> = {
  preco: {
    steps: ['Acolha: reconheça que o preço importa', 'Pergunte o que inclui o orçamento do concorrente', 'Mostre o valor total: qualidade, prazo, personalização, atendimento', 'Calcule o custo por peça/uso para relativizar'],
    reply: 'Entendo que o preço é importante! Para comparar certinho, o que exatamente inclui o orçamento do concorrente? (material, gravação, prazo, frete...) Às vezes o que parece mais barato tem surpresas.',
  },
  prazo: {
    steps: ['Confirme a data real do evento', 'Informe o prazo de produção realista', 'Se urgente, verifique estoque ou parceiro express', 'Ofereça alternativa com menor prazo se houver'],
    reply: 'Qual é a data exata que você precisa? Com isso consigo verificar a opção mais rápida disponível, incluindo estoque pronto.',
  },
  quantidade_minima: {
    steps: ['Explique o porquê do mínimo (setup de produção)', 'Ofereça mistura de itens para atingir o mínimo', 'Sugira produto alternativo sem mínimo'],
    reply: 'O mínimo existe pelo setup de produção. Mas posso misturar modelos diferentes para atingir o volume — assim você paga menos por peça. Quantas unidades precisa no total?',
  },
  concorrente: {
    steps: ['Não fale mal do concorrente', 'Pergunte os detalhes da proposta', 'Mostre os diferenciais objetivos', 'Se perder em preço, ganhe em valor'],
    reply: 'Ótimo estar comparando! Pode me dizer o que eles cotaram exatamente? Material, quantidade, prazo e o que inclui no preço? Quero fazer uma comparação justa.',
  },
  chefe: {
    steps: ['Pergunte o que o chefe precisa saber para decidir', 'Ofereça material de apoio (proposta formal)', 'Confirme quem é o decisor e quando haverá retorno'],
    reply: 'Claro! Posso preparar uma proposta formal com todos os detalhes para você apresentar. O que seu chefe costuma perguntar nessas decisões?',
  },
  qualidade: {
    steps: ['Ofereça amostras físicas', 'Mostre certificações ou cases', 'Explique o processo de produção'],
    reply: 'Faz todo sentido querer ter certeza da qualidade. Posso enviar uma amostra física antes do pedido — você vê o material e a gravação de perto. Qual o endereço?',
  },
  frete: {
    steps: ['Informe o frete real', 'Calcule o custo por peça com frete', 'Verifique se pedido maior zera o frete'],
    reply: 'Posso calcular o frete exato agora. Me confirma o CEP de entrega? E se o pedido for maior, às vezes consigo embutir no valor da peça.',
  },
  generica: {
    steps: ['Pergunte o que falta para decidir', 'Resuma os pontos já alinhados', 'Proponha um prazo para retorno'],
    reply: 'Sem problema! Para ajudar na sua decisão: tem alguma dúvida que ficou em aberto? Ou posso preparar algo específico para você comparar melhor?',
  },
};

const SMOKESCREEN_SIGNALS = ['gostei', 'legal', 'bonito', 'quero sim', 'me interessei', 'pode ser', 'aprovamos', 'exatamente', 'perfeito', 'ótimo'];

export function useObjectionHandler({ clientText }: { clientText: string }): ObjectionResult {
  return useMemo(() => {
    if (!clientText) return { detected: false, type: null, isSmokescreen: false, treatmentSteps: [], suggestedReply: '' };
    const lower = clientText.toLowerCase();

    let detectedType: ObjeçãoType | null = null;
    for (const [type, triggers] of Object.entries(OBJECTION_TRIGGERS) as [ObjeçãoType, string[]][]) {
      if (triggers.some((t) => lower.includes(t))) { detectedType = type; break; }
    }

    if (!detectedType) return { detected: false, type: null, isSmokescreen: false, treatmentSteps: [], suggestedReply: '' };

    const hasBuySignal = SMOKESCREEN_SIGNALS.some((s) => lower.includes(s));
    const isSmokescreen = detectedType === 'generica' && hasBuySignal;
    const script = OBJECTION_SCRIPTS[detectedType];
    return { detected: true, type: detectedType, isSmokescreen, treatmentSteps: script.steps, suggestedReply: script.reply };
  }, [clientText]);
}
