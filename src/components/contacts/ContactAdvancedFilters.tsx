import { motion } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building, Briefcase, Tag, CalendarDays, TrendingUp, Heart,
  RotateCcw, Sparkles,
} from 'lucide-react';

const DATE_FILTERS = [
  { value: 'all', label: 'Todos os períodos' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Última semana' },
  { value: 'month', label: 'Último mês' },
  { value: 'quarter', label: 'Últimos 3 meses' },
  { value: 'year', label: 'Último ano' },
];

const SENTIMENT_OPTIONS = [
  { value: '__all__', label: 'Todos', icon: '🔵' },
  { value: 'positive', label: 'Positivo', icon: '😊' },
  { value: 'neutral', label: 'Neutro', icon: '😐' },
  { value: 'negative', label: 'Negativo', icon: '😞' },
];

interface ContactAdvancedFiltersProps {
  filterCompany: string;
  setFilterCompany: (val: string) => void;
  filterJobTitle: string;
  setFilterJobTitle: (val: string) => void;
  filterTag: string;
  setFilterTag: (val: string) => void;
  filterDateRange: string;
  setFilterDateRange: (val: string) => void;
  filterSentiment?: string;
  setFilterSentiment?: (val: string) => void;
  filterLeadScoreRange?: [number, number];
  setFilterLeadScoreRange?: (val: [number, number]) => void;
  uniqueCompanies: string[];
  uniqueJobTitles: string[];
  uniqueTags: string[];
  onClearFilters: () => void;
  activeFiltersCount: number;
}

export function ContactAdvancedFilters({
  filterCompany, setFilterCompany,
  filterJobTitle, setFilterJobTitle,
  filterTag, setFilterTag,
  filterDateRange, setFilterDateRange,
  filterSentiment, setFilterSentiment,
  filterLeadScoreRange, setFilterLeadScoreRange,
  uniqueCompanies, uniqueJobTitles, uniqueTags,
  onClearFilters, activeFiltersCount,
}: ContactAdvancedFiltersProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-card rounded-[14px] p-4 border border-border/70 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Filtros Avançados</span>
          {activeFiltersCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5">{activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}</Badge>
          )}
        </div>
        {activeFiltersCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground" onClick={onClearFilters}>
            <RotateCcw className="w-3 h-3" />
            Limpar tudo
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Company */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
            <Building className="w-3.5 h-3.5" />Empresa
          </Label>
          <Select value={filterCompany || '__all__'} onValueChange={(v) => setFilterCompany(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as empresas</SelectItem>
              {uniqueCompanies.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Job Title */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
            <Briefcase className="w-3.5 h-3.5" />Cargo
          </Label>
          <Select value={filterJobTitle || '__all__'} onValueChange={(v) => setFilterJobTitle(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os cargos</SelectItem>
              {uniqueJobTitles.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tag */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
            <Tag className="w-3.5 h-3.5" />Etiqueta
          </Label>
          <Select value={filterTag || '__all__'} onValueChange={(v) => setFilterTag(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as etiquetas</SelectItem>
              {uniqueTags.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date */}
        <div className="space-y-2">
          <Label className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" />Período
          </Label>
          <Select value={filterDateRange} onValueChange={setFilterDateRange}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Second row - Sentiment + Lead Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/20">
        {/* Sentiment */}
        {setFilterSentiment && (
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <Heart className="w-3.5 h-3.5" />Sentimento (IA)
            </Label>
            <Select value={filterSentiment || '__all__'} onValueChange={(v) => setFilterSentiment(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SENTIMENT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="flex items-center gap-2">{s.icon} {s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Lead Score */}
        {setFilterLeadScoreRange && filterLeadScoreRange && (
          <div className="space-y-3">
            <Label className="text-xs font-medium flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="w-3.5 h-3.5" />
              Lead Score
              <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1.5">
                {filterLeadScoreRange[0]} – {filterLeadScoreRange[1]}
              </Badge>
            </Label>
            <Slider
              value={filterLeadScoreRange}
              onValueChange={(v) => setFilterLeadScoreRange(v as [number, number])}
              min={0}
              max={100}
              step={5}
              className="py-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>Frio (0)</span>
              <span>Quente (100)</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
