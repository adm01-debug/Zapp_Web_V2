
-- 1. Remove duplicates (keep the one with best category, i.e. non-viral preferred, oldest first)
DELETE FROM audio_memes 
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY name 
        ORDER BY 
          CASE WHEN category != 'viral' THEN 0 ELSE 1 END,
          created_at ASC
      ) as rn
    FROM audio_memes
    WHERE name IN (SELECT name FROM audio_memes GROUP BY name HAVING COUNT(*) > 1)
  ) ranked
  WHERE rn > 1
);

-- 2. Normalize 'victory' category to 'vitória'
UPDATE audio_memes SET category = 'vitória' WHERE category = 'victory';
