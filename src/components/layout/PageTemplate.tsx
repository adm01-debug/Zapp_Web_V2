import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface PageTemplateProps {
  /** Page title (H1) */
  title: string;
  /** Optional subtitle / description */
  subtitle?: string;
  /** Icon shown next to title */
  icon?: React.ReactNode;
  /** Action buttons (top-right) */
  actions?: React.ReactNode;
  /** Filter/search bar row */
  filters?: React.ReactNode;
  /** Main page content */
  children: React.ReactNode;
  /** Extra classNames for the content area */
  className?: string;
  /** Whether content should have padding (default true) */
  padded?: boolean;
  /** Whether to use full-bleed (no max-width) */
  fullBleed?: boolean;
}

const easeSmooth = [0.4, 0, 0.2, 1] as const;

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: easeSmooth as unknown as [number, number, number, number],
      staggerChildren: 0.06,
    },
  },
};

const childVariants = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: easeSmooth as unknown as [number, number, number, number] },
  },
};

export function PageTemplate({
  title,
  subtitle,
  icon,
  actions,
  filters,
  children,
  className,
  padded = true,
  fullBleed = false,
}: PageTemplateProps) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className={cn(
        'flex flex-col w-full min-w-0 h-full overflow-hidden',
        !fullBleed && 'max-w-full'
      )}
    >
      {/* ─── Header ─── */}
      <motion.header
        variants={childVariants}
        className={cn(
          'flex flex-col gap-3 shrink-0 border-b border-border/40 bg-card',
          padded ? 'px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4' : 'px-4 pt-4 pb-3'
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          {/* Title block */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-fluid-lg sm:text-fluid-xl font-bold text-foreground tracking-tight truncate leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-fluid-xs sm:text-fluid-sm text-muted-foreground truncate mt-0.5 leading-normal">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          {actions && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {actions}
            </div>
          )}
        </div>

        {/* Filters row */}
        {filters && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            {filters}
          </div>
        )}
      </motion.header>

      {/* ─── Content ─── */}
      <motion.div
        variants={childVariants}
        className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden min-h-0',
          padded && 'p-[var(--density-padding-x)] sm:p-[calc(var(--density-padding-x)*1.5)]',
          className
        )}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}