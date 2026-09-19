-- Stub user 1, mirroring PHP ensureGymSchema(). Safe to run against an
-- imported production dump because it is a no-op when the row exists.
INSERT INTO users (id, name)
SELECT 1, 'Admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 1);
