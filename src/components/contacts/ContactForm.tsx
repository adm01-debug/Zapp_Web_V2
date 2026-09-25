import React, { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONTACT_TYPES } from '@/utils/whatsappFileTypes';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Phone, Mail, Building, Briefcase, AlertCircle, CheckCircle2, Loader2, Info, Smile, MapPin } from 'lucide-react';
import { useExternalCargos } from '@/hooks/crm/useExternalCargos';
import { useExternalEmpresas } from '@/hooks/crm/useExternalEmpresas';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useContactFormValidation } from './useContactFormValidation';

interface ContactFormValues {
  name: string;
  nickname?: string | null;
  surname?: string | null;
  job_title?: string | null;
  company?: string | null;
  phone: string;
  email?: string | null;
  contact_type?: string | null;
  postal_code?: string | null;
  address?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

interface ContactFormProps {
  values: ContactFormValues;
  onChange: (field: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting?: boolean;
}

function FieldStatus({ error, isTouched, value }: { error?: string | null; isTouched?: boolean; value?: string | null }) {
  if (!isTouched) return null;
  if (error) return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1 text-destructive text-xs mt-1" role="alert">
      <AlertCircle className="w-3 h-3" />{error}
    </motion.div>
  );
  if (value && String(value).trim()) return (
    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="absolute right-3 top-1/2 -translate-y-1/2">
      <CheckCircle2 className="w-4 h-4 text-success" />
    </motion.div>
  );
  return null;
}

/** CEP é guardado só com dígitos; a máscara é de exibição. */
function formatCep(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const ContactForm = React.memo(function ContactForm({ values, onChange, onSubmit, onCancel, submitLabel, isSubmitting = false }: ContactFormProps) {
  const { data: externalCargos = [] } = useExternalCargos();
  const { data: externalEmpresas = [] } = useExternalEmpresas();
  const [empresaSearch, setEmpresaSearch] = useState('');
  const [showEmpresaDropdown, setShowEmpresaDropdown] = useState(false);
  const empresaBlurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const v = useContactFormValidation(values, onChange, onSubmit);

  return (
    <TooltipProvider>
      <div className="space-y-4 pt-4" role="form" aria-label="Formulário de contato"
        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) v.handleSubmit(); }}>

        {/* Name + Surname */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" /> Nome Principal <span className="text-destructive">*</span>
              <Tooltip><TooltipTrigger asChild><Info className="w-3 h-3 text-muted-foreground/50 cursor-help" /></TooltipTrigger>
              <TooltipContent><p className="text-xs">Nome usado para identificar o contato</p></TooltipContent></Tooltip>
            </Label>
            <div className="relative">
              <Input id="name" placeholder="Nome do contato" value={values.name}
                onChange={(e) => v.handleChange('name', e.target.value)} onBlur={() => v.handleBlur('name', values.name)}
                aria-required="true" aria-invalid={!!v.errors.name} maxLength={100}
                className={cn('transition-all duration-200',
                  v.errors.name && v.touched.name && 'border-destructive focus-visible:ring-destructive',
                  !v.errors.name && v.touched.name && values.name.trim() && 'border-success/50 focus-visible:ring-success/30')} />
              <FieldStatus error={null} isTouched={v.touched.name} value={!v.errors.name ? values.name : null} />
            </div>
            <AnimatePresence>{v.touched.name && v.errors.name && <FieldStatus error={v.errors.name} isTouched />}</AnimatePresence>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="surname">Sobrenome</Label>
            <Input id="surname" placeholder="Sobrenome" value={values.surname || ''} onChange={(e) => v.handleChange('surname', e.target.value)} maxLength={100} />
          </div>
        </div>

        {/* Nickname + Type */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="nickname" className="flex items-center gap-1.5"><Smile className="w-3.5 h-3.5 text-muted-foreground" /> Apelido</Label>
            <Input id="nickname" placeholder="Como prefere ser chamado" value={values.nickname || ''} onChange={(e) => v.handleChange('nickname', e.target.value)} maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_type">Tipo de Contato</Label>
            <Select value={values.contact_type || 'cliente'} onValueChange={(val) => onChange('contact_type', val)}>
              <SelectTrigger className="bg-input border-border"><SelectValue /></SelectTrigger>
              <SelectContent>{CONTACT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}><div className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", type.color)} />{type.label}</div></SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Job + Company */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="job_title" className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> Cargo</Label>
            <Select value={values.job_title || '__none__'} onValueChange={(val) => v.handleChange('job_title', val === '__none__' ? '' : val)}>
              <SelectTrigger id="job_title"><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
              <SelectContent><SelectItem value="__none__">Selecione o cargo</SelectItem>{externalCargos.map((cargo) => <SelectItem key={cargo} value={cargo}>{cargo}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company" className="flex items-center gap-1.5"><Building className="w-3.5 h-3.5 text-muted-foreground" /> Empresa</Label>
            <div className="relative">
              <Input id="company" placeholder="Buscar empresa..." value={values.company || ''}
                onChange={(e) => { v.handleChange('company', e.target.value); setEmpresaSearch(e.target.value); setShowEmpresaDropdown(e.target.value.length >= 1); }}
                onFocus={() => { clearTimeout(empresaBlurTimer.current); const val = values.company || ''; setEmpresaSearch(val); setShowEmpresaDropdown(val.length >= 1); }}
                onBlur={() => { empresaBlurTimer.current = setTimeout(() => setShowEmpresaDropdown(false), 200); }}
                autoComplete="off" />
              {showEmpresaDropdown && empresaSearch.length >= 1 && (() => {
                const filtered = externalEmpresas.filter(e => e.toLowerCase().includes(empresaSearch.toLowerCase())).slice(0, 8);
                return filtered.length > 0 ? (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filtered.map((empresa) => (
                      <button key={empresa} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        onMouseDown={(e) => e.preventDefault()} onClick={() => { v.handleChange('company', empresa); setEmpresaSearch(''); setShowEmpresaDropdown(false); }}>
                        {empresa}
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-muted-foreground" /> Telefone <span className="text-destructive">*</span>
            <Tooltip><TooltipTrigger asChild><Info className="w-3 h-3 text-muted-foreground/50 cursor-help" /></TooltipTrigger>
            <TooltipContent><p className="text-xs">Número com código do país (ex: +55 11 99999-9999)</p></TooltipContent></Tooltip>
          </Label>
          <div className="relative">
            <Input id="phone" placeholder="+55 11 99999-9999" value={values.phone}
              onChange={(e) => v.handlePhoneChange(e.target.value)} onBlur={() => v.handleBlur('phone', values.phone)}
              aria-required="true" aria-invalid={!!v.errors.phone} maxLength={20}
              className={cn('transition-all duration-200',
                v.errors.phone && v.touched.phone && 'border-destructive focus-visible:ring-destructive',
                !v.errors.phone && v.touched.phone && values.phone.trim() && 'border-success/50 focus-visible:ring-success/30')} />
            <FieldStatus error={null} isTouched={v.touched.phone} value={!v.errors.phone ? values.phone : null} />
          </div>
          <AnimatePresence>{v.touched.phone && v.errors.phone && <FieldStatus error={v.errors.phone} isTouched />}</AnimatePresence>
          <AnimatePresence>
            {v.duplicateWarning && !v.errors.phone && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-[hsl(38_92%_50%)] text-xs bg-[hsl(38_92%_50%)]/10 rounded-md px-2 py-1.5" role="alert">
                <AlertCircle className="w-3 h-3 shrink-0" /><span>{v.duplicateWarning}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email <span className="text-muted-foreground text-xs">(para resposta)</span>
          </Label>
          <div className="relative">
            <Input id="email" type="email" placeholder="email@exemplo.com" value={values.email || ''}
              onChange={(e) => v.handleChange('email', e.target.value)} onBlur={() => v.handleBlur('email', values.email || '')}
              aria-invalid={!!v.errors.email} maxLength={255}
              className={cn('transition-all duration-200',
                v.errors.email && v.touched.email && 'border-destructive focus-visible:ring-destructive',
                !v.errors.email && v.touched.email && values.email && 'border-success/50 focus-visible:ring-success/30')} />
            <FieldStatus error={null} isTouched={v.touched.email} value={!v.errors.email ? values.email : null} />
          </div>
          <AnimatePresence>{v.touched.email && v.errors.email && <FieldStatus error={v.errors.email} isTouched />}</AnimatePresence>
        </div>

        {/* Endereço */}
        <div className="space-y-3 pt-2 border-t border-border/30">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Endereço <span className="text-muted-foreground/60">(opcional)</span>
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="postal_code">CEP</Label>
              <Input id="postal_code" placeholder="00000-000" inputMode="numeric"
                value={formatCep(values.postal_code || '')}
                onChange={(e) => onChange('postal_code', e.target.value.replace(/\D/g, '').slice(0, 8))}
                maxLength={9} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="address">Logradouro</Label>
              <Input id="address" placeholder="Rua, avenida..." value={values.address || ''}
                onChange={(e) => onChange('address', e.target.value)} maxLength={200} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="address_number">Número</Label>
              <Input id="address_number" placeholder="123 ou S/N" value={values.address_number || ''}
                onChange={(e) => onChange('address_number', e.target.value)} maxLength={20} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="neighborhood">Bairro</Label>
              <Input id="neighborhood" placeholder="Bairro" value={values.neighborhood || ''}
                onChange={(e) => onChange('neighborhood', e.target.value)} maxLength={100} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" placeholder="Cidade" value={values.city || ''}
                onChange={(e) => onChange('city', e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">UF</Label>
              <Input id="state" placeholder="SP" value={values.state || ''}
                onChange={(e) => onChange('state', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                maxLength={2} />
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1"><span className="text-destructive">*</span> Campos obrigatórios</p>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border/30">
          <p className="text-xs text-muted-foreground hidden sm:block">Ctrl+Enter para salvar</p>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancelar</Button>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button onClick={v.handleSubmit} disabled={isSubmitting || !v.isValid}
                className="gap-2 shadow-lg shadow-primary/20">
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitLabel}
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
});
