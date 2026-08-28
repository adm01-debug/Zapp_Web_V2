import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

export function SocialProof() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="mt-6 flex items-center justify-between gap-3 border-t border-border/30 pt-4 text-[11px] text-muted-foreground"
    >
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-success" />
        <span className="font-medium">Conexão criptografada</span>
      </div>
      <div className="flex items-center gap-3 font-mono uppercase tracking-widest">
        <span>SOC 2</span>
        <span className="text-border">·</span>
        <span>LGPD</span>
        <span className="text-border">·</span>
        <span>99.9% SLA</span>
      </div>
    </motion.div>
  );
}
