import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { ShaderMount as ShaderMountInstance } from '@paper-design/shaders';
import { Loader2 } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getLogger } from '@/lib/logger';

const log = getLogger('LiquidMetalButton');

export interface LiquidMetalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  count?: number | null;
  loading?: boolean;
  compact?: boolean;
}

export const LiquidMetalButton = forwardRef<HTMLButtonElement, LiquidMetalButtonProps>(
  ({ label = 'TALK ME', count, loading = false, compact = false, className, disabled, ...props }, ref) => {
    const shaderContainerRef = useRef<HTMLDivElement>(null);
    const shaderMountRef = useRef<ShaderMountInstance | null>(null);
    const [shaderReady, setShaderReady] = useState(false);
    const reduceMotion = useReducedMotion() ?? false;

    useEffect(() => {
      let cancelled = false;
      if (
        reduceMotion
        || !shaderContainerRef.current
        || typeof window === 'undefined'
        || !('WebGL2RenderingContext' in window)
      ) return;

      void import('@paper-design/shaders')
        .then(({ ShaderMount, liquidMetalFragmentShader }) => {
          if (cancelled || !shaderContainerRef.current) return;
          const mount = new ShaderMount(
            shaderContainerRef.current,
            liquidMetalFragmentShader,
            {
              u_repetition: 4,
              u_softness: 0.5,
              u_shiftRed: 0.3,
              u_shiftBlue: 0.3,
              u_distortion: 0,
              u_contour: 0,
              u_angle: 45,
              u_scale: 8,
              u_shape: 1,
              u_offsetX: 0.1,
              u_offsetY: -0.1,
            },
            { alpha: true, antialias: true },
            0.35,
            undefined,
            1,
            320 * 160,
          );
          mount.canvasElement.setAttribute('aria-hidden', 'true');
          Object.assign(mount.canvasElement.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            borderRadius: '9999px',
          });
          shaderMountRef.current = mount;
          setShaderReady(true);
        })
        .catch((error: unknown) => {
          log.warn('Shader indisponível; usando acabamento metálico estático', error);
          setShaderReady(false);
        });

      return () => {
        cancelled = true;
        shaderMountRef.current?.dispose();
        shaderMountRef.current = null;
      };
    }, [reduceMotion]);

    const setShaderSpeed = (speed: number) => shaderMountRef.current?.setSpeed(speed);
    const visibleCount = typeof count === 'number' ? Math.max(0, count) : null;

    return (
      <button
        ref={ref}
        {...props}
        type="button"
        disabled={disabled || loading}
        className={cn(
          'group relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          'border border-white/25 bg-zinc-950 text-white shadow-lg shadow-black/30',
          'transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-60 motion-reduce:transform-none',
          compact ? 'h-[38px] min-w-[108px] px-3' : 'h-[46px] min-w-[142px] px-4',
          className,
        )}
        aria-label={visibleCount === null ? label : `${label}: ${visibleCount} aguardando`}
        onPointerEnter={(event) => { setShaderSpeed(0.85); props.onPointerEnter?.(event); }}
        onPointerLeave={(event) => { setShaderSpeed(0.35); props.onPointerLeave?.(event); }}
        onFocus={(event) => { setShaderSpeed(0.85); props.onFocus?.(event); }}
        onBlur={(event) => { setShaderSpeed(0.35); props.onBlur?.(event); }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 -z-20 rounded-full',
            'bg-[linear-gradient(115deg,#fafafa_0%,#71717a_18%,#f4f4f5_38%,#18181b_58%,#d4d4d8_79%,#52525b_100%)]',
            !shaderReady && !reduceMotion && 'animate-pulse motion-reduce:animate-none',
          )}
        />
        <div ref={shaderContainerRef} aria-hidden="true" className="absolute inset-0 -z-10 rounded-full overflow-hidden" />
        <span aria-hidden="true" className="absolute inset-[2px] -z-[5] rounded-full bg-zinc-950/88 shadow-inner" />
        <span className="flex items-center gap-2 text-2xs font-black tracking-[0.15em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {label}
          {visibleCount !== null && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-3xs font-bold tracking-normal text-zinc-950 shadow">
              {visibleCount > 99 ? '99+' : visibleCount}
            </span>
          )}
        </span>
      </button>
    );
  },
);

LiquidMetalButton.displayName = 'LiquidMetalButton';
