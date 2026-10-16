import { useMemo } from 'react';

export interface FirstReplySuggestion {
  text: string;
  brindeQuestions: string[];  // top 1 BRINDE question to ask
  personalized: boolean;
}

export interface UseFirstReplyOptions {
  isNewContact: boolean;
  contactName?: string;
  incomingMessage: string;
  brindeScores: Partial<Record<string, boolean>>; // which BRINDE fields are known
}

// BRINDE fields and their corresponding questions
const BRINDE_QUESTIONS: Record<string, string> = {
  B: 'Qual seria o brinde ideal para o seu evento ou campanha?',
  R: 'Qual é o público que vai receber os brindes?',
  I: 'Qual é a identidade visual ou logo que gostaria de colocar no brinde?',
  N: 'Quantas unidades você precisa?',
  D: 'Qual é a data do evento ou prazo de entrega?',
  E: 'Qual é o objetivo da ação? (ex: captação, fidelização, reconhecimento)',
};

const BRINDE_ORDER = ['D', 'N', 'B', 'R', 'I', 'E'];

function getTopMissingQuestion(brindeScores: Partial<Record<string, boolean>>): string | null {
  for (const key of BRINDE_ORDER) {
    if (!brindeScores[key]) {
      return BRINDE_QUESTIONS[key] ?? null;
    }
  }
  return null;
}

function detectIntent(message: string): string {
  const lower = message.toLowerCase();
  if (/or[çc]amento/i.test(lower)) return 'orçamento';
  if (/pre[çc]o|quanto custa/i.test(lower)) return 'preço';
  if (/brinde|produto|item/i.test(lower)) return 'produto';
  if (/catálogo|cat[aá]logo/i.test(lower)) return 'catálogo';
  return 'informações';
}

export function useFirstReply(options: UseFirstReplyOptions): {
  suggestion: FirstReplySuggestion | null;
} {
  const { isNewContact, contactName, incomingMessage, brindeScores } = options;

  const suggestion = useMemo((): FirstReplySuggestion | null => {
    if (!isNewContact || !incomingMessage.trim()) return null;

    const topQuestion = getTopMissingQuestion(brindeScores);
    const intent = detectIntent(incomingMessage);
    const nameGreeting = contactName ? `, ${contactName.split(' ')[0]}` : '';

    let text = `Olá${nameGreeting}! Que ótimo ter você aqui 😊 Vi que você está buscando ${intent} — vou te ajudar com muito prazer!`;

    if (topQuestion) {
      text += `\n\nPara eu te passar a melhor opção: ${topQuestion}`;
    } else {
      text += '\n\nVou montar a melhor proposta para você. Me conta um pouco mais sobre o que precisa!';
    }

    return {
      text,
      brindeQuestions: topQuestion ? [topQuestion] : [],
      personalized: !!contactName,
    };
  }, [isNewContact, contactName, incomingMessage, brindeScores]);

  return { suggestion };
}
