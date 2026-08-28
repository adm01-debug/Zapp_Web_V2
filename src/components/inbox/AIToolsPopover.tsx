import { lazy, Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Radar, GraduationCap, Loader2 } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

const ObjectionDetector = lazy(() => import('./ObjectionDetector').then(m => ({ default: m.ObjectionDetector })));
const UniversityHelp = lazy(() => import('./UniversityHelp').then(m => ({ default: m.UniversityHelp })));

interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
}

interface AIToolsPopoverProps {
  contactId: string;
  contactName?: string;
  lastMessages: string[];
  allMessages: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
}

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center py-6 gap-2">
    <Loader2 className="w-4 h-4 animate-spin text-primary" />
    <span className="text-[11px] text-muted-foreground">Carregando...</span>
  </div>
);

export function AIToolsPopover({ contactId, contactName, lastMessages, allMessages, onSelectSuggestion }: AIToolsPopoverProps) {
  const [activeTab, setActiveTab] = useState('objections');

  return (
    <div className="space-y-1">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full h-9 bg-muted/50 p-0.5 rounded-lg mb-3">
          <TabsTrigger
            value="objections"
            className="flex-1 h-8 text-[11px] gap-1.5 font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Radar className="w-3.5 h-3.5" />
            Monitoramento de Objeções
          </TabsTrigger>
          <TabsTrigger
            value="university"
            className="flex-1 h-8 text-[11px] gap-1.5 font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Ajuda dos Universitários
          </TabsTrigger>
        </TabsList>
        <TabsContent value="objections" className="mt-0 focus-visible:outline-none">
          <SectionErrorBoundary sectionName="Detector de Objeções">
            <Suspense fallback={<LoadingFallback />}>
              <ObjectionDetector
                contactId={contactId}
                contactName={contactName}
                lastMessages={lastMessages}
                allMessages={allMessages}
                onSelectSuggestion={onSelectSuggestion}
              />
            </Suspense>
          </SectionErrorBoundary>
        </TabsContent>
        <TabsContent value="university" className="mt-0 focus-visible:outline-none">
          <SectionErrorBoundary sectionName="Ajuda Universitários">
            <Suspense fallback={<LoadingFallback />}>
              <UniversityHelp
                contactId={contactId}
                contactName={contactName}
                messages={allMessages}
                onSelectSuggestion={onSelectSuggestion}
              />
            </Suspense>
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
