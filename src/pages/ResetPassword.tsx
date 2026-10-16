import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, CheckCircle, Loader2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { MFAVerify } from '@/components/mfa/MFAVerify';
import { useMFA } from '@/hooks/auth/useMFA';
import { toast } from 'sonner';

// Estado do portão do 2º fator: enquanto não sabemos o nível de garantia da
// sessão, o formulário NÃO aparece. Verificado o AAL, a troca é liberada.
type PortaoSegundoFator = 'verificando' | 'liberado' | 'totp' | 'erro';

const passwordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Deve conter letra maiúscula')
  .regex(/[a-z]/, 'Deve conter letra minúscula')
  .regex(/[0-9]/, 'Deve conter número')
  .regex(/[^A-Za-z0-9]/, 'Deve conter caractere especial');

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [hasSession, setHasSession] = useState(false);
  // A troca do link (PKCE + detectSessionInUrl) é assíncrona: enquanto ela não
  // termina não dá para afirmar que o link é inválido. Só depois de a sessão
  // ser conferida é que o estado 'Link Inválido' pode aparecer.
  const [checkingSession, setCheckingSession] = useState(true);
  // Veredito do medidor (requisitos + HIBP): senha vazada barra o envio.
  const [isValid, setIsValid] = useState(false);
  // Contagem visível até o redirecionamento; o usuário pode cancelá-la.
  const [countdown, setCountdown] = useState(5);
  const [redirectCancelled, setRedirectCancelled] = useState(false);
  // Portão do 2º fator: com TOTP verificado a sessão de recuperação é AAL1 e o
  // GoTrue recusa `updateUser({password})` com `insufficient_aal`. O desafio
  // TOTP tem de vir ANTES do formulário.
  const [portaoSegundoFator, setPortaoSegundoFator] = useState<PortaoSegundoFator>('verificando');
  // A troca de senha encerra as outras sessões; se isso falhar, o usuário
  // precisa ver — nunca dizemos que encerrou sem ter encerrado.
  const [falhaAoEncerrarSessoes, setFalhaAoEncerrarSessoes] = useState(false);
  const { getAssuranceLevel } = useMFA();

  // Lê o nível de garantia da sessão. `getAssuranceLevel` devolve null quando a
  // leitura falha: sem saber o nível, NÃO liberamos a escrita de senha (falha
  // fechado) — a sessão AAL1 que não consegue confirmar o fator pendente é
  // exatamente o caso que o GoTrue recusa.
  const decidirPortaoPeloNivel = useCallback(async (): Promise<PortaoSegundoFator> => {
    const assurance = await getAssuranceLevel();
    if (!assurance) return 'erro';
    const pendente = assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2';
    return pendente ? 'totp' : 'liberado';
  }, [getAssuranceLevel]);

  useEffect(() => {
    // Check if user came from password reset email
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setHasSession(true);
        setCheckingSession(false);
      }
    });

    // Also check current session
    supabase.auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          setHasSession(true);
        }
        setCheckingSession(false);
      })
      .catch(() => {
        // Não dá para confirmar a sessão: cai em 'Link Inválido' em vez de
        // deixar a tela presa no estado 'Verificando'.
        setCheckingSession(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  // Só depois de a sessão estar confirmada é que faz sentido perguntar o nível
  // de garantia. A tela fica no portão 'verificando' até isso resolver — e o
  // setState vive no `.then`, nunca sincronamente dentro do efeito.
  useEffect(() => {
    if (checkingSession || !hasSession) return;
    let ativo = true;
    void decidirPortaoPeloNivel().then((estado) => {
      if (ativo) setPortaoSegundoFator(estado);
    });
    return () => {
      ativo = false;
    };
  }, [checkingSession, hasSession, decidirPortaoPeloNivel]);

  // Após o sucesso, redireciona com contagem regressiva visível. O usuário pode
  // cancelar ("Ficar nesta página") — nesse caso o efeito para e nada navega.
  useEffect(() => {
    if (!success || redirectCancelled) return;
    if (countdown <= 0) {
      navigate('/auth');
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [success, redirectCancelled, countdown, navigate]);

  const handleStrengthChange = useCallback((_strength: number, valid: boolean) => {
    setIsValid(valid);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Senha vazada (HIBP) ou requisito não atendido: não envia. O medidor
    // mostra o motivo na tela.
    if (password.length > 0 && !isValid) {
      setError('A senha precisa atender aos requisitos e não pode estar em vazamentos conhecidos.');
      return;
    }

    try {
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
        return;
      }
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        // Sessão AAL1 com TOTP verificado: o GoTrue exige o 2º fator. Em vez de
        // mostrar um erro cru, levamos o usuário ao desafio TOTP.
        const codigo = (error as { code?: string }).code;
        if (codigo === 'insufficient_aal' || /AAL2 session is required/i.test(error.message ?? '')) {
          setPortaoSegundoFator('totp');
          setError('Para trocar a senha, confirme o código do seu autenticador.');
          toast.error('Confirme o código de verificação em duas etapas para trocar a senha.');
          return;
        }
        throw error;
      }

      // Trocar a senha encerra as OUTRAS sessões: quem ficou com a sessão antiga
      // perde o acesso. Se o encerramento falhar, o usuário vê — não afirmamos
      // que encerrou sem ter encerrado.
      let falhaAoEncerrar = false;
      try {
        const { error: erroRevogacao } = await supabase.functions.invoke('revoke-auth-sessions', {
          body: { scope: 'others' },
        });
        if (erroRevogacao) throw erroRevogacao;
      } catch {
        falhaAoEncerrar = true;
      }

      setFalhaAoEncerrarSessoes(falhaAoEncerrar);
      setSuccess(true);
      if (falhaAoEncerrar) {
        toast.error('Senha alterada, mas não foi possível encerrar as outras sessões.');
      } else {
        toast.success('Senha alterada com sucesso! As outras sessões foram encerradas.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha');
      toast.error('Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-muted-foreground"
        >
          <Loader2 className="w-5 h-5 motion-safe:animate-spin" />
          <span>Verificando link de recuperação…</span>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div role="status" aria-live="polite">
              <CardTitle>Link Inválido</CardTitle>
              <CardDescription>
                Este link de recuperação é inválido ou expirou. Solicite um novo link.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/forgot-password')}>
              Solicitar novo link
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
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
              <CardTitle>Senha Alterada!</CardTitle>
              {redirectCancelled ? (
                <>
                  <CardDescription>
                    Sua senha foi alterada com sucesso. Redirecionamento cancelado.
                  </CardDescription>
                  <div className="pt-4">
                    <Button className="w-full" onClick={() => navigate('/auth')}>
                      Ir para o login
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <CardDescription>
                    Sua senha foi alterada com sucesso. Redirecionando para login em {countdown}s...
                  </CardDescription>
                  <div className="pt-4">
                    <Button variant="outline" className="w-full" onClick={() => setRedirectCancelled(true)}>
                      Ficar nesta página
                    </Button>
                  </div>
                </>
              )}
              {falhaAoEncerrarSessoes ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  Sua senha foi alterada, mas não foi possível encerrar as outras sessões desta
                  conta. Saia e entre novamente e, em Segurança, encerre os outros dispositivos.
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  As outras sessões desta conta foram encerradas.
                </p>
              )}
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (portaoSegundoFator === 'verificando') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-muted-foreground"
        >
          <Loader2 className="w-5 h-5 motion-safe:animate-spin" />
          <span>Verificando verificação em duas etapas…</span>
        </div>
      </div>
    );
  }

  if (portaoSegundoFator === 'erro') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div role="alert">
              <CardTitle className="flex items-center justify-center gap-2">
                <ShieldAlert className="w-5 h-5 text-destructive" aria-hidden="true" />
                Não foi possível confirmar a verificação em duas etapas
              </CardTitle>
              <CardDescription>
                Sem confirmar o nível de segurança da sua sessão, não trocamos sua senha.
                Tente de novo em alguns instantes.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => {
                setPortaoSegundoFator('verificando');
                void decidirPortaoPeloNivel().then(setPortaoSegundoFator);
              }}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (portaoSegundoFator === 'totp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <MFAVerify
          title="Confirme o 2º fator"
          description="Sua conta usa verificação em duas etapas. Confirme o código do autenticador para trocar a senha."
          onSuccess={() => setPortaoSegundoFator('liberado')}
          onCancel={() => {
            void supabase.auth.signOut().then(() => navigate('/auth'));
          }}
        />
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
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Nova Senha</CardTitle>
            <CardDescription>
              Digite sua nova senha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className={error ? 'border-destructive pr-10' : 'pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    aria-controls="password"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
                <PasswordStrengthMeter password={password} onStrengthChange={handleStrengthChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  autoComplete="new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              {password.length > 0 && !isValid && (
                <p className="text-xs text-muted-foreground">
                  A senha precisa atender aos requisitos e não pode estar em vazamentos conhecidos.
                </p>
              )}

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive"
                >
                  {error}
                </motion.p>
              )}

              <Button type="submit" className="w-full" disabled={loading || !isValid}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Alterando...
                  </>
                ) : (
                  'Alterar Senha'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
