import { Brain, Sparkles, FileSearch, AlertOctagon, Mic } from 'lucide-react';
import { DashboardCard, SectionHeader, VerTodasButton } from './DashboardCard';
import { AI_FEATURES, useAIFeatureNavigation } from '../aiFeatures';
import { cn } from '@/lib/utils';

interface AIToolsCardProps {
  onSeeAll: () => void;
}

const TILE_BY_TITLE: Record<string, { tile: string; icon: typeof Sparkles }> = {
  'Sugestões de Resposta': { tile: 'bg-dash-tile-amber', icon: Sparkles },
  'Análise de Conversa': { tile: 'bg-dash-tile-blue', icon: FileSearch },
  'Alertas de Sentimento': { tile: 'bg-dash-tile-red', icon: AlertOctagon },
  'Transcrição de Áudio': { tile: 'bg-dash-tile-green', icon: Mic },
};

export function AIToolsCard({ onSeeAll }: AIToolsCardProps) {
  const handleFeatureClick = useAIFeatureNavigation();
  const features = AI_FEATURES.filter((f) => TILE_BY_TITLE[f.title]);

  return (
    <DashboardCard testid="ai-tools-card" className="min-h-[173px]">
      <SectionHeader icon={Brain} title="Inteligência Artificial" tileSize={34} right={<VerTodasButton onClick={onSeeAll} />} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {features.map((feature) => {
          const { tile, icon: Icon } = TILE_BY_TITLE[feature.title];
          return (
            <button
              key={feature.id}
              type="button"
              data-testid="ai-tile"
              onClick={() => handleFeatureClick(feature)}
              className="h-[100px] rounded-[10px] bg-muted/30 border border-border/60 p-2.5 text-left flex flex-col gap-2 hover:border-primary/40 transition-colors"
            >
              <span className={cn('w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0', tile)}>
                <Icon className="w-4 h-4 text-white/90" />
              </span>
              <span>
                <p className="text-[12px] font-semibold text-foreground truncate">{feature.title}</p>
                <p className="text-[11px] text-foreground-secondary line-clamp-2 leading-snug">{feature.description}</p>
              </span>
            </button>
          );
        })}
      </div>
    </DashboardCard>
  );
}
