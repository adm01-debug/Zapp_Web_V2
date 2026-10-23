/**
 * CV-071/072: Detects customer objections in real-time and provides treatment scripts.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export type ObjectionType =
  | 'price'
  | 'time'
  | 'minimum_qty'
  | 'competitor'
  | 'delay'
  | 'quality'
  | 'need';

export interface ObjectionClassification {
  type: ObjectionType;
  isReal: boolean;
  confidence: number;
  script: string[];
}

export interface UseObjectionDetectorOptions {
  conversationId: string;
  messages: string[];
  onObjectionDetected?: (objection: ObjectionClassification) => void;
}

const OBJECTION_KEYWORDS: Record<ObjectionType, string[]> = {
  price: ['caro', 'preço', 'valor', 'barato', 'concorrente', 'achei mais', 'mais em conta', 'pesado'],
  delay: ['vou pensar', 'deixa ver', 'vou conferir', 'depois', 'semana que vem', 'vou ver', 'semana'],
  competitor: ['outro fornecedor', 'outro site', 'comprar em', 'mais barato', 'vi em outro', 'outro lugar', 'promoção'],
  time: ['prazo', 'demora', 'urgente', 'preciso rápido', 'tempo', 'quando chega', 'entrega'],
  minimum_qty: ['quantidade mínima', 'mínimo', 'pouca quantidade', 'menos quantidade', 'qtd mínima'],
  quality: ['qualidade', 'dura', 'material', 'acabamento', 'foto', 'amostra', 'diferente', 'igual'],
  need: ['não preciso', 'não tenho interesse', 'não quero', 'sem interesse', 'não necessito'],
};

const TREATMENT_SCRIPTS: Record<ObjectionType, string[]> = {
  price: [
    '1. Acolher: "Entendo sua preocupação com o investimento. Faz todo sentido querer o melhor custo-benefício."',
    '2. Causa: "Posso perguntar — você está comparando com algum fornecedor específico?"',
    '3. Valor: "Nosso diferencial está em [gravação inclusa + prazo garantido + frete]. O custo por peça considerando tudo isso costuma ser mais baixo."',
    '4. Checar: "Se eu conseguir igualar ou superar o que você encontrou, faz sentido fechar com a gente?"',
  ],
  delay: [
    '1. Acolher: "Claro, sem problema! Você precisa de alguma informação adicional para decidir?"',
    '2. Causa: "Tem algum ponto específico que ainda está em aberto para você?"',
    '3. Valor: "Posso reservar as peças por 24h sem compromisso. Assim você tem tempo para pensar sem correr risco de ficar sem estoque."',
    '4. Checar: "Qual seria o melhor momento para eu dar um retorno?"',
  ],
  competitor: [
    '1. Acolher: "É natural pesquisar — e você está certo em comparar!"',
    '2. Causa: "O que eles estão oferecendo que chamou sua atenção?"',
    '3. Valor: "Nosso diferencial está na gravação inclusa, no prazo garantido e no atendimento pós-venda. Muitos clientes que foram lá voltaram por causa disso."',
    '4. Checar: "Se nosso preço estiver próximo, qual seria o fator decisivo para você?"',
  ],
  time: [
    '1. Acolher: "Entendo que o prazo é crucial para o sucesso do seu evento."',
    '2. Causa: "Qual é a data exata que você precisa receber?"',
    '3. Valor: "Com esse prazo, consigo garantir [X dias] de produção. Posso também oferecer rastreamento em tempo real."',
    '4. Checar: "Se eu confirmar esse prazo em contrato, podemos avançar?"',
  ],
  minimum_qty: [
    '1. Acolher: "Compreendo que uma quantidade menor seria ideal para começar."',
    '2. Causa: "É um teste ou você já tem uma demanda definida?"',
    '3. Valor: "Posso sugerir um produto similar com mínimo menor, ou podemos dividir em 2 pedidos para facilitar."',
    '4. Checar: "Qual quantidade você consegue trabalhar agora?"',
  ],
  quality: [
    '1. Acolher: "Totalmente justo querer ter certeza da qualidade antes de investir."',
    '2. Causa: "Você tem algum produto de referência para comparar?"',
    '3. Valor: "Posso enviar uma amostra gratuita para você aprovar antes de fechar. Assim você tem certeza do que está comprando."',
    '4. Checar: "Se a amostra atender suas expectativas, podemos avançar com o pedido?"',
  ],
  need: [
    '1. Acolher: "Sem problema, respeito completamente sua decisão."',
    '2. Causa: "Posso perguntar o que fez você mudar de ideia? Sua opinião é muito importante para mim."',
    '3. Valor: "Caso mude de ideia ou surja uma nova demanda, estou à disposição. Vou deixar nosso catálogo com você."',
    '4. Checar: "Posso entrar em contato em outra ocasião, como em datas comemorativas?"',
  ],
};

function detectObjection(messages: string[]): ObjectionClassification | null {
  if (messages.length === 0) return null;

  const lastMessages = messages.slice(-3).join(' ').toLowerCase();

  let bestMatch: { type: ObjectionType; confidence: number } | null = null;

  for (const [type, keywords] of Object.entries(OBJECTION_KEYWORDS) as [ObjectionType, string[]][]) {
    const matchCount = keywords.filter(kw => lastMessages.includes(kw)).length;
    if (matchCount > 0) {
      const confidence = Math.min(matchCount / keywords.length + 0.3, 1.0);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { type, confidence };
      }
    }
  }

  if (!bestMatch) return null;

  return {
    type: bestMatch.type,
    isReal: bestMatch.confidence >= 0.5,
    confidence: bestMatch.confidence,
    script: TREATMENT_SCRIPTS[bestMatch.type],
  };
}

export function useObjectionDetector(options: UseObjectionDetectorOptions): {
  objection: ObjectionClassification | null;
  isProcessing: boolean;
  dismiss: () => void;
} {
  const { messages, onObjectionDetected } = options;
  const [objection, setObjection] = useState<ObjectionClassification | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onObjectionRef = useRef(onObjectionDetected);
  onObjectionRef.current = onObjectionDetected;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setIsProcessing(true);

    debounceRef.current = setTimeout(() => {
      const detected = detectObjection(messages);
      setObjection(detected);
      setIsProcessing(false);
      if (detected && onObjectionRef.current) {
        onObjectionRef.current(detected);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [messages]);

  const dismiss = useCallback(() => {
    setObjection(null);
  }, []);

  return { objection, isProcessing, dismiss };
}
