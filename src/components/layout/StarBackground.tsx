import { useMemo } from 'react';

interface Star {
  id: number;
  top: string;
  left: string;
  size: number;
  delay: string;
  duration: string;
}

const STAR_COUNT = 60;

function generateStars(count: number): Star[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: Math.random() * 1.5 + 0.5,
    delay: `${(Math.random() * 4).toFixed(2)}s`,
    duration: `${(3 + Math.random() * 4).toFixed(2)}s`,
  }));
}

function StarBackground() {
  const stars = useMemo(() => generateStars(STAR_COUNT), []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full bg-white/70 animate-pulse motion-reduce:animate-none"
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}

export default StarBackground;
