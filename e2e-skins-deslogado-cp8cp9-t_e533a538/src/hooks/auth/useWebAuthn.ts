import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import {
  base64URLToBuffer, bufferToBase64URL, getDeviceName,
  isWebAuthnSupported, isPlatformAuthenticatorAvailable as checkPlatformAuth,
} from '@/lib/webauthnUtils';

interface ExcludeCredential {
  id: string;
  type: string;
  transports?: string[];
}

interface PasskeyCredential {
  id: string;
  credential_id: string;
  friendly_name: string | null;
  device_type: string | null;
  created_at: string;
  last_used_at: string | null;
}

export function useWebAuthn() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);

  const isSupported = useCallback(() => isWebAuthnSupported(), []);
  const isPlatformAuthenticatorAvailable = useCallback(() => checkPlatformAuth(), []);

  const fetchPasskeys = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('passkey_credentials')
      .select('id, credential_id, friendly_name, device_type, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { log.error('Failed to fetch passkeys:', error); return; }
    setPasskeys(data || []);
  }, [user]);

  const registerPasskey = useCallback(async (friendlyName?: string) => {
    if (!user) { toast.error('Você precisa estar logado para registrar uma passkey'); return { success: false }; }
    if (!isSupported()) { toast.error('WebAuthn não é suportado neste navegador'); return { success: false }; }

    setLoading(true);
    try {
      const { data: optionsData, error: optionsError } = await supabase.functions.invoke('webauthn', {
        body: { action: 'registration-options', userId: user.id, userEmail: user.email, userName: user.user_metadata?.name || user.email },
      });
      if (optionsError || !optionsData?.options) throw new Error(optionsError?.message || 'Falha ao obter opções de registro');

      const options = optionsData.options;
      const credentialCreationOptions: CredentialCreationOptions = {
        publicKey: {
          ...options,
          challenge: base64URLToBuffer(options.challenge),
          user: { ...options.user, id: base64URLToBuffer(options.user.id) },
          excludeCredentials: options.excludeCredentials?.map((cred: ExcludeCredential) => ({
            ...cred, id: base64URLToBuffer(cred.id),
          })),
        },
      };

      const credential = await navigator.credentials.create(credentialCreationOptions) as PublicKeyCredential;
      if (!credential) throw new Error('Falha ao criar credencial');

      const response = credential.response as AuthenticatorAttestationResponse;
      const credentialForServer = {
        id: credential.id, rawId: bufferToBase64URL(credential.rawId), type: credential.type,
        authenticatorAttachment: (credential as PublicKeyCredential & { authenticatorAttachment?: string }).authenticatorAttachment,
        response: {
          clientDataJSON: bufferToBase64URL(response.clientDataJSON),
          attestationObject: bufferToBase64URL(response.attestationObject),
          transports: response.getTransports?.() || ['internal'],
          publicKeyAlgorithm: response.getPublicKeyAlgorithm?.(),
        },
      };

      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('webauthn', {
        body: { action: 'verify-registration', userId: user.id, credential: credentialForServer, friendlyName: friendlyName || getDeviceName() },
      });
      if (verifyError || !verifyData?.success) throw new Error(verifyError?.message || 'Falha ao verificar registro');

      toast.success('Passkey registrada com sucesso!');
      await fetchPasskeys();
      return { success: true };
    } catch (error) {
      log.error('Passkey registration error:', error);
      const err = error as Error & { name?: string };
      if (err.name === 'NotAllowedError') toast.error('Registro cancelado pelo usuário');
      else if (err.name === 'SecurityError') toast.error('Erro de segurança. Verifique se está usando HTTPS.');
      else toast.error(err.message || 'Falha ao registrar passkey');
      return { success: false };
    } finally { setLoading(false); }
  }, [user, isSupported, fetchPasskeys]);

  const authenticateWithPasskey = useCallback(async (email?: string) => {
    if (!isSupported()) { toast.error('WebAuthn não é suportado neste navegador'); return { success: false }; }

    setLoading(true);
    try {
      const { data: optionsData, error: optionsError } = await supabase.functions.invoke('webauthn', {
        body: { action: 'authentication-options', userEmail: email },
      });
      if (optionsError || !optionsData?.options) throw new Error(optionsError?.message || 'Falha ao obter opções de autenticação');

      const options = optionsData.options;
      const credentialRequestOptions: CredentialRequestOptions = {
        publicKey: {
          ...options,
          challenge: base64URLToBuffer(options.challenge),
          allowCredentials: options.allowCredentials?.map((cred: { id: string; type: string; transports?: string[] }) => ({
            ...cred, id: base64URLToBuffer(cred.id),
          })),
        },
      };

      const credential = await navigator.credentials.get(credentialRequestOptions) as PublicKeyCredential;
      if (!credential) throw new Error('Falha ao obter credencial');

      const response = credential.response as AuthenticatorAssertionResponse;
      const credentialForServer = {
        id: credential.id, rawId: bufferToBase64URL(credential.rawId), type: credential.type,
        response: {
          clientDataJSON: bufferToBase64URL(response.clientDataJSON),
          authenticatorData: bufferToBase64URL(response.authenticatorData),
          signature: bufferToBase64URL(response.signature),
          userHandle: response.userHandle ? bufferToBase64URL(response.userHandle) : null,
        },
      };

      const { data: verifyData, error: verifyError } = await supabase.functions.invoke('webauthn', {
        body: { action: 'verify-authentication', credential: credentialForServer },
      });
      if (verifyError || !verifyData?.success) throw new Error(verifyError?.message || 'Falha ao verificar autenticação');

      toast.success('Autenticado com passkey!');
      return { success: true, userId: verifyData.userId, userEmail: verifyData.userEmail };
    } catch (error) {
      log.error('Passkey authentication error:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') toast.error('Autenticação cancelada pelo usuário');
      else toast.error(error instanceof Error ? error.message : 'Falha na autenticação com passkey');
      return { success: false };
    } finally { setLoading(false); }
  }, [isSupported]);

  const deletePasskey = useCallback(async (passkeyId: string) => {
    if (!user) return { success: false };
    setLoading(true);
    try {
      const { error } = await supabase.from('passkey_credentials').delete().eq('id', passkeyId).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Passkey removida com sucesso');
      await fetchPasskeys();
      return { success: true };
    } catch (error) {
      log.error('Failed to delete passkey:', error);
      toast.error('Falha ao remover passkey');
      return { success: false };
    } finally { setLoading(false); }
  }, [user, fetchPasskeys]);

  const renamePasskey = useCallback(async (passkeyId: string, newName: string) => {
    if (!user) return { success: false };
    try {
      const { error } = await supabase.from('passkey_credentials').update({ friendly_name: newName }).eq('id', passkeyId).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Passkey renomeada');
      await fetchPasskeys();
      return { success: true };
    } catch (error) {
      log.error('Failed to rename passkey:', error);
      toast.error('Falha ao renomear passkey');
      return { success: false };
    }
  }, [user, fetchPasskeys]);

  return {
    loading, passkeys, isSupported, isPlatformAuthenticatorAvailable,
    fetchPasskeys, registerPasskey, authenticateWithPasskey, deletePasskey, renamePasskey,
  };
}
