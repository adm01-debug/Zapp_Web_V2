import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { LinkPreviewCachePanel } from '@/components/admin/LinkPreviewCachePanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useUserRole } from '@/hooks/system/useUserRole';

export default function LinkPreviewCachePage() {
  const navigate = useNavigate();
  const { isAdmin, isSupervisor } = useUserRole();

  if (!isAdmin && !isSupervisor) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md" data-testid="cache-previas-sem-acesso">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Apenas administradores e supervisores podem ver o histórico do cache de prévias.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
          Voltar
        </Button>
      </div>
      <LinkPreviewCachePanel />
    </div>
  );
}
