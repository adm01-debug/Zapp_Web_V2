import { useState } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { useConnectionOptions } from '@/hooks/connections/useConnectionOptions';
import { instanciaDa, mensagemDeErro } from '@/components/evolution/evolutionUi';

/**
 * "Enviar toque" (`offer-call`, Evolution v2): faz o WhatsApp do contato tocar por
 * alguns segundos, sem abrir áudio — para chamar a atenção antes de mandar mensagem.
 * Restaurada após o #2054 por decisão do dono. Sai pela mesma linha WhatsApp que o
 * painel de ligação usa. O gate da Edge confere se o número é um contato visível.
 * Na Evolution GO a rota não existe: `notSupported` vira aviso de erro.
 */
export const TOQUE_SEGUNDOS = 5;

export function OfferCallButton({ e164, connectionId }: { e164: string; connectionId: string | null | undefined }) {
  const { offerCall } = useEvolutionApi();
  const { data: conexoes = [] } = useConnectionOptions(Boolean(connectionId));
  const [enviando, setEnviando] = useState(false);

  if (!connectionId) return null;

  const tocar = async () => {
    const instancia = instanciaDa(connectionId, conexoes);
    if (!instancia) { toast.error('A linha WhatsApp desta ligação não tem instância configurada.'); return; }
    setEnviando(true);
    try {
      await offerCall(instancia, e164.replace(/\D/g, ''), false, TOQUE_SEGUNDOS);
      toast.success('Toque enviado');
    } catch (err) {
      toast.error(mensagemDeErro(err, 'Não foi possível enviar o toque'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={() => { void tocar(); }} disabled={enviando || !e164}
      data-testid="tel-offer-call">
      {enviando ? <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
      Enviar toque no WhatsApp
    </Button>
  );
}
