import React, { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ImageOff } from 'lucide-react';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  aspectRatio?: '1:1' | '4:3' | '16:9' | '3:2' | '2:3';
  fallback?: React.ReactNode;
  placeholder?: 'blur' | 'shimmer' | 'pulse' | 'none';
  placeholderColor?: string;
  priority?: boolean;
  onLoadComplete?: () => void;
  containerClassName?: string;
}

const aspectRatioClasses = {
  '1:1': 'aspect-square',
  '4:3': 'aspect-[4/3]',
  '16:9': 'aspect-video',
  '3:2': 'aspect-[3/2]',
  '2:3': 'aspect-[2/3]',
};

export const OptimizedImage = memo(function OptimizedImage({
  src,
  alt,
  width,
  height,
  aspectRatio,
  fallback,
  placeholder = 'shimmer',
  placeholderColor = 'hsl(var(--muted))',
  priority = false,
  onLoadComplete,
  className,
  containerClassName,
  ...props
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '100px', threshold: 0.01 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoadComplete?.();
  };

  const handleError = () => {
    setHasError(true);
  };

  const renderPlaceholder = () => {
    if (placeholder === 'none') return null;

    const baseClasses = 'absolute inset-0 w-full h-full';

    switch (placeholder) {
      case 'shimmer':
        return (
          <div className={cn(baseClasses, 'bg-muted overflow-hidden')}>
            <motion.div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{ translateX: ['0%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        );
      case 'pulse':
        return (
          <motion.div
            className={cn(baseClasses, 'bg-muted')}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        );
      case 'blur':
        return (
          <div
            className={cn(baseClasses, 'backdrop-blur-lg')}
            style={{ backgroundColor: placeholderColor }}
          />
        );
      default:
        return <div className={cn(baseClasses, 'bg-muted')} />;
    }
  };

  const renderFallback = () => {
    if (fallback) return fallback;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted">
        <div className="text-center text-muted-foreground">
          <ImageOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Imagem indisponível</p>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden',
        aspectRatio && aspectRatioClasses[aspectRatio],
        containerClassName
      )}
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
      }}
    >
      {/* Placeholder */}
      <AnimatePresence>
        {!isLoaded && !hasError && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            {renderPlaceholder()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error fallback */}
      {hasError && renderFallback()}

      {/* Actual image */}
      {isInView && !hasError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0"
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              'w-full h-full object-cover',
              className
            )}
            {...props}
          />
        </motion.div>
      )}
    </div>
  );
});

// Optimized Avatar component
interface OptimizedAvatarProps {
  src?: string | null;
  alt: string;
  fallbackText?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'away' | 'offline' | 'busy';
  className?: string;
}

const avatarSizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

const statusColors = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-muted-foreground',
  busy: 'bg-destructive',
};

const statusSizes = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-4 h-4',
};

export const OptimizedAvatar = memo(function OptimizedAvatar({
  src,
  alt,
  fallbackText,
  size = 'md',
  status,
  className,
}: OptimizedAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const initials = fallbackText
    ? fallbackText
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : alt
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

  return (
    <div className={cn('relative inline-flex', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden bg-primary/10 flex items-center justify-center ring-2 ring-border/50',
          avatarSizes[size]
        )}
      >
        {src && !hasError ? (
          <>
            {/* Placeholder */}
            {!isLoaded && (
              <motion.div
                className="absolute inset-0 bg-muted"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
              className={cn(
                'w-full h-full object-cover transition-opacity duration-300',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
            />
          </>
        ) : (
          <span className="font-semibold text-primary">{initials}</span>
        )}
      </div>

      {/* Status indicator */}
      {status && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-background',
            statusColors[status],
            statusSizes[size]
          )}
        />
      )}
    </div>
  );
});
