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
  /**
   * View interna do ViewRouter (VIEW_MAP) para onde o cartão leva. É sempre uma
   * view de `?view=...` — nunca uma rota de URL (um cartão apontando para rota
   * inexistente cai em `path="*"` → NotFound, foi o caso de `/sentiment-alerts`).
   */
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
    action: 'sentiment',
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
    action: 'sentiment',
    gradient: 'from-coins to-warning',
  },
];

/**
 * Navegação dos cartões de IA: leva à VIEW interna (`action`) de cada feature.
 * Antes os cartões 'Alertas de Sentimento' e 'Tendências de Sentimento' usavam
 * `route: '/sentiment-alerts'`, rota que não existe em AppRoutes — o clique caía
 * no NotFound. A tela real é a view `sentiment`.
 */
export function useAIFeatureNavigation() {
  return (feature: AIFeature) => {
    if (feature.action) navigateToView(feature.action);
  };
}
