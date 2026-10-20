import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type CallbackStatus = 'loading' | 'success' | 'error';

export default function SSOCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session from URL hash (for OAuth callbacks)
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (data.session) {
          setStatus('success');
          toast.success('Login realizado com sucesso!');
          
          // Redirect after a brief delay
          setTimeout(() => {
            navigate('/');
          }, 1500);
        } else {
          // Check for error in URL params
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const errorParam = hashParams.get('error_description') || hashParams.get('error');
          
          if (errorParam) {
            throw new Error(errorParam);
          }
          
          // Wait for auth state change
          const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
              setStatus('success');
              toast.success('Login realizado com sucesso!');
              setTimeout(() => navigate('/'), 1500);
            } else if (event === 'SIGNED_OUT') {
              setStatus('error');
              setErrorMessage('Sessão não encontrada');
            }
          });

          // Timeout fallback
          setTimeout(() => {
            if (status === 'loading') {
              setStatus('error');
              setErrorMessage('Tempo esgotado. Tente novamente.');
            }
          }, 10000);

          return () => {
            authData.subscription.unsubscribe();
          };
        }
      } catch (err: unknown) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro durante autenticação');
        toast.error('Erro no login SSO');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        {status === 'loading' && (
          <Card>
            <CardHeader className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center"
              >
                <Loader2 className="w-8 h-8 text-primary" />
              </motion.div>
              <CardTitle>Autenticando...</CardTitle>
              <CardDescription>
                Aguarde enquanto completamos seu login
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === 'success' && (
          <Card>
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
                className="mx-auto mb-4 w-16 h-16 bg-success/10 dark:bg-success/20/30 rounded-full flex items-center justify-center"
              >
                <CheckCircle className="w-8 h-8 text-success dark:text-success" />
              </motion.div>
              <CardTitle>Login Realizado!</CardTitle>
              <CardDescription>
                Redirecionando para o dashboard...
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {status === 'error' && (
          <Card>
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="mx-auto mb-4 w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center"
              >
                <XCircle className="w-8 h-8 text-destructive" />
              </motion.div>
              <CardTitle>Erro no Login</CardTitle>
              <CardDescription>
                {errorMessage || 'Ocorreu um erro durante a autenticação'}
              </CardDescription>
              <div className="pt-4">
                <Button onClick={() => navigate('/auth')} className="w-full">
                  Tentar Novamente
                </Button>
              </div>
            </CardHeader>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
