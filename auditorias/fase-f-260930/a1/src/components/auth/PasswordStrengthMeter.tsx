import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertTriangle, Shield, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { log } from '@/lib/logger';

interface PasswordStrengthMeterProps {
  password: string;
  onStrengthChange?: (strength: number, isValid: boolean) => void;
}

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
  weight: number;
}

const requirements: PasswordRequirement[] = [
  { label: 'Mínimo 8 caracteres', test: (p) => p.length >= 8, weight: 1 },
  { label: 'Letra maiúscula (A-Z)', test: (p) => /[A-Z]/.test(p), weight: 1 },
  { label: 'Letra minúscula (a-z)', test: (p) => /[a-z]/.test(p), weight: 1 },
  { label: 'Número (0-9)', test: (p) => /\d/.test(p), weight: 1 },
  { label: 'Caractere especial (!@#$%)', test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p), weight: 1 },
];

// Simple hash function for k-anonymity check
async function sha1Hash(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function PasswordStrengthMeter({ password, onStrengthChange }: PasswordStrengthMeterProps) {
  const [isBreached, setIsBreached] = useState<boolean | null>(null);
  const [checkingBreach, setCheckingBreach] = useState(false);
  const [breachCount, setBreachCount] = useState<number>(0);

  const metRequirements = useMemo(() => {
    return requirements.filter((req) => req.test(password));
  }, [password]);

  const strength = useMemo(() => {
    if (!password) return 0;
    let score = metRequirements.length;
    
    // Bonus for length
    if (password.length >= 12) score += 0.5;
    if (password.length >= 16) score += 0.5;
    
    return Math.min(score, requirements.length + 1);
  }, [password, metRequirements]);

  const strengthPercent = useMemo(() => {
    return Math.round((strength / (requirements.length + 1)) * 100);
  }, [strength]);

  const strengthLabel = useMemo(() => {
    if (strength === 0) return '';
    if (strengthPercent < 40) return 'Fraca';
    if (strengthPercent < 60) return 'Razoável';
    if (strengthPercent < 80) return 'Boa';
    return 'Forte';
  }, [strength, strengthPercent]);

  const strengthColor = useMemo(() => {
    if (strengthPercent < 40) return { bg: 'bg-destructive', text: 'text-destructive', glow: 'shadow-destructive/50' };
    if (strengthPercent < 60) return { bg: 'bg-warning', text: 'text-warning', glow: 'shadow-warning/50' };
    if (strengthPercent < 80) return { bg: 'bg-info', text: 'text-info', glow: 'shadow-blue-500/50' };
    return { bg: 'bg-success', text: 'text-success', glow: 'shadow-green-500/50' };
  }, [strengthPercent]);

  const isValid = metRequirements.length === requirements.length && isBreached !== true;

  // Check for breached passwords using HaveIBeenPwned API
  useEffect(() => {
    if (!password || password.length < 8) {
      setIsBreached(null);
      setBreachCount(0);
      return;
    }

    const checkBreach = async () => {
      setCheckingBreach(true);
      try {
        const hash = await sha1Hash(password);
        const prefix = hash.substring(0, 5);
        const suffix = hash.substring(5);

        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { 'Add-Padding': 'true' }
        });

        if (!response.ok) {
          setIsBreached(null);
          return;
        }

        const text = await response.text();
        const lines = text.split('\n');
        
        for (const line of lines) {
          const [hashSuffix, count] = line.split(':');
          if (hashSuffix.trim() === suffix) {
            setIsBreached(true);
            setBreachCount(parseInt(count.trim(), 10));
            return;
          }
        }
        
        setIsBreached(false);
        setBreachCount(0);
      } catch (error) {
        log.error('Error checking password breach:', error);
        setIsBreached(null);
      } finally {
        setCheckingBreach(false);
      }
    };

    const debounce = setTimeout(checkBreach, 500);
    return () => clearTimeout(debounce);
  }, [password]);

  // Notify parent of strength changes
  useEffect(() => {
    onStrengthChange?.(strength, isValid);
  }, [strength, isValid, onStrengthChange]);

  if (!password) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3 mt-3"
    >
      {/* Strength Bar with Glow Effect */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {strengthPercent >= 80 ? (
              <ShieldCheck className={`w-4 h-4 ${strengthColor.text}`} />
            ) : strengthPercent >= 40 ? (
              <Shield className={`w-4 h-4 ${strengthColor.text}`} />
            ) : (
              <ShieldAlert className={`w-4 h-4 ${strengthColor.text}`} />
            )}
            <span className={`text-sm font-medium ${strengthColor.text}`}>
              {strengthLabel}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {strengthPercent}%
          </span>
        </div>
        
        <div className="relative h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${strengthPercent}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`absolute inset-y-0 left-0 rounded-full ${strengthColor.bg} shadow-lg ${strengthColor.glow}`}
          />
          {/* Animated pulse for strong passwords */}
          {strengthPercent >= 80 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={`absolute inset-y-0 left-0 rounded-full ${strengthColor.bg}`}
              style={{ width: `${strengthPercent}%` }}
            />
          )}
        </div>
      </div>

      {/* Breach Warning */}
      <AnimatePresence>
        {checkingBreach && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-2 rounded-lg bg-muted"
          >
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Verificando em bancos de vazamentos...
            </span>
          </motion.div>
        )}
        
        {!checkingBreach && isBreached === true && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
          >
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Senha comprometida!
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Esta senha apareceu em {breachCount.toLocaleString()} vazamentos de dados. 
                Escolha outra senha para sua segurança.
              </p>
            </div>
          </motion.div>
        )}

        {!checkingBreach && isBreached === false && password.length >= 8 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-2 p-2 rounded-lg bg-success/10 border border-success/20"
          >
            <ShieldCheck className="w-4 h-4 text-success" />
            <span className="text-xs text-success dark:text-success">
              Senha não encontrada em vazamentos conhecidos
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Requirements Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg bg-muted/50">
        {requirements.map((req, index) => {
          const met = req.test(password);
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-2"
            >
              <motion.div
                initial={false}
                animate={{ 
                  scale: met ? [1, 1.2, 1] : 1,
                  rotate: met ? [0, 10, 0] : 0
                }}
                transition={{ duration: 0.3 }}
              >
                {met ? (
                  <div className="p-0.5 rounded-full bg-success/20">
                    <Check className="w-3 h-3 text-success" />
                  </div>
                ) : (
                  <div className="p-0.5 rounded-full bg-muted">
                    <X className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
              <span className={`text-xs transition-colors ${
                met ? 'text-success dark:text-success font-medium' : 'text-muted-foreground'
              }`}>
                {req.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Tips */}
      {password.length > 0 && password.length < 12 && metRequirements.length >= 3 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-muted-foreground flex items-center gap-1"
        >
          💡 Dica: senhas com 12+ caracteres são ainda mais seguras
        </motion.p>
      )}
    </motion.div>
  );
}
