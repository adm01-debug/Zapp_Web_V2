import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Brain, Plus, X, Save, Lightbulb, AlertCircle, Handshake, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Json } from '@/integrations/supabase/types';

interface MemoryData {
  id?: string;
  facts: string[];
  objections_handled: string[];
  promises_made: string[];
  pending_items: string[];
  commercial_summary: string;
  cumulative_summary: string;
}

interface ConversationMemoryPanelProps {
  contactId: string;
  profileId?: string | null;
}

const SECTIONS = [
  { key: 'facts' as const, label: 'Fatos relevantes', icon: Lightbulb, color: 'text-primary' },
  { key: 'objections_handled' as const, label: 'Objeções tratadas', icon: AlertCircle, color: 'text-warning' },
  { key: 'promises_made' as const, label: 'Promessas feitas', icon: Handshake, color: 'text-success' },
  { key: 'pending_items' as const, label: 'Pendências', icon: Clock, color: 'text-destructive' },
];

export function ConversationMemoryPanel({ contactId, profileId }: ConversationMemoryPanelProps) {
  const [memory, setMemory] = useState<MemoryData>({
    facts: [], objections_handled: [], promises_made: [], pending_items: [],
    commercial_summary: '', cumulative_summary: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newItems, setNewItems] = useState<Record<string, string>>({});

  useEffect(() => {
    loadMemory();
  }, [contactId]);

  const loadMemory = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('conversation_memory')
      .select('*')
      .eq('contact_id', contactId)
      .maybeSingle();
    if (data) {
      setMemory({
        id: data.id,
        facts: Array.isArray(data.facts) ? (data.facts as Json[]).map(String) : [],
        objections_handled: Array.isArray(data.objections_handled) ? (data.objections_handled as Json[]).map(String) : [],
        promises_made: Array.isArray(data.promises_made) ? (data.promises_made as Json[]).map(String) : [],
        pending_items: Array.isArray(data.pending_items) ? (data.pending_items as Json[]).map(String) : [],
        commercial_summary: data.commercial_summary || '',
        cumulative_summary: data.cumulative_summary || '',
      });
    }
    setLoading(false);
  };

  const addItem = (key: keyof Pick<MemoryData, 'facts' | 'objections_handled' | 'promises_made' | 'pending_items'>) => {
    const value = newItems[key]?.trim();
    if (!value) return;
    setMemory(prev => ({ ...prev, [key]: [...prev[key], value] }));
    setNewItems(prev => ({ ...prev, [key]: '' }));
  };

  const removeItem = (key: keyof Pick<MemoryData, 'facts' | 'objections_handled' | 'promises_made' | 'pending_items'>, index: number) => {
    setMemory(prev => ({ ...prev, [key]: prev[key].filter((_: string, i: number) => i !== index) }));
  };

  const saveMemory = async () => {
    setSaving(true);
    const payload = {
      contact_id: contactId,
      facts: memory.facts,
      objections_handled: memory.objections_handled,
      promises_made: memory.promises_made,
      pending_items: memory.pending_items,
      commercial_summary: memory.commercial_summary || null,
      cumulative_summary: memory.cumulative_summary || null,
      updated_by: profileId,
    };

    const { error } = memory.id
      ? await supabase.from('conversation_memory').update(payload).eq('id', memory.id)
      : await supabase.from('conversation_memory').insert(payload);

    if (!error) {
      toast.success('Memória salva');
      loadMemory();
    } else {
      toast.error('Erro ao salvar');
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Memória da Conversa</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveMemory} disabled={saving}>
          <Save className="w-3 h-3 mr-1" />
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {SECTIONS.map(({ key, label, icon: Icon, color }) => (
        <div key={key} className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Badge variant="outline" className="text-[10px] h-4">{memory[key].length}</Badge>
          </div>
          <div className="space-y-1">
            {memory[key].map((item: string, idx: number) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 text-xs bg-muted/20 rounded px-2 py-1 group"
              >
                <span className="flex-1">{item}</span>
                <button onClick={() => removeItem(key, idx)} className="opacity-0 group-hover:opacity-100">
                  <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </button>
              </motion.div>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              value={newItems[key] || ''}
              onChange={(e) => setNewItems(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder="Adicionar..."
              className="flex-1 text-xs bg-transparent border border-border/30 rounded px-2 py-1 focus:outline-none focus:border-primary/50"
              onKeyDown={(e) => e.key === 'Enter' && addItem(key)}
            />
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => addItem(key)}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ))}

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Resumo comercial</span>
        <Textarea
          value={memory.commercial_summary}
          onChange={(e) => setMemory(prev => ({ ...prev, commercial_summary: e.target.value }))}
          placeholder="Resumo do contexto comercial..."
          rows={2}
          className="text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Resumo cumulativo</span>
        <Textarea
          value={memory.cumulative_summary}
          onChange={(e) => setMemory(prev => ({ ...prev, cumulative_summary: e.target.value }))}
          placeholder="Resumo acumulado entre atendentes..."
          rows={2}
          className="text-xs"
        />
      </div>
    </div>
  );
}
