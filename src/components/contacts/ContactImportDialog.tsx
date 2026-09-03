import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ContactImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

interface ParsedRow { [key: string]: string; }

const FIELD_OPTIONS = [
  { value: '_skip', label: '⏭ Ignorar' },
  { value: 'name', label: 'Nome' },
  { value: 'surname', label: 'Sobrenome' },
  { value: 'nickname', label: 'Apelido' },
  { value: 'phone', label: 'Telefone *' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Empresa' },
  { value: 'job_title', label: 'Cargo' },
  { value: 'contact_type', label: 'Tipo' },
  { value: 'notes', label: 'Notas' },
];

const AUTO_MAP: Record<string, string> = {
  nome: 'name', name: 'name', sobrenome: 'surname', surname: 'surname',
  apelido: 'nickname', nickname: 'nickname',
  telefone: 'phone', phone: 'phone', celular: 'phone', whatsapp: 'phone',
  email: 'email', 'e-mail': 'email',
  empresa: 'company', company: 'company',
  cargo: 'job_title', tipo: 'contact_type', notas: 'notes',
};

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [] as string[], rows: [] as ParsedRow[] };
  const parseLine = (line: string) => {
    const result: string[] = []; let current = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { current += '"'; i++; } else inQ = !inQ; }
      else if ((ch === ',' || ch === ';') && !inQ) { result.push(current.trim()); current = ''; }
      else current += ch;
    }
    result.push(current.trim()); return result;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line); const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; }); return row;
  });
  return { headers, rows };
}

export function ContactImportDialog({ open, onOpenChange, onImportComplete }: ContactImportDialogProps) {
  const [step, setStep] = useState<'upload'|'preview'|'importing'|'done'>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<number[]>([]);
  const [result, setResult] = useState({ success: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setStep('upload'); setHeaders([]); setRows([]); setMapping({}); setDuplicates([]); };

  const handleFile = useCallback(async (file: File) => {
    const { headers: h, rows: r } = parseCSV((await file.text()).replace(/^\uFEFF/, ''));
    if (!h.length || !r.length) { toast.error('Arquivo vazio'); return; }
    const m: Record<string, string> = {};
    h.forEach(col => { m[col] = AUTO_MAP[col.toLowerCase().trim()] || '_skip'; });
    setHeaders(h); setRows(r); setMapping(m);
    const phoneCol = Object.entries(m).find(([,v]) => v === 'phone')?.[0];
    if (phoneCol) {
      const phones = r.map(row => row[phoneCol]?.replace(/\D/g, ''));
      const { data } = await supabase.from('contacts').select('phone').in('phone', phones.filter(Boolean));
      const existing = new Set((data||[]).map(e => e.phone.replace(/\D/g, '')));
      setDuplicates(r.map((row, i) => existing.has(row[phoneCol]?.replace(/\D/g, '')) ? i : -1).filter(i => i >= 0));
    }
    setStep('preview');
  }, []);

  const handleImport = async () => {
    const phoneCol = Object.entries(mapping).find(([,v]) => v === 'phone')?.[0];
    const nameCol = Object.entries(mapping).find(([,v]) => v === 'name')?.[0];
    if (!phoneCol || !nameCol) { toast.error('Mapeie Nome e Telefone'); return; }
    setStep('importing'); let s = 0, f = 0;
    for (const [i, row] of rows.entries()) {
      if (duplicates.includes(i)) continue;
      const c: Record<string, string> = {};
      Object.entries(mapping).forEach(([h, field]) => { if (field !== '_skip' && row[h]) c[field] = row[h]; });
      if (!c.phone || !c.name) { f++; continue; }
      const { error } = await supabase.from('contacts').insert({
        name: c.name, phone: c.phone.replace(/\D/g, ''), surname: c.surname || null,
        nickname: c.nickname || null, email: c.email || null, company: c.company || null,
        job_title: c.job_title || null, contact_type: c.contact_type || 'cliente', notes: c.notes || null,
      });
      if (error) f++; else s++;
    }
    setResult({ success: s, failed: f }); setStep('done'); if (s > 0) onImportComplete();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-primary" />Importar Contatos</DialogTitle>
          <DialogDescription>
            {step === 'upload' ? 'Envie um arquivo CSV' : step === 'preview' ? 'Revise e confirme' : step === 'importing' ? 'Importando...' : 'Concluído'}
          </DialogDescription>
        </DialogHeader>
        <AnimatePresence mode="wait">
          {step === 'upload' && (
            <motion.div key="up" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <Upload className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-sm font-medium">Arraste um CSV ou clique para selecionar</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </motion.div>
          )}
          {step === 'preview' && (
            <motion.div key="pv" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col gap-4 overflow-hidden">
              <div className="flex items-center gap-3 text-xs">
                <Badge variant="secondary">{rows.length} linhas</Badge>
                {duplicates.length > 0 && <Badge variant="destructive">{duplicates.length} duplicados</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {headers.map(h => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="text-xs truncate w-24 text-muted-foreground">{h}</span><span className="text-muted-foreground">→</span>
                    <Select value={mapping[h]} onValueChange={v => setMapping(m => ({ ...m, [h]: v }))}>
                      <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <ScrollArea className="h-40 rounded-lg border">
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left w-8">#</th>
                    {headers.filter(h => mapping[h] !== '_skip').map(h => <th key={h} className="p-2 text-left">{mapping[h]}</th>)}
                  </tr></thead>
                  <tbody>{rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className={cn('border-b', duplicates.includes(i) && 'bg-destructive/5 line-through opacity-50')}>
                      <td className="p-2 text-muted-foreground">{i+1}</td>
                      {headers.filter(h => mapping[h] !== '_skip').map(h => <td key={h} className="p-2 truncate max-w-[120px]">{row[h]}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Voltar</Button>
                <Button onClick={handleImport}><CheckCircle2 className="w-4 h-4 mr-2" />Importar {rows.length - duplicates.length}</Button>
              </DialogFooter>
            </motion.div>
          )}
          {step === 'importing' && (
            <motion.div key="imp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-16">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" /><p className="text-sm font-medium">Importando...</p>
            </motion.div>
          )}
          {step === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-12 gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"><CheckCircle2 className="w-8 h-8 text-primary" /></div>
              <p className="text-lg font-bold">{result.success} importados</p>
              {result.failed > 0 && <p className="text-sm text-destructive">{result.failed} falharam</p>}
              <Button onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
