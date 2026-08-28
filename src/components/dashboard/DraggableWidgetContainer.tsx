import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Maximize2, Minimize2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { DashboardWidget, WidgetSize } from '@/hooks/analytics/useDashboardWidgets';
import React, { useState } from 'react';
import { WidgetConfigSheet } from './WidgetConfigSheet';

interface DraggableWidgetContainerProps {
  widgets: DashboardWidget[];
  visibleWidgets: DashboardWidget[];
  isEditMode: boolean;
  setIsEditMode: (value: boolean) => void;
  onReorder: (sourceIndex: number, destinationIndex: number) => void;
  onToggleVisibility: (widgetId: string) => void;
  onUpdateSize?: (widgetId: string, size: WidgetSize) => void;
  onMoveWidget?: (widgetId: string, direction: 'up' | 'down' | 'left' | 'right') => void;
  onReset: () => void;
  children?: React.ReactNode;
  renderWidget: (widget: DashboardWidget) => React.ReactNode;
}

const getWidgetGridClass = (widget: DashboardWidget) => {
  switch (widget.size) {
    case 'small': return 'md:col-span-1';
    case 'medium': return 'md:col-span-2';
    case 'large': return 'md:col-span-3';
    case 'full': return 'md:col-span-4';
    default: return 'md:col-span-2';
  }
};

export function DraggableWidgetContainer({
  widgets, visibleWidgets, isEditMode, setIsEditMode,
  onReorder, onToggleVisibility, onUpdateSize, onMoveWidget, onReset, renderWidget,
}: DraggableWidgetContainerProps) {
  const [hoveredWidget, setHoveredWidget] = useState<string | null>(null);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    onReorder(result.source.index, result.destination.index);
  };

  return (
    <div className="space-y-4">
      <WidgetConfigSheet
        widgets={widgets}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        onToggleVisibility={onToggleVisibility}
        onUpdateSize={onUpdateSize}
        onReset={onReset}
      />

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="dashboard-widgets">
          {(provided, snapshot) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className={cn(
                "grid grid-cols-1 md:grid-cols-4 gap-4 transition-all duration-300",
                snapshot.isDraggingOver && "bg-primary/5 rounded-xl p-4 -m-4",
                isEditMode && "gap-6"
              )}
            >
              <AnimatePresence mode="popLayout">
                {visibleWidgets.map((widget, index) => (
                  <Draggable key={widget.id} draggableId={widget.id} index={index} isDragDisabled={!isEditMode}>
                    {(provided, snapshot) => (
                      <motion.div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn("relative col-span-1", getWidgetGridClass(widget), snapshot.isDragging && "z-50")}
                        onMouseEnter={() => setHoveredWidget(widget.id)}
                        onMouseLeave={() => setHoveredWidget(null)}
                      >
                        {/* Edit Mode Overlay */}
                        <AnimatePresence>
                          {isEditMode && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 pointer-events-none">
                              <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full pointer-events-auto cursor-nw-resize" />
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full pointer-events-auto cursor-ne-resize" />
                              <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-full pointer-events-auto cursor-sw-resize" />
                              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full pointer-events-auto cursor-se-resize" />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Drag Handle */}
                        {isEditMode && (
                          <div className="absolute -left-8 top-1/2 -translate-y-1/2 z-20 hidden md:block" {...provided.dragHandleProps}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="p-2 rounded-lg bg-primary text-primary-foreground cursor-grab active:cursor-grabbing shadow-lg hover:scale-110 transition-transform">
                                  <GripVertical className="w-4 h-4" />
                                </motion.div>
                              </TooltipTrigger>
                              <TooltipContent side="left">Arraste para mover</TooltipContent>
                            </Tooltip>
                          </div>
                        )}

                        {/* Quick Actions */}
                        <AnimatePresence>
                          {isEditMode && hoveredWidget === widget.id && onMoveWidget && (
                            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-background/95 backdrop-blur-sm rounded-lg p-1 shadow-lg border border-border">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onMoveWidget(widget.id, 'up')}><ChevronUp className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onMoveWidget(widget.id, 'left')}><ChevronLeft className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onMoveWidget(widget.id, 'right')}><ChevronRight className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onMoveWidget(widget.id, 'down')}><ChevronDown className="w-4 h-4" /></Button>
                              {onUpdateSize && (
                                <>
                                  <div className="w-px h-4 bg-border" />
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onUpdateSize(widget.id, widget.size === 'small' ? 'medium' : widget.size === 'medium' ? 'large' : widget.size === 'large' ? 'full' : 'small')}>
                                    {widget.size === 'full' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                  </Button>
                                </>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Widget Container */}
                        <motion.div
                          className={cn("h-full transition-all duration-300 rounded-xl overflow-hidden", isEditMode && "ring-2 ring-dashed ring-primary/40 hover:ring-primary", snapshot.isDragging && "ring-primary shadow-2xl scale-[1.02] rotate-1")}
                          animate={{ boxShadow: snapshot.isDragging ? "0 25px 50px -12px rgba(0, 0, 0, 0.25)" : "0 0 0 0 rgba(0, 0, 0, 0)" }}
                        >
                          <AnimatePresence>
                            {isEditMode && (
                              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute -top-3 left-4 z-20">
                                <Badge className="bg-primary text-primary-foreground shadow-lg">{widget.title}</Badge>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {renderWidget(widget)}
                        </motion.div>
                      </motion.div>
                    )}
                  </Draggable>
                ))}
              </AnimatePresence>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
