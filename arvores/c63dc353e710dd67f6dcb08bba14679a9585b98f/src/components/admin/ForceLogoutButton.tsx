import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ForceLogoutButtonProps {
  userId: string;
  userName: string;
}

export function ForceLogoutButton({ userId, userName }: ForceLogoutButtonProps) {
  const [loading, setLoading] = useState(false);
  // Reentrância: um duplo clique no botão de confirmar dispara o handler duas
  // vezes antes do estado `loading` refletir no DOM. O ref é síncrono e fecha a
  // porta já na primeira entrada, garantindo uma única invocação da Edge Function.
  const inFlight = useRef(false);

  const handleForceLogout = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      // Contrato canônico (R2-AUTH-004 item 6): revogar sessões Auth reais via
      // Edge Function server-side. `scope: "global"` + `target_user_id` revoga
      // TODAS as sessões do usuário alvo. NUNCA atualizar apenas
      // `profiles.session_invalidated_at` — isso não revoga nada no Auth.
      const { error } = await supabase.functions.invoke('revoke-auth-sessions', {
        body: { scope: 'global', target_user_id: userId },
      });
      if (error) throw error;
      toast.success(
        `Sessões de ${userName} revogadas. Um token de acesso já emitido pode continuar válido até expirar.`
      );
    } catch {
      toast.error('Erro ao revogar sessões');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label="Forçar logout"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LogOut className="w-4 h-4" aria-hidden="true" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Forçar logout de {userName}?</AlertDialogTitle>
          <AlertDialogDescription>
            As sessões e tokens de refresh de <strong>{userName}</strong> serão revogados agora.
            Um token de acesso (JWT) já emitido pode continuar válido até expirar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleForceLogout}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Forçar logout
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
