import { useState, useCallback, useMemo } from 'react';
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
import { useUserRole } from '@/hooks/system/useUserRole';
import { sendOutboundMessage, sendRichOutboundMessage } from '@/services/outbound-message.service';
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

/** Opção da enquete com id estável (o `key={índice}` fazia o foco pular ao remover). */
interface PollOption {
  id: string;
  value: string;
}

/**
 * Telefone do cartão de contato: 8 a 15 dígitos — o MESMO limite que o
 * construtor de botões já exige (interactive-builder/useInteractiveMessage.ts:138).
 * O WhatsApp recusa número fora dessa faixa.
 */
function isValidContactPhone(phone: string): boolean {
  return /^\d{8,15}$/.test(phone.replace(/\D/g, ''));
}

/** E-mail do cartão de contato: campo opcional, mas quando preenchido tem de ter formato de e-mail. */
function isValidContactEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** A fila canônica só enfileira figurinha com URL `https://` (enqueue_outbound_message). */
function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

// Contador de módulo: garante um id único e estável por opção, inclusive entre
// instâncias do componente que existam ao mesmo tempo.
let pollOptionSeq = 0;
function newPollOption(value = ''): PollOption {
  pollOptionSeq += 1;
  return { id: `opcao-${pollOptionSeq}`, value };
}

interface ContactCardErrors {
  fullName?: string;
  phoneNumber?: string;
  email?: string;
}

interface AdvancedMessageMenuProps {
  contactId: string;
  instanceName: string;
  recipientNumber: string;
  onPollSent?: (poll: PollData) => void;
  onContactSent?: (contactName: string) => void;
}

