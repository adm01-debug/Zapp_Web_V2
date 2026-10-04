import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useMFA } from '@/hooks/auth/useMFA';
import { MFAVerify } from '@/components/mfa/MFAVerify';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type MfaStatus = 'checking' | 'verify' | 'done' | 'error';

export default function TwoFactorAuth() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { getAssuranceLevel } = useMFA();
  const [status, setStatus] = useState<MfaStatus>('checking');

  useEffect(() => {
    if (authLoading || !user) return;

    // R2-AUTH-003: a rota ficava presa em "Verificando" para usuário sem sessão,
    // sem fator pendente ou com erro de assurance — cada caso agora tem estado
    // explícito (redirect ou tela de erro), nunca spinner infinito.
    const checkMFAStatus = async () => {
      const assurance = await getAssuranceLevel();

      if (!assurance) {
        setStatus('error');
        return;
      }

      const pendente = assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2';
      setStatus(pendente ? 'verify' : 'done');
    };

    void checkMFAStatus();
  }, [user, authLoading, getAssuranceLevel]);

  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // aal2 já verificado ou aal1 sem fator pendente — nada a desafiar aqui.
  if (status === 'done') {
    return <Navigate to="/" replace />;
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-4"
        >
          <Shield className="w-12 h-12 mx-auto text-destructive" />
          <p className="text-destructive font-medium">Erro ao verificar autenticação</p>
          <p className="text-muted-foreground text-sm">
            Não foi possível confirmar o status da verificação em duas etapas.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void supabase.auth.signOut().then(() => navigate('/auth'));
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para login
          </Button>
        </motion.div>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Verificando status de autenticação...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <MFAVerify
          title="Verificação Necessária"
          description="Para continuar, verifique sua identidade com 2FA"
          onSuccess={() => navigate('/')}
          onCancel={() => {
            // Sign out and go back to login
            supabase.auth.signOut().then(() => navigate('/auth'));
          }}
        />

        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para login
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
