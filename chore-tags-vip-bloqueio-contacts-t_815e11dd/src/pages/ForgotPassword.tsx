import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle, Loader2, Clock } from 'lucide-react';
import { log } from '@/lib/logger';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const emailSchema = z.string().email('Email inválido');

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      emailSchema.parse(email);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
        return;
      }
    }

    setLoading(true);
    try {
      // First, find the user by email
      // We need to create a reset request instead of directly sending
      const { data: existingUser, error: userError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', email)
        .maybeSingle();

      if (!existingUser) {
        // Don't reveal if user exists or not for security
        setSent(true);
        toast.success('Se o email existir, sua solicitação será analisada.');
        return;
      }

      // Create password reset request
      const { error: insertError } = await supabase
        .from('password_reset_requests')
        .insert({
          user_id: existingUser.user_id,
          email,
          reason: reason || null,
          ip_address: null, // Could get from an API if needed
          user_agent: navigator.userAgent,
        });

      if (insertError) throw insertError;

      setSent(true);
      toast.success('Solicitação enviada! Aguarde a aprovação de um administrador.');
    } catch (err: unknown) {
      log.error('Error submitting reset request:', err);
      setError('Erro ao enviar solicitação. Tente novamente.');
      toast.error('Erro ao enviar solicitação');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="mx-auto mb-4 w-16 h-16 bg-warning/10 dark:bg-warning/20 rounded-full flex items-center justify-center"
              >
                <Clock className="w-8 h-8 text-warning dark:text-warning" />
              </motion.div>
              <CardTitle>Solicitação Enviada!</CardTitle>
              <CardDescription>
                Sua solicitação de reset para <strong>{email}</strong> foi enviada para análise.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted text-sm space-y-2">
                <p className="font-medium">Próximos passos:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Um administrador irá analisar sua solicitação</li>
                  <li>Você receberá um email quando for aprovada</li>
                  <li>Use o link do email para redefinir sua senha</li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Este processo pode levar alguns minutos. Verifique seu email regularmente.
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/auth">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar para login
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Esqueceu sua senha?</CardTitle>
            <CardDescription>
              Digite seu email e envie uma solicitação de reset. Um administrador irá analisar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={error ? 'border-destructive' : ''}
                />
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-destructive"
                  >
                    {error}
                  </motion.p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Ex: Esqueci minha senha após férias..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={loading}
                  className="resize-none"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Ajuda o administrador a validar sua identidade
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Solicitar Reset de Senha'
                )}
              </Button>

              <Button variant="ghost" className="w-full" asChild>
                <Link to="/auth">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar para login
                </Link>
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
