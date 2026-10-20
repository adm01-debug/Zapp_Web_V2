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
 * Entrada curta e escalonada: só `transform`/`opacity`, 40 ms entre um item e
 * o seguinte (pedido do cartão L1: "até 40 ms por item").
 */
const PASSO_ENTRADA = 0.04;
const BASE_ENTRADA = 0.1;
const DURACAO_ENTRADA = 0.25;

/**
 * Painel de apresentação do /auth (coluna esquerda no desktop; acima do
 * formulário no celular). Fundo transparente de propósito: o mapa de fundo da
 * tela passa por trás — por isso os cartões de benefício são translúcidos
 * (`bg-card/60`) com `backdrop-blur-sm`, para o texto ficar legível sobre o mapa.
 */
export function HeroBenefits() {
  const reduceMotion = useReducedMotion() ?? false;

  // Com movimento reduzido nada se desloca: `initial={false}` e atraso 0.
  const entrada = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: DURACAO_ENTRADA, delay },
        };

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : DURACAO_ENTRADA, delay: reduceMotion ? 0 : BASE_ENTRADA }}
      className="flex w-full flex-col justify-center px-4 py-4 lg:px-12 lg:py-8"
    >
      <motion.h2
        {...entrada(reduceMotion ? 0 : BASE_ENTRADA + PASSO_ENTRADA)}
        className="mb-1 text-lg font-bold text-foreground lg:mb-2 lg:text-2xl"
      >
        Tudo que você precisa para
      </motion.h2>
      <motion.p
        {...entrada(reduceMotion ? 0 : BASE_ENTRADA + PASSO_ENTRADA * 2)}
        className="mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-xl font-bold text-transparent lg:mb-8 lg:text-3xl"
      >
        atender com excelência
      </motion.p>

      <ul className="grid grid-cols-3 gap-2 lg:grid-cols-2 lg:gap-4">
        {benefits.map((benefit, index) => (
          <motion.li
            key={benefit.title}
            {...entrada(reduceMotion ? 0 : BASE_ENTRADA + 0.15 + index * PASSO_ENTRADA)}
            whileHover={reduceMotion ? undefined : { scale: 1.02, y: -2 }}
            className="flex cursor-default flex-col items-center gap-1.5 rounded-lg border border-border/30 bg-card/60 p-2 text-center backdrop-blur-sm transition-colors hover:border-primary/30 lg:flex-row lg:items-start lg:gap-3 lg:p-3 lg:text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 lg:h-10 lg:w-10">
              <benefit.icon aria-hidden="true" className="h-4 w-4 text-primary lg:h-5 lg:w-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold leading-tight text-foreground lg:text-sm">
                {benefit.title}
              </h3>
              <p className="mt-0.5 hidden text-xs text-muted-foreground lg:block">
                {benefit.description}
              </p>
            </div>
          </motion.li>
        ))}
      </ul>

      {/* Testemunho — apenas no desktop */}
      <motion.figure
        {...entrada(reduceMotion ? 0 : BASE_ENTRADA + 0.35)}
        className="mt-8 hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 p-4 lg:block"
      >
        <blockquote className="text-sm italic text-muted-foreground">
          “Nós somos o que fazemos repetidamente; a excelência, portanto, não é um ato, mas um
          hábito.”
        </blockquote>
        <figcaption className="mt-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-primary-foreground">
            AR
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">Aristóteles</p>
            <p className="text-xs text-muted-foreground">Filósofo</p>
          </div>
        </figcaption>
      </motion.figure>
    </motion.div>
  );
}
