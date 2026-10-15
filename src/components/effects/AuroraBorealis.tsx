import { motion, useReducedMotion } from 'framer-motion';

export function AuroraBorealis() {
  // Acessibilidade: com `prefers-reduced-motion: reduce` o fundo continua na
  // tela, porém estático — as ondas perdem a animação e as faíscas não são
  // montadas (nada se move depois do primeiro paint).
  const reduzirMovimento = useReducedMotion() ?? false;

  return (
    <div
      data-testid="aurora-borealis"
      className="absolute inset-x-0 top-0 h-64 overflow-hidden pointer-events-none z-0"
    >
      {/* Base gradient layer */}
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/5 via-transparent to-transparent" />
      
      {/* Aurora waves */}
      <motion.div
        data-testid="aurora-wave"
        className="absolute inset-x-0 top-0 h-48"
        style={{
          background: 'linear-gradient(180deg, hsl(var(--secondary) / 0.15) 0%, hsl(var(--primary) / 0.1) 30%, transparent 100%)',
          filter: 'blur(40px)',
        }}
        initial={reduzirMovimento ? false : { opacity: 0.3, scaleY: 1 }}
        animate={reduzirMovimento ? undefined : {
          opacity: [0.3, 0.6, 0.4, 0.7, 0.3],
          scaleY: [1, 1.2, 0.9, 1.1, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      {/* Purple wave 1 */}
      <motion.div
        data-testid="aurora-wave"
        className="absolute h-32 w-full"
        style={{
          top: '10%',
          background: 'radial-gradient(ellipse 80% 50% at 20% 50%, hsl(var(--secondary) / 0.25), transparent)',
          filter: 'blur(30px)',
        }}
        initial={reduzirMovimento ? false : { x: '-10%', opacity: 0.4, scaleX: 1 }}
        animate={reduzirMovimento ? undefined : {
          x: ['-10%', '30%', '10%', '-10%'],
          opacity: [0.4, 0.7, 0.5, 0.4],
          scaleX: [1, 1.3, 0.9, 1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      {/* Purple wave 2 */}
      <motion.div
        data-testid="aurora-wave"
        className="absolute h-24 w-full"
        style={{
          top: '5%',
          background: 'radial-gradient(ellipse 60% 40% at 70% 50%, hsl(var(--secondary) / 0.3), transparent)',
          filter: 'blur(25px)',
        }}
        initial={reduzirMovimento ? false : { x: '20%', opacity: 0.3, scaleX: 1.2 }}
        animate={reduzirMovimento ? undefined : {
          x: ['20%', '-20%', '0%', '20%'],
          opacity: [0.3, 0.6, 0.4, 0.3],
          scaleX: [1.2, 0.8, 1.1, 1.2],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      />
      
      {/* Green accent wave */}
      <motion.div
        data-testid="aurora-wave"
        className="absolute h-20 w-full"
        style={{
          top: '15%',
          background: 'radial-gradient(ellipse 50% 30% at 50% 50%, hsl(var(--primary) / 0.2), transparent)',
          filter: 'blur(20px)',
        }}
        initial={reduzirMovimento ? false : { x: '-5%', opacity: 0.2 }}
        animate={reduzirMovimento ? undefined : {
          x: ['-5%', '25%', '-15%', '-5%'],
          opacity: [0.2, 0.5, 0.3, 0.2],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
      />
      
      {/* Teal shimmer */}
      <motion.div
        data-testid="aurora-wave"
        className="absolute h-16 w-1/2"
        style={{
          top: '8%',
          left: '25%',
          background: 'radial-gradient(ellipse 100% 50% at 50% 50%, hsl(180 60% 50% / 0.15), transparent)',
          filter: 'blur(15px)',
        }}
        initial={reduzirMovimento ? false : { x: '-20%', opacity: 0.2, scaleX: 1 }}
        animate={reduzirMovimento ? undefined : {
          x: ['-20%', '40%', '0%', '-20%'],
          opacity: [0.2, 0.4, 0.3, 0.2],
          scaleX: [1, 1.5, 0.8, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.5,
        }}
      />
      
      {/* Sparkle particles */}
      {!reduzirMovimento && [...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          data-testid="aurora-sparkle"
          className="absolute w-1 h-1 rounded-full bg-secondary/60"
          style={{
            left: `${10 + i * 12}%`,
            top: `${15 + (i % 3) * 10}%`,
            filter: 'blur(0.5px)',
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            y: [0, -10, -20],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 0.4,
            ease: 'easeOut',
          }}
        />
      ))}
      
      {/* Top edge glow line */}
      <motion.div
        data-testid="aurora-glow-line"
        className="absolute top-0 inset-x-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, hsl(var(--secondary) / 0.5) 20%, hsl(var(--primary) / 0.4) 50%, hsl(var(--secondary) / 0.5) 80%, transparent 100%)',
        }}
        initial={reduzirMovimento ? false : { opacity: 0.3 }}
        animate={reduzirMovimento ? undefined : {
          opacity: [0.3, 0.8, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}
