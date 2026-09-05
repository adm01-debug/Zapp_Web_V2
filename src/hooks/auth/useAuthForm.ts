import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/auth/useAuth';
import { useWebAuthn } from '@/hooks/auth/useWebAuthn';
import { toast } from '@/hooks/ui/use-toast';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { checkAccountLock, recordFailedLogin, clearLoginAttempts, formatLockTime } from '@/lib/loginAttempts';

const passwordSchema = z.string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'Deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'Deve conter pelo menos um número')
  .regex(/[^A-Za-z0-9]/, 'Deve conter pelo menos um caractere especial');

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100, 'Nome muito longo'),
  email: z.string().email('Email inválido').max(255, 'Email muito longo'),
  password: passwordSchema,
});

export interface LockStatus {
  isLocked: boolean;
  remainingTime: number;
  attempts: number;
}

export function useAuthForm() {
  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuth();
  const { isSupported, isPlatformAuthenticatorAvailable, authenticateWithPasskey, loading: passkeyLoading } = useWebAuthn();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [lockStatus, setLockStatus] = useState<LockStatus>({
    isLocked: false,
    remainingTime: 0,
    attempts: 0
  });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user && window.location.pathname === '/auth') {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    // BUG-F3 FIX: guard against setState after unmount when the
    // platform-authenticator probe resolves slowly.
    if (!isSupported()) return;
    let cancelled = false;
    isPlatformAuthenticatorAvailable()
      .then((available) => {
        if (!cancelled) setPasskeyAvailable(available);
      })
      .catch(() => {
        if (!cancelled) setPasskeyAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSupported, isPlatformAuthenticatorAvailable]);

  useEffect(() => {
    if (lockStatus.remainingTime > 0) {
      const timer = setInterval(() => {
        setLockStatus(prev => {
          const newTime = prev.remainingTime - 1;
          if (newTime <= 0) return { ...prev, isLocked: false, remainingTime: 0 };
          return { ...prev, remainingTime: newTime };
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockStatus.remainingTime]);

  useEffect(() => {
    const checkLock = async () => {
      if (formData.email && formData.email.includes('@')) {
        const status = await checkAccountLock(formData.email);
        setLockStatus(status);
      }
    };
    const debounce = setTimeout(checkLock, 500);
    return () => clearTimeout(debounce);
  }, [formData.email]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // O browser pode autopreencher os campos sem disparar onChange — acontece
    // sobretudo depois que a senha e limpada num login recusado. Lemos o DOM do
    // proprio form para nao validar contra um estado desatualizado.
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const credentials = {
      ...formData,
      email: ((fd.get("email") as string | null) ?? formData.email).trim(),
      password: (fd.get("password") as string | null) || formData.password,
    };
    if (credentials.email !== formData.email || credentials.password !== formData.password) {
      setFormData(credentials);
    }

    const result = loginSchema.safeParse(credentials);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    let error: { message: string } | null = null;
    let via: 'edge' | 'direct' = 'direct';
    let lock: Awaited<ReturnType<typeof recordFailedLogin>> | null = null;
    try {
      const currentLock = await checkAccountLock(credentials.email);
      if (currentLock.isLocked) {
        setLockStatus(currentLock);
        toast({ title: 'Conta bloqueada', description: `Muitas tentativas. Aguarde ${formatLockTime(currentLock.remainingTime)}.`, variant: 'destructive' });
        return;
      }
      ({ error, via, lock } = await signIn(credentials.email, credentials.password));
    } finally {
      // Qualquer excecao no caminho (rede, edge) nao pode deixar o botao travado.
      setLoading(false);
    }

    if (error) {
      // Pela edge auth-login a falha ja foi registrada no servidor (ADR-006).
      const lockResult = lock ?? await recordFailedLogin(credentials.email);
      setLockStatus(lockResult);
      // BUG-F4 FIX: never keep the rejected password in memory after a
      // failed attempt — forces the user to retype and avoids leaking it
      // through React DevTools or accidental form-state serialization.
      setFormData((prev) => ({ ...prev, password: '' }));
      if (lockResult.isLocked) {
        toast({ title: 'Conta bloqueada temporariamente', description: `Após ${lockResult.attempts} tentativas, sua conta foi bloqueada por ${formatLockTime(lockResult.remainingTime)}.`, variant: 'destructive' });
      } else {
        const remainingAttempts = 5 - lockResult.attempts;
        toast({
          title: 'Erro ao entrar',
          description: error.message === 'Invalid login credentials' 
            ? `Email ou senha incorretos. ${remainingAttempts > 0 ? `${remainingAttempts} tentativa${remainingAttempts > 1 ? 's' : ''} restante${remainingAttempts > 1 ? 's' : ''}.` : ''}`
            : error.message,
          variant: 'destructive',
        });
      }
    } else {
      if (via !== 'edge') await clearLoginAttempts(credentials.email);
      toast({ title: 'Bem-vindo!', description: 'Login realizado com sucesso.' });
      // BUG-F2 FIX: rely on the single useEffect above that watches `user`
      // to redirect, avoiding a double navigate (race between sync
      // navigate + async onAuthStateChange → user → effect → navigate).
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    const result = signupSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const { error } = await signUp(formData.email, formData.password, formData.name);
    setLoading(false);

    if (error) {
      const errorMessage = error.message.includes('already registered') ? 'Este email já está cadastrado' : error.message;
      toast({ title: 'Erro ao criar conta', description: errorMessage, variant: 'destructive' });
    } else {
      toast({ title: 'Conta criada!', description: 'Você já pode fazer login.' });
      navigate('/');
    }
  };

  const handlePasskeyLogin = async () => {
    const result = await authenticateWithPasskey(formData.email || undefined);
    if (result.success && result.userEmail) {
      const { error } = await supabase.auth.signInWithOtp({
        email: result.userEmail,
        options: { shouldCreateUser: false },
      });
      if (!error) {
        toast({ title: 'Autenticado com Passkey!', description: 'Redirecionando...' });
        navigate('/');
      } else {
        toast({ title: 'Erro ao entrar com Passkey', description: error.message, variant: 'destructive' });
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      // Usa o cliente oficial (projeto tnnnlkbymytvtqngbbqh). O cliente do Lovable
      // aponta para o projeto interno vpkmqeumtxhrwgawxdrl — backend errado, a
      // sessao voltava de outro banco. Callback tratado em /auth/callback.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        toast({ title: 'Erro ao conectar com Google', description: error.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Login social indisponível', description: 'Tente novamente mais tarde.', variant: 'destructive' });
    }
  };

  return {
    loading,
    activeTab,
    setActiveTab,
    passkeyAvailable,
    passkeyLoading,
    lockStatus,
    formData,
    setFormData,
    errors,
    handleLogin,
    handleSignUp,
    handlePasskeyLogin,
    handleGoogleLogin,
  };
}
