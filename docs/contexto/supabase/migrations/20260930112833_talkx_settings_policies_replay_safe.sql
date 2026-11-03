drop policy if exists "authenticated_read_talkx_settings" on public.talkx_settings

create policy "authenticated_read_talkx_settings"
  on public.talkx_settings
  for select
  to authenticated
  using (true)

drop policy if exists talkx_settings_admin_write on public.talkx_settings

create policy talkx_settings_admin_write
  on public.talkx_settings
  for update
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()))
  with check (public.is_admin_or_supervisor(auth.uid()))
