import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import type { WhatsAppConnection } from '@/hooks/chat/useGroupsManager';
import { EPHEMERAL_OPTIONS, extrairCodigoConvite } from './groupEvolutionOptions';
import { isEvolutionNotSupported, mensagemNaoSuportado } from '@/lib/evolutionNotSupported';

/**
 * Diálogos da tela de Grupos que usam `invite-info`/`accept-invite` e
 * `toggle-ephemeral`. Os wrappers existiam em `useEvolutionGroups`, mas
 * nenhuma tela os chamava — e o #2054 apagou as rotas por isso. Aqui ficam as
 * portas de entrada que faltavam. Na Evolution GO (provedor padrão) algumas
 * rotas não existem: a Edge responde `notSupported` e a tela mostra um aviso em
 * português. Sem `invite-info`, ainda dá para entrar no grupo sem a prévia
 * (`accept-invite` funciona na GO).
 */

function mensagemDeErro(err: unknown, padrao: string): string {
  return err instanceof Error && err.message ? err.message : padrao;
}

interface InviteInfo { subject?: string; size?: number; desc?: string; description?: string }

export function JoinGroupByInviteDialog({ open, onOpenChange, connections, onJoined }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: WhatsAppConnection[];
  /** Depois de entrar: a tela sincroniza a lista de grupos. */
  onJoined?: () => void;
}) {
  const { getInviteInfo, acceptInvite } = useEvolutionApi();
  const [conexao, setConexao] = useState('');
  const [convite, setConvite] = useState('');
  const [info, setInfo] = useState<InviteInfo | null>(null);
  // A prévia do convite não existe nesta conexão (GO): libera entrar sem ela.
  const [semPrevia, setSemPrevia] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [entrando, setEntrando] = useState(false);

  // Com uma conexão só, ela já vem escolhida.
  const conexaoEfetiva = conexao || (connections.length === 1 ? connections[0].id : '');
  const instancia = connections.find((c) => c.id === conexaoEfetiva)?.instance_id ?? '';

  const fechar = (aberto: boolean) => {
    if (!aberto) { setConvite(''); setInfo(null); setSemPrevia(false); }
    onOpenChange(aberto);
  };

  const verConvite = async () => {
    const codigo = extrairCodigoConvite(convite);
    if (!instancia) { toast.error('Escolha a conexão.'); return; }
    if (!codigo) { toast.error('Informe o link ou o código do convite.'); return; }
    setConsultando(true);
    setInfo(null);
    setSemPrevia(false);
    try {
      const data = await getInviteInfo(instancia, codigo);
      setInfo((data && typeof data === 'object' ? data : {}) as InviteInfo);
    } catch (err) {
      if (isEvolutionNotSupported(err)) {
        setSemPrevia(true);
        toast.warning(mensagemNaoSuportado('A prévia do convite'));
        return;
      }
      toast.error(mensagemDeErro(err, 'Não foi possível ler o convite'));
    } finally {
      setConsultando(false);
    }
  };

  const entrar = async () => {
    setEntrando(true);
    try {
      await acceptInvite(instancia, extrairCodigoConvite(convite));
      fechar(false);
      onJoined?.();
    } catch {
      // `acceptInvite` já avisa por toast (withToast).
    } finally {
      setEntrando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrar em grupo por convite</DialogTitle>
          <DialogDescription>Confira o grupo antes de entrar: nome e número de participantes vêm do próprio convite.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="convite-conexao">Conexão</Label>
            <Select value={conexaoEfetiva} onValueChange={(v) => { setConexao(v); setInfo(null); setSemPrevia(false); }}>
              <SelectTrigger id="convite-conexao" aria-label="Conexão"><SelectValue placeholder="Escolha a conexão" /></SelectTrigger>
              <SelectContent>
                {connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="convite-link">Link ou código do convite</Label>
            <div className="flex gap-2">
              <Input id="convite-link" value={convite} onChange={(e) => { setConvite(e.target.value); setInfo(null); setSemPrevia(false); }}
                placeholder="https://chat.whatsapp.com/..." />
              <Button variant="outline" onClick={() => { void verConvite(); }} disabled={consultando}>
                {consultando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Ver convite
              </Button>
            </div>
          </div>
          {info && (
            <div className="rounded-lg border p-3 space-y-1" data-testid="previa-convite">
              <p className="text-sm font-medium">{info.subject || 'Grupo sem nome'}</p>
              {typeof info.size === 'number' && <p className="text-xs text-muted-foreground">{info.size} participante(s)</p>}
              {(info.desc || info.description) && <p className="text-xs text-muted-foreground">{info.desc || info.description}</p>}
            </div>
          )}
          {semPrevia && (
            <p role="note" data-testid="convite-sem-previa" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
              Esta conexão não mostra a prévia do convite. Dá para entrar mesmo assim — confira o link antes.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)}>Cancelar</Button>
          <Button onClick={() => { void entrar(); }} disabled={(!info && !semPrevia) || entrando}>
            {entrando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Entrar no grupo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GroupEphemeralDialog({ open, onOpenChange, instanceName, groupJid, groupName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string;
  groupJid: string;
  groupName: string;
}) {
  const { toggleEphemeral } = useEvolutionApi();
  // A API não informa a duração atual do grupo: nada vem pré-selecionado e a
  // escolha é obrigatória (pré-selecionar "Desligado" desligava sem querer).
  const [duracao, setDuracao] = useState<string>('');
  const [aplicando, setAplicando] = useState(false);

  const aplicar = async () => {
    if (!instanceName) { toast.error('Este grupo não tem conexão vinculada.'); return; }
    if (!duracao) { toast.error('Escolha a duração.'); return; }
    setAplicando(true);
    try {
      await toggleEphemeral(instanceName, groupJid, Number(duracao));
      toast.success(duracao === '0' ? 'Mensagens temporárias desligadas' : 'Mensagens temporárias ativadas');
      onOpenChange(false);
    } catch (err) {
      if (isEvolutionNotSupported(err)) {
        toast.warning(mensagemNaoSuportado('Mensagens temporárias'));
        return;
      }
      toast.error(mensagemDeErro(err, 'Não foi possível alterar as mensagens temporárias'));
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mensagens temporárias — {groupName}</DialogTitle>
          <DialogDescription>Novas mensagens do grupo somem depois do prazo escolhido. Exige que a conexão seja admin do grupo.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="duracao-temporarias">Duração</Label>
          <Select value={duracao} onValueChange={setDuracao}>
            <SelectTrigger id="duracao-temporarias" aria-label="Duração"><SelectValue placeholder="Escolha a duração" /></SelectTrigger>
            <SelectContent>
              {EPHEMERAL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">A duração atual do grupo não é informada pelo WhatsApp; escolha a que deve valer.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { void aplicar(); }} disabled={aplicando || !duracao}>
            {aplicando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
