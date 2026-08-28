import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldCheck, ShieldOff, Trash2, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { useMFA } from '@/hooks/auth/useMFA';
import { MFAEnroll } from './MFAEnroll';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

export function MFASettings() {
  const { factors, fetchFactors, unenroll, loading, isMFAEnabled } = useMFA();
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [factorToRemove, setFactorToRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetchFactors();
  }, [fetchFactors]);

  const handleRemove = async () => {
    if (!factorToRemove) return;
    
    setRemoving(true);
    try {
      await unenroll(factorToRemove);
      setFactorToRemove(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isMFAEnabled ? 'bg-success/10 dark:bg-success/20/30' : 'bg-muted'
              }`}>
                {isMFAEnabled ? (
                  <ShieldCheck className="w-5 h-5 text-success dark:text-success" />
                ) : (
                  <ShieldOff className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="text-lg">Autenticação de Dois Fatores (2FA)</CardTitle>
                <CardDescription>
                  {isMFAEnabled 
                    ? 'Sua conta está protegida com 2FA' 
                    : 'Adicione uma camada extra de segurança'}
                </CardDescription>
              </div>
            </div>
            <Badge variant={isMFAEnabled ? 'default' : 'secondary'}>
              {isMFAEnabled ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isMFAEnabled && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-3 p-3 bg-warning/10 dark:bg-warning/20/20 border border-warning dark:border-warning rounded-lg"
            >
              <AlertTriangle className="w-5 h-5 text-warning dark:text-warning mt-0.5" />
              <div>
                <p className="font-medium text-sm text-warning dark:text-warning">
                  Recomendado ativar 2FA
                </p>
                <p className="text-xs text-warning dark:text-warning">
                  Proteja sua conta contra acessos não autorizados
                </p>
              </div>
            </motion.div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {factors.map((factor) => (
                  <motion.div
                    key={factor.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">
                          {factor.friendly_name || 'App Autenticador'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          TOTP • {factor.status === 'verified' ? 'Verificado' : 'Não verificado'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFactorToRemove(factor.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowEnrollDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {isMFAEnabled ? 'Adicionar outro método' : 'Configurar 2FA'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enroll Dialog */}
      <Dialog open={showEnrollDialog} onOpenChange={setShowEnrollDialog}>
        <DialogContent className="sm:max-w-md p-0">
          <MFAEnroll
            onSuccess={() => {
              setShowEnrollDialog(false);
              fetchFactors();
            }}
            onCancel={() => setShowEnrollDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <AlertDialog open={!!factorToRemove} onOpenChange={() => setFactorToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Autenticação 2FA?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai remover a proteção adicional da sua conta. Você pode configurar novamente a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-destructive hover:bg-destructive/90"
            >
              {removing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
