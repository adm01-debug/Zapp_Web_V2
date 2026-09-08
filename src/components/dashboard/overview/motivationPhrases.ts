export const MOTIVATION_PHRASES = [
  'Disciplina hoje, resultados amanhã.',
  'Cada conversa é uma oportunidade.',
  'Constância vence intensidade.',
  'Um passo de cada vez, sempre em frente.',
  'Excelência é hábito, não acidente.',
  'Foco no cliente, resultado garantido.',
  'Hoje é um bom dia para superar ontem.',
] as const;

export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}
