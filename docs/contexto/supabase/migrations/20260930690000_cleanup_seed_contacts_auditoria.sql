UPDATE public.contacts
   SET deleted_at = now()
 WHERE deleted_at IS NULL
   AND id IN (
     '2994c2ee-af64-48b0-8da3-b4134377f7ce',
     '729d8fac-f145-42d1-b222-6be0980d2b55',
     '787192a1-d097-49dd-8ce5-eda9b092c156',
     '8217fbcc-72ef-48ff-9592-4c9315d266bd',
     '3943117b-7009-4ff1-98b8-073fc73fe403'
   )
