import { useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollToTopButton } from '@/components/ui/scroll-to-top';
import { useLayoutScroll } from '@/contexts/LayoutScrollContext';
import { TagsEmptyState } from '@/components/ui/contextual-empty-states';
import { PageHeader } from '@/components/layout/PageHeader';
import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import { motion, StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tag,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Users,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTags, Tag as TagType } from '@/hooks/crm/useTags';

const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
];

export function TagsView() {
  const { tags, isLoading, createTag, updateTag, deleteTag, isCreating, isUpdating, isDeleting } = useTags();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TagType | null>(null);
  const [newTag, setNewTag] = useState({ name: '', color: COLORS[0] });

  const handleAddTag = async () => {
    if (newTag.name) {
      await createTag({
        name: newTag.name,
        color: newTag.color,
      });
      setNewTag({ name: '', color: COLORS[0] });
      setIsAddDialogOpen(false);
    }
  };

  const handleEditTag = async () => {
    if (editingTag) {
      await updateTag({
        id: editingTag.id,
        name: editingTag.name,
        color: editingTag.color,
      });
      setEditingTag(null);
    }
  };

  const handleDeleteTag = async (id: string) => {
    await deleteTag(id);
  };

  const TagForm = ({ tag, setTag, onSubmit, isEdit, isSubmitting }: {
    tag: { name: string; color: string };
    setTag: (tag: { name: string; color: string }) => void;
    onSubmit: () => void;
    isEdit?: boolean;
    isSubmitting?: boolean;
  }) => (
    <div className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="tagName">Nome da etiqueta</Label>
        <Input
          id="tagName"
          placeholder="Ex: VIP, Lead Quente..."
          value={tag.name}
          onChange={(e) => setTag({ ...tag, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Cor</Label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((color) => (
            <motion.button
              key={color}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setTag({ ...tag, color })}
              className={cn(
                'w-8 h-8 rounded-full transition-all',
                tag.color === color && 'ring-2 ring-offset-2 ring-offset-background ring-primary'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: tag.color }}
        />
        <span className="text-sm font-medium">{tag.name || 'Preview'}</span>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => (isEdit ? setEditingTag(null) : setIsAddDialogOpen(false))}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button 
          onClick={onSubmit} 
          className="bg-whatsapp hover:bg-whatsapp-dark"
          disabled={isSubmitting || !tag.name}
        >
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </div>
  );

  const totalContacts = tags.reduce((sum, t) => sum + (t.contact_count || 0), 0);
  const mostUsedTag = [...tags].sort((a, b) => (b.contact_count || 0) - (a.contact_count || 0))[0];

  const layoutScrollRef = useLayoutScroll();

  return (
    <div className="space-y-6 relative bg-background w-full min-w-0">
      <ScrollToTopButton scrollRef={layoutScrollRef} />
      <AuroraBorealis />
      <FloatingParticles />
      {/* Header with Breadcrumbs */}
      <PageHeader
        title="Etiquetas"
        subtitle="Organize seus contatos e conversas com etiquetas personalizadas"
        breadcrumbs={[
          { label: 'Gestão' },
          { label: 'Etiquetas' },
        ]}
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Nova Etiqueta
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Criar Nova Etiqueta</DialogTitle>
              </DialogHeader>
              <TagForm
                tag={newTag}
                setTag={setNewTag}
                onSubmit={handleAddTag}
                isSubmitting={isCreating}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingTag} onOpenChange={() => setEditingTag(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar Etiqueta</DialogTitle>
          </DialogHeader>
          {editingTag && (
            <TagForm
              tag={editingTag}
              setTag={(tag) => setEditingTag({ ...editingTag, ...tag })}
              onSubmit={handleEditTag}
              isEdit
              isSubmitting={isUpdating}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total de Etiquetas', value: tags.length },
          { label: 'Contatos Etiquetados', value: totalContacts },
          { label: 'Mais Usada', value: mostUsedTag?.name || '-' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border border-secondary/20 bg-card card-glow-purple">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : tags.length === 0 ? (
        <TagsEmptyState
          onCreateTag={() => setIsAddDialogOpen(true)}
        />
      ) : (
        /* Tags Grid */
        <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <StaggeredItem key={tag.id}>
              <motion.div
                whileHover={{ y: -4, boxShadow: '0 8px 30px hsl(var(--primary) / 0.1)' }}
              >
                <Card className="cursor-pointer border border-secondary/20 bg-card hover:border-secondary/40 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <motion.div
                          whileHover={{ scale: 1.2, rotate: 10 }}
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${tag.color}20` }}
                        >
                          <Tag className="w-5 h-5" style={{ color: tag.color }} />
                        </motion.div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <h3 className="font-semibold">{tag.name}</h3>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Users className="w-3.5 h-3.5" />
                            <span>{tag.contact_count || 0} contatos</span>
                          </div>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            <Button variant="ghost" size="icon" className="w-8 h-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </motion.div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingTag(tag)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteTag(tag.id)}
                            disabled={isDeleting}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </StaggeredItem>
          ))}
        </StaggeredList>
      )}
    </div>
  );
}