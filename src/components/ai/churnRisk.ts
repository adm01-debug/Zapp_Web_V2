import { differenceInDays } from 'date-fns';

export interface ChurnContact {
  id: string;
  name: string;
  phone: string;
  ai_sentiment: string | null;
  updated_at: string;
  created_at: string;
}

export interface ChurnRisk {
  contactId: string;
  contactName: string;
  phone: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  daysSinceLastMessage: number;
  totalMessages: number;
  sentiment: string | null;
  reasons: string[];
}

export function getRiskLevel(score: number): ChurnRisk['riskLevel'] {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export function computeChurnRisk(contact: ChurnContact, now: Date = new Date()): ChurnRisk {
  // Clamp em 0: timestamps futuros (clock skew) não podem gerar dias negativos
  const daysSinceUpdate = Math.max(0, differenceInDays(now, new Date(contact.updated_at)));
  const daysSinceCreation = Math.max(0, differenceInDays(now, new Date(contact.created_at)));

  let score = 0;
  const reasons: string[] = [];

  // Inactivity factor (max 40 points)
  if (daysSinceUpdate > 30) {
    score += Math.min(40, (daysSinceUpdate - 30) * 2);
    reasons.push(`${daysSinceUpdate} dias sem interação`);
  }

  // Sentiment factor (max 30 points)
  if (contact.ai_sentiment === 'negative') {
    score += 30;
    reasons.push('Sentimento negativo detectado');
  } else if (contact.ai_sentiment === 'neutral') {
    score += 10;
  }

  // New contact with no follow-up (max 20 points)
  if (daysSinceCreation < 7 && daysSinceUpdate > 3) {
    score += 20;
    reasons.push('Novo contato sem follow-up');
  }

  // Long-term inactive (max 10 points)
  if (daysSinceUpdate > 60) {
    score += 10;
    reasons.push('Inativo por mais de 60 dias');
  }

  score = Math.min(100, score);

  if (reasons.length === 0) reasons.push('Engajamento regular');

  return {
    contactId: contact.id,
    contactName: contact.name,
    phone: contact.phone,
    riskScore: score,
    riskLevel: getRiskLevel(score),
    daysSinceLastMessage: daysSinceUpdate,
    totalMessages: 0,
    sentiment: contact.ai_sentiment,
    reasons,
  };
}
