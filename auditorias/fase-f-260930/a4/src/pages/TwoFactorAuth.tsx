import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useMFA } from '@/hooks/auth/useMFA';
import { MFAVerify } from '@/components/mfa/MFAVerify';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export default function TwoFactorAuth() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAssuranceLevel, isMFAEnabled, fetchFactors } = useMFA();
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    const checkMFAStatus = async () => {
      await fetchFactors();
      const assurance = await getAssuranceLevel();
      
      if (assurance) {
        // If user has MFA setup but hasn't verified this session
        if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
          setNeedsVerification(true);
        } else if (assurance.currentLevel === 'aal2') {
          // Already verified, redirect to home
          navigate('/');
        }
      }
    };

    if (user) {
      checkMFAStatus();
    }
  }, [user, navigate, getAssuranceLevel, fetchFactors]);

  if (!needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Verificando status de autenticação...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <MFAVerify
          title="Verificação Necessária"
          description="Para continuar, verifique sua identidade com 2FA"
          onSuccess={() => navigate('/')}
          onCancel={() => {
            // Sign out and go back to login
            supabase.auth.signOut().then(() => navigate('/auth'));
          }}
        />
        
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/auth')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para login
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
