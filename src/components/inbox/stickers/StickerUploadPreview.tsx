import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Tag, X, Check } from 'lucide-react';
import { CategorySelector } from './CategorySelector';
import { CATEGORY_LABELS, type PendingUpload } from './StickerTypes';

interface UploadPreviewProps {
  pending: PendingUpload;
  onConfirm: (p: PendingUpload) => void;
  onCancel: () => void;
}

export function StickerUploadPreview({ pending, onConfirm, onCancel }: UploadPreviewProps) {
  const [category, setCategory] = useState(pending.selectedCategory);
  const [name, setName] = useState(pending.name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-3 border border-border rounded-lg bg-card space-y-2.5"
      role="dialog"
      aria-label="Pré-visualização do upload"
    >
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted/30 shrink-0 flex items-center justify-center border border-border/30">
          <img src={pending.imageUrl} alt="Preview da figurinha" className="w-full h-full object-contain p-0.5"  loading="lazy" decoding="async"/>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 text-xs flex-1"
          placeholder="Nome da figurinha"
          aria-label="Nome da figurinha"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onConfirm({ ...pending, selectedCategory: category, name });
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Tag className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="text-[10px] text-muted-foreground shrink-0">Categoria:</span>
        <CategorySelector value={category} onChange={setCategory} size="sm" />
        {pending.aiCategory !== 'outros' && pending.aiCategory !== 'enviadas' && category !== pending.aiCategory && (
          <button
            onClick={() => setCategory(pending.aiCategory)}
            className="text-[9px] text-primary hover:underline shrink-0"
            aria-label={`Usar sugestão da IA: ${CATEGORY_LABELS[pending.aiCategory]?.label}`}
          >
            IA sugere: {CATEGORY_LABELS[pending.aiCategory]?.label}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          <X className="w-3 h-3 mr-1" /> Cancelar
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onConfirm({ ...pending, selectedCategory: category, name })}>
          <Check className="w-3 h-3 mr-1" /> Salvar
        </Button>
      </div>
    </motion.div>
  );
}
