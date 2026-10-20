import { useMemo, useEffect, useState } from 'react';
import type { VoiceAgentPhase } from '@/hooks/voice/types';

interface PhaseColors {
  primary: string;
  secondary: string;
  accent: string;
  glow1: string;
  glow2: string;
  particles: string[];
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function usePhaseColors(phase: VoiceAgentPhase): PhaseColors {
  const [themeHue, setThemeHue] = useState(220);

  useEffect(() => {
    const readHue = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      const match = raw.match(/^(\d+)/);
      if (match) setThemeHue(parseInt(match[1], 10));
    };
    readHue();
    const observer = new MutationObserver(readHue);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);

  return useMemo(() => {
    const h = themeHue;
    switch (phase) {
      case 'listening':
        return {
          primary: hsl(h, 80, 60),
          secondary: hsl(330, 80, 60),
          accent: hsl(270, 70, 55),
          glow1: hsl(h, 70, 40),
          glow2: hsl(330, 70, 40),
          particles: [hsl(250, 80, 70), hsl(270, 80, 70), hsl(290, 80, 70)],
        };
      case 'processing':
        return {
          primary: hsl(270, 80, 60),
          secondary: hsl(330, 80, 60),
          accent: hsl(300, 70, 55),
          glow1: hsl(270, 70, 40),
          glow2: hsl(330, 70, 40),
          particles: [hsl(270, 80, 70), hsl(290, 80, 70), hsl(310, 80, 70)],
        };
      case 'speaking':
        return {
          primary: hsl(330, 80, 60),
          secondary: hsl(h, 80, 60),
          accent: hsl(300, 70, 55),
          glow1: hsl(330, 70, 40),
          glow2: hsl(h, 70, 40),
          particles: [hsl(200, 80, 70), hsl(250, 80, 70), hsl(270, 80, 70)],
        };
      case 'error':
        return {
          primary: hsl(0, 80, 55),
          secondary: hsl(330, 70, 45),
          accent: hsl(15, 80, 50),
          glow1: hsl(0, 70, 35),
          glow2: hsl(330, 60, 35),
          particles: [hsl(0, 80, 60), hsl(15, 80, 60), hsl(30, 80, 60)],
        };
      case 'booting':
      case 'idle':
      default:
        return {
          primary: hsl(h, 70, 55),
          secondary: hsl(270, 60, 50),
          accent: hsl(330, 60, 50),
          glow1: hsl(h, 60, 30),
          glow2: hsl(270, 50, 30),
          particles: [hsl(220, 70, 65), hsl(240, 70, 65), hsl(260, 70, 65)],
        };
    }
  }, [phase, themeHue]);
}
