import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MessageSquarePlus, Send, Loader2, UserPlus, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useNewConversation } from '@/hooks/chat/useNewConversation';

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationStarted?: (contactId: string) => void;
}

export function NewConversationModal({ open, onOpenChange, onConversationStarted }: NewConversationModalProps) {
  const {
    searchQuery, setSearchQuery, contacts, selectedContact, setSelectedContact,
    newPhone, setNewPhone, newName, setNewName, messageText, setMessageText,
    isLoading, isSending, mode, setMode, connections, selectedConnection,
    setSelectedConnection, handleSend, resetForm,
  } = useNewConversation(open, onConversationStarted, () => onOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            Nova Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={mode === 'search' ? 'default' : 'outline'} size="sm"
              onClick={() => { setMode('search'); setSelectedContact(null); }}
              className={cn(mode === 'search' && 'bg-primary')}>
              <Search className="w-4 h-4 mr-1" />Contato existente
            </Button>
            <Button variant={mode === 'new' ? 'default' : 'outline'} size="sm"
              onClick={() => { setMode('new'); setSelectedContact(null); }}
              className={cn(mode === 'new' && 'bg-primary')}>
              <UserPlus className="w-4 h-4 mr-1" />Novo contato
            </Button>
          </div>

          {connections.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Conexão WhatsApp</Label>
              <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {connections.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{c.name}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'search' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou telefone..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              {isLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : contacts.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {contacts.map((contact) => (
                    <motion.button key={contact.id} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedContact(contact)}
                      className={cn('w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left',
                        selectedContact?.id === contact.id ? 'border-primary bg-primary/5' : 'border-border/30 hover:border-primary/30')}>
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={contact.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{contact.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : searchQuery.trim() ? (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum contato encontrado</p>
              ) : null}
            </div>
          )}

          {mode === 'new' && (
            <div className="space-y-3">
              <div><Label className="text-xs">Telefone *</Label><Input placeholder="+5511999999999" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></div>
              <div><Label className="text-xs">Nome (opcional)</Label><Input placeholder="Nome do contato" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Mensagem</Label>
            <Textarea placeholder="Digite a primeira mensagem..." value={messageText} onChange={(e) => setMessageText(e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSend}
              disabled={isSending || (!selectedContact && mode === 'search') || (!newPhone.trim() && mode === 'new') || !messageText.trim()}
              className="bg-primary hover:bg-primary/90">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
