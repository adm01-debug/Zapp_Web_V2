import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

type VerificationStatus = 'loading' | 'success' | 'error' | 'expired';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [email, setEmail] = useState('');

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('success');
        setEmail(session.user.email || '');
        toast.success('Email verificado com sucesso!');
      }
    });

    const verifyEmail = async () => {
      const type = searchParams.get('type');

      if (type === 'signup' || type === 'email_change') {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          setStatus('error');
          return;
        }

        if (data.session) {
          setStatus('success');
          setEmail(data.session.user.email || '');
          toast.success('Email verificado com sucesso!');
        } else {
          setStatus('expired');
        }
      } else {
        // Wait a bit for the verification to complete
        timeoutId = setTimeout(() => {
          supabase.auth.getSession().then(({ data, error }) => {
            if (error || !data.session) {
              setStatus('expired');
            } else {
              setStatus('success');
              setEmail(data.session.user.email || '');
            }
          });
        }, 2000);
      }
    };

    verifyEmail();

    return () => {
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [searchParams]);

  const handleResendEmail = async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      toast.error('Erro ao reenviar email');
    } else {
      toast.success('Email reenviado!');
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center"
              >
                <Loader2 className="w-8 h-8 text-primary" />
              </motion.div>
              <CardTitle>Verificando...</CardTitle>
              <CardDescription>
                Aguarde enquanto verificamos seu email
              </CardDescription>
            </CardHeader>
          </Card>
        );

      case 'success':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring' }}
                  className="mx-auto mb-4 w-16 h-16 bg-success/10 dark:bg-success/20/30 rounded-full flex items-center justify-center"
                >
                  <CheckCircle className="w-8 h-8 text-success dark:text-success" />
                </motion.div>
                <CardTitle>Email Verificado!</CardTitle>
                <CardDescription>
                  {email && <>Seu email <strong>{email}</strong> foi verificado com sucesso.</>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => navigate('/')}>
                  Ir para o Dashboard
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        );

      case 'error':
        return (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="mx-auto mb-4 w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center"
              >
                <XCircle className="w-8 h-8 text-destructive" />
              </motion.div>
              <CardTitle>Erro na Verificação</CardTitle>
              <CardDescription>
                Ocorreu um erro ao verificar seu email. Tente novamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" onClick={handleResendEmail}>
                <Mail className="w-4 h-4 mr-2" />
                Reenviar Email
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/auth')}>
                Voltar para Login
              </Button>
            </CardContent>
          </Card>
        );

      case 'expired':
        return (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="mx-auto mb-4 w-16 h-16 bg-warning/10 dark:bg-warning/20/30 rounded-full flex items-center justify-center"
              >
                <Mail className="w-8 h-8 text-warning dark:text-warning" />
              </motion.div>
              <CardTitle>Link Expirado</CardTitle>
              <CardDescription>
                O link de verificação expirou ou é inválido.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" onClick={() => navigate('/auth')}>
                Fazer Login e Reenviar
              </Button>
            </CardContent>
          </Card>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      {renderContent()}
    </div>
  );
}
