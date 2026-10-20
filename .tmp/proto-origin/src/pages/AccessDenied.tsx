import { type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Home, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { zappTransition } from '@/lib/motion';

/**
 * Acesso negado explicado — a rota tentada aparece na tela em vez de o usuário
 * ser devolvido para '/' em silêncio (paridade V3 -> V2).
 *
 * O registro de auditoria fica no `ProtectedRoute`, que é quem nega o acesso
 * (uma vez por navegação); esta tela só explica e oferece a saída.
 */
type EstadoAcessoNegado = { from?: { pathname?: string } };

export default function AccessDenied() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;

  // Só o caminho: nada de query/hash (que podem carregar dado sensível) na tela.
  const estado = location.state as EstadoAcessoNegado | null;
  const rotaTentada =
    typeof estado?.from?.pathname === 'string' ? estado.from.pathname : null;

  // Teclado no próprio container (Esc/Acima), sem listener global em window.
  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      navigate('/');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-6"
      onKeyDown={aoTeclar}
    >
      <motion.section
        data-testid="access-denied"
        data-motion={reduce ? 'reduced' : 'full'}
        aria-labelledby="access-denied-titulo"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : zappTransition.panel}
        className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-elev-3"
      >
        <motion.div
          aria-hidden="true"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : zappTransition.normal}
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        >
          <Lock className="h-7 w-7" />
        </motion.div>

        <h1
          id="access-denied-titulo"
          className="text-xl font-semibold text-foreground"
        >
          Acesso negado
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Você não tem permissão para acessar esta área.
        </p>

        {rotaTentada && (
          <p className="mt-4 text-sm text-muted-foreground">
            Rota solicitada:{' '}
            <code className="rounded-sm bg-muted px-2 py-1 font-mono text-xs text-foreground">
              {rotaTentada}
            </code>
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Button>
          <Button className="gap-2" onClick={() => navigate('/')}>
            <Home className="h-4 w-4" aria-hidden="true" />
            Ir para o início
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Pressione{' '}
          <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-2xs text-foreground">
            Esc
          </kbd>{' '}
          para ir ao início.
        </p>
      </motion.section>
    </div>
  );
}
