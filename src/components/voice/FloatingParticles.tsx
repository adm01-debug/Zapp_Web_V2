import { useEffect, useRef, useMemo } from 'react';
import type { VoiceAgentPhase } from '@/hooks/voice/types';

interface FloatingParticlesProps {
  phase: VoiceAgentPhase;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
}

const PHASE_CONFIG: Record<string, { count: number; speed: number; hueRange: [number, number] }> = {
  idle: { count: 20, speed: 0.3, hueRange: [220, 260] },
  booting: { count: 15, speed: 0.2, hueRange: [220, 260] },
  listening: { count: 40, speed: 0.6, hueRange: [250, 290] },
  processing: { count: 35, speed: 0.8, hueRange: [270, 310] },
  speaking: { count: 50, speed: 0.5, hueRange: [200, 270] },
  error: { count: 25, speed: 0.4, hueRange: [0, 30] },
};

export function FloatingParticles({ phase }: FloatingParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const dimsRef = useRef({ w: 0, h: 0 });
  const prefersReduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimsRef.current = { w, h };
    };
    resize();
    window.addEventListener('resize', resize);

    // Reduced motion: draw static dots once, no animation loop
    if (prefersReduced) {
      const config = PHASE_CONFIG[phase] || PHASE_CONFIG.idle;
      const { w, h } = dimsRef.current;
      ctx.clearRect(0, 0, w, h);
      const count = Math.min(config.count, 15); // fewer for static view
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const hue = config.hueRange[0] + Math.random() * (config.hueRange[1] - config.hueRange[0]);
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 70%, 0.4)`;
        ctx.fill();
      }
      return () => window.removeEventListener('resize', resize);
    }

    const config = PHASE_CONFIG[phase] || PHASE_CONFIG.idle;
    const { w, h } = dimsRef.current;

    // Update existing particles' velocities and hues for new phase
    for (const p of particlesRef.current) {
      p.vx = (Math.random() - 0.5) * config.speed;
      p.vy = (Math.random() - 0.5) * config.speed;
      p.hue = config.hueRange[0] + Math.random() * (config.hueRange[1] - config.hueRange[0]);
    }

    // Add or trim particles to match target count
    while (particlesRef.current.length < config.count) {
      particlesRef.current.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * config.speed,
        vy: (Math.random() - 0.5) * config.speed,
        life: Math.random() * 200,
        maxLife: 200 + Math.random() * 200,
        hue: config.hueRange[0] + Math.random() * (config.hueRange[1] - config.hueRange[0]),
        size: 1 + Math.random() * 2,
      });
    }
    particlesRef.current = particlesRef.current.slice(0, config.count);

    const animate = () => {
      const { w: cw, h: ch } = dimsRef.current;
      ctx.clearRect(0, 0, cw, ch);
      const particles = particlesRef.current;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        if (p.life > p.maxLife || p.x < 0 || p.x > cw || p.y < 0 || p.y > ch) {
          p.x = Math.random() * cw;
          p.y = Math.random() * ch;
          p.life = 0;
          p.hue = config.hueRange[0] + Math.random() * (config.hueRange[1] - config.hueRange[0]);
        }

        const alpha = Math.min(1, p.life / 30) * Math.max(0, 1 - (p.life / p.maxLife));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${alpha * 0.6})`;
        ctx.fill();
      }

      // Constellation lines
      // Limit constellation checks to avoid O(n²) on large counts
      const maxCheck = Math.min(particles.length, 30);
      for (let i = 0; i < maxCheck; i++) {
        for (let j = i + 1; j < maxCheck; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 14400) { // 120²
            const dist = Math.sqrt(distSq);
            const lineAlpha = (1 - dist / 120) * 0.12;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(${particles[i].hue}, 60%, 60%, ${lineAlpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [phase]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
