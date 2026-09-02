import { motion, AnimatePresence } from '@/components/ui/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Mail,
  ArrowRight,
  Sparkles,
  Fingerprint,
  Loader2,
  Lock,
  AlertTriangle,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { RippleButton } from '@/components/ui/micro-interactions';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { SocialProof } from '@/components/auth/SocialProof';
import { HeroBenefits } from '@/components/auth/HeroBenefits';
import { SilkWaves } from '@/components/effects/SilkWaves';
import { ZappLogo } from '@/components/auth/ZappLogo';
import { useAuthForm } from '@/hooks/auth/useAuthForm';
import { Link } from 'react-router-dom';

/**
 * Auth — layout portado do Zapp_Web_V3 (cópia de design 20260831).
 * Fundo: mantém o efeito SilkWaves (aprovado) + orbes ambientes.
 * Hooks: os do V2 (useAuthForm local).
 */
export default function Auth() {
  const {
    loading,
    passkeyAvailable,
    passkeyLoading,
    lockStatus,
    formData,
    setFormData,
    errors,
    handleLogin,
    handlePasskeyLogin,
    handleGoogleLogin,
  } = useAuthForm();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-label="Acesso à plataforma"
      className="relative flex min-h-dvh overflow-y-auto overflow-x-hidden bg-background focus:outline-none lg:justify-evenly lg:px-0"
    >
      {/* Ambient background — mantido (SilkWaves aprovado + orbes + grid de pontos) */}
      <div className="pointer-events-none absolute inset-0">
        <SilkWaves alpha={0.22} speed={0.6} className="absolute inset-0 h-full w-full" />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-secondary/20 blur-3xl"
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, hsl(var(--primary)) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Hero Benefits - Left Side (Desktop) */}
      <div className="relative z-10 hidden lg:flex">
        <HeroBenefits />
      </div>

      {/* Auth Form - Right Side */}
      <div className="flex flex-1 flex-col items-center justify-start p-4 lg:flex-none lg:justify-center lg:p-0">
        <div className="relative z-10 mb-4 w-full max-w-[358px] lg:hidden">
          <HeroBenefits />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 w-full max-w-[358px]"
        >
          {/* Header */}
          <div className="mb-8 text-center">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="relative mx-auto mb-[5px] flex h-24 w-24 items-center justify-center overflow-visible rounded-[2rem]"
            >
              <ZappLogo className="h-24 w-24 drop-shadow-[0_8px_24px_hsl(var(--primary)/0.35)]" />
              <div className="absolute inset-0 -z-10 rounded-[2rem] bg-primary/40 opacity-60 blur-2xl" />
              <motion.div
                animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                className="absolute -right-2 -top-2"
              >
                <Sparkles className="h-4 w-4 text-primary" />
              </motion.div>
              <motion.div
                animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.7 }}
                className="absolute -bottom-1 -left-1"
              >
                <Sparkles className="h-3 w-3 text-secondary" />
              </motion.div>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-3xl font-bold text-transparent"
            >
              ZAPP Web
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-2 text-muted-foreground"
            >
              Plataforma omnichannel para atendimento
            </motion.p>
          </div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="relative"
          >
            {/* Scan line sutil — protótipo ZAPP Auth (run h356738) */}
            <div className="futurista-scan" aria-hidden="true" />
            <Card className="overflow-hidden rounded-[1.5rem] border-border/40 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
              <CardContent className="pt-4">
                <AnimatePresence>
                  {lockStatus.isLocked && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-destructive/20 p-2">
                          <Lock className="h-5 w-5 text-destructive" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-destructive">
                            Conta bloqueada temporariamente
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Muitas tentativas de login falhadas. Aguarde antes de tentar novamente.
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: lockStatus.remainingTime, ease: 'linear' }}
                                className="h-full rounded-full bg-destructive"
                              />
                            </div>
                            <span className="min-w-[60px] text-right text-sm text-destructive">
                              {Math.floor(lockStatus.remainingTime / 60)}:
                              {(lockStatus.remainingTime % 60).toString().padStart(2, '0')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!lockStatus.isLocked && lockStatus.attempts > 0 && lockStatus.attempts < 5 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mb-4 rounded-lg border border-warning/20 bg-warning/10 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-warning" />
                        <p className="text-sm text-warning">
                          {5 - lockStatus.attempts} tentativa
                          {5 - lockStatus.attempts > 1 ? 's' : ''} restante
                          {5 - lockStatus.attempts > 1 ? 's' : ''} antes do bloqueio
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleLogin} className="space-y-3">
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="login-email" className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground" style={{ fontFamily: "var(--font-numeric)" }}>
                      E-mail
                    </Label>
                    <div className="group relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        placeholder="seu@email.com"
                        className="glass border-border/50 pl-10 transition-all focus:border-primary/50 focus:ring-primary/20"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                    <AnimatePresence>
                      {errors.email && (
                        <motion.p
                          role="alert"
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-xs text-destructive"
                        >
                          {errors.email}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="login-password" className="text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground" style={{ fontFamily: "var(--font-numeric)" }}>
                      Senha
                    </Label>
                    <PasswordInput
                      id="login-password"
                      autoComplete="current-password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                    <AnimatePresence>
                      {errors.password && (
                        <motion.p
                          role="alert"
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="text-xs text-destructive"
                        >
                          {errors.password}
                        </motion.p>
                      )}
                    </AnimatePresence>
                    <div className="flex justify-end">
                      <Link
                        to="/forgot-password"
                        className="text-xs text-primary transition-colors hover:underline hover:opacity-80"
                      >
                        Esqueci minha senha
                      </Link>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <RippleButton
                      type="submit"
                      variant="primary"
                      className="group inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all"
                      disabled={loading}
                    >
                      {loading ? (
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          Entrando...
                        </motion.span>
                      ) : (
                        <>
                          Entrar
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </>
                      )}
                    </RippleButton>
                  </motion.div>

                  {passkeyAvailable && (
                    <>
                      <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center">
                          <Separator className="w-full" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">ou</span>
                        </div>
                      </div>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2"
                          disabled={passkeyLoading}
                          onClick={handlePasskeyLogin}
                        >
                          {passkeyLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Fingerprint className="h-4 w-4" />
                          )}
                          Entrar com Passkey
                        </Button>
                      </motion.div>
                    </>
                  )}
                </form>

                {/* Social Login */}
                <div className="mt-2">
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <Separator className="w-full" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou continue com</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 border-border/50 hover:bg-muted/50"
                    onClick={handleGoogleLogin}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                    Entrar com Google
                  </Button>
                </div>

                {/* Trust badges — protótipo ZAPP Auth (run h356738) */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="Selos de confiança">
                  <span className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground">
                    <Lock className="h-3 w-3 text-primary" aria-hidden="true" /> SSL · 256-bit
                  </span>
                  <span className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground">
                    <ShieldCheck className="h-3 w-3 text-secondary" aria-hidden="true" /> LGPD
                  </span>
                  <span className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground">
                    <Zap className="h-3 w-3 text-primary" aria-hidden="true" /> 99.9% uptime
                  </span>
                </div>
                <SocialProof />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-center"
          >
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Promo Brindes. Todos os direitos reservados.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </main>
  );
}
