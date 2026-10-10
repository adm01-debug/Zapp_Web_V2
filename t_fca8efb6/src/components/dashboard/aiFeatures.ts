import { useNavigate } from 'react-router-dom';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import {
  Brain,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  FileText,
  Mic,
} from 'lucide-react';

export interface AIFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  route?: string;
  action?: string;
  gradient: string;
  badge?: string;
}

export const AI_FEATURES: AIFeature[] = [
  {
    id: 'suggestions',
    title: 'Sugestões de Resposta',
    description: 'IA gera respostas personalizadas para cada conversa',
    icon: Sparkles,
    action: 'inbox',
    gradient: 'from-primary to-warning',
    badge: 'Popular',
  },
  {
    id: 'analysis',
    title: 'Análise de Conversa',
    description: 'Resumo, sentimento e pontos-chave automáticos',
    icon: Brain,
    action: 'inbox',
    gradient: 'from-secondary to-primary',
  },
  {
    id: 'sentiment',
    title: 'Alertas de Sentimento',
    description: 'Monitore conversas com sentimento negativo',
    icon: AlertTriangle,
    route: '/sentiment-alerts',
    gradient: 'from-warning to-warning',
    badge: 'Novo',
  },
  {
    id: 'summary',
    title: 'Resumo Automático',
    description: 'Gere resumos de conversas longas instantaneamente',
    icon: FileText,
    action: 'inbox',
    gradient: 'from-info to-info',
  },
  {
    id: 'transcription',
    title: 'Transcrição de Áudio',
    description: 'Converta mensagens de áudio em texto',
    icon: Mic,
    action: 'inbox',
    gradient: 'from-success to-success',
  },
  {
    id: 'trends',
    title: 'Tendências de Sentimento',
    description: 'Acompanhe a evolução do sentimento dos clientes',
    icon: TrendingUp,
    route: '/sentiment-alerts',
    gradient: 'from-coins to-warning',
  },
];

/** Encapsula a navegação usada pelo handleFeatureClick original de AIQuickAccess — reaproveitada por AIToolsCard (Fase 8) sem alterar o comportamento da tab "ai". */
export function useAIFeatureNavigation() {
  const navigate = useNavigate();
  return (feature: AIFeature) => {
    if (feature.route) {
      navigate(feature.route);
    } else if (feature.action === 'inbox') {
      navigateToView('inbox');
    }
  };
}
