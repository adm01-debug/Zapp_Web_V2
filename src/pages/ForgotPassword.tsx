import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle, Loader2, Clock, KeyRound } from 'lucide-react';
import { log } from '@/lib/logger';
import { z } from 'zod';
import { fromTable } from '@/lib/supabaseHelpers';
import { useAuth } from '@/hooks/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const emailSchema = z.string().email('Email inválido');

const MSG_ENVIADO = 'Se o email estiver cadastrado, o pedido foi enviado para aprovação do gestor.';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  // Quem já está logado não pede reset anônimo: o gatilho trataria o pedido como do
  // próprio usuário sem user_id e o INSERT seria recusado. Troca de senha com sessão
  // é em Segurança → Alterar Senha (com reautenticação).
  const { user, loading: authLoading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enter repetido / duplo submit: um pedido por vez. Sessão ainda carregando ou já
    // existente: não grava pedido nenhum.
    if (loading || authLoading || user) return;
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
      // Quem esqueceu a senha não está logado (anon): não lê profiles e não sabe o
      // próprio user_id. O cliente envia SÓ email/motivo/navegador; o gatilho
      // public.sanitize_reset_request() (migration 20261015182400) resolve a conta no
      // servidor a partir do e-mail, ignora e-mail sem conta e limita a 3 pendentes
      // por hora — sem erro e sem revelar se a conta existe. O pedido nasce pendente
      // e só o gestor libera (painel de pedidos + Edge approve-password-reset).
      // Sem .select(): o anon não lê a tabela, então não há RETURNING. fromTable porque
      // o tipo gerado exige user_id, que aqui é preenchido pelo gatilho no servidor.
      const { error: requestError } = await fromTable('password_reset_requests')
        .insert({
          email,
          reason: reason || null,
          user_agent: navigator.userAgent,
        });

      if (requestError) throw requestError;

      setSent(true);
      toast.success(MSG_ENVIADO);
    } catch (err: unknown) {
      log.error('Error submitting reset request:', err);
      setError('Erro ao enviar solicitação. Tente novamente.');
      toast.error('Erro ao enviar solicitação');
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <CardTitle>Você já está conectado</CardTitle>
            <CardDescription>
              {user.email ? <>Sessão ativa como <strong>{user.email}</strong>. </> : null}
              Para trocar a senha, use Segurança → Alterar Senha. Se esta não é a sua
              conta, saia dela para pedir o reset da sua.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" asChild>
              <Link to="/?view=security">Ir para Segurança</Link>
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await signOut();
                } catch (err: unknown) {
                  log.error('Error signing out from forgot-password:', err);
                  toast.error('Não foi possível sair da conta. Tente novamente.');
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              {signingOut ? 'Saindo...' : 'Sair desta conta'}
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link to="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar para o app
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                  <li>O gestor irá analisar sua solicitação</li>
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
              Digite seu email e envie uma solicitação de reset. O gestor irá analisar.
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
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'email-error' : undefined}
                />
                {error && (
                  <motion.p
                    id="email-error"
                    role="alert"
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
                  Ajuda o gestor a validar sua identidade
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading || authLoading}>
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
