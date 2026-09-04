/**
 * CompanyFormDialog — Modal for creating/editing companies in the external CRM DB
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
import { Building2, Save, Loader2 } from 'lucide-react';

interface CompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: Record<string, unknown> | null; // null = create mode
  onSuccess?: () => void;
}

const EMPTY_COMPANY = {
  nome_fantasia: '',
  razao_social: '',
  cnpj: '',
  inscricao_estadual: '',
  website: '',
  ramo_atividade: '',
  status: 'ativo',
  nicho_cliente: '',
  porte_rf: '',
  natureza_juridica_desc: '',
  capital_social: '',
  data_fundacao: '',
};

const STATUS_OPTIONS = ['ativo', 'inativo', 'prospecto', 'suspenso'];
const PORTE_OPTIONS = ['MEI', 'ME', 'EPP', 'Médio', 'Grande'];

export function CompanyFormDialog({ open, onOpenChange, company, onSuccess }: CompanyFormDialogProps) {
  const isEdit = !!company;
  const mutation = useExternalMutation();
  const [form, setForm] = useState(EMPTY_COMPANY);

  useEffect(() => {
    if (company) {
      setForm({
        nome_fantasia: String(company.nome_fantasia || ''),
        razao_social: String(company.razao_social || ''),
        cnpj: String(company.cnpj || ''),
        inscricao_estadual: String(company.inscricao_estadual || ''),
        website: String(company.website || ''),
        ramo_atividade: String(company.ramo_atividade || ''),
        status: String(company.status || 'ativo'),
        nicho_cliente: String(company.nicho_cliente || ''),
        porte_rf: String(company.porte_rf || ''),
        natureza_juridica_desc: String(company.natureza_juridica_desc || ''),
        capital_social: company.capital_social != null ? String(company.capital_social) : '',
        data_fundacao: String(company.data_fundacao || ''),
      });
    } else {
      setForm(EMPTY_COMPANY);
    }
  }, [company, open]);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.nome_fantasia.trim() && !form.razao_social.trim()) {
      toast.error('Preencha pelo menos o Nome Fantasia ou Razão Social.');
      return;
    }

    const payload: Record<string, unknown> = {
      nome_fantasia: form.nome_fantasia || null,
      razao_social: form.razao_social || null,
      cnpj: form.cnpj || null,
      inscricao_estadual: form.inscricao_estadual || null,
      website: form.website || null,
      ramo_atividade: form.ramo_atividade || null,
      status: form.status || null,
      nicho_cliente: form.nicho_cliente || null,
      porte_rf: form.porte_rf || null,
      natureza_juridica_desc: form.natureza_juridica_desc || null,
      capital_social: form.capital_social ? Number(form.capital_social) : null,
      data_fundacao: form.data_fundacao || null,
    };

    try {
      if (isEdit && company?.id) {
        await mutation.mutateAsync({
          action: 'update',
          table: 'companies',
          data: payload,
          match: { id: company.id },
        });
        toast.success('Empresa atualizada com sucesso!');
      } else {
        await mutation.mutateAsync({
          action: 'insert',
          table: 'companies',
          data: payload,
        });
        toast.success('Empresa criada com sucesso!');
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
            <Building2 className="h-5 w-5 text-primary" />
            {isEdit ? 'Editar Empresa' : 'Nova Empresa'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Altere os dados da empresa no CRM externo.' : 'Cadastre uma nova empresa no CRM externo.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {/* Nome Fantasia */}
            <div className="space-y-1.5">
              <Label htmlFor="nome_fantasia">Nome Fantasia *</Label>
              <Input id="nome_fantasia" value={form.nome_fantasia} onChange={e => handleChange('nome_fantasia', e.target.value)} placeholder="Nome fantasia da empresa" />
            </div>

            {/* Razão Social */}
            <div className="space-y-1.5">
              <Label htmlFor="razao_social">Razão Social</Label>
              <Input id="razao_social" value={form.razao_social} onChange={e => handleChange('razao_social', e.target.value)} placeholder="Razão social completa" />
            </div>

            {/* CNPJ */}
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" value={form.cnpj} onChange={e => handleChange('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
            </div>

            {/* Inscrição Estadual */}
            <div className="space-y-1.5">
              <Label htmlFor="inscricao_estadual">Inscrição Estadual</Label>
              <Input id="inscricao_estadual" value={form.inscricao_estadual} onChange={e => handleChange('inscricao_estadual', e.target.value)} placeholder="IE" />
            </div>

            {/* Website */}
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={form.website} onChange={e => handleChange('website', e.target.value)} placeholder="https://..." />
            </div>

            {/* Ramo de Atividade */}
            <div className="space-y-1.5">
              <Label htmlFor="ramo_atividade">Ramo de Atividade</Label>
              <Input id="ramo_atividade" value={form.ramo_atividade} onChange={e => handleChange('ramo_atividade', e.target.value)} placeholder="Ex: Comércio, Indústria..." />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => handleChange('status', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Porte */}
            <div className="space-y-1.5">
              <Label>Porte RF</Label>
              <Select value={form.porte_rf} onValueChange={v => handleChange('porte_rf', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {PORTE_OPTIONS.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nicho */}
            <div className="space-y-1.5">
              <Label htmlFor="nicho_cliente">Nicho do Cliente</Label>
              <Input id="nicho_cliente" value={form.nicho_cliente} onChange={e => handleChange('nicho_cliente', e.target.value)} placeholder="Ex: Brindes, Têxtil..." />
            </div>

            {/* Natureza Jurídica */}
            <div className="space-y-1.5">
              <Label htmlFor="natureza_juridica_desc">Natureza Jurídica</Label>
              <Input id="natureza_juridica_desc" value={form.natureza_juridica_desc} onChange={e => handleChange('natureza_juridica_desc', e.target.value)} placeholder="Descrição" />
            </div>

            {/* Capital Social */}
            <div className="space-y-1.5">
              <Label htmlFor="capital_social">Capital Social (R$)</Label>
              <Input id="capital_social" type="number" value={form.capital_social} onChange={e => handleChange('capital_social', e.target.value)} placeholder="0.00" />
            </div>

            {/* Data de Fundação */}
            <div className="space-y-1.5">
              <Label htmlFor="data_fundacao">Data de Fundação</Label>
              <Input id="data_fundacao" type="date" value={form.data_fundacao} onChange={e => handleChange('data_fundacao', e.target.value)} />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isEdit ? 'Salvar Alterações' : 'Criar Empresa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
