import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { useConnectionOptions } from '@/hooks/connections/useConnectionOptions';
import { ConnectionSelect } from '@/components/evolution/ConnectionSelect';
import { conexaoEfetiva, instanciaDa, listaDe, mensagemDeErro, texto } from '@/components/evolution/evolutionUi';

/**
 * Diagnóstico: conversas que o APARELHO conhece (`find-chats`, Evolution v2).
 * Restaurada após o #2054 por decisão do dono. Serve para comparar com o que o
 * Zapp recebeu pelo webhook (conversa no aparelho e ausente no Zapp = evento perdido).
 * Admin/supervisor (leitura de toda a instância). Na Evolution GO: `notSupported`.
 */
export function DeviceChatsPanel() {
  const { findChats } = useEvolutionApi();
  const { data: conexoes = [] } = useConnectionOptions();
  const [escolhida, setEscolhida] = useState('');
  const [chats, setChats] = useState<Record<string, unknown>[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const conexao = conexaoEfetiva(escolhida, conexoes);

  const carregar = async () => {
    const instancia = instanciaDa(conexao, conexoes);
    if (!instancia) { toast.error('Escolha a conexão.'); return; }
    setCarregando(true);
    try {
      setChats(listaDe(await findChats(instancia), 'chats'));
    } catch (err) {
      setChats(null);
      toast.error(mensagemDeErro(err, 'Não foi possível listar as conversas do aparelho'));
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Card className="mt-4" data-testid="device-chats-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><MessagesSquare className="w-4 h-4" />Conversas no aparelho</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Lista o que o próprio WhatsApp da conexão tem. Conversa que aparece aqui e não aparece no Zapp indica evento perdido no webhook.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1"><ConnectionSelect id="device-chats-conexao" connections={conexoes} value={conexao} onChange={(v) => { setEscolhida(v); setChats(null); }} /></div>
          <Button onClick={() => { void carregar(); }} disabled={carregando}>
            {carregando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Listar conversas
          </Button>
        </div>
        {chats !== null && (
          chats.length === 0
            ? <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada no aparelho.</p>
            : (
              <ul className="divide-y rounded-md border max-h-80 overflow-y-auto" aria-label="Conversas do aparelho">
                {chats.map((c, i) => {
                  const jid = texto(c.remoteJid) || texto(c.id);
                  const nome = texto(c.pushName) || texto(c.name) || jid;
                  const naoLidas = Number(c.unreadCount ?? c.unreadMessages ?? 0);
                  return (
                    <li key={`${jid}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0"><span className="block truncate font-medium">{nome}</span><span className="block truncate text-xs text-muted-foreground">{jid}</span></span>
                      {naoLidas > 0 && <span className="shrink-0 text-xs text-muted-foreground">{naoLidas} não lida(s)</span>}
                    </li>
                  );
                })}
              </ul>
            )
        )}
      </CardContent>
    </Card>
  );
}
