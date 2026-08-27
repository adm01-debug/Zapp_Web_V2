import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquareDot, Mail, User, ArrowRight, Fingerprint, Loader2, Lock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { RippleButton } from '@/components/ui/micro-interactions';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { SocialProof } from '@/components/auth/SocialProof';
import { HeroBenefits } from '@/components/auth/HeroBenefits';
import { useAuthForm } from '@/hooks/auth/useAuthForm';
import { GOOGLE_OAUTH_ENABLED } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

export default function Auth() {
  const {
    loading, activeTab, setActiveTab, passkeyAvailable, passkeyLoading,
    lockStatus, formData, setFormData, errors,
    handleLogin, handleSignUp, handlePasskeyLogin, handleGoogleLogin,
  } = useAuthForm();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      aria-label="Acesso à plataforma"
      className="relative flex min-h-dvh overflow-x-hidden overflow-y-auto bg-background focus:outline-none"
    >
      {/* Ambient background — subtle, never competes with content */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ opacity: [0.18, 0.28, 0.18] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-48 -left-32 h-[34rem] w-[34rem] rounded-full bg-primary/25 blur-[120px]"
        />
        <motion.div
          animate={{ opacity: [0.12, 0.22, 0.12] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 right-1/3 h-[28rem] w-[28rem] rounded-full bg-secondary/20 blur-[120px]"
        />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, hsl(var(--primary)) 1px, transparent 0)',
            backgroundSize: '36px 36px',
          }}
        />
      </div>

      {/* Left — editorial brand panel */}
      <div className="relative z-10 hidden lg:flex lg:w-[58%]">
        <HeroBenefits />
      </div>

      {/* Right — auth column */}
      <div className="relative z-10 flex flex-1 flex-col p-4 lg:p-10">
        <div className="mb-6 w-full max-w-md self-center lg:hidden">
          <HeroBenefits />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="m-auto w-full max-w-[440px]"
        >
          {/* Compact brand lockup — no more giant icon */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg shadow-primary/25"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <MessageSquareDot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <div className="font-display text-base font-bold tracking-tight text-foreground">
                  ZAPP Web
                </div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Suite v2
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-2.5 py-1 backdrop-blur-sm">
              <ShieldCheck className="h-3 w-3 text-success" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Seguro
              </span>
            </div>
          </div>

          {/* Title above the card — more editorial hierarchy */}
          <div className="mb-5">
            <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-foreground">
              {activeTab === 'login' ? 'Bem-vindo de volta' : 'Crie sua conta'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === 'login'
                ? 'Acesse seu painel e continue de onde parou.'
                : 'Comece em segundos. Sem cartão de crédito.'}
            </p>
          </div>

          {/* Card */}
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <Card className="glass-strong overflow-hidden border-border/50 shadow-2xl shadow-primary/10">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <CardHeader className="pb-0">
                  <TabsList className="grid w-full grid-cols-2 glass border border-border/30">
                    <TabsTrigger value="login" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Entrar</TabsTrigger>
                    <TabsTrigger value="signup" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Criar Conta</TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent className="pt-6">
                  {/* LOGIN TAB */}
                  <TabsContent value="login" className="mt-0">
                    <AnimatePresence>
                      {lockStatus.isLocked && (
                        <motion.div initial={{ opacity: 0, scale: 0.95, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -10 }} className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-destructive/20"><Lock className="w-5 h-5 text-destructive" /></div>
                            <div className="flex-1">
                              <p className="font-medium text-destructive">Conta bloqueada temporariamente</p>
                              <p className="text-sm text-muted-foreground mt-1">Muitas tentativas de login falhadas. Aguarde antes de tentar novamente.</p>
                              <div className="mt-3 flex items-center gap-2">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: lockStatus.remainingTime, ease: 'linear' }} className="h-full bg-destructive rounded-full" />
                                </div>
                                <span className="text-sm font-mono text-destructive min-w-[60px] text-right">
                                  {Math.floor(lockStatus.remainingTime / 60)}:{(lockStatus.remainingTime % 60).toString().padStart(2, '0')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {!lockStatus.isLocked && lockStatus.attempts > 0 && lockStatus.attempts < 5 && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4 flex items-center gap-2.5 rounded-lg border-l-2 border-warning bg-warning/5 px-3 py-2">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                          <p className="text-xs text-warning/90">
                            <span className="font-semibold">{5 - lockStatus.attempts}</span> tentativa{5 - lockStatus.attempts > 1 ? 's' : ''} restante{5 - lockStatus.attempts > 1 ? 's' : ''} antes do bloqueio
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form onSubmit={handleLogin} className="space-y-4">
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="space-y-2">
                        <Label htmlFor="login-email" className="text-sm font-medium">Email</Label>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input id="login-email" name="email" autoComplete="username" type="email" placeholder="seu@email.com" className="pl-10 glass border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                        </div>
                        <AnimatePresence>{errors.email && <motion.p role="alert" aria-live="polite" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-xs text-destructive">{errors.email}</motion.p>}</AnimatePresence>
                      </motion.div>
                      
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="space-y-2">
                        <Label htmlFor="login-password" className="text-sm font-medium">Senha</Label>
                        <PasswordInput id="login-password" name="password" autoComplete="current-password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                        <AnimatePresence>{errors.password && <motion.p role="alert" aria-live="polite" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-xs text-destructive">{errors.password}</motion.p>}</AnimatePresence>
                        <div className="flex justify-end">
                          <Link to="/forgot-password" className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors">Esqueci minha senha</Link>
                        </div>
                      </motion.div>
                      
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="pt-1">
                        <RippleButton type="submit" variant="primary" className="group w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:shadow-primary/50" disabled={loading}>
                          {loading ? <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>Entrando...</motion.span> : <>Entrar<ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>}
                        </RippleButton>
                      </motion.div>
                    </form>

                    {/* Alternative sign-in — compact horizontal */}
                    <div className="mt-5">
                      <div className="relative my-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border/40" />
                        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                          ou continue com
                        </span>
                        <div className="h-px flex-1 bg-border/40" />
                      </div>
                      <div className={passkeyAvailable && GOOGLE_OAUTH_ENABLED ? 'grid grid-cols-2 gap-2' : ''}>
                        {passkeyAvailable && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 gap-2 rounded-xl border-border/50 hover:bg-muted/50"
                            disabled={passkeyLoading}
                            onClick={handlePasskeyLogin}
                          >
                            {passkeyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                            <span className="text-sm font-medium">Passkey</span>
                          </Button>
                        )}
                        {GOOGLE_OAUTH_ENABLED && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 gap-2 rounded-xl border-border/50 hover:bg-muted/50"
                            onClick={handleGoogleLogin}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            <span className="text-sm font-medium">Google</span>
                          </Button>
                        )}
                      </div>
                    </div>
                    <SocialProof />
                  </TabsContent>

                  {/* SIGNUP TAB */}
                  <TabsContent value="signup" className="mt-0">
                    <form onSubmit={handleSignUp} className="space-y-4">
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="space-y-2">
                        <Label htmlFor="signup-name" className="text-sm font-medium">Nome</Label>
                        <div className="relative group">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input id="signup-name" type="text" placeholder="Seu nome" className="pl-10 glass border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <AnimatePresence>{errors.name && <motion.p role="alert" aria-live="polite" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-xs text-destructive">{errors.name}</motion.p>}</AnimatePresence>
                      </motion.div>
                      
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="space-y-2">
                        <Label htmlFor="signup-email" className="text-sm font-medium">Email</Label>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                          <Input id="signup-email" type="email" placeholder="seu@email.com" className="pl-10 glass border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                        </div>
                        <AnimatePresence>{errors.email && <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-xs text-destructive">{errors.email}</motion.p>}</AnimatePresence>
                      </motion.div>
                      
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 }} className="space-y-2">
                        <Label htmlFor="signup-password" className="text-sm font-medium">Senha</Label>
                        <PasswordInput id="signup-password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                        <AnimatePresence><PasswordStrengthMeter password={formData.password} /></AnimatePresence>
                        <AnimatePresence>{errors.password && <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-xs text-destructive">{errors.password}</motion.p>}</AnimatePresence>
                      </motion.div>
                      
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="pt-1">
                        <Button type="submit" className="group h-12 w-full rounded-xl text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40" style={{ background: 'var(--gradient-primary)' }} disabled={loading}>
                          {loading ? <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }}>Criando conta...</motion.span> : <>Criar Conta<ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" /></>}
                        </Button>
                      </motion.div>

                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="text-xs text-center text-muted-foreground mt-4">
                        Ao criar uma conta, você concorda com nossos{' '}
                        <button type="button" className="text-primary hover:underline">Termos de Uso</button>{' '}e{' '}
                        <button type="button" className="text-primary hover:underline">Política de Privacidade</button>
                      </motion.p>
                    </form>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </motion.div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-8 text-center text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} ZAPP Web · Todos os direitos reservados
          </motion.p>
        </motion.div>
      </div>
    </main>
  );
}
