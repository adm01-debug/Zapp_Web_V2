import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InviteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteAgentDialog({ open, onOpenChange }: InviteAgentDialogProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('agent');
  const [isSending, setIsSending] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error('Email é obrigatório');
      return;
    }

    setIsSending(true);
    try {
      // Send invite email via edge function
      const { error } = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: 'Convite para a plataforma ZAPP',
          html: `
            <h2>Você foi convidado!</h2>
            <p>Olá ${name || 'colega'},</p>
            <p>Você foi convidado para participar da plataforma ZAPP como <strong>${
              role === 'admin' ? 'Administrador' : role === 'supervisor' ? 'Supervisor' : 'Atendente'
            }</strong>.</p>
            <p>Acesse a plataforma e crie sua conta para começar.</p>
          `,
        },
      });

      if (error) throw error;

      toast.success(`Convite enviado para ${email}!`);
      setEmail('');
      setName('');
      setRole('agent');
      onOpenChange(false);
    } catch (err) {
      toast.error('Erro ao enviar convite. Verifique a configuração de email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Convidar Agente
          </DialogTitle>
          <DialogDescription>
            Envie um convite por email para um novo membro da equipe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do agente"
            />
          </div>

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agente@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Cargo</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Atendente</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleInvite} disabled={isSending}>
            {isSending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            Enviar Convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
