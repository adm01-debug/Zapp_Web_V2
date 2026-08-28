import { motion } from 'framer-motion';
import { Inbox, Sparkles, ShieldCheck } from 'lucide-react';

const pillars = [
  {
    n: '01',
    icon: Inbox,
    title: 'Inbox omnichannel',
    description: 'WhatsApp, Email, Voz e Web em uma única caixa, com SLA e filas inteligentes.',
  },
  {
    n: '02',
    icon: Sparkles,
    title: 'IA que responde por você',
    description: 'Sugestões, resumos e atendimento autônomo treinados na sua operação.',
  },
  {
    n: '03',
    icon: ShieldCheck,
    title: 'Segurança corporativa',
    description: 'Criptografia, MFA, RLS estrita e auditoria completa de cada conversa.',
  },
];

const metrics = [
  { value: '10k+', label: 'Times ativos' },
  { value: '1.4M', label: 'Msgs / dia' },
  { value: '99.9%', label: 'Uptime' },
  { value: '< 30s', label: 'Resposta' },
];

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
});

export function HeroBenefits() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden px-6 py-8 lg:px-14 lg:py-14">
      {/* Status chip */}
      <motion.div {...fade(0.1)} className="flex items-center gap-2 self-start rounded-full border border-border/40 bg-card/40 px-3 py-1.5 backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          ZAPP Web · v2 · Online
        </span>
      </motion.div>

      {/* Editorial headline */}
      <div className="my-10 lg:my-0">
        <motion.h1
          {...fade(0.2)}
          className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-foreground lg:text-[clamp(2.75rem,4.5vw,4.25rem)]"
        >
          O centro de comando do{' '}
          <span className="bg-gradient-to-r from-primary via-primary to-secondary bg-clip-text text-transparent">
            atendimento moderno.
          </span>
        </motion.h1>
        <motion.p {...fade(0.3)} className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground lg:text-lg">
          Uma plataforma para conversar, automatizar e mensurar — sem trocar de aba, sem perder o cliente.
        </motion.p>
      </div>

      {/* Pillars — numbered horizontal rows */}
      <ul className="space-y-1">
        {pillars.map((p, i) => (
          <motion.li key={p.n} {...fade(0.4 + i * 0.08)} className="group">
            <div className="flex items-start gap-5 border-t border-border/40 py-5 transition-colors hover:border-primary/40">
              <span className="font-display text-xs font-semibold tracking-[0.2em] text-muted-foreground/70">
                {p.n}
              </span>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/20 transition-all group-hover:bg-primary/15 group-hover:ring-primary/40">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 pt-0.5">
                <h2 className="text-base font-semibold text-foreground">{p.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
              </div>
            </div>
          </motion.li>
        ))}
        <li className="border-t border-border/40" />
      </ul>

      {/* Metrics strip */}
      <motion.div
        {...fade(0.8)}
        className="mt-10 hidden grid-cols-4 divide-x divide-border/40 rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm lg:grid"
      >
        {metrics.map((m) => (
          <div key={m.label} className="px-4 py-4 text-center">
            <div className="font-display text-2xl font-bold tracking-tight text-foreground">{m.value}</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {m.label}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
