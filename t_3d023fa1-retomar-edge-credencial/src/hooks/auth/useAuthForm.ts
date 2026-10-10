import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/auth/useAuth';
import { useWebAuthn } from '@/hooks/auth/useWebAuthn';
import { toast } from '@/hooks/ui/use-toast';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { clearLoginAttempts, formatLockTime } from '@/lib/loginAttempts';

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // O browser pode autopreencher os campos sem disparar onChange — acontece
    // sobretudo depois que a senha e limpada num login recusado. Lemos o DOM do
    // proprio form para nao validar contra um estado desatualizado.
    //
    // Mas o DOM so pode PREENCHER o que o estado nao tem, nunca SOBRESCREVER o
    // que o usuario digitou: com o e-mail vindo do DOM, uma sobra de autofill
    // (a conta anterior, num aparelho compartilhado) fazia o app autenticar por
    // um e-mail que o proprio estado nunca viu. Medido em producao: estado com A
    // e DOM com B -> a requisicao saiu com B. Por isso o e-mail prefere o estado
    // quando ele existe; a senha segue o caminho antigo, onde o DOM e essencial.
    const formEl = e.currentTarget as HTMLFormElement;
    const fd = new FormData(formEl);
    const credentials = {
      ...formData,
      email: formData.email.trim() || ((fd.get("email") as string | null) ?? "").trim(),
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
    let lock: LockStatus | null = null;
    try {
      ({ error, via, lock } = await signIn(credentials.email, credentials.password));
    } finally {
      setLoading(false);
    }

    if (error) {
      if (lock) setLockStatus(lock);
      // Decisao de produto (03/10): depois de uma recusa a senha sai do estado E do
      // DOM. O handler prefere o valor do DOM (`fd.get("password") || ...`), entao
      // limpar so o estado deixava a senha RECUSADA voltar no proximo envio — o
      // campo exibia uma senha que o app tinha acabado de rejeitar. O autofill
      // continua valendo no primeiro envio; o que muda e so o pos-recusa, onde os
      // dois ficam vazios de proposito e o usuario redigita.
      setFormData((prev) => ({ ...prev, password: '' }));
      const campoSenha = formEl.querySelector<HTMLInputElement>('input[name="password"]');
      if (campoSenha) campoSenha.value = '';
      if (lock?.isLocked) {
        toast({ title: 'Conta bloqueada temporariamente', description: `Após ${lock.attempts} tentativas, sua conta foi bloqueada por ${formatLockTime(lock.remainingTime)}.`, variant: 'destructive' });
      } else {
        toast({
          title: 'Erro ao entrar',
          description: error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos.'
            : error.message,
          variant: 'destructive',
        });
      }
    } else {
      if (via !== 'edge') await clearLoginAttempts(credentials.email);
      toast({ title: 'Bem-vindo!', description: 'Login realizado com sucesso.' });
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
