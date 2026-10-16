import { Keyboard, Brain, MessageSquare, Target, Gamepad2 } from 'lucide-react';

export type GameType = 'speed-typing' | 'quiz' | 'response-match' | 'emoji-decode';

export interface Game {
  id: GameType;
  name: string;
  description: string;
  icon: typeof Gamepad2;
  difficulty: 'easy' | 'medium' | 'hard';
  xpReward: number;
}

export const GAMES: Game[] = [
  { id: 'speed-typing', name: 'Speed Typing', description: 'Digite respostas rápidas para clientes', icon: Keyboard, difficulty: 'medium', xpReward: 50 },
  { id: 'quiz', name: 'Quiz do Atendimento', description: 'Teste seus conhecimentos', icon: Brain, difficulty: 'easy', xpReward: 30 },
  { id: 'response-match', name: 'Response Match', description: 'Combine perguntas com respostas', icon: MessageSquare, difficulty: 'medium', xpReward: 40 },
  { id: 'emoji-decode', name: 'Emoji Decode', description: 'Descubra o sentimento do cliente', icon: Target, difficulty: 'easy', xpReward: 25 },
];

export const TYPING_PHRASES = [
  "Olá! Como posso ajudar você hoje?",
  "Entendo sua situação. Vou resolver isso agora.",
  "Obrigado por entrar em contato conosco!",
  "Sua solicitação foi encaminhada com sucesso.",
  "Posso ajudar com mais alguma coisa?",
  "Aguarde um momento enquanto verifico.",
  "Seu problema foi solucionado!",
  "Tenha um ótimo dia!",
];

export const QUIZ_QUESTIONS = [
  { question: "Qual a primeira coisa a fazer ao receber uma reclamação?", options: ["Transferir para outro setor", "Ouvir atentamente o cliente", "Pedir para aguardar", "Encerrar a conversa"], correct: 1 },
  { question: "O que significa SLA?", options: ["Service Level Agreement", "Sales Lead Analysis", "Support Line Agent", "System Log Alert"], correct: 0 },
  { question: "Como lidar com um cliente irritado?", options: ["Ignorar", "Responder no mesmo tom", "Manter a calma e ser empático", "Encerrar a conversa"], correct: 2 },
  { question: "Qual é o tempo ideal de primeira resposta?", options: ["1 hora", "5 minutos", "30 segundos", "1 dia"], correct: 1 },
  { question: "O que é CSAT?", options: ["Customer Satisfaction Score", "Company Sales Analysis Tool", "Customer Service Agent Team", "Contact Support And Track"], correct: 0 },
];

export const EMOJI_CHALLENGES = [
  { emojis: "😊👍✨", sentiment: "positive", answer: "Satisfeito" },
  { emojis: "😤😠💢", sentiment: "negative", answer: "Irritado" },
  { emojis: "😕🤔❓", sentiment: "neutral", answer: "Confuso" },
  { emojis: "😢😞💔", sentiment: "negative", answer: "Triste" },
  { emojis: "🎉🥳🎊", sentiment: "positive", answer: "Muito Feliz" },
  { emojis: "😐🤷‍♂️", sentiment: "neutral", answer: "Indiferente" },
];
