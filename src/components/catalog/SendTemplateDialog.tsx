import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import type { WhatsAppTemplate } from '@/hooks/integrations/useWhatsAppTemplates';

/**
 * Envio de um template pelo `send-template` da Edge (Evolution v2,
 * `/message/sendTemplate`). O wrapper `sendTemplateMessage` existia em
 * `useEvolutionMessaging`, mas nenhuma tela o chamava — e o #2054 apagou a
 * rota por isso. Esta é a porta de entrada que faltava, na lista de templates.
 *
 * Só funciona com template APROVADO pela Meta numa conexão WhatsApp Business
 * (Cloud API). Na Evolution GO a rota não existe: a Edge responde
 * `notSupported` e o aviso aparece como erro, nunca como sucesso. O gate da
 * Edge confere se o número é um contato visível para quem envia.
 */

interface ConexaoResumo { id: string; name: string; instance_id: string | null }

/** Monta o `template` no formato da Evolution v2 (componente `body` com as variáveis, na ordem). */
export function montarTemplateEvolution(template: Pick<WhatsAppTemplate, 'name' | 'language'>, valores: string[]) {
  return {
    name: template.name,
    language: template.language,
    components: valores.length > 0
      ? [{ type: 'body', parameters: valores.map((text) => ({ type: 'text', text })) }]
      : [],
  };
}

export function SendTemplateDialog({ template, onOpenChange }: {
  template: WhatsAppTemplate | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { sendTemplateMessage } = useEvolutionApi();
  const [conexoes, setConexoes] = useState<ConexaoResumo[]>([]);
  const [conexao, setConexao] = useState('');
  const [numero, setNumero] = useState('');
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const variaveis = template?.variables ?? [];

  useEffect(() => {
    if (!template) return;
    let cancelado = false;
    setValores(variaveis.map(() => ''));
    setConexao(template.whatsapp_connection_id ?? '');
    void supabase.from('whatsapp_connections').select('id, name, instance_id').order('name', { ascending: true })
      .then(({ data }) => { if (!cancelado) setConexoes((data ?? []) as ConexaoResumo[]); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só quando o template muda
  }, [template]);

  if (!template) return null;

  const instancia = conexoes.find((c) => c.id === conexao)?.instance_id ?? '';
  const numeroLimpo = numero.replace(/\D/g, '');

  const enviar = async () => {
    if (!instancia) { toast.error('Escolha a conexão.'); return; }
    if (numeroLimpo.length < 10) { toast.error('Informe o número com DDD (só dígitos).'); return; }
    if (valores.some((v) => !v.trim())) { toast.error('Preencha todas as variáveis do template.'); return; }
    setEnviando(true);
    try {
      await sendTemplateMessage(instancia, numeroLimpo, montarTemplateEvolution(template, valores.map((v) => v.trim())));
      toast.success('Template enviado');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Não foi possível enviar o template');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar template — {template.name}</DialogTitle>
          <DialogDescription>Precisa ser um template aprovado pela Meta numa conexão WhatsApp Business.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="template-conexao">Conexão</Label>
            <Select value={conexao} onValueChange={setConexao}>
              <SelectTrigger id="template-conexao" aria-label="Conexão"><SelectValue placeholder="Escolha a conexão" /></SelectTrigger>
              <SelectContent>
                {conexoes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="template-numero">Número do contato</Label>
            <Input id="template-numero" inputMode="tel" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="5511999999999" />
          </div>
          {variaveis.map((v, i) => (
            <div key={`${v}-${i}`}>
              <Label htmlFor={`template-var-${i}`}>Variável {v}</Label>
              <Input id={`template-var-${i}`} value={valores[i] ?? ''}
                onChange={(e) => setValores((atual) => atual.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => { void enviar(); }} disabled={enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
