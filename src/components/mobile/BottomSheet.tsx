import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { haptics } from './SwipeGestures';

// Re-export FAB components
export { FloatingActionButton, SpeedDialFAB, KeyboardAwareContainer } from './FloatingActionButtons';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  defaultSnap?: number;
  title?: string;
  showHandle?: boolean;
  showCloseButton?: boolean;
  className?: string;
  overlayClassName?: string;
  preventClose?: boolean;
}

export function BottomSheet({
  isOpen, onClose, children, snapPoints = [0.5, 0.9], defaultSnap = 0,
  title, showHandle = true, showCloseButton = true, className, overlayClassName, preventClose = false,
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState(defaultSnap);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.velocity.y > 500 && !preventClose) { haptics.light(); onClose(); return; }
    const windowHeight = window.innerHeight;
    const newPercentage = (windowHeight * snapPoints[currentSnap] - info.offset.y) / windowHeight;
    let closestSnap = 0;
    let minDiff = Math.abs(snapPoints[0] - newPercentage);
    snapPoints.forEach((snap, index) => { const diff = Math.abs(snap - newPercentage); if (diff < minDiff) { minDiff = diff; closestSnap = index; } });
    if (newPercentage < snapPoints[0] * 0.5 && !preventClose) { haptics.light(); onClose(); }
    else { setCurrentSnap(closestSnap); haptics.selection(); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={preventClose ? undefined : onClose}
            className={cn('fixed inset-0 bg-background/50 z-50 backdrop-blur-sm', overlayClassName)} />
          <motion.div ref={sheetRef}
            initial={{ y: '100%' }} animate={{ y: 0, height: `${snapPoints[currentSnap] * 100}%` }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y" dragControls={dragControls} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.2} onDragEnd={handleDragEnd}
            className={cn('fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl shadow-2xl overflow-hidden flex flex-col safe-area-bottom', className)}>
            {showHandle && (
              <div onPointerDown={(e) => dragControls.start(e)} className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none">
                <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
              </div>
            )}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-4 pb-3 border-b border-border">
                {title && <h3 className="font-display font-semibold text-lg text-foreground">{title}</h3>}
                {showCloseButton && !preventClose && (
                  <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </motion.button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
