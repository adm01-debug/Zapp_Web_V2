import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { resolverDestinoPosLogin } from '@/lib/postLoginRedirect';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type CallbackStatus = 'loading' | 'success' | 'error';

const MAX_ERROR_LENGTH = 200;
const GENERIC_ERROR = 'Ocorreu um erro durante a autenticação';
const CONTA_NAO_LIBERADA = 'Sua conta não está liberada. Peça ao administrador.';
const CONTA_DESATIVADA = 'Sua conta está desativada. Peça ao administrador.';
const ACESSO_NEGADO = 'Acesso não autorizado. Tente novamente ou peça ajuda ao administrador.';
const SERVIDOR_FALHOU = 'O servidor de autenticação falhou. Tente novamente em instantes.';

// Códigos e textos em inglês que o provedor devolve no retorno do login social.
const ERROR_TRANSLATIONS: Record<string, string> = {
  signup_disabled: CONTA_NAO_LIBERADA,
  signups_not_allowed: CONTA_NAO_LIBERADA,
  user_banned: CONTA_DESATIVADA,
  access_denied: ACESSO_NEGADO,
  server_error: SERVIDOR_FALHOU,
};

// PKCE flow returns error params in the query string, not the hash fragment.
// `error_code` vem primeiro: é o identificador estável que o provedor usa.
function getUrlError(): string | null {
  const p = new URLSearchParams(window.location.search);
  return p.get('error_code') || p.get('error_description') || p.get('error');
}

// Mensagem conhecida do provedor vira pt-BR; desconhecida segue para sanitização.
function traduzirErroAuth(raw: string): string | null {
  const chave = raw.trim().toLowerCase();
  if (ERROR_TRANSLATIONS[chave]) return ERROR_TRANSLATIONS[chave];
  if (chave.includes('signup_disabled') || chave.includes('signups not allowed')) {
    return CONTA_NAO_LIBERADA;
  }
  if (chave.includes('user_banned') || chave.includes('banned')) return CONTA_DESATIVADA;
  if (chave.includes('access_denied')) return ACESSO_NEGADO;
  if (chave.includes('server_error')) return SERVIDOR_FALHOU;
  return null;
}

// A mensagem vem da URL (quem monta o link controla o texto): textos conhecidos
// viram pt-BR; o resto é cortado no tamanho máximo, perde caracteres de marcação
// e cai no texto genérico quando não sobra nada.
function sanitizeAuthError(raw: string | null | undefined): string {
  if (!raw) return GENERIC_ERROR;
  const traduzido = traduzirErroAuth(raw);
  if (traduzido) return traduzido;
  const text = raw.slice(0, MAX_ERROR_LENGTH).replace(/[<>"'&`]/g, '').trim();
  return text || GENERIC_ERROR;
}

export default function SSOCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  // Destino pedido antes do SSO (?next= ou state.from); '/' como padrao.
  const destinoPosLogin = resolverDestinoPosLogin(location);
  const rawUrlError = getUrlError();
  const initialError = rawUrlError ? sanitizeAuthError(rawUrlError) : null;
  const [status, setStatus] = useState<CallbackStatus>(initialError ? 'error' : 'loading');
  const [errorMessage, setErrorMessage] = useState(initialError ?? '');
  // ref tracks live status to avoid stale closure in the timeout callback
  const statusRef = useRef<CallbackStatus>(initialError ? 'error' : 'loading');
  // Garante um único toast de sucesso e um único redirecionamento, mesmo que a
  // sessão chegue pelos dois caminhos (getSession e onAuthStateChange SIGNED_IN).
  const loginConcluidoRef = useRef(false);
  const redirecionamentoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If Google returned an error in the redirect URL, show it and stop
    const errorParam = getUrlError();
    if (errorParam) {
      toast.error('Erro no login SSO');
      return;
    }

    let ativo = true;

    const concluirLogin = () => {
      if (loginConcluidoRef.current) return;
      loginConcluidoRef.current = true;
      statusRef.current = 'success';
      setStatus('success');
      toast.success('Login realizado com sucesso!');
      redirecionamentoRef.current = setTimeout(() => navigate(destinoPosLogin), 1500);
    };

    const falharLogin = (mensagem: string) => {
      // Um login que falha depois do sucesso cancela o redirecionamento pendente.
      if (redirecionamentoRef.current) {
        clearTimeout(redirecionamentoRef.current);
        redirecionamentoRef.current = null;
      }
      loginConcluidoRef.current = false;
      statusRef.current = 'error';
      setStatus('error');
      setErrorMessage(mensagem);
    };

    // Subscribe to auth state changes — cleanup returned directly to React (not inside async fn)
    const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        concluirLogin();
      } else if (event === 'SIGNED_OUT') {
        falharLogin('Sessão não encontrada');
      }
    });

    // Check if a session already exists (fast redirect case)
    supabase.auth.getSession().then(({ data, error }) => {
      if (!ativo) return;
      if (error) {
        falharLogin(sanitizeAuthError(error.message));
        toast.error('Erro no login SSO');
        return;
      }
      if (data.session) {
        concluirLogin();
      }
    });

    // Timeout fallback — use ref to avoid stale closure on `status` state
    const timer = setTimeout(() => {
      if (statusRef.current === 'loading') {
        falharLogin('Tempo esgotado. Tente novamente.');
        toast.error('Erro no login SSO');
      }
    }, 10000);

    return () => {
      ativo = false;
      clearTimeout(timer);
      if (redirecionamentoRef.current) {
        clearTimeout(redirecionamentoRef.current);
        redirecionamentoRef.current = null;
      }
      authData.subscription.unsubscribe();
    };
  }, [navigate, destinoPosLogin]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        {status === 'loading' && (
          <Card role="status" aria-live="polite">
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
          <Card role="status" aria-live="polite">
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
          <Card role="alert" aria-live="assertive">
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
    </main>
  );
}
