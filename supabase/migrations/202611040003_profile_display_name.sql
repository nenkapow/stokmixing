-- Apply after the 1A and 1B migrations, with review, in the dedicated project.
begin;
alter table public.profiles add column display_name text;
alter table public.profiles add constraint profiles_display_name_length check (display_name is null or (length(trim(display_name)) between 1 and 120));
-- Existing users keep their own read access; only admins can read other profiles.
create policy profile_admin_read on public.profiles for select to authenticated using (public.is_admin());
create policy profile_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Grant only the name column, never role or id.
grant update (display_name) on public.profiles to authenticated;
commit;
