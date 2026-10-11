import { motion, useReducedMotion } from 'framer-motion';
import { Users, MessageSquare, Zap, Shield } from 'lucide-react';

const stats = [
  { icon: Users, value: '10k+', label: 'Usuários ativos' },
  { icon: MessageSquare, value: '1M+', label: 'Mensagens/dia' },
  { icon: Zap, value: '99.9%', label: 'Uptime' },
  { icon: Shield, value: '100%', label: 'Seguro' },
];

/**
 * Faixa de estatísticas do cartão de login (V3).
 *
 * Grade de 4 colunas separada do formulário por uma linha (`border-t`). Cada item
 * tem ícone lucide em `primary`, valor em negrito e rótulo pequeno. Com
 * `prefers-reduced-motion: reduce` a entrada é pulada (`initial={false}` e
 * duração 0), então nada se desloca — o conteúdo aparece no primeiro paint.
 */
export function SocialProof() {
  const reduzirMovimento = useReducedMotion();

  return (
    <motion.div
      data-testid="social-proof"
      initial={reduzirMovimento ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduzirMovimento ? 0 : 0.4, delay: reduzirMovimento ? 0 : 0.8 }}
      className="mt-6 border-t border-border/30 pt-4"
    >
      <div className="grid grid-cols-4 gap-2">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            data-testid="social-proof-item"
            initial={reduzirMovimento ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduzirMovimento ? 0 : 0.25,
              delay: reduzirMovimento ? 0 : 0.9 + index * 0.1,
            }}
            className="flex min-w-0 flex-col items-center text-center"
          >
            <stat.icon className="mb-1 h-4 w-4 text-primary" aria-hidden="true" />
            <div className="text-sm font-bold text-foreground">{stat.value}</div>
            <div className="text-2xs leading-tight break-words text-muted-foreground">{stat.label}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
