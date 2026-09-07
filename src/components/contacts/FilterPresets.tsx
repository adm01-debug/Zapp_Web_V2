import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bookmark, Plus, X, Filter, Check } from 'lucide-react';
import { toast } from 'sonner';

export interface FilterPreset {
  id: string;
  name: string;
  filters: {
    type?: string;
    company?: string;
    jobTitle?: string;
    tag?: string;
    dateRange?: string;
  };
}

interface FilterPresetsProps {
  onApplyPreset: (preset: FilterPreset) => void;
  currentFilters: FilterPreset['filters'];
}

const STORAGE_KEY = 'contact-filter-presets';

function getPresets(): FilterPreset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function savePresets(presets: FilterPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function FilterPresets({ onApplyPreset, currentFilters }: FilterPresetsProps) {
  const [presets, setPresets] = useState<FilterPreset[]>(getPresets);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  const hasActiveFilters = Object.values(currentFilters).some(v => v && v !== 'all');

  const handleSave = useCallback(() => {
    if (!newName.trim()) return;
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      filters: { ...currentFilters },
    };
    const updated = [...presets, preset];
    setPresets(updated);
    savePresets(updated);
    setNewName('');
    setSaving(false);
    toast.success(`Filtro "${preset.name}" salvo!`);
  }, [newName, currentFilters, presets]);

  const handleDelete = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    savePresets(updated);
    toast.success('Filtro removido');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-11 px-4 rounded-xl bg-input border border-border text-[15px] font-medium gap-2">
          <Bookmark className="w-[18px] h-[18px]" />
          Filtros Salvos
          {presets.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{presets.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-foreground">Filtros Salvos</p>

          {presets.length === 0 && !saving && (
            <p className="text-xs text-muted-foreground py-2 text-center">Nenhum filtro salvo</p>
          )}

          <AnimatePresence>
            {presets.map(preset => (
              <motion.div
                key={preset.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 justify-start h-7 text-xs"
                  onClick={() => onApplyPreset(preset)}
                >
                  <Filter className="w-3 h-3 mr-1.5 text-primary" />
                  {preset.name}
                </Button>
                <button
                  onClick={() => handleDelete(preset.id)}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {saving ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5"
            >
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSaving(false); }}
                placeholder="Nome do filtro..."
                className="h-7 text-xs"
                autoFocus
              />
              <button onClick={handleSave} className="p-1 text-primary hover:text-primary/80">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setSaving(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs gap-1.5"
              onClick={() => setSaving(true)}
              disabled={!hasActiveFilters}
            >
              <Plus className="w-3 h-3" />
              {hasActiveFilters ? 'Salvar Filtro Atual' : 'Aplique filtros primeiro'}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
