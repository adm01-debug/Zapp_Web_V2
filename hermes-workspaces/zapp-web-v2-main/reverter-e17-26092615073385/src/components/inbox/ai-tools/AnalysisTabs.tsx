import { motion } from 'framer-motion';
import { MessageSquareText, BarChart3, ListChecks, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type AnalysisData } from './analysisConfigs';
import { SummaryTab } from './SummaryTab';
import { SentimentTab } from './SentimentTab';
import { KeyPointsTab } from './KeyPointsTab';
import { HistoryTab } from './HistoryTab';

interface AnalysisTabsProps {
  analysis: AnalysisData;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  sentimentScore: number;
  currentSentiment: string;
  analyses: Array<{
    id: string;
    summary: string;
    status: string;
    key_points: string[];
    next_steps: string[];
    sentiment: string;
    sentiment_score: number;
    topics: string[];
    urgency: string | null;
    customer_satisfaction: number | null;
    message_count: number | null;
    created_at: string;
    department?: string;
    relationship_type?: string;
  }>;
  historyLoading: boolean;
  isTtsPlaying: boolean;
  isTtsLoading: boolean;
  onPlaySummary: () => void;
  onPlayText: (text: string) => void;
  onLoadHistory: (item: AnalysisData) => void;
}

const TAB_ITEMS = [
  { value: 'resumo', icon: MessageSquareText, label: 'Resumo' },
  { value: 'sentimento', icon: BarChart3, label: 'Sentimento' },
  { value: 'pontos', icon: ListChecks, label: 'Pontos-chave' },
  { value: 'historico', icon: History, label: 'Histórico' },
] as const;

export function AnalysisTabs({
  analysis, activeTab, setActiveTab, sentimentScore, currentSentiment,
  analyses, historyLoading, isTtsPlaying, isTtsLoading,
  onPlaySummary, onPlayText, onLoadHistory,
}: AnalysisTabsProps) {
  const ttsButtonClass = `h-6 w-6 ${isTtsLoading ? 'text-warning animate-spin' : isTtsPlaying ? 'text-primary animate-pulse' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-9 w-full grid-cols-4 rounded-xl">
          <TooltipProvider delayDuration={300}>
            {TAB_ITEMS.map(({ value, icon: Icon, label }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <TabsTrigger value={value} className="rounded-lg px-2 text-xs">
                    <Icon className="h-3.5 w-3.5" />
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>{label}</p></TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </TabsList>

        <TabsContent value="resumo" className="mt-4">
          <SummaryTab analysis={analysis} ttsButtonClass={ttsButtonClass} isTtsLoading={isTtsLoading} isTtsPlaying={isTtsPlaying} onPlaySummary={onPlaySummary} />
        </TabsContent>

        <TabsContent value="sentimento" className="mt-4">
          <SentimentTab analysis={analysis} sentimentScore={sentimentScore} currentSentiment={currentSentiment} analyses={analyses} />
        </TabsContent>

        <TabsContent value="pontos" className="mt-4">
          <KeyPointsTab analysis={analysis} ttsButtonClass={ttsButtonClass} isTtsLoading={isTtsLoading} isTtsPlaying={isTtsPlaying} onPlayText={onPlayText} />
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <HistoryTab analyses={analyses} historyLoading={historyLoading} onLoadHistory={onLoadHistory} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
