import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, RotateCcw, Settings2, Grid3X3, LayoutGrid, Maximize2, GripVertical, ChevronUp, ChevronDown, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { LiveRegion } from '@/components/a11y/a11yComponents';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { DashboardWidget, WidgetSize } from '@/hooks/analytics/useDashboardWidgets';

const sizeLabels: Record<WidgetSize, string> = {
  small: 'Pequeno (1 col)',
  medium: 'Médio (2 cols)',
  large: 'Grande (3 cols)',
  full: 'Completo (4 cols)',
};

const sizeIcons: Record<WidgetSize, React.ReactNode> = {
  small: <Grid3X3 className="w-4 h-4" />,
  medium: <LayoutGrid className="w-4 h-4" />,
  large: <Maximize2 className="w-4 h-4" />,
  full: <Maximize2 className="w-5 h-5" />,
};

/**
 * Widgets que viraram cartões fixos da Visão Geral (`stats`/KPIs, `queues` e
 * `activity`). Eles não podem sumir por engano no painel de personalização:
 * o interruptor fica travado e a linha ganha o selo "Obrigatório".
 */
const WIDGETS_OBRIGATORIOS: ReadonlySet<string> = new Set(['stats', 'queues', 'activity']);

interface WidgetConfigSheetProps {
  widgets: DashboardWidget[];
  isEditMode: boolean;
  setIsEditMode: (value: boolean) => void;
  onToggleVisibility: (widgetId: string) => void;
  onUpdateSize?: (widgetId: string, size: WidgetSize) => void;
  /** Reordena por índice (origem → destino). Habilita arrastar e as setas. */
  onReorder?: (sourceIndex: number, destinationIndex: number) => void;
  onReset: () => void;
  /** Rótulo do botão que abre o painel. */
  triggerLabel?: string;
}

export function WidgetConfigSheet({
  widgets, isEditMode, setIsEditMode, onToggleVisibility, onUpdateSize, onReorder, onReset,
  triggerLabel = 'Personalizar',
}: WidgetConfigSheetProps) {
  const [anuncio, setAnuncio] = useState('');

  const mover = (index: number, destino: number) => {
    if (!onReorder || destino < 0 || destino >= widgets.length) return;
    onReorder(index, destino);
    setAnuncio(`${widgets[index].title} movido para a posição ${destino + 1} de ${widgets.length}`);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    onReorder?.(result.source.index, result.destination.index);
    setAnuncio(`${widgets[result.source.index].title} movido para a posição ${result.destination.index + 1} de ${widgets.length}`);
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <AnimatePresence>
        {isEditMode && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Modo Edição Ativo</Badge>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" data-testid="btn-personalizar">
            <Settings2 className="w-4 h-4" />
            {triggerLabel}
          </Button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Personalizar Dashboard</SheetTitle>
            <SheetDescription>Arraste para reordenar (ou use as setas), redimensione e ative/desative widgets</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {/* Anuncia a cada reordenação, por arrastar ou por teclado. */}
            <LiveRegion message={anuncio} />

            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Modo de edição</span>
              </div>
              <Switch checked={isEditMode} onCheckedChange={setIsEditMode} aria-label="Modo de edição" />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                Widgets Disponíveis
              </h4>
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="widget-config-list">
                  {(droppable) => (
                    <div ref={droppable.innerRef} {...droppable.droppableProps} className="space-y-2">
                      {widgets.map((widget, index) => {
                        const obrigatorio = WIDGETS_OBRIGATORIOS.has(widget.id);
                        return (
                          <Draggable key={widget.id} draggableId={widget.id} index={index}>
                            {(draggable, snapshot) => (
                              <div
                                ref={draggable.innerRef}
                                {...draggable.draggableProps}
                                data-testid={`widget-config-${widget.id}`}
                                className={cn(
                                  "flex items-center justify-between gap-2 p-3 rounded-lg border transition-all",
                                  widget.visible ? "bg-background border-border" : "bg-muted/30 border-border/50 opacity-60",
                                  snapshot.isDragging && "shadow-lg ring-2 ring-primary/40"
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    {...draggable.dragHandleProps}
                                    aria-label={`Arrastar ${widget.title}`}
                                    className="p-1 rounded text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </span>
                                  <div className={cn("p-1.5 rounded-md transition-colors", widget.visible ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                                    {widget.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium block truncate">{widget.title}</span>
                                    <span className="text-xs text-muted-foreground">{sizeLabels[widget.size]}</span>
                                  </div>
                                  {obrigatorio && (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 shrink-0 text-2xs"
                                      title="Sempre visível na Visão Geral"
                                    >
                                      <Lock className="w-3 h-3" /> Obrigatório
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {onReorder && (
                                    <>
                                      <Button
                                        variant="ghost" size="sm" className="h-8 w-8 p-0"
                                        aria-label={`Mover ${widget.title} para cima`}
                                        disabled={index === 0}
                                        onClick={() => mover(index, index - 1)}
                                      >
                                        <ChevronUp className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm" className="h-8 w-8 p-0"
                                        aria-label={`Mover ${widget.title} para baixo`}
                                        disabled={index === widgets.length - 1}
                                        onClick={() => mover(index, index + 1)}
                                      >
                                        <ChevronDown className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                  {onUpdateSize && widget.visible && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Tamanho de ${widget.title}`}>{sizeIcons[widget.size]}</Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuLabel>Tamanho</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {(['small', 'medium', 'large', 'full'] as WidgetSize[]).map((size) => (
                                          <DropdownMenuItem key={size} onClick={() => onUpdateSize(widget.id, size)} className={cn(widget.size === size && "bg-primary/10 text-primary")}>
                                            <span className="mr-2">{sizeIcons[size]}</span>
                                            {sizeLabels[size]}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                  <Switch
                                    checked={widget.visible}
                                    disabled={obrigatorio}
                                    aria-label={`Mostrar ${widget.title}`}
                                    title={obrigatorio ? 'Sempre visível na Visão Geral' : undefined}
                                    onCheckedChange={() => { if (!obrigatorio) onToggleVisibility(widget.id); }}
                                  />
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {droppable.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>

            <Button variant="outline" size="sm" onClick={onReset} className="w-full gap-2 mt-4">
              <RotateCcw className="w-4 h-4" />
              Restaurar Padrão
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export { sizeLabels, sizeIcons };
