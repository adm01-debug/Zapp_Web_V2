import { Card, CardContent } from '@/components/ui/card';
import { CopilotRetentionPanel } from '@/components/admin/CopilotRetentionPanel';
import { useUserRole } from '@/hooks/system/useUserRole';

/**
 * Tela da retencao do copiloto RADAR (CV-143). O agregado diario
 * (`copilot_retention_aggregates`) e a serie que faltava para saber se o
 * copiloto esta sendo usado — e por quem. Restrita a admin/supervisor, o mesmo
 * publico das demais telas de supervisao.
 */
export function CopilotRetentionPage() {
  const { isAdmin, isSupervisor } = useUserRole();

  if (!isAdmin && !isSupervisor) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Card className="max-w-md" data-testid="retencao-copiloto-sem-acesso">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Apenas administradores e supervisores podem ver a retenção do copiloto.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl p-4">
      <CopilotRetentionPanel />
    </div>
  );
}
