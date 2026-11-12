import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { PRESENCE_OPTIONS, type Presenca } from './instancePresenceOptions';
import { isEvolutionNotSupported, mensagemNaoSuportado } from '@/lib/evolutionNotSupported';

/**
 * Aba "Presença" do InstanceSettingsDialog.
 *
 * `set-presence` tinha wrapper (`useEvolutionInstance.setPresence`) e rota na
 * Edge, mas nenhuma tela o chamava — e o #2054 apagou a rota. Esta aba é a
 * porta de entrada que faltava, no diálogo de administração da conexão (a
 * ação é de admin/supervisor). Na Evolution GO a rota não existe: a Edge
 * responde `notSupported`: vira um aviso em português (nunca sucesso).
 */
export function PresenceTabContent({ instanceName }: { instanceName: string }) {
  const { setPresence } = useEvolutionApi();
  const [presenca, setPresenca] = useState<Presenca>('available');
  const [enviando, setEnviando] = useState(false);

  const aplicar = async () => {
    setEnviando(true);
    try {
      await setPresence(instanceName, presenca);
      toast.success('Presença atualizada');
    } catch (err) {
      if (isEvolutionNotSupported(err)) {
        toast.warning(mensagemNaoSuportado('A troca de presença'));
        return;
      }
      toast.error(err instanceof Error && err.message ? err.message : 'Não foi possível atualizar a presença');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-muted-foreground">
        Define como a conta aparece para os contatos agora. Para manter sempre online, use
        &quot;Sempre online&quot; na aba Config.
      </p>
      <div>
        <Label htmlFor="presenca-conta">Presença da conta</Label>
        <Select value={presenca} onValueChange={(v) => setPresenca(v as Presenca)}>
          <SelectTrigger id="presenca-conta" aria-label="Presença da conta"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRESENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => { void aplicar(); }} disabled={enviando} className="w-full">
        {enviando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Aplicar presença
      </Button>
    </div>
  );
}
