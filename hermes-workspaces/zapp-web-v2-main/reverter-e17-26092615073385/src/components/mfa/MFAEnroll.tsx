import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Smartphone, Copy, Check, Loader2 } from 'lucide-react';
import { useMFA } from '@/hooks/auth/useMFA';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface MFAEnrollProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function MFAEnroll({ onSuccess, onCancel }: MFAEnrollProps) {
  const { enrollTOTP, verifyTOTP, loading, enrollmentData } = useMFA();
  const [step, setStep] = useState<'intro' | 'qr' | 'verify'>('intro');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleStartEnrollment = async () => {
    try {
      await enrollTOTP();
      setStep('qr');
    } catch (err) {
      // Error handled in hook
    }
  };

  const handleCopySecret = () => {
    if (enrollmentData?.totp.secret) {
      navigator.clipboard.writeText(enrollmentData.totp.secret);
      setCopied(true);
      toast.success('Código copiado!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerify = async () => {
    if (!enrollmentData || code.length !== 6) return;
    
    setVerifying(true);
    try {
      await verifyTOTP(enrollmentData.id, code);
      onSuccess?.();
    } catch (err) {
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (code.length === 6) {
      handleVerify();
    }
  }, [code]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Configurar Autenticação 2FA</CardTitle>
        <CardDescription>
          Adicione uma camada extra de segurança à sua conta
        </CardDescription>
      </CardHeader>

      <CardContent>
        {step === 'intro' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Smartphone className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Você precisará de um app autenticador</p>
                <p className="text-xs text-muted-foreground">
                  Como Google Authenticator, Authy ou 1Password
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Button className="w-full" onClick={handleStartEnrollment} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  'Começar Configuração'
                )}
              </Button>
              {onCancel && (
                <Button variant="ghost" className="w-full" onClick={onCancel}>
                  Cancelar
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {step === 'qr' && enrollmentData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Escaneie este QR code com seu app autenticador
              </p>
              
              <div className="inline-block p-4 bg-background rounded-lg shadow-sm">
                <img 
                  src={enrollmentData.totp.qr_code} 
                  alt="QR Code para MFA"
                  className="w-48 h-48"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Ou insira manualmente:
              </Label>
              <div className="flex gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-xs font-mono break-all">
                  {enrollmentData.totp.secret}
                </code>
                <Button size="sm" variant="outline" onClick={handleCopySecret}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={() => setStep('verify')}>
              Continuar
            </Button>
          </motion.div>
        )}

        {step === 'verify' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Digite o código de 6 dígitos do seu app autenticador
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Código de Verificação</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest font-mono"
                disabled={verifying}
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('qr')}>
                Voltar
              </Button>
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
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
