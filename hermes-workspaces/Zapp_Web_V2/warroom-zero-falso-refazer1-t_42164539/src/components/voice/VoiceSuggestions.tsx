import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const SUGGESTION_COMMANDS = [
  '"Abrir a inbox"',
  '"Mostrar o dashboard"',
  '"Buscar contato João"',
  '"Ir para equipe"',
];

interface VoiceSuggestionsProps {
  visible: boolean;
}

export function VoiceSuggestions({ visible }: VoiceSuggestionsProps) {
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: prefersReduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReduced ? 0 : -8 }}
          transition={{ duration: 0.3 }}
          className="w-full space-y-2"
        >
          <p className="text-3xs text-white/25 text-center uppercase tracking-widest font-semibold">
            Experimente dizer
          </p>
          <div className="flex flex-col items-center gap-1.5">
            {SUGGESTION_COMMANDS.map((cmd, i) => (
              <motion.div
                key={cmd}
                initial={{ opacity: 0, y: prefersReduced ? 0 : 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prefersReduced ? 0 : i * 0.06 }}
                className="text-xs text-white/35 px-4 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:text-white/50 transition-colors cursor-default select-none"
              >
                {cmd}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
