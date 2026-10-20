import { motion, useReducedMotion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { zappTransition } from '@/lib/motion';
import { resetChunkReloadGuard } from '@/lib/chunkReload';

interface StaleBundleNoticeProps {
  /** Acao do botao "Atualizar agora"; sem ela, recarrega a propria pagina. */
  onAtualizar?: () => void;
}

/**
 * Tela "Nova versao disponivel": mostrada quando a aba ja gastou o orcamento de
 * recargas automaticas e o deploy novo continua fora de alcance. Calma, so com
 * tokens do sistema, um giro unico e lento no icone e o botao primario em
 * destaque. "Atualizar agora" zera a guarda (orcamento/cooldown/flag antiga) e
 * recarrega, para a proxima sessao comecar limpa.
 *
 * Com movimento reduzido (`useReducedMotion`) nao ha giro nem deslocamento: o
 * card ja nasce no lugar final e a transicao tem duracao 0.
 */
export function StaleBundleNotice({ onAtualizar }: StaleBundleNoticeProps) {
  const reduzirMovimento = useReducedMotion();

  const atualizar = () => {
    resetChunkReloadGuard();
    if (onAtualizar) {
      onAtualizar();
      return;
    }
    window.location.reload();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      role="alert"
      aria-live="assertive"
    >
      <motion.div
        className="w-full max-w-lg"
        initial={reduzirMovimento ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduzirMovimento ? { duration: 0 } : zappTransition.normal}
      >
        <Card className="shadow-2xl border-primary/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4">
              <motion.div
                className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"
                animate={reduzirMovimento ? { rotate: 0 } : { rotate: 360 }}
                transition={
                  reduzirMovimento
                    ? { duration: 0 }
                    : { duration: 1.2, ease: zappTransition.panel.ease }
                }
              >
                <RefreshCw className="w-10 h-10 text-primary" />
              </motion.div>
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Nova versão disponível
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Publicamos uma atualização enquanto você usava o Zapp. Atualize agora
              para voltar a carregar as telas normalmente.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-2">
            <Button onClick={atualizar} className="w-full min-h-11">
              Atualizar agora
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
