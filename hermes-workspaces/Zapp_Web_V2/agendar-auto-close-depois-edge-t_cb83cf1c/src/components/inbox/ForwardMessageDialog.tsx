import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Forward, Search, Users, User, Check, MessageSquare, Phone, Send, Loader2, Paperclip, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { useForwardMessage, type ForwardCallback } from '@/hooks/chat/useForwardMessage';
import type { ForwardMediaItem } from '@/hooks/chat/useForwardMedia';
import { forwardConfirmMessage, forwardLimitError, needsForwardConfirmation } from '@/lib/forward-limits';

export interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Caminho do chat: uma mensagem. */
  message?: Message | null;
  /** Caminho da aba Arquivos (etapa 38): um ou mais itens da seleção. */
  items?: ForwardMediaItem[];
  /** Etapa 36: `'contacts'` esconde a aba Grupos (o RPC de envio só aceita contato). */
  targets?: 'contacts' | 'all';
  /**
   * Etapa 37: devolve `Promise<ForwardResult>` com sucesso/falha por destino. O caminho
   * legado do chat devolve `void` e o diálogo fecha como antes.
   */
  onForward: ForwardCallback;
}

function truncateMessage(content: string, maxLength = 100) {
  return content.length <= maxLength ? content : content.slice(0, maxLength) + '...';
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  items,
  targets = 'all',
  onForward,
}: ForwardMessageDialogProps) {
  const allowGroups = targets !== 'contacts';
  const itemCount = items && items.length > 0 ? items.length : 1;
  const fwd = useForwardMessage({ open, allowGroups, itemCount, onForward, onOpenChange });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const limitReason = forwardLimitError(itemCount, fwd.totalSelected);
  const limitBlocked = limitReason !== null;

  const handleSubmit = () => {
    if (limitBlocked || fwd.totalSelected === 0) return;
    if (needsForwardConfirmation(itemCount, fwd.totalSelected)) {
      setConfirmOpen(true);
      return;
    }
    void fwd.handleForward();
  };

  const confirmAndSend = () => {
    setConfirmOpen(false);
    void fwd.handleForward();
  };

  const nonForwardable = fwd.lastResult?.nonForwardable ?? [];
  const itemName = (itemId: string) => items?.find((item) => item.id === itemId)?.filename ?? itemId;

  return (
    <>
      <Dialog open={open} onOpenChange={fwd.handleClose}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <Forward className="w-5 h-5 text-primary" />
              Encaminhar Mensagem
            </DialogTitle>
            <DialogDescription>
              {items && items.length > 0
                ? 'Selecione os contatos que devem receber os arquivos selecionados'
                : 'Selecione contatos ou grupos para encaminhar'}
            </DialogDescription>
          </DialogHeader>

          {items && items.length > 0 && (
            <div className="px-4 py-3 bg-muted/50 border-b border-border">
              <div className="flex items-start gap-2">
                <Paperclip className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {items.length === 1 ? items[0].filename : `${items.length} arquivos selecionados`}
                  </p>
                  {items.length > 1 && (
                    <p className="text-xs text-muted-foreground truncate">
                      {items.slice(0, 3).map((item) => item.filename).join(' · ')}
                      {items.length > 3 ? ' · …' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {(!items || items.length === 0) && message && (
            <div className="px-4 py-3 bg-muted/50 border-b border-border">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-foreground line-clamp-2">
                  {message.type === 'image' && '📷 Imagem'}
                  {message.type === 'audio' && '🎤 Áudio'}
                  {message.type === 'video' && '🎬 Vídeo'}
                  {message.type === 'document' && '📄 Documento'}
                  {(message.type === 'text' || message.type === 'interactive') && truncateMessage(message.content)}
                </p>
              </div>
            </div>
          )}

          <div className="p-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar contatos ou grupos..." value={fwd.searchQuery} onChange={(e) => fwd.setSearchQuery(e.target.value)} className="pl-9" />
            </div>
          </div>

          <Tabs value={fwd.activeTab} onValueChange={(v) => fwd.setActiveTab(v as 'contacts' | 'groups')} className="px-4">
            <TabsList className={cn('grid w-full', allowGroups ? 'grid-cols-2' : 'grid-cols-1')}>
              <TabsTrigger value="contacts" className="gap-2">
                <User className="w-4 h-4" />
                Contatos
                {fwd.selectedContacts.length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">{fwd.selectedContacts.length}</Badge>}
              </TabsTrigger>
              {allowGroups && (
                <TabsTrigger value="groups" className="gap-2">
                  <Users className="w-4 h-4" />
                  Grupos
                  {fwd.selectedGroups.length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">{fwd.selectedGroups.length}</Badge>}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="contacts" className="mt-2">
              <ScrollArea className="h-[300px]">
                {fwd.isLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : fwd.filteredContacts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground"><User className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhum contato encontrado</p></div>
                ) : (
                  <div className="space-y-1">
                    <AnimatePresence>
                      {fwd.filteredContacts.map((contact, i) => {
                        const isSelected = fwd.selectedContacts.includes(contact.id);
                        return (
                          <motion.button key={contact.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                            onClick={() => fwd.toggleContact(contact.id)}
                            className={cn("w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left", isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/80 border border-transparent")}
                          >
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={contact.avatar_url} alt={contact.name || 'Avatar'} />
                              <AvatarFallback className="bg-primary/10 text-primary text-sm">{contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{contact.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{contact.phone}</p>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {allowGroups && (
              <TabsContent value="groups" className="mt-2">
                <ScrollArea className="h-[300px]">
                  {fwd.filteredGroups.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground"><Users className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhum grupo encontrado</p></div>
                  ) : (
                    <div className="space-y-1">
                      <AnimatePresence>
                        {fwd.filteredGroups.map((group, i) => {
                          const isSelected = fwd.selectedGroups.includes(group.id);
                          return (
                            <motion.button key={group.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                              onClick={() => fwd.toggleGroup(group.id)}
                              className={cn("w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left", isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/80 border border-transparent")}
                            >
                              <Checkbox checked={isSelected} className="pointer-events-none" />
                              <Avatar className="w-10 h-10">
                                <AvatarImage src={group.avatar_url} alt={group.name || 'Grupo'} />
                                <AvatarFallback className="bg-secondary text-secondary-foreground text-sm"><Users className="w-5 h-5" /></AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{group.name}</p>
                                <p className="text-xs text-muted-foreground">{group.participant_count} participantes</p>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>

          {/* Etapa 38: progresso "X/Y enviados" honesto, anunciado para leitores de tela. */}
          {fwd.progress && (
            <p className="px-4 pt-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {fwd.progress.done}/{fwd.progress.total} enviados
            </p>
          )}

          {/* Etapa 37: resultado parcial honesto, com retry só dos destinos que falharam. */}
          {(fwd.failedTargets.length > 0 || nonForwardable.length > 0) && (
            <div className="mx-4 mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2" data-testid="forward-partial-failures">
              {fwd.failedTargets.length > 0 && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">Falhou em:</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {fwd.failedTargets.map((target) => target.name).join(', ')}
                    </p>
                  </div>
                </div>
              )}
              {nonForwardable.length > 0 && (
                <div className="min-w-0">
                  <p className="text-sm text-foreground">Não encaminháveis:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {nonForwardable.map((entry) => (
                      <li key={entry.itemId} className="truncate">{itemName(entry.itemId)} — {entry.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {fwd.failedTargets.length > 0 && (
                <Button type="button" size="sm" variant="outline" className="h-8 gap-2" onClick={() => void fwd.retryFailed()} disabled={fwd.isSending}>
                  {fwd.isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Tentar novamente só os que falharam
                </Button>
              )}
            </div>
          )}

          <DialogFooter className="p-4 pt-3 border-t border-border flex-row justify-between items-center">
            <div className="text-sm text-muted-foreground min-w-0">
              {limitReason ? (
                <span className="text-destructive">{limitReason}</span>
              ) : fwd.totalSelected > 0 ? (
                <span className="text-foreground font-medium">{fwd.totalSelected} {fwd.totalSelected === 1 ? 'selecionado' : 'selecionados'}</span>
              ) : (
                'Selecione destinatários'
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={fwd.handleClose}>Cancelar</Button>
              <Button
                onClick={handleSubmit}
                disabled={fwd.totalSelected === 0 || fwd.isSending || limitBlocked}
                title={limitReason ?? undefined}
                className="gap-2"
              >
                {fwd.isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Encaminhar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Etapa 39: confirmação explícita a partir de 20 envios. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar encaminhamento</AlertDialogTitle>
            <AlertDialogDescription>
              {forwardConfirmMessage(itemCount, fwd.totalSelected)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAndSend}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
