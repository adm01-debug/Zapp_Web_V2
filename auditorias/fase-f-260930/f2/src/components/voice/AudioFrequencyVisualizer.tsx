import { useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { VoiceAgentPhase } from '@/hooks/voice/types';
import { usePhaseColors } from './usePhaseColors';

interface AudioFrequencyVisualizerProps {
  phase: VoiceAgentPhase;
}

const BAR_COUNT = 24;
const MIN_HEIGHT = 3;
const MAX_HEIGHT = 32;
const BAR_WIDTH = 3;
const BAR_GAP = 2;

/**
 * Canvas-based audio frequency visualizer that mimics real voice waveforms.
 * Renders smoothly at 60fps with phase-reactive animation speeds.
 */
export function AudioFrequencyVisualizer({ phase }: AudioFrequencyVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const barsRef = useRef<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));
  const targetsRef = useRef<number[]>(Array(BAR_COUNT).fill(MIN_HEIGHT));
  const phaseRef = useRef(phase);
  const prefersReduced = useReducedMotion();
  const colors = usePhaseColors(phase);
  const colorsRef = useRef(colors);

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { colorsRef.current = colors; }, [colors]);

  const isActive = phase === 'listening' || phase === 'speaking' || phase === 'processing';

  // Generate new random targets periodically
  const generateTargets = useCallback(() => {
    const p = phaseRef.current;
    const active = p === 'listening' || p === 'speaking' || p === 'processing';

    for (let i = 0; i < BAR_COUNT; i++) {
      // Voice-like distribution: center bars taller
      const distFromCenter = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
      const envelope = 1 - distFromCenter * 0.6;

      if (active) {
        // Simulate voice frequency patterns
        const base = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * envelope;
        const randomFactor = 0.3 + Math.random() * 0.7;
        targetsRef.current[i] = base * randomFactor;
      } else {
        // Idle: very subtle movement
        targetsRef.current[i] = MIN_HEIGHT + Math.random() * 4 * envelope;
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
    const canvasWidth = totalWidth;
    const canvasHeight = MAX_HEIGHT + 4;

    // HiDPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let targetUpdateTimer = 0;
    const TARGET_UPDATE_INTERVAL_MS = 120; // Update targets ~8x/sec for organic feel

    if (prefersReduced) {
      // Static bars for reduced motion
      generateTargets();
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      const c = colorsRef.current;
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * (BAR_WIDTH + BAR_GAP);
        const h = targetsRef.current[i];
        const y = (canvasHeight - h) / 2;
        const colorIdx = i % 3;
        ctx.fillStyle = colorIdx === 0 ? c.primary : colorIdx === 1 ? c.secondary : c.accent;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, h, 1.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;

      // Update targets periodically
      targetUpdateTimer += dt;
      if (targetUpdateTimer >= TARGET_UPDATE_INTERVAL_MS) {
        targetUpdateTimer = 0;
        generateTargets();
      }

      // Smooth interpolation toward targets
      const active = phaseRef.current === 'listening' || phaseRef.current === 'speaking' || phaseRef.current === 'processing';
      const lerpSpeed = active ? 0.15 : 0.08;

      for (let i = 0; i < BAR_COUNT; i++) {
        barsRef.current[i] += (targetsRef.current[i] - barsRef.current[i]) * lerpSpeed;
      }

      // Draw
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      const c = colorsRef.current;

      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * (BAR_WIDTH + BAR_GAP);
        const h = Math.max(MIN_HEIGHT, barsRef.current[i]);
        const y = (canvasHeight - h) / 2; // Center vertically

        // Color per bar — alternating primary/secondary/accent
        const colorIdx = i % 3;
        const color = colorIdx === 0 ? c.primary : colorIdx === 1 ? c.secondary : c.accent;
        // Convert hsl(...) to hsla(..., 0.5) for gradient stop
        const colorFaded = color.replace('hsl(', 'hsla(').replace(')', ', 0.5)');

        // Gradient per bar for depth
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, color);
        grad.addColorStop(1, colorFaded);

        ctx.fillStyle = grad;
        ctx.globalAlpha = active ? 0.9 : 0.5;
        ctx.beginPath();
        ctx.roundRect(x, y, BAR_WIDTH, h, 1.5);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(animate);
    };

    generateTargets();
    animRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animRef.current);
  }, [phase, prefersReduced, generateTargets, isActive]);

  const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  return (
    <div className="flex items-center justify-center h-10">
      <canvas
        ref={canvasRef}
        style={{ width: totalWidth, height: MAX_HEIGHT + 4 }}
        className="pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
