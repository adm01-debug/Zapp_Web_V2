import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type CallbackStatus = 'loading' | 'success' | 'error';

// PKCE flow returns error params in the query string, not the hash fragment
function getUrlError(): string | null {
  const p = new URLSearchParams(window.location.search);
  return p.get('error_description') || p.get('error');
}

export default function SSOCallback() {
  const navigate = useNavigate();
  const urlError = getUrlError();
  const [status, setStatus] = useState<CallbackStatus>(urlError ? 'error' : 'loading');
  const [errorMessage, setErrorMessage] = useState(urlError ?? '');
  // ref tracks live status to avoid stale closure in the timeout callback
  const statusRef = useRef<CallbackStatus>(urlError ? 'error' : 'loading');

  useEffect(() => {
    // If Google returned an error in the redirect URL, show it and stop
    const errorParam = getUrlError();
    if (errorParam) {
      toast.error('Erro no login SSO');
      return;
    }

    // Subscribe to auth state changes — cleanup returned directly to React (not inside async fn)
    const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        statusRef.current = 'success';
        setStatus('success');
        toast.success('Login realizado com sucesso!');
        setTimeout(() => navigate('/'), 1500);
      } else if (event === 'SIGNED_OUT') {
        statusRef.current = 'error';
        setStatus('error');
        setErrorMessage('Sessão não encontrada');
      }
    });

    // Check if a session already exists (fast redirect case)
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        statusRef.current = 'error';
        setStatus('error');
        setErrorMessage(error.message);
        toast.error('Erro no login SSO');
        return;
      }
      if (data.session) {
        statusRef.current = 'success';
        setStatus('success');
        toast.success('Login realizado com sucesso!');
        setTimeout(() => navigate('/'), 1500);
      }
    });

    // Timeout fallback — use ref to avoid stale closure on `status` state
    const timer = setTimeout(() => {
      if (statusRef.current === 'loading') {
        statusRef.current = 'error';
        setStatus('error');
        setErrorMessage('Tempo esgotado. Tente novamente.');
        toast.error('Erro no login SSO');
      }
    }, 10000);

    return () => {
      clearTimeout(timer);
      authData.subscription.unsubscribe();
    };
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
