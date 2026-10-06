import { useCallback, useEffect, useState } from 'react';
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
import { Loader2, Mail, UserPlus, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface InviteAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AgentInviteRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

interface CreateInviteResponse {
  ok: boolean;
  error?: string;
  invite_id?: string;
  code?: string;
  role?: string;
  email?: string;
  expires_at?: string;
  existing_account?: boolean;
}

interface CreatedInvite {
  code: string;
  email: string;
  role: string;
  expires_at: string;
  existing_account: boolean;
}

type RpcResult<T> = { data: T | null; error: { message: string } | null };

// R2-AUTH-015: as RPCs do convite nasceram depois do último retrato de tipos
// (src/integrations/supabase/types.ts é gerado do banco e sai do escopo deste cartão).
const callRpc = supabase.rpc.bind(supabase) as unknown as <T>(
  fn: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult<T>>;

const ROLE_LABEL: Record<string, string> = {
  agent: 'Atendente',
  supervisor: 'Supervisor',
  admin: 'Administrador',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  used: 'Usado',
  expired: 'Expirado',
  revoked: 'Revogado',
};

const ERROR_MESSAGE: Record<string, string> = {
  already_pending: 'Já existe um convite pendente para este e-mail.',
  not_authorized: 'Você não tem permissão para convidar com este cargo.',
  invalid_email: 'E-mail inválido.',
  invalid_role: 'Cargo inválido.',
  not_authenticated: 'Sessão expirada. Entre novamente para convidar.',
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
};

export function InviteAgentDialog({ open, onOpenChange }: InviteAgentDialogProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('agent');
  const [isSending, setIsSending] = useState(false);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [invites, setInvites] = useState<AgentInviteRow[]>([]);

  const applyInvites = useCallback((result: RpcResult<AgentInviteRow[]>) => {
    if (result.error) {
      // não finge lista vazia: o operador precisa saber que a leitura falhou
      toast.error('Não foi possível carregar os convites.');
      return;
    }
    setInvites(Array.isArray(result.data) ? result.data : []);
  }, []);

  const loadInvites = useCallback(
    () =>
      callRpc<AgentInviteRow[]>('list_agent_invites', { p_limit: 20 }).then(
        applyInvites,
        () => applyInvites({ data: null, error: { message: 'network' } }),
      ),
    [applyInvites],
  );

  useEffect(() => {
    if (!open) return;
    void loadInvites();
  }, [open, loadInvites]);

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast.error('Não foi possível copiar o código.');
    }
  };

  const handleInvite = async () => {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail) {
      toast.error('Email é obrigatório');
      return;
    }

    setIsSending(true);
    try {
      // 1) Cria o convite de verdade: destinatário, papel autorizado, validade e consumo único.
      // Sem convite criado não há convite para anunciar.
      const { data, error } = await callRpc<CreateInviteResponse>('create_agent_invite', {
        p_email: trimmedEmail,
        p_name: trimmedName || null,
        p_role: role,
        p_expires_hours: 72,
      });

      if (error) {
        toast.error('Não foi possível criar o convite. Verifique se você tem permissão.');
        return;
      }

      if (!data?.ok) {
        toast.error(ERROR_MESSAGE[data?.error ?? ''] ?? 'Não foi possível criar o convite.');
        return;
      }

      // 2) O convite existe: mostra o código para o operador repassar e só então tenta o e-mail.
      setCreated({
        code: data.code ?? '',
        email: data.email ?? trimmedEmail,
        role: data.role ?? role,
        expires_at: data.expires_at ?? '',
        existing_account: data.existing_account === true,
      });
      setEmail('');
      setName('');
      setRole('agent');
      void loadInvites();

      // Send invite email via edge function. O relay `send-email` autoriza a chamada
      // (JWT + admin/supervisor) e deriva remetente, assunto e corpo de um template do
      // servidor: o cliente só informa e-mail, nome e cargo (sem subject/html arbitrários).
      const { error: emailError } = await supabase.functions.invoke('send-email', {
        body: {
          email: trimmedEmail,
          name: trimmedName || undefined,
          role,
        },
      });

      if (emailError) {
        toast.warning(`Convite criado, mas o e-mail não pôde ser enviado. Repasse o código ${data.code}.`);
      } else {
        toast.success(`Convite criado para ${trimmedEmail}.`);
      }
    } catch (err) {
      toast.error('Erro ao criar o convite. Verifique a configuração de email.');
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
            Crie um convite de uso único com validade, para um novo membro da equipe
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

          {created && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Convite pendente</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {ROLE_LABEL[created.role] ?? created.role}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-base font-bold tracking-widest text-foreground">
                  {created.code}
                </code>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => void handleCopy(created.code)}
                  aria-label="Copiar código"
                >
                  {copiedCode === created.code ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {created.email} · válido até {formatDate(created.expires_at)} · uso único
              </p>
              {created.existing_account && (
                <p className="text-xs text-muted-foreground">
                  Este e-mail já tem conta; o papel será ajustado na aceitação.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">Convites</span>
            {invites.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum convite registrado</p>
            ) : (
              <ul className="space-y-1">
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/40 px-2 py-1.5"
                  >
                    <span className="truncate text-xs text-foreground">{invite.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ROLE_LABEL[invite.role] ?? invite.role} ·{' '}
                      {STATUS_LABEL[invite.status] ?? invite.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
