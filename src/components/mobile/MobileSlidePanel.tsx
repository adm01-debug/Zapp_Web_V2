import React, { useRef } from 'react';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
import { haptics } from './SwipeGestures';

// ─── Slide Over Panel ──────────────────────────────────────
interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: 'left' | 'right';
  width?: 'sm' | 'md' | 'lg' | 'full';
  title?: string;
  className?: string;
}

const panelWidths = {
  sm: 'max-w-xs',
  md: 'max-w-sm',
  lg: 'max-w-md',
  full: 'max-w-full',
};

export function SlideOverPanel({ isOpen, onClose, children, side = 'right', width = 'md', title, className }: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const velocity = side === 'right' ? info.velocity.x : -info.velocity.x;
    const offset = side === 'right' ? info.offset.x : -info.offset.x;
    if (velocity > 300 || offset > 100) { haptics.light(); onClose(); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-background/70 z-50" />
          <motion.div
            ref={panelRef}
            initial={{ x: side === 'right' ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="x" dragControls={dragControls} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className={cn('fixed inset-y-0 z-50 w-full bg-card shadow-2xl flex flex-col', side === 'right' ? 'right-0' : 'left-0', panelWidths[width], className)}
          >
            {title && (
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="font-display font-semibold text-lg">{title}</h2>
                <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="p-2 rounded-full hover:bg-muted">
                  <Menu className="w-5 h-5 rotate-90" />
                </motion.button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Pinch to Zoom ─────────────────────────────────────────
interface PinchZoomProps {
  children: React.ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
}

export function PinchZoom({ children, className, minScale = 1, maxScale = 3 }: PinchZoomProps) {
  const [scale, setScale] = React.useState(1);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const lastDistance = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastDistance.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (lastDistance.current > 0) setScale(Math.min(Math.max(scale * (distance / lastDistance.current), minScale), maxScale));
      lastDistance.current = distance;
    }
  };

  const handleDoubleClick = () => {
    haptics.selection();
    if (scale > 1) { setScale(1); setPosition({ x: 0, y: 0 }); } else setScale(2);
  };

  return (
    <div ref={containerRef} className={cn('overflow-hidden touch-none', className)} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={() => { lastDistance.current = 0; }} onDoubleClick={handleDoubleClick}>
      <motion.div animate={{ scale, x: position.x, y: position.y }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} drag={scale > 1} dragConstraints={containerRef} className="origin-center">
        {children}
      </motion.div>
    </div>
  );
}

// ─── Long Press Menu ───────────────────────────────────────
interface LongPressMenuItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

interface LongPressMenuProps {
  children: React.ReactNode;
  items: LongPressMenuItem[];
  delay?: number;
  className?: string;
}

export function LongPressMenu({ children, items, delay = 500, className }: LongPressMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleItemClick = (item: LongPressMenuItem) => { haptics.selection(); item.onClick(); setIsOpen(false); };

  return (
    <>
      <div
        onTouchStart={(e) => { const touch = e.touches[0]; timerRef.current = setTimeout(() => { haptics.heavy(); setPosition({ x: touch.clientX, y: touch.clientY }); setIsOpen(true); }, delay); }}
        onTouchEnd={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
        onTouchMove={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
        className={className}
      >
        {children}
      </div>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOpen(false)} className="fixed inset-0 z-50" />
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              style={{ position: 'fixed', left: position.x, top: position.y, transform: 'translate(-50%, -100%)' }}
              className="z-50 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden min-w-[160px]"
            >
              {items.map((item, index) => (
                <motion.button
                  key={index} whileTap={{ scale: 0.98, backgroundColor: 'hsl(var(--muted))' }}
                  onClick={() => handleItemClick(item)}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', item.destructive ? 'text-destructive' : 'text-foreground', index !== items.length - 1 && 'border-b border-border')}
                >
                  {item.icon}
                  <span className="text-sm font-medium">{item.label}</span>
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
