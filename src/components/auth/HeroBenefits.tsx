import { motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Bot, BarChart3, Users, Clock, Shield } from 'lucide-react';

const benefits = [
  {
    icon: MessageCircle,
    title: 'Inbox Unificado',
    description: 'Todas conversas em um só lugar',
  },
  {
    icon: Bot,
    title: 'IA Integrada',
    description: 'Respostas automáticas inteligentes',
  },
  {
    icon: BarChart3,
    title: 'Analytics Avançado',
    description: 'Métricas em tempo real',
  },
  {
    icon: Users,
    title: 'Multi-agentes',
    description: 'Colaboração de equipe eficiente',
  },
  {
    icon: Clock,
    title: 'SLA Tracking',
    description: 'Monitore tempos de resposta',
  },
  {
    icon: Shield,
    title: 'Segurança Total',
    description: 'Dados criptografados',
  },
];

/**
 * Painel de apresentação do /auth (coluna esquerda no desktop).
 * Fundo transparente de propósito: o mapa de fundo da tela passa por trás.
 */
export function HeroBenefits() {
  const reduceMotion = useReducedMotion() ?? false;
  // Entrada e hover desligados quando o usuário pediu menos movimento.
  const enter = (delay: number) =>
    reduceMotion
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { delay },
        };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reduceMotion ? 0 : 0.6 }}
      className="flex w-full flex-col justify-center px-4 py-4 lg:px-12 lg:py-8"
    >
      <motion.h2
        initial={reduceMotion ? false : { opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.7 }}
        className="mb-1 text-lg font-bold text-foreground lg:mb-2 lg:text-2xl"
      >
        Tudo que você precisa para
      </motion.h2>
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: reduceMotion ? 0 : 0.8 }}
        className="mb-4 bg-gradient-to-r from-primary to-[hsl(var(--primary-text))] bg-clip-text text-xl font-bold text-transparent lg:mb-8 lg:text-3xl"
      >
        atender com excelência
      </motion.p>

      <ul className="grid grid-cols-3 gap-2 lg:grid-cols-2 lg:gap-4">
        {benefits.map((benefit, index) => (
          <motion.li
            key={benefit.title}
            {...enter(reduceMotion ? 0 : 0.9 + index * 0.1)}
            whileHover={reduceMotion ? undefined : { scale: 1.02, x: 5 }}
            className="flex cursor-default flex-col items-center gap-1.5 rounded-lg border border-border/30 bg-card p-2 text-center transition-all hover:border-primary/30 lg:flex-row lg:items-start lg:gap-3 lg:p-3 lg:text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 lg:h-10 lg:w-10">
              <benefit.icon aria-hidden="true" className="h-4 w-4 text-primary lg:h-5 lg:w-5" />
            </div>
            <div>
              <h3 className="text-2xs font-semibold leading-tight text-foreground lg:text-sm">
                {benefit.title}
              </h3>
              <p className="mt-0.5 hidden text-3xs text-muted-foreground lg:block lg:text-xs">
                {benefit.description}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>

      {/* Testemunho — apenas no desktop */}
      <motion.figure
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : 1.5 }}
        className="mt-8 hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 p-4 lg:block"
      >
        <blockquote className="text-sm italic text-muted-foreground">
          "Nós somos o que fazemos repetidamente; a excelência, portanto, não é um ato, mas um
          hábito."
        </blockquote>
        <figcaption className="mt-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-primary-foreground">
            AR
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Aristóteles</p>
            <p className="text-3xs text-muted-foreground">Filósofo</p>
          </div>
        </figcaption>
      </motion.figure>
    </motion.div>
  );
}