export function AdvancedMessageMenu({ contactId, instanceName, recipientNumber, onPollSent, onContactSent }: AdvancedMessageMenuProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [stickerDialog, setStickerDialog] = useState(false);
  const [pollDialog, setPollDialog] = useState(false);
  const [contactDialog, setContactDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);

  // Sticker state
  const [stickerUrl, setStickerUrl] = useState('');

  // Poll state
  const [pollName, setPollName] = useState('');
  const [pollOptions, setPollOptions] = useState<PollOption[]>(() => [newPollOption(), newPollOption()]);
  const [pollSelectableCount, setPollSelectableCount] = useState(1);

  // Contact card state
  const [contactCard, setContactCard] = useState({
    fullName: '',
    phoneNumber: '',
    organization: '',
    email: '',
  });
  const [contactErrors, setContactErrors] = useState<ContactCardErrors>({});

  // Status state
  const [statusText, setStatusText] = useState('');
  const [statusConfirming, setStatusConfirming] = useState(false);
  const [isSendingOutbound, setIsSendingOutbound] = useState(false);

  const { sendStatusMessage, isLoading } = useEvolutionApi();
  // 'Status/Story' publica para TODOS os contatos do número: a Edge nega
  // `send-status` a quem não é admin/supervisor, então a opção só aparece para eles.
  const { isSupervisor, loading: roleLoading } = useUserRole();
  const canPublishStatus = isSupervisor && !roleLoading;

  const filledPollOptions = useMemo(
    () => pollOptions.map((o) => o.value.trim()).filter((v) => v.length > 0),
    [pollOptions],
  );
  const maxSelectable = Math.max(1, filledPollOptions.length);
  // selectableCount sempre entre 1 e o número de opções PREENCHIDAS (o `max` do
  // input só limitava as setas; digitar 0 ou 99 ia direto para a fila).
  const selectableCount = Math.min(Math.max(1, pollSelectableCount), maxSelectable);

  const updatePollOption = useCallback((id: string, value: string) => {
    setPollOptions((prev) => prev.map((option) => (option.id === id ? { ...option, value } : option)));
  }, []);

  const removePollOption = useCallback((id: string) => {
    setPollOptions((prev) => prev.filter((option) => option.id !== id));
  }, []);

  const updateContactField = useCallback((field: keyof typeof contactCard, value: string) => {
    setContactCard((prev) => ({ ...prev, [field]: value }));
    setContactErrors((prev) => (prev[field as keyof ContactCardErrors] ? { ...prev, [field]: undefined } : prev));
  }, []);

  const handleSendSticker = useCallback(async () => {
    if (!isHttpsUrl(stickerUrl)) {
      toast.error('Informe uma URL https:// válida para a figurinha');
      return;
    }
    if (isSendingOutbound) return;
    setIsSendingOutbound(true);
    try {
      await sendOutboundMessage({
        contactId, content: '[Sticker]', messageType: 'sticker', mediaUrl: stickerUrl,
      });
      toast.success('Figurinha enviada!');
      setStickerUrl('');
      setStickerDialog(false);
    } catch {
      toast.error('Erro ao enviar figurinha');
    } finally {
      setIsSendingOutbound(false);
    }
  }, [contactId, stickerUrl, isSendingOutbound]);

  const handleSendPoll = useCallback(async () => {
    const validOptions = pollOptions.map((o) => o.value.trim()).filter((v) => v.length > 0);
    if (!pollName.trim() || validOptions.length < 2) {
      toast.error('Preencha o título e pelo menos 2 opções');
      return;
    }
    const normalized = validOptions.map((o) => o.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      toast.error('Remova as opções repetidas da enquete');
      return;
    }
    if (isSendingOutbound) return;
    setIsSendingOutbound(true);
    try {
      await sendRichOutboundMessage({
        contactId,
        displayContent: `📊 *Enquete:* ${pollName}\n${validOptions.map((option, index) => `${index + 1}. ${option}`).join('\n')}`,
        messageType: 'poll',
        deliveryPayload: { name: pollName, selectableCount, values: validOptions },
      });
      onPollSent?.({ name: pollName, options: validOptions, selectableCount });
      toast.success('Enquete enviada!');
      setPollName('');
      setPollOptions([newPollOption(), newPollOption()]);
      setPollSelectableCount(1);
      setPollDialog(false);
    } catch {
      toast.error('Erro ao enviar enquete');
    } finally {
      setIsSendingOutbound(false);
    }
  }, [contactId, pollName, pollOptions, selectableCount, onPollSent, isSendingOutbound]);

  const handleSendContact = useCallback(async () => {
    const errors: ContactCardErrors = {};
    if (!contactCard.fullName.trim()) {
      errors.fullName = 'Informe o nome completo.';
    }
    if (!isValidContactPhone(contactCard.phoneNumber)) {
      errors.phoneNumber = 'O telefone deve ter de 8 a 15 dígitos.';
    }
    if (contactCard.email.trim() && !isValidContactEmail(contactCard.email)) {
      errors.email = 'Informe um e-mail válido.';
    }
    setContactErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (isSendingOutbound) return;
    setIsSendingOutbound(true);
    try {
      await sendRichOutboundMessage({
        contactId,
        displayContent: `📇 Cartão de contato: ${contactCard.fullName}`,
        messageType: 'contact',
        deliveryPayload: {
          fullName: contactCard.fullName,
          phoneNumber: contactCard.phoneNumber,
          ...(contactCard.organization ? { organization: contactCard.organization } : {}),
          ...(contactCard.email ? { email: contactCard.email } : {}),
        },
      });
      onContactSent?.(contactCard.fullName);
      toast.success('Cartão de contato enviado!');
      setContactCard({ fullName: '', phoneNumber: '', organization: '', email: '' });
      setContactErrors({});
      setContactDialog(false);
    } catch {
      toast.error('Erro ao enviar contato');
    } finally {
      setIsSendingOutbound(false);
    }
  }, [contactId, contactCard, onContactSent, isSendingOutbound]);

  const handleSendStatus = useCallback(async () => {
    if (!statusText.trim()) return;
    try {
      await sendStatusMessage(instanceName, { type: 'text', content: statusText });
      toast.success('Status publicado!');
      setStatusText('');
      setStatusConfirming(false);
      setStatusDialog(false);
    } catch {
      toast.error('Erro ao publicar status');
    }
  }, [statusText, instanceName, sendStatusMessage]);

  const menuItems = useCallback(() => {
    const items = [
      { icon: Sticker, label: 'Figurinha', onClick: () => { setPopoverOpen(false); setStickerDialog(true); } },
      { icon: BarChart3, label: 'Enquete', onClick: () => { setPopoverOpen(false); setPollDialog(true); } },
      { icon: Contact2, label: 'Cartão de Contato', onClick: () => { setPopoverOpen(false); setContactDialog(true); } },
    ];
    if (canPublishStatus) {
      items.push({ icon: Radio, label: 'Status/Story', onClick: () => { setPopoverOpen(false); setStatusDialog(true); } });
    }
    return items;
  }, [canPublishStatus]);

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" title="Mais opções de mensagem" aria-label="Mais opções de mensagem">
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
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sticker className="w-5 h-5 text-primary" />
              Enviar Figurinha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sticker-url">URL da figurinha (imagem/webp)</Label>
              <Input
                id="sticker-url"
                value={stickerUrl}
                onChange={(e) => setStickerUrl(e.target.value)}
                placeholder="https://exemplo.com/sticker.webp"
                aria-invalid={stickerUrl.trim().length > 0 && !isHttpsUrl(stickerUrl) ? true : undefined}
                aria-describedby={stickerUrl.trim().length > 0 && !isHttpsUrl(stickerUrl) ? 'sticker-url-error' : undefined}
              />
              {stickerUrl.trim().length > 0 && !isHttpsUrl(stickerUrl) && (
                <p id="sticker-url-error" className="text-xs text-destructive mt-1">
                  Use uma URL que comece com https:// (ex.: https://exemplo.com/sticker.webp).
                </p>
              )}
            </div>
            {isHttpsUrl(stickerUrl) && (
              <img
                src={stickerUrl}
                alt="Prévia da figurinha"
                className="max-h-32 mx-auto rounded-lg border border-border/60"
              />
            )}
            <Button onClick={handleSendSticker} disabled={isSendingOutbound || !isHttpsUrl(stickerUrl)} className="w-full">
              <Send className="w-4 h-4 mr-2" /> Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Poll Dialog */}
      <Dialog open={pollDialog} onOpenChange={setPollDialog}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Criar Enquete
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="poll-name">Pergunta</Label>
              <Input
                id="poll-name"
                value={pollName}
                onChange={(e) => setPollName(e.target.value)}
                placeholder="Qual horário preferem?"
              />
            </div>
            <div>
              <Label htmlFor="poll-selectable">Seleções permitidas</Label>
              <Input
                id="poll-selectable"
                type="number"
                min={1}
                max={maxSelectable}
                value={selectableCount}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (!Number.isFinite(raw)) return;
                  setPollSelectableCount(Math.min(Math.max(1, Math.trunc(raw)), maxSelectable));
                }}
                className="w-20"
              />
            </div>
            <div className="space-y-2">
              <Label>Opções</Label>
              {pollOptions.map((opt, i) => (
                <div key={opt.id} className="flex gap-2">
                  <Input
                    value={opt.value}
                    aria-label={`Opção ${i + 1} da enquete`}
                    onChange={(e) => updatePollOption(opt.id, e.target.value)}
                    placeholder={`Opção ${i + 1}`}
                  />
                  {pollOptions.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover opção ${i + 1}`}
                      onClick={() => removePollOption(opt.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              {pollOptions.length < 12 && (
                <Button variant="outline" size="sm" onClick={() => setPollOptions((prev) => [...prev, newPollOption()])}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar opção
                </Button>
              )}
            </div>
            <Button onClick={handleSendPoll} disabled={isSendingOutbound} className="w-full">
              <Send className="w-4 h-4 mr-2" /> Enviar Enquete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact Card Dialog */}
      <Dialog
        open={contactDialog}
        onOpenChange={(open) => {
          setContactDialog(open);
          if (!open) setContactErrors({});
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Contact2 className="w-5 h-5 text-primary" />
              Enviar Cartão de Contato
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="contact-full-name">Nome completo *</Label>
              <Input
                id="contact-full-name"
                value={contactCard.fullName}
                onChange={(e) => updateContactField('fullName', e.target.value)}
                placeholder="João Silva"
                aria-invalid={contactErrors.fullName ? true : undefined}
                aria-describedby={contactErrors.fullName ? 'contact-full-name-error' : undefined}
              />
              {contactErrors.fullName && (
                <p id="contact-full-name-error" role="alert" className="text-xs text-destructive mt-1">
                  {contactErrors.fullName}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="contact-phone">Telefone *</Label>
              <Input
                id="contact-phone"
                value={contactCard.phoneNumber}
                onChange={(e) => updateContactField('phoneNumber', e.target.value)}
                placeholder="5511999999999"
                aria-invalid={contactErrors.phoneNumber ? true : undefined}
                aria-describedby={contactErrors.phoneNumber ? 'contact-phone-error' : undefined}
              />
              {contactErrors.phoneNumber && (
                <p id="contact-phone-error" role="alert" className="text-xs text-destructive mt-1">
                  {contactErrors.phoneNumber}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="contact-organization">Empresa</Label>
              <Input
                id="contact-organization"
                value={contactCard.organization}
                onChange={(e) => updateContactField('organization', e.target.value)}
                placeholder="Empresa XYZ"
              />
            </div>
            <div>
              <Label htmlFor="contact-email">E-mail</Label>
              <Input
                id="contact-email"
                value={contactCard.email}
                onChange={(e) => updateContactField('email', e.target.value)}
                placeholder="joao@empresa.com"
                aria-invalid={contactErrors.email ? true : undefined}
                aria-describedby={contactErrors.email ? 'contact-email-error' : undefined}
              />
              {contactErrors.email && (
                <p id="contact-email-error" role="alert" className="text-xs text-destructive mt-1">
                  {contactErrors.email}
                </p>
              )}
            </div>
            <Button onClick={handleSendContact} disabled={isSendingOutbound} className="w-full">
              <Send className="w-4 h-4 mr-2" /> Enviar Contato
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Dialog — só para admin/supervisor (a Edge nega send-status aos demais) */}
      {canPublishStatus && (
        <Dialog
          open={statusDialog}
          onOpenChange={(open) => {
            setStatusDialog(open);
            if (!open) setStatusConfirming(false);
          }}
        >
          <DialogContent aria-describedby={undefined} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                Publicar Status/Story
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="status-text">Texto do status</Label>
                <Textarea
                  id="status-text"
                  value={statusText}
                  onChange={(e) => {
                    setStatusText(e.target.value);
                    setStatusConfirming(false);
                  }}
                  placeholder="Seu status aqui..."
                  rows={4}
                />
              </div>
              {statusConfirming ? (
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-3">
                  <p className="text-sm text-muted-foreground">
                    Esta publicação será vista por todos os seus contatos do número selecionado — não só por esta conversa.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setStatusConfirming(false)}>
                      Voltar
                    </Button>
                    <Button className="flex-1" onClick={handleSendStatus} disabled={isLoading}>
                      <Send className="w-4 h-4 mr-2" /> Publicar para todos
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setStatusConfirming(true)} disabled={isLoading || !statusText.trim()} className="w-full">
                  <Send className="w-4 h-4 mr-2" /> Publicar
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
