import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { useConnectionOptions } from '@/hooks/connections/useConnectionOptions';
import type { WhatsAppTemplate } from '@/hooks/integrations/useWhatsAppTemplates';
import { ConnectionSelect } from '@/components/evolution/ConnectionSelect';
import { conexaoEfetiva, instanciaDa, listaDe, mensagemDeErro, texto } from '@/components/evolution/evolutionUi';
import { montarTemplateMeta } from './metaTemplatePayload';

/**
 * Templates na Meta (WhatsApp Business Cloud API) por conexão: listar
 * (`find-templates`), enviar um template local para aprovação (`create-template`)
 * e excluir na Meta (`delete-template`). Restauradas após o #2054 por decisão do
 * dono. Admin/supervisor. Na Evolution GO as rotas não existem: `notSupported`
 * vira aviso de erro.
 */
export function MetaTemplatesDialog({ open, onOpenChange, localTemplates }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localTemplates: WhatsAppTemplate[];
}) {
  const { findTemplates, createTemplate, deleteTemplate } = useEvolutionApi();
  const { data: conexoes = [] } = useConnectionOptions(open);
  const [escolhida, setEscolhida] = useState('');
  const [remotos, setRemotos] = useState<Record<string, unknown>[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [localId, setLocalId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);

  const conexao = conexaoEfetiva(escolhida, conexoes);
  const instancia = instanciaDa(conexao, conexoes);

  const carregar = async () => {
    if (!instancia) { toast.error('Escolha a conexão.'); return; }
    setCarregando(true);
    try {
      setRemotos(listaDe(await findTemplates(instancia), 'templates'));
    } catch (err) {
      setRemotos(null);
      toast.error(mensagemDeErro(err, 'Não foi possível listar os templates da Meta'));
    } finally {
      setCarregando(false);
    }
  };

  const enviarParaAprovacao = async () => {
    const local = localTemplates.find((t) => t.id === localId);
    if (!instancia) { toast.error('Escolha a conexão.'); return; }
    if (!local) { toast.error('Escolha o template local.'); return; }
    setEnviando(true);
    try {
      await createTemplate(instancia, montarTemplateMeta(local));
      setLocalId('');
      if (remotos !== null) await carregar();
    } catch {
      // `createTemplate` já avisa por toast (withToast), inclusive o motivo da Meta.
    } finally {
      setEnviando(false);
    }
  };

  const excluir = async (nome: string) => {
    setConfirmarExclusao(null);
    try {
      await deleteTemplate(instancia, { name: nome });
      setRemotos((atual) => (atual ?? []).filter((t) => texto(t.name) !== nome));
    } catch {
      // `deleteTemplate` já avisa por toast (withToast).
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Templates na Meta</DialogTitle>
          <DialogDescription>Templates oficiais da conta WhatsApp Business da conexão. Só conexões Cloud API (Evolution v2) têm esta função.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1"><ConnectionSelect id="meta-templates-conexao" connections={conexoes} value={conexao} onChange={(v) => { setEscolhida(v); setRemotos(null); }} /></div>
            <Button variant="outline" onClick={() => { void carregar(); }} disabled={carregando}>
              {carregando && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" />}Listar na Meta
            </Button>
          </div>

          {remotos !== null && (
            remotos.length === 0
              ? <p className="text-sm text-muted-foreground">Nenhum template nesta conta.</p>
              : (
                <ul className="divide-y rounded-md border" aria-label="Templates na Meta">
                  {remotos.map((t, i) => {
                    const nome = texto(t.name);
                    return (
                      <li key={`${nome}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{nome}</span>
                          <span className="block text-xs text-muted-foreground">{texto(t.language)} · {texto(t.category)}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {texto(t.status) && <Badge variant="outline">{texto(t.status)}</Badge>}
                          {confirmarExclusao === nome ? (
                            <>
                              <Button size="sm" variant="destructive" onClick={() => { void excluir(nome); }}>Confirmar exclusão</Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmarExclusao(null)}>Cancelar</Button>
                            </>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Excluir ${nome} na Meta`} onClick={() => setConfirmarExclusao(nome)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )
          )}

          <section className="space-y-2 rounded-md border p-3" aria-labelledby="meta-aprovacao">
            <h3 id="meta-aprovacao" className="text-sm font-medium">Enviar template local para aprovação</h3>
            <Label htmlFor="meta-template-local">Template local</Label>
            <Select value={localId} onValueChange={setLocalId}>
              <SelectTrigger id="meta-template-local" aria-label="Template local"><SelectValue placeholder="Escolha o template" /></SelectTrigger>
              <SelectContent>
                {localTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => { void enviarParaAprovacao(); }} disabled={enviando || !localId} className="w-full">
              {enviando ? <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}Enviar para aprovação da Meta
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
