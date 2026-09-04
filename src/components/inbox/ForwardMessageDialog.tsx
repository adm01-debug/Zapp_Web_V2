import { motion, AnimatePresence } from 'framer-motion';
import { Forward, Search, Users, User, Check, MessageSquare, Phone, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { useForwardMessage } from '@/hooks/chat/useForwardMessage';

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  onForward: (targetIds: string[], targetType: 'contact' | 'group') => void;
}

function truncateMessage(content: string, maxLength = 100) {
  return content.length <= maxLength ? content : content.slice(0, maxLength) + '...';
}

export function ForwardMessageDialog({ open, onOpenChange, message, onForward }: ForwardMessageDialogProps) {
  const fwd = useForwardMessage(open, onForward, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={fwd.handleClose}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Forward className="w-5 h-5 text-primary" />
            Encaminhar Mensagem
          </DialogTitle>
          <DialogDescription>Selecione contatos ou grupos para encaminhar</DialogDescription>
        </DialogHeader>

        {message && (
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="contacts" className="gap-2">
              <User className="w-4 h-4" />
              Contatos
              {fwd.selectedContacts.length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">{fwd.selectedContacts.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2">
              <Users className="w-4 h-4" />
              Grupos
              {fwd.selectedGroups.length > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5">{fwd.selectedGroups.length}</Badge>}
            </TabsTrigger>
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
                            <AvatarImage src={contact.avatar_url} />
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
                            <AvatarImage src={group.avatar_url} />
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
        </Tabs>

        <DialogFooter className="p-4 pt-3 border-t border-border flex-row justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {fwd.totalSelected > 0 ? <span className="text-foreground font-medium">{fwd.totalSelected} {fwd.totalSelected === 1 ? 'selecionado' : 'selecionados'}</span> : 'Selecione destinatários'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fwd.handleClose}>Cancelar</Button>
            <Button onClick={fwd.handleForward} disabled={fwd.totalSelected === 0 || fwd.isSending} className="gap-2">
              {fwd.isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Encaminhar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
