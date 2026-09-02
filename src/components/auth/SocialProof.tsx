import { motion } from '@/components/ui/motion';
import { Users, MessageSquare, Zap, Shield } from 'lucide-react';

const stats = [
  { icon: Users, value: '10k+', label: 'Usuários ativos' },
  { icon: MessageSquare, value: '1M+', label: 'Mensagens/dia' },
  { icon: Zap, value: '99.9%', label: 'Uptime' },
  { icon: Shield, value: '100%', label: 'Seguro' },
];

/** Social Proof component. */
export function SocialProof() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="mt-6 border-t border-border/30 pt-6"
    >
      <div className="grid grid-cols-4 gap-2">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9 + index * 0.1 }}
            className="text-center"
          >
            <stat.icon className="mx-auto mb-1 h-4 w-4 text-primary" />
            <div className="text-sm font-bold text-foreground">{stat.value}</div>
            <div className="text-[10px] leading-tight text-muted-foreground">{stat.label}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
