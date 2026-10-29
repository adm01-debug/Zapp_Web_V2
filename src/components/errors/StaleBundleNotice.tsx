import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
 * A animacao e CSS do tema (`motion-safe:` + `animate-*`), nao mais o runtime de
 * animacao por JS: o import de framer-motion daqui arrastava o chunk `vendor-motion`
 * (~43 KB gzip) para o pacote inicial, que e alcancado pelo `ErrorBoundary`. A entrada
 * usa `motion-safe:animate-slide-up` (mesmo "sobe com fade" de antes) e o icone faz um
 * giro unico com `motion-safe:animate-[spin_1.2s_ease-out_1]`.
 *
 * Com movimento reduzido nao ha giro nem deslocamento: o `motion-safe:` nao entrega a
 * classe quando o sistema pede `prefers-reduced-motion: reduce` (o card nasce no estado
 * final) e a classe `reduced-motion` no <html>, do painel de Acessibilidade, zera a
 * duracao por `accessibility.css`. Os dois caminhos continuam valendo.
 */
export function StaleBundleNotice({ onAtualizar }: StaleBundleNoticeProps) {
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
      <div className="w-full max-w-lg motion-safe:animate-slide-up">
        <Card className="shadow-2xl border-primary/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center motion-safe:animate-[spin_1.2s_ease-out_1]">
                <RefreshCw className="w-10 h-10 text-primary" />
              </div>
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
      </div>
    </div>
  );
}
