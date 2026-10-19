export function FloatingParticles() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: 0 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="absolute h-1 w-1 rounded-full bg-primary/20"
          style={{
            left: `${15 + i * 15}%`,
            top: `${10 + i * 12}%`,
            animation: `pulse ${2 + i * 0.5}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
