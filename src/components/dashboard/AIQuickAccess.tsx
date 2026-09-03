import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import {
  Brain,
  Sparkles,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  FileText,
  Mic,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  route?: string;
  action?: string;
  gradient: string;
  badge?: string;
}

const aiFeatures: AIFeature[] = [
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

export function AIQuickAccess() {
  const navigate = useNavigate();
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);

  const handleFeatureClick = (feature: AIFeature) => {
    if (feature.route) {
      navigate(feature.route);
    } else if (feature.action === 'inbox') {
      navigateToView('inbox');
    }
  };

  return (
    <Card className="border-secondary/20 overflow-hidden bg-card hover:border-secondary/40 transition-all duration-300">
      <CardHeader className="border-b border-secondary/20 bg-gradient-to-r from-secondary/10 to-primary/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div 
              className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, hsl(var(--secondary)), hsl(var(--primary)))' }}
              animate={{ 
                boxShadow: [
                  '0 0 20px hsl(var(--secondary) / 0.3)',
                  '0 0 40px hsl(var(--primary) / 0.4)',
                  '0 0 20px hsl(var(--secondary) / 0.3)',
                ]
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Brain className="w-5 h-5 text-primary-foreground" />
            </motion.div>
            <div>
              <CardTitle className="font-display text-lg text-foreground flex items-center gap-2">
                Inteligência Artificial
                <Badge variant="secondary" className="text-xs bg-secondary/20 text-secondary border-0">
                  <Activity className="w-3 h-3 mr-1" />
                  Ativo
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Acesso rápido às funcionalidades de IA</p>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {aiFeatures.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredFeature(feature.id)}
              onMouseLeave={() => setHoveredFeature(null)}
            >
              <Button
                variant="ghost"
                className={cn(
                  "w-full h-auto p-4 flex flex-col items-start gap-2 rounded-xl border transition-all duration-300",
                  "bg-muted/30 border-border/30 hover:border-primary/30 hover:bg-primary/5",
                  hoveredFeature === feature.id && "border-primary/50 bg-primary/10"
                )}
                onClick={() => handleFeatureClick(feature)}
              >
                <div className="flex items-start justify-between w-full">
                  <motion.div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      `bg-gradient-to-br ${feature.gradient}`
                    )}
                    animate={hoveredFeature === feature.id ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <feature.icon className="w-5 h-5 text-primary-foreground" />
                  </motion.div>
                  
                  <div className="flex items-center gap-2">
                    {feature.badge && (
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          feature.badge === 'Novo' && "bg-success/20 text-success border-0",
                          feature.badge === 'Popular' && "bg-primary/20 text-primary border-0"
                        )}
                      >
                        {feature.badge}
                      </Badge>
                    )}
                    <motion.div
                      animate={hoveredFeature === feature.id ? { x: 4, opacity: 1 } : { x: 0, opacity: 0.5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </motion.div>
                  </div>
                </div>
                
                <div className="text-left">
                  <h4 className="font-semibold text-sm text-foreground">{feature.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {feature.description}
                  </p>
                </div>
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-4 pt-4 border-t border-border/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span>Modelo: Gemini 2.5 Flash</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                <span>Análises disponíveis</span>
              </div>
            </div>
            <Button 
              variant="link" 
              size="sm" 
              className="text-xs text-primary p-0 h-auto"
              onClick={() => navigate('/sentiment-alerts')}
            >
              Ver todas as análises →
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
