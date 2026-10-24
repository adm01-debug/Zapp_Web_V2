import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import { getLogger } from '@/lib/logger';

const log = getLogger('AvatarUpload');

export function AvatarUpload() {
  const { user, profile, refreshProfile } = useAuth();
  const feedback = useActionFeedback();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: filePath })
          .eq('user_id', user.id);
        if (updateError) throw updateError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
        await refreshProfile();
        await queryClient.invalidateQueries({ queryKey: ['team-profiles-rpc'] });
        await queryClient.invalidateQueries({ queryKey: ['user-profile'] });

        const { data: existingFiles } = await supabase.storage.from('avatars').list(user.id);
        if (existingFiles) {
          const newFileName = `avatar.${ext}`;
          const toRemove = existingFiles
            .filter(f => f.name !== newFileName)
            .map(f => `${user.id}/${f.name}`);
          if (toRemove.length > 0) {
            const { error: removeError } = await supabase.storage.from('avatars').remove(toRemove);
            if (removeError) log.warn('Falha ao remover avatars antigos do bucket', removeError);
          }
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
        await queryClient.invalidateQueries({ queryKey: ['team-profiles-rpc'] });
        await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
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
