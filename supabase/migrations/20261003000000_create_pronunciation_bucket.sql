begin;

-- /enrich uploads MP3s with the server's service-role key and returns public URLs.
-- Only pronunciation audio belongs here; illustration images remain external URLs.
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('voca-media', 'voca-media', true, array['audio/mpeg'])
on conflict (id) do update
set public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;

-- No client upload/list/update/delete policies are needed: the API's service role
-- bypasses Storage RLS. Public downloads work without a storage.objects policy.
-- Do not add a broad authenticated write policy for this bucket.

commit;
