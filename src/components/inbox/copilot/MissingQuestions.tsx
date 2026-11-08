import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CopilotSession } from '@/hooks/chat/useCopilotSession';

const BRINDE_QUESTIONS: Array<{
  key: keyof Pick<CopilotSession, 'brinde_budget' | 'brinde_responsible' | 'brinde_intention' | 'brinde_quantity' | 'brinde_deadline' | 'brinde_delivery'>;
  letter: string;
  question: string;
}> = [
  { key: 'brinde_budget',      letter: 'B', question: 'Qual o orçamento disponível por brinde ou total?' },
  { key: 'brinde_responsible', letter: 'R', question: 'Quem toma a decisão de compra?' },
  { key: 'brinde_intention',   letter: 'I', question: 'Qual a finalidade/evento dos brindes?' },
  { key: 'brinde_quantity',    letter: 'N', question: 'Quantas unidades são necessárias?' },
  { key: 'brinde_deadline',    letter: 'D', question: 'Qual o prazo máximo de entrega?' },
  { key: 'brinde_delivery',    letter: 'E', question: 'Como será a entrega (endereço, local, frete)?' },
];

interface MissingQuestionsProps {
  session: CopilotSession;
  className?: string;
}

export function MissingQuestions({ session, className }: MissingQuestionsProps) {
  const missing = BRINDE_QUESTIONS.filter((q) => !session[q.key]);
  if (missing.length === 0) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <HelpCircle className="w-3.5 h-3.5" />
        Perguntas pendentes
      </div>
      <ul className="space-y-1">
        {missing.map((q) => (
          <li key={q.key} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 w-4 h-4 rounded bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 text-[10px]">
              {q.letter}
            </span>
            <span className="text-muted-foreground">{q.question}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
