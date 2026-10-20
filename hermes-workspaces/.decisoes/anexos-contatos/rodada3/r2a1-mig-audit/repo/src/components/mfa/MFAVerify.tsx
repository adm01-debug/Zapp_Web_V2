import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Loader2 } from 'lucide-react';
import { useMFA } from '@/hooks/auth/useMFA';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface MFAVerifyProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
}

export function MFAVerify({ 
  onSuccess, 
  onCancel,
  title = 'Verificação 2FA',
  description = 'Digite o código do seu app autenticador'
}: MFAVerifyProps) {
  const { verifyTOTP, factors, fetchFactors, loading } = useMFA();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFactors();
  }, [fetchFactors]);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    
    const verifiedFactor = factors.find(f => f.status === 'verified');
    if (!verifiedFactor) {
      setError('Nenhum fator MFA encontrado');
      return;
    }

    setVerifying(true);
    setError('');
    
    try {
      await verifyTOTP(verifiedFactor.id, code);
      onSuccess?.();
    } catch (err: unknown) {
      setError('Código inválido. Tente novamente.');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (code.length === 6 && !verifying) {
      handleVerify();
    }
  }, [code]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center"
        >
          <Shield className="w-6 h-6 text-primary" />
        </motion.div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mfa-code">Código de Verificação</Label>
          <Input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setError('');
              setCode(e.target.value.replace(/\D/g, ''));
            }}
            className={`text-center text-2xl tracking-widest font-mono ${error ? 'border-destructive' : ''}`}
            disabled={verifying || loading}
            autoFocus
          />
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive text-center"
            >
              {error}
            </motion.p>
          )}
        </div>

        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button 
            className="flex-1" 
            onClick={handleVerify}
            disabled={code.length !== 6 || verifying}
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              'Verificar'
            )}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Abra seu app autenticador e digite o código de 6 dígitos
        </p>
      </CardContent>
    </Card>
  );
}
