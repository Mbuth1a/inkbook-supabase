-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Creates the two photo buckets. Safe to run again.

-- Portfolio photos: public, so the site can show them.
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do update set public = true;

-- Client reference photos: private. Only the artist's signed-in dashboard can open them,
-- through short-lived links.
insert into storage.buckets (id, name, public)
values ('references', 'references', false)
on conflict (id) do update set public = false;

-- Reference photos: only JPG, PNG or WebP, and at most 5 MB each. Storage enforces this on every upload.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'references';
