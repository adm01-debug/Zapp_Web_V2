import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, Plus } from 'lucide-react';
import { useAIProviders } from './ai-providers/useAIProviders';
import { AIProviderCard } from './ai-providers/AIProviderCard';
import { AIProviderFormDialog } from './ai-providers/AIProviderFormDialog';
import { AIProviderHealthPanel } from './ai-providers/AIProviderHealthPanel';

export function AIProvidersManager() {
  const {
    providers, isLoading, dialogOpen, setDialogOpen, editingId,
    form, setForm, testing, saveMutation, deleteMutation,
    handleTest, openEdit, openNew, toggleUseFor,
  } = useAIProviders();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Gestão de Provedores de IA
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure provedores de IA externos, agentes treinados ou APIs customizadas.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2 rounded-xl">
          <Plus className="w-4 h-4" />
          Novo Provedor
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3 w-64" />
                    <div className="flex gap-1.5">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card className="border-dashed border-2 border-border/40">
          <CardContent className="py-12 text-center">
            <Brain className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Nenhum provedor configurado.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Adicione um provedor de IA para começar a usar funcionalidades inteligentes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {providers.map((p, i) => (
            <AIProviderCard
              key={p.id}
              provider={p}
              testing={testing}
              onTest={handleTest}
              onEdit={openEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
              index={i}
            />
          ))}
        </div>
      )}

      <AIProviderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        editingId={editingId}
        isPending={saveMutation.isPending}
        onSave={() => saveMutation.mutate(form)}
        toggleUseFor={toggleUseFor}
      />

      {/* Health Monitoring */}
      <AIProviderHealthPanel />
    </div>
  );
}
