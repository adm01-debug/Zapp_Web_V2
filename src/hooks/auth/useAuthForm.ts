import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/auth/useAuth';
import { useWebAuthn } from '@/hooks/auth/useWebAuthn';
import { toast } from '@/hooks/ui/use-toast';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { clearLoginAttempts, formatLockTime } from '@/lib/loginAttempts';
import { resolverDestinoPosLogin } from '@/lib/postLoginRedirect';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export interface LockStatus {
  isLocked: boolean;
  remainingTime: number;
  attempts: number;
}

export function useAuthForm() {
  const navigate = useNavigate();
  const location = useLocation();
  // Destino pedido antes do login: ?next= (link direto) ou state.from (o
  // ProtectedRoute devolve a rota que expirou). Sem destino seguro, '/'.
  const destinoPosLogin = resolverDestinoPosLogin(location);
  const { user, signIn } = useAuth();
  const { isSupported, isPlatformAuthenticatorAvailable, authenticateWithPasskey, loading: passkeyLoading } = useWebAuthn();
  const [loading, setLoading] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [lockStatus, setLockStatus] = useState<LockStatus>({
    isLocked: false,
    remainingTime: 0,
    attempts: 0
  });
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user && window.location.pathname === '/auth') {
      navigate(destinoPosLogin);
    }
  }, [user, navigate, destinoPosLogin]);

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

  const handlePasskeyLogin = async () => {
    const result = await authenticateWithPasskey(formData.email || undefined);
    if (!result.success || !result.token_hash) {
      toast({ title: 'Erro ao entrar com Passkey', description: 'A autenticação com a passkey não foi concluída.', variant: 'destructive' });
      return;
    }
    // A Edge (`verify-authentication`, PH-01) já validou a asserção e devolveu um
    // `token_hash` de uso único. Trocamos esse token por sessão AQUI: o antigo
    // `signInWithOtp` só ENVIAVA o link por e-mail e deixava o usuário sem sessão
    // nenhuma — a tela protegida o devolvia ao /auth (item #71).
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: result.token_hash,
      type: 'magiclink',
    });
    if (error || !data?.session) {
      // Recusa genérica: não descreve o token nem o estado da conta (sem
      // enumeração — não revela se a conta existe).
      toast({
        title: 'Erro ao entrar com Passkey',
        description: 'Não foi possível concluir o login com a passkey. Tente novamente.',
        variant: 'destructive',
      });
      return;
    }
    // A sessão foi criada pelo próprio token — é a prova do login. O destino
    // pós-login (inclui o gate de 2FA em rota, SH2) é o mesmo do login por senha.
    toast({ title: 'Autenticado com Passkey!', description: 'Redirecionando...' });
    navigate(destinoPosLogin);
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
    passkeyAvailable,
    passkeyLoading,
    lockStatus,
    formData,
    setFormData,
    errors,
    handleLogin,
    handlePasskeyLogin,
    handleGoogleLogin,
  };
}
