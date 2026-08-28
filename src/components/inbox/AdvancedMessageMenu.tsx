import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { toast } from 'sonner';
import {
  MoreHorizontal,
  Sticker,
  BarChart3,
  Contact2,
  Radio,
  Plus,
  Trash2,
  Send,
} from 'lucide-react';

interface PollData {
  name: string;
  options: string[];
  selectableCount: number;
}

interface AdvancedMessageMenuProps {
  instanceName: string;
  recipientNumber: string;
  onPollSent?: (poll: PollData) => void;
  onContactSent?: (contactName: string) => void;
}

export function AdvancedMessageMenu({ instanceName, recipientNumber, onPollSent, onContactSent }: AdvancedMessageMenuProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [stickerDialog, setStickerDialog] = useState(false);
  const [pollDialog, setPollDialog] = useState(false);
  const [contactDialog, setContactDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);

  // Sticker state
  const [stickerUrl, setStickerUrl] = useState('');

  // Poll state
  const [pollName, setPollName] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollSelectableCount, setPollSelectableCount] = useState(1);

  // Contact card state
  const [contactCard, setContactCard] = useState({
    fullName: '',
    phoneNumber: '',
    organization: '',
    email: '',
  });

  // Status state
  const [statusText, setStatusText] = useState('');

  const { sendStickerMessage, sendPollMessage, sendContactMessage, sendStatusMessage, isLoading } = useEvolutionApi();

  const handleSendSticker = useCallback(async () => {
    if (!stickerUrl.trim()) return;
    try {
      await sendStickerMessage(instanceName, recipientNumber, stickerUrl);
      toast.success('Figurinha enviada!');
      setStickerUrl('');
      setStickerDialog(false);
    } catch {
      toast.error('Erro ao enviar figurinha');
    }
  }, [stickerUrl, instanceName, recipientNumber, sendStickerMessage]);

  const handleSendPoll = useCallback(async () => {
    const validOptions = pollOptions.filter(o => o.trim());
    if (!pollName.trim() || validOptions.length < 2) {
      toast.error('Preencha o título e pelo menos 2 opções');
      return;
    }
    try {
      await sendPollMessage({
        instanceName,
        number: recipientNumber,
        name: pollName,
        selectableCount: pollSelectableCount,
        values: validOptions,
      });
      onPollSent?.({ name: pollName, options: validOptions, selectableCount: pollSelectableCount });
      toast.success('Enquete enviada!');
      setPollName('');
      setPollOptions(['', '']);
      setPollDialog(false);
    } catch {
      toast.error('Erro ao enviar enquete');
    }
  }, [pollName, pollOptions, pollSelectableCount, instanceName, recipientNumber, sendPollMessage, onPollSent]);

  const handleSendContact = useCallback(async () => {
    if (!contactCard.fullName.trim() || !contactCard.phoneNumber.trim()) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }
    try {
      await sendContactMessage(instanceName, recipientNumber, [{
        fullName: contactCard.fullName,
        wuid: contactCard.phoneNumber,
        phoneNumber: contactCard.phoneNumber,
        organization: contactCard.organization || undefined,
        email: contactCard.email || undefined,
      }]);
      onContactSent?.(contactCard.fullName);
      toast.success('Cartão de contato enviado!');
      setContactCard({ fullName: '', phoneNumber: '', organization: '', email: '' });
      setContactDialog(false);
    } catch {
      toast.error('Erro ao enviar contato');
    }
  }, [contactCard, instanceName, recipientNumber, sendContactMessage, onContactSent]);

  const handleSendStatus = useCallback(async () => {
    if (!statusText.trim()) return;
    try {
      await sendStatusMessage(instanceName, { type: 'text', content: statusText });
      toast.success('Status publicado!');
      setStatusText('');
      setStatusDialog(false);
    } catch {
      toast.error('Erro ao publicar status');
    }
  }, [statusText, instanceName, sendStatusMessage]);

  const menuItems = useCallback(() => [
    { icon: Sticker, label: 'Figurinha', onClick: () => { setPopoverOpen(false); setStickerDialog(true); } },
    { icon: BarChart3, label: 'Enquete', onClick: () => { setPopoverOpen(false); setPollDialog(true); } },
    { icon: Contact2, label: 'Cartão de Contato', onClick: () => { setPopoverOpen(false); setContactDialog(true); } },
    { icon: Radio, label: 'Status/Story', onClick: () => { setPopoverOpen(false); setStatusDialog(true); } },
  ], []);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" title="Mais opções de mensagem">
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 glass-strong border-border/50" align="start">
           <div className="space-y-1">
            {menuItems().map(({ icon: Icon, label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 text-sm transition-colors"
              >
                <Icon className="w-4 h-4 text-muted-foreground" />
                {label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Sticker Dialog */}
      <Dialog open={stickerDialog} onOpenChange={setStickerDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sticker className="w-5 h-5 text-primary" />
              Enviar Figurinha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>URL da figurinha (imagem/webp)</Label>
              <Input
                value={stickerUrl}
                onChange={(e) => setStickerUrl(e.target.value)}
                placeholder="https://exemplo.com/sticker.webp"
              />
            </div>
            {stickerUrl && (
              <div className="flex justify-center p-4 bg-muted/20 rounded-lg">
                <img src={stickerUrl} alt="Preview" className="max-w-32 max-h-32 object-contain"  loading="lazy" decoding="async"/>
              </div>
            )}
            <Button onClick={handleSendSticker} disabled={isLoading || !stickerUrl.trim()} className="w-full">
              <Send className="w-4 h-4 mr-2" /> Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Poll Dialog */}
      <Dialog open={pollDialog} onOpenChange={setPollDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Criar Enquete
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Pergunta</Label>
              <Input
                value={pollName}
                onChange={(e) => setPollName(e.target.value)}
                placeholder="Qual horário preferem?"
              />
            </div>
            <div>
              <Label>Seleções permitidas</Label>
              <Input
                type="number"
                min={1}
                max={pollOptions.length}
                value={pollSelectableCount}
                onChange={(e) => setPollSelectableCount(Number(e.target.value))}
                className="w-20"
              />
            </div>
            <div className="space-y-2">
              <Label>Opções</Label>
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const updated = [...pollOptions];
                      updated[i] = e.target.value;
                      setPollOptions(updated);
                    }}
                    placeholder={`Opção ${i + 1}`}
                  />
                  {pollOptions.length > 2 && (
                    <Button variant="ghost" size="icon" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              {pollOptions.length < 12 && (
                <Button variant="outline" size="sm" onClick={() => setPollOptions([...pollOptions, ''])}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar opção
                </Button>
              )}
            </div>
            <Button onClick={handleSendPoll} disabled={isLoading} className="w-full">
              <Send className="w-4 h-4 mr-2" /> Enviar Enquete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact Card Dialog */}
      <Dialog open={contactDialog} onOpenChange={setContactDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Contact2 className="w-5 h-5 text-primary" />
              Enviar Cartão de Contato
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome completo *</Label>
              <Input value={contactCard.fullName} onChange={(e) => setContactCard({ ...contactCard, fullName: e.target.value })} placeholder="João Silva" />
            </div>
            <div>
              <Label>Telefone *</Label>
              <Input value={contactCard.phoneNumber} onChange={(e) => setContactCard({ ...contactCard, phoneNumber: e.target.value })} placeholder="5511999999999" />
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={contactCard.organization} onChange={(e) => setContactCard({ ...contactCard, organization: e.target.value })} placeholder="Empresa XYZ" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={contactCard.email} onChange={(e) => setContactCard({ ...contactCard, email: e.target.value })} placeholder="joao@empresa.com" />
            </div>
            <Button onClick={handleSendContact} disabled={isLoading} className="w-full">
              <Send className="w-4 h-4 mr-2" /> Enviar Contato
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Dialog */}
      <Dialog open={statusDialog} onOpenChange={setStatusDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              Publicar Status/Story
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Texto do status</Label>
              <Textarea
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                placeholder="Seu status aqui..."
                rows={4}
              />
            </div>
            <Button onClick={handleSendStatus} disabled={isLoading || !statusText.trim()} className="w-full">
              <Send className="w-4 h-4 mr-2" /> Publicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
