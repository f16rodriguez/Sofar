-- Private storage bucket for answer audio (SPEC §7: buckets private, signed
-- URLs with 10-minute expiry). Separate from 0001 because storage.objects
-- policy DDL depends on storage-schema privileges; if this migration fails
-- with an ownership error, create the same two policies in the dashboard
-- (Storage → Policies) instead.

insert into storage.buckets (id, name, public)
values ('answer-audio', 'answer-audio', false)
on conflict (id) do nothing;

-- objects are stored under <user_id>/<answer_id>.webm
create policy answer_audio_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'answer-audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy answer_audio_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'answer-audio' and (storage.foldername(name))[1] = auth.uid()::text);
