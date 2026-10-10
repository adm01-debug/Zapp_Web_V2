import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { parseSupabaseStorageObjectUrl } from '@/lib/storage_object_reference';
import { useAuth } from '@/hooks/auth/useAuth';
import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import { getLogger } from '@/lib/logger';

const log = getLogger('AvatarUpload');

// Expiração curta: o perfil guarda só o caminho do arquivo e a URL assinada é
// regerada a cada render, então não há motivo para uma validade longa.
export const AVATAR_SIGNED_URL_TTL_SECONDS = 300;

const AVATAR_BUCKET = 'avatars';

function isStorageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Normaliza o valor guardado em profile.avatar_url para o caminho do objeto.
 * Avatares legados guardam a URL pública completa ('.../object/public/avatars/...?t=...');
 * com o bucket privado esse valor precisa virar caminho antes de assinar.
 * Aceita rotas /object/public/, /object/sign/ e /object/authenticated/, ignora a query
 * e restringe ao bucket `avatars`. Retorna null quando não dá para normalizar.
 */
function avatarObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isStorageUrl(value)) return value;
  return parseSupabaseStorageObjectUrl(value, [AVATAR_BUCKET], [])?.path ?? null;
}

export function AvatarUpload() {
  const { user, profile, refreshProfile } = useAuth();
  const feedback = useActionFeedback();
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gera URL assinada temporária a partir do caminho armazenado
  useEffect(() => {
    const raw = profile?.avatar_url;
    if (!raw || !user) {
      setAvatarUrl(null);
      return;
    }
    // Legado: avatar_url pode ser a URL pública completa; normaliza para caminho.
    const filePath = avatarObjectPath(raw);
    if (!filePath || isStorageUrl(filePath)) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from('avatars')
        .createSignedUrl(filePath, AVATAR_SIGNED_URL_TTL_SECONDS);
      const signedUrl = data?.signedUrl ?? null;
      if (!cancelled && !error && signedUrl) {
        setAvatarUrl(signedUrl);
      } else if (!cancelled) {
        setAvatarUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.avatar_url, user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      feedback.warning('Imagem deve ter no máximo 5MB');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${ext}`;

    await feedback.withFeedback(
      async () => {
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        // Guarda o caminho do arquivo (não a URL assinada, que expira)
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: filePath })
          .eq('user_id', user.id);
        if (updateError) throw updateError;

        await refreshProfile();
        // O caminho é fixo (`<user.id>/avatar.<ext>`), então profile.avatar_url pode
        // não mudar e o useEffect não roda de novo: reassina e atualiza a prévia aqui.
        try {
          const { data: signed } = await supabase.storage
            .from(AVATAR_BUCKET)
            .createSignedUrl(filePath, AVATAR_SIGNED_URL_TTL_SECONDS);
          if (signed?.signedUrl) setAvatarUrl(signed.signedUrl);
        } catch {
          // Mantém a prévia via refreshProfile; a próxima renderização reassina.
        }
      },
      {
        loadingMessage: 'Enviando foto...',
        successMessage: 'Foto atualizada com sucesso!',
        errorMessage: 'Erro ao enviar foto',
      }
    );
    setUploading(false);
  };

  const handleRemove = async () => {
    if (!user) return;

    await feedback.withFeedback(
      async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ avatar_url: null })
          .eq('user_id', user.id);
        if (error) throw error;
        setAvatarUrl(null);
        await refreshProfile();
      },
      {
        successMessage: 'Foto removida!',
        errorMessage: 'Erro ao remover foto',
      }
    );
  };

  const initials = profile?.name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2) || '?';

  return (
    <div className="flex items-center gap-6">
      <div className="relative group">
        <Avatar className="w-20 h-20 ring-2 ring-border/50 group-hover:ring-primary/50 transition-all">
          <AvatarImage src={avatarUrl || undefined} alt="Avatar" />
          <AvatarFallback className="bg-primary/10 text-primary font-display text-xl font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
        </motion.button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">{profile?.name || 'Usuário'}</p>
        <p className="text-xs text-muted-foreground">{profile?.email || user?.email}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Enviando...' : 'Alterar foto'}
          </Button>
          <AnimatePresence>
            {avatarUrl && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                <Button variant="ghost" size="sm" onClick={handleRemove} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remover
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}