import { useState } from 'react';
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

  const handleForceLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ session_invalidated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (error) throw error;
      toast.success(`Sessão de ${userName} invalidada`);
    } catch {
      toast.error('Erro ao invalidar sessão');
    } finally {
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
          title="Forçar logout"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Forçar logout de {userName}?</AlertDialogTitle>
          <AlertDialogDescription>
            A sessão ativa de <strong>{userName}</strong> será invalidada imediatamente. O usuário precisará fazer login novamente.
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
