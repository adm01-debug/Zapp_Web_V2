import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';

const log = getLogger('AIAutoTagsConfig');
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/ui/use-toast';
import { Tags, Brain, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AIAutoTagsConfig() {
  const queryClient = useQueryClient();

  const { data: tagStats = [], isLoading } = useQuery({
    queryKey: ['ai-tag-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_conversation_tags')
        .select('tag_name, confidence');
      
      if (!data) return [];

      // Aggregate by tag
      const tagMap = new Map<string, { count: number; avgConfidence: number }>();
      data.forEach(t => {
        const existing = tagMap.get(t.tag_name) || { count: 0, avgConfidence: 0 };
        existing.count += 1;
        existing.avgConfidence = (existing.avgConfidence * (existing.count - 1) + Number(t.confidence)) / existing.count;
        tagMap.set(t.tag_name, existing);
      });

      return Array.from(tagMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count);
    },
  });

  const retagMutation = useMutation({
    mutationFn: async () => {
      // Get recent contacts with messages
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(20);

      if (!contacts) return;

      let processed = 0;
      for (const contact of contacts) {
        try {
          await supabase.functions.invoke('ai-auto-tag', {
            body: { contactId: contact.id },
          });
          processed++;
        } catch (e) {
          log.error('Error tagging contact:', contact.id, e);
        }
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 1000));
      }
      return processed;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['ai-tag-stats'] });
      toast({ title: 'Tags atualizadas!', description: `${count} conversas classificadas por IA.` });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  const tagColors: Record<string, string> = {
    suporte_tecnico: 'bg-info/15 text-info border-info',
    vendas: 'bg-success/15 text-success border-success',
    financeiro: 'bg-warning/15 text-warning border-warning',
    reclamacao: 'bg-destructive/15 text-destructive border-destructive',
    elogio: 'bg-success/15 text-success border-success/30',
    urgente: 'bg-destructive/15 text-destructive border-destructive/30',
    cancelamento: 'bg-warning/15 text-warning border-warning',
    duvida: 'bg-primary/15 text-primary border-primary',
    feedback: 'bg-info/15 text-info border-info/30',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Tags className="w-5 h-5 text-primary" />
            Tags Automáticas por IA
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Classificação automática de conversas por tema e sentimento usando IA.
          </p>
        </div>
        <Button
          onClick={() => retagMutation.mutate()}
          disabled={retagMutation.isPending}
          className="gap-2"
        >
          {retagMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {retagMutation.isPending ? 'Classificando...' : 'Classificar Recentes'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Distribuição de Tags
          </CardTitle>
          <CardDescription>
            Tags geradas automaticamente pela IA com base no conteúdo das conversas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Carregando...</div>
          ) : tagStats.length === 0 ? (
            <div className="text-center py-8">
              <Tags className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhuma tag gerada ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em "Classificar Recentes" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tagStats.map(tag => {
                const maxCount = Math.max(...tagStats.map(t => t.count));
                const barWidth = (tag.count / maxCount) * 100;
                const colorClass = tagColors[tag.name] || 'bg-muted text-foreground border-border';

                return (
                  <div key={tag.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={cn('text-xs', colorClass)}>
                        {tag.name.replace(/_/g, ' ')}
                      </Badge>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{tag.count} conversas</span>
                        <span>•</span>
                        <span>{(tag.avgConfidence * 100).toFixed(0)}% confiança</span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
