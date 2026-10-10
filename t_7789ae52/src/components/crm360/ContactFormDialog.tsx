/**
 * ContactFormDialog — Modal for creating/editing contacts in the external CRM DB
 */
import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExternalMutation } from '@/hooks/integrations/useExternalDB';
import { toast } from 'sonner';
import { Users, Save, Loader2 } from 'lucide-react';

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Record<string, unknown> | null;
  onSuccess?: () => void;
}

const EMPTY_CONTACT = {
  first_name: '',
  last_name: '',
  nome_tratamento: '',
  apelido: '',
  cargo: '',
  departamento: '',
  cpf: '',
  data_nascimento: '',
  sexo: '',
  relationship_stage: '',
  relationship_score: '',
  sentiment: '',
  source: '',
  notes: '',
  assinatura_contato: '',
};

const STAGE_OPTIONS = ['lead', 'prospect', 'qualificado', 'cliente', 'parceiro', 'inativo'];
const SENTIMENT_OPTIONS = ['positivo', 'neutro', 'negativo'];
const SEXO_OPTIONS = ['M', 'F', 'Outro'];

export function ContactFormDialog({ open, onOpenChange, contact, onSuccess }: ContactFormDialogProps) {
  const isEdit = !!contact;
  const mutation = useExternalMutation();
  const [form, setForm] = useState(EMPTY_CONTACT);

  useEffect(() => {
    if (contact) {
      setForm({
        first_name: String(contact.first_name || ''),
        last_name: String(contact.last_name || ''),
        nome_tratamento: String(contact.nome_tratamento || ''),
        apelido: String(contact.apelido || ''),
        cargo: String(contact.cargo || ''),
        departamento: String(contact.departamento || ''),
        cpf: String(contact.cpf || ''),
        data_nascimento: String(contact.data_nascimento || ''),
        sexo: String(contact.sexo || ''),
        relationship_stage: String(contact.relationship_stage || ''),
        relationship_score: contact.relationship_score != null ? String(contact.relationship_score) : '',
        sentiment: String(contact.sentiment || ''),
        source: String(contact.source || ''),
        notes: String(contact.notes || ''),
        assinatura_contato: String(contact.assinatura_contato || ''),
      });
    } else {
      setForm(EMPTY_CONTACT);
    }
  }, [contact, open]);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.first_name.trim()) {
      toast.error('O primeiro nome é obrigatório.');
      return;
    }

    const payload: Record<string, unknown> = {
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      full_name: [form.first_name, form.last_name].filter(Boolean).join(' ') || null,
      nome_tratamento: form.nome_tratamento || null,
      apelido: form.apelido || null,
      cargo: form.cargo || null,
      departamento: form.departamento || null,
      cpf: form.cpf || null,
      data_nascimento: form.data_nascimento || null,
      sexo: form.sexo || null,
      relationship_stage: form.relationship_stage || null,
      relationship_score: form.relationship_score ? Number(form.relationship_score) : 0,
      sentiment: form.sentiment || null,
      source: form.source || null,
      notes: form.notes || null,
      assinatura_contato: form.assinatura_contato || null,
    };

    try {
      if (isEdit && contact?.id) {
        await mutation.mutateAsync({
          action: 'update',
          table: 'contacts',
          data: payload,
          match: { id: contact.id },
        });
        toast.success('Contato atualizado com sucesso!');
      } else {
        await mutation.mutateAsync({
          action: 'insert',
          table: 'contacts',
          data: payload,
        });
        toast.success('Contato criado com sucesso!');
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {isEdit ? 'Editar Contato' : 'Novo Contato'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Altere os dados do contato no CRM externo.' : 'Cadastre um novo contato no CRM externo.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {/* Primeiro Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="first_name">Primeiro Nome *</Label>
              <Input id="first_name" value={form.first_name} onChange={e => handleChange('first_name', e.target.value)} placeholder="Nome" />
            </div>

            {/* Sobrenome */}
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Sobrenome</Label>
              <Input id="last_name" value={form.last_name} onChange={e => handleChange('last_name', e.target.value)} placeholder="Sobrenome" />
            </div>

            {/* Nome de Tratamento */}
            <div className="space-y-1.5">
              <Label htmlFor="nome_tratamento">Nome de Tratamento</Label>
              <Input id="nome_tratamento" value={form.nome_tratamento} onChange={e => handleChange('nome_tratamento', e.target.value)} placeholder="Como prefere ser chamado" />
            </div>

            {/* Apelido */}
            <div className="space-y-1.5">
              <Label htmlFor="apelido">Apelido</Label>
              <Input id="apelido" value={form.apelido} onChange={e => handleChange('apelido', e.target.value)} placeholder="Apelido" />
            </div>

            {/* Cargo */}
            <div className="space-y-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" value={form.cargo} onChange={e => handleChange('cargo', e.target.value)} placeholder="Ex: Diretor Comercial" />
            </div>

            {/* Departamento */}
            <div className="space-y-1.5">
              <Label htmlFor="departamento">Departamento</Label>
              <Input id="departamento" value={form.departamento} onChange={e => handleChange('departamento', e.target.value)} placeholder="Ex: Comercial" />
            </div>

            {/* CPF */}
            <div className="space-y-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" value={form.cpf} onChange={e => handleChange('cpf', e.target.value)} placeholder="000.000.000-00" />
            </div>

            {/* Data de Nascimento */}
            <div className="space-y-1.5">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input id="data_nascimento" type="date" value={form.data_nascimento} onChange={e => handleChange('data_nascimento', e.target.value)} />
            </div>

            {/* Sexo */}
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              <Select value={form.sexo} onValueChange={v => handleChange('sexo', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SEXO_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{s === 'M' ? 'Masculino' : s === 'F' ? 'Feminino' : 'Outro'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estágio de Relacionamento */}
            <div className="space-y-1.5">
              <Label>Estágio</Label>
              <Select value={form.relationship_stage} onValueChange={v => handleChange('relationship_stage', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Score */}
            <div className="space-y-1.5">
              <Label htmlFor="relationship_score">Score de Relacionamento</Label>
              <Input id="relationship_score" type="number" min="0" max="100" value={form.relationship_score} onChange={e => handleChange('relationship_score', e.target.value)} placeholder="0-100" />
            </div>

            {/* Sentimento */}
            <div className="space-y-1.5">
              <Label>Sentimento</Label>
              <Select value={form.sentiment} onValueChange={v => handleChange('sentiment', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SENTIMENT_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Origem */}
            <div className="space-y-1.5">
              <Label htmlFor="source">Origem</Label>
              <Input id="source" value={form.source} onChange={e => handleChange('source', e.target.value)} placeholder="Ex: Site, Indicação..." />
            </div>

            {/* Assinatura */}
            <div className="space-y-1.5">
              <Label htmlFor="assinatura_contato">Assinatura</Label>
              <Input id="assinatura_contato" value={form.assinatura_contato} onChange={e => handleChange('assinatura_contato', e.target.value)} placeholder="Assinatura do contato" />
            </div>

            {/* Notas - full width */}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" value={form.notes} onChange={e => handleChange('notes', e.target.value)} placeholder="Observações sobre este contato..." rows={3} />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isEdit ? 'Salvar Alterações' : 'Criar Contato'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
