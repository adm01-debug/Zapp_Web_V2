import { forwardRef, useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { ShaderMount as ShaderMountInstance } from '@paper-design/shaders';
import { Loader2 } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getLogger } from '@/lib/logger';
import { emitTalkMeTelemetry } from '@/lib/talkme/telemetry';

const log = getLogger('LiquidMetalButton');

export interface LiquidMetalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  count?: number | null;
  loading?: boolean;
  compact?: boolean;
}

export const LiquidMetalButton = forwardRef<HTMLButtonElement, LiquidMetalButtonProps>(
  ({ label = 'TALK ME', count, loading = false, compact = false, className, disabled, 'aria-label': ariaLabel, ...props }, ref) => {
    const shaderContainerRef = useRef<HTMLDivElement>(null);
    const shaderMountRef = useRef<ShaderMountInstance | null>(null);
    const shaderSpeedRef = useRef(0.35);
    const [shaderReady, setShaderReady] = useState(false);
    const reduceMotion = useReducedMotion() ?? false;
    const applyShaderSpeed = useCallback((speed: number) => {
      try {
        shaderMountRef.current?.setSpeed(speed);
      } catch (error: unknown) {
        log.warn('Falha ao ajustar velocidade do shader metálico', error);
        emitTalkMeTelemetry('erro_shader', { tipo_erro: 'velocidade' });
      }
    }, []);

    useEffect(() => {
      let cancelled = false;
      let disposed = false;
      const disposeShader = () => {
        if (disposed) return;
        disposed = true;
        const mount = shaderMountRef.current;
        shaderMountRef.current = null;
        if (!mount) return;
        try {
          mount.dispose();
        } catch (error: unknown) {
          log.warn('Falha ao liberar shader metálico', error);
          emitTalkMeTelemetry('erro_shader', { tipo_erro: 'dispose' });
        }
      };
      if (
        reduceMotion
        || !shaderContainerRef.current
        || typeof window === 'undefined'
        || !('WebGL2RenderingContext' in window)
      ) return disposeShader;

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
          applyShaderSpeed(document.hidden ? 0 : shaderSpeedRef.current);
          setShaderReady(true);
        })
        .catch((error: unknown) => {
          log.warn('Shader indisponível; usando acabamento metálico estático', error);
          emitTalkMeTelemetry('erro_shader', { tipo_erro: 'inicializacao' });
          setShaderReady(false);
        });

      return () => {
        cancelled = true;
        disposeShader();
      };
    }, [applyShaderSpeed, reduceMotion]);

    useEffect(() => {
      const handleVisibilityChange = () => {
        applyShaderSpeed(document.hidden ? 0 : shaderSpeedRef.current);
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [applyShaderSpeed]);

    const setShaderSpeed = (speed: number) => {
      shaderSpeedRef.current = speed;
      applyShaderSpeed(document.hidden ? 0 : speed);
    };
    const visibleCount = typeof count === 'number' ? Math.max(0, count) : null;

    return (
      <button
        ref={ref}
        {...props}
        type="button"
        disabled={disabled || loading}
        className={cn(
          'group relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          'border border-white/25 bg-black text-white shadow-lg shadow-black/30',
          'transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-60 motion-reduce:transform-none',
          compact ? 'h-[38px] min-w-[108px] px-3' : 'h-[46px] min-w-[142px] px-4',
          className,
        )}
        aria-label={ariaLabel ?? (visibleCount === null ? label : `${label}: ${visibleCount} aguardando`)}
        aria-busy={loading || undefined}
        onPointerEnter={(event) => { setShaderSpeed(0.85); props.onPointerEnter?.(event); }}
        onPointerLeave={(event) => { setShaderSpeed(0.35); props.onPointerLeave?.(event); }}
        onFocus={(event) => { setShaderSpeed(0.85); props.onFocus?.(event); }}
        onBlur={(event) => { setShaderSpeed(0.35); props.onBlur?.(event); }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 z-0 rounded-full',
            'bg-[linear-gradient(115deg,#fafafa_0%,#71717a_18%,#f4f4f5_38%,#18181b_58%,#d4d4d8_79%,#52525b_100%)]',
            !shaderReady && !reduceMotion && 'animate-pulse motion-reduce:animate-none',
          )}
        />
        <div ref={shaderContainerRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-full" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-[2px] z-[1] rounded-full bg-black shadow-inner" />
        <span className="relative z-10 flex items-center gap-2 text-2xs font-black tracking-[0.15em]">
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
