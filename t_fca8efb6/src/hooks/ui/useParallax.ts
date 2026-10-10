import { useEffect, useState, useRef, useCallback } from 'react';

interface ParallaxOptions {
  speed?: number;
  direction?: 'vertical' | 'horizontal';
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out';
}

interface ScrollProgress {
  progress: number;
  direction: 'up' | 'down' | 'none';
  velocity: number;
}

export function useParallax(options: ParallaxOptions = {}) {
  const { speed = 0.5, direction = 'vertical' } = options;
  const [offset, setOffset] = useState(0);
  const [scrollProgress, setScrollProgress] = useState<ScrollProgress>({
    progress: 0,
    direction: 'none',
    velocity: 0
  });
  const lastScrollY = useRef(0);
  const lastTime = useRef(Date.now());

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const currentTime = Date.now();
      const deltaTime = currentTime - lastTime.current;
      const deltaScroll = currentScrollY - lastScrollY.current;
      
      const velocity = deltaTime > 0 ? Math.abs(deltaScroll / deltaTime) : 0;
      const scrollDirection = deltaScroll > 0 ? 'down' : deltaScroll < 0 ? 'up' : 'none';
      
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? currentScrollY / maxScroll : 0;

      setOffset(currentScrollY * speed);
      setScrollProgress({
        progress,
        direction: scrollDirection,
        velocity
      });

      lastScrollY.current = currentScrollY;
      lastTime.current = currentTime;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed]);

  const getTransform = useCallback(() => {
    if (direction === 'horizontal') {
      return `translateX(${offset}px)`;
    }
    return `translateY(${offset}px)`;
  }, [offset, direction]);

  return { offset, scrollProgress, getTransform };
}

export function useScrollReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setIsVisible(true);
          setHasAnimated(true);
        }
      },
      { threshold, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, hasAnimated]);

  return { ref, isVisible };
}

export function useMouseParallax(intensity = 0.02) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      
      const x = (e.clientX - centerX) * intensity;
      const y = (e.clientY - centerY) * intensity;
      
      setPosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [intensity]);

  return position;
}

export function useSmoothScroll() {
  const scrollTo = useCallback((targetId: string, offset = 0) => {
    const element = document.getElementById(targetId);
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  return { scrollTo };
}
