import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft, RotateCw } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useMFA } from '@/hooks/auth/useMFA';
import { MFAVerify } from '@/components/mfa/MFAVerify';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { resolverDestinoPosLogin } from '@/lib/postLoginRedirect';

type MfaStatus = 'checking' | 'verify' | 'done' | 'error';

export default function TwoFactorAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  // A tela pedida veio no state.from (o ProtectedRoute a repassa ao /2fa);
  // concluido o desafio, o usuario volta para ela, nao para '/'.
  const destinoPosLogin = resolverDestinoPosLogin(location);
  const { user, loading: authLoading } = useAuth();
  const { getAssuranceLevel } = useMFA();
  const [status, setStatus] = useState<MfaStatus>('checking');
  // Nova leitura de assurance quando 'Tentar de novo' é acionado; quem lê é o
  // efeito de baixo.
  const [tentativa, setTentativa] = useState(0);

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
  }, [user, authLoading, getAssuranceLevel, tentativa]);

  // ÚNICO caminho de saída da tela: sempre encerra a sessão antes de voltar ao
  // login. Sem o signOut a pessoa seguia em aal1, o useAuthForm a mandava ao
  // destino e o ProtectedRoute a devolvia ao /2fa (ciclo preso, sem saída).
  const sairParaLogin = useCallback(() => {
    void supabase.auth
      .signOut()
      .catch(() => undefined)
      .finally(() => navigate('/auth'));
  }, [navigate]);

  // 'Tentar de novo' existe só no estado de erro: refaz a leitura de assurance
  // (rede/GoTrue podem ter voltado) sem derrubar a sessão.
  const tentarDeNovo = useCallback(() => {
    setStatus('checking');
    setTentativa((n) => n + 1);
  }, []);

  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // aal2 já verificado ou aal1 sem fator pendente — nada a desafiar aqui.
  if (status === 'done') {
    return <Navigate to={destinoPosLogin} replace />;
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
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Button size="sm" onClick={tentarDeNovo}>
              <RotateCw className="w-4 h-4 mr-2" />
              Tentar de novo
            </Button>
            <Button variant="ghost" size="sm" onClick={sairParaLogin}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para login
            </Button>
          </div>
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
          onSuccess={() => navigate(destinoPosLogin)}
          onCancel={sairParaLogin}
        />
      </motion.div>
    </div>
  );
}
