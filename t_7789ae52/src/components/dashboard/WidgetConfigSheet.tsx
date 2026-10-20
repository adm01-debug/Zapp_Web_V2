import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, RotateCcw, Settings2, Grid3X3, LayoutGrid, Maximize2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

interface WidgetConfigSheetProps {
  widgets: DashboardWidget[];
  isEditMode: boolean;
  setIsEditMode: (value: boolean) => void;
  onToggleVisibility: (widgetId: string) => void;
  onUpdateSize?: (widgetId: string, size: WidgetSize) => void;
  onReset: () => void;
}

export function WidgetConfigSheet({ widgets, isEditMode, setIsEditMode, onToggleVisibility, onUpdateSize, onReset }: WidgetConfigSheetProps) {
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
          <Button variant="outline" size="sm" className="gap-2">
            <Settings2 className="w-4 h-4" />
            Configurar Widgets
          </Button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Configurar Dashboard</SheetTitle>
            <SheetDescription>Arraste para reordenar, redimensione e ative/desative widgets</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Modo de edição</span>
              </div>
              <Switch checked={isEditMode} onCheckedChange={setIsEditMode} />
            </div>
            
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                Widgets Disponíveis
              </h4>
              <div className="space-y-2">
                {widgets.map((widget) => (
                  <motion.div
                    key={widget.id}
                    layout
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all",
                      widget.visible ? "bg-background border-border" : "bg-muted/30 border-border/50 opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ scale: widget.visible ? 1 : 0.9 }}
                        className={cn("p-1.5 rounded-md transition-colors", widget.visible ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}
                      >
                        {widget.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </motion.div>
                      <div>
                        <span className="text-sm font-medium block">{widget.title}</span>
                        <span className="text-xs text-muted-foreground">{sizeLabels[widget.size]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {onUpdateSize && widget.visible && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">{sizeIcons[widget.size]}</Button>
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
                      <Switch checked={widget.visible} onCheckedChange={() => onToggleVisibility(widget.id)} />
                    </div>
                  </motion.div>
                ))}
              </div>
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
