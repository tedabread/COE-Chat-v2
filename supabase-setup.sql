-- ============================================================
-- COE Chat v2 — Complete Database Setup
-- Idempotent — safe to run multiple times
-- ============================================================

-- ── Profiles: widen site-wide roles ─────────────────────────

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'moderator', 'admin', 'owner'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_outline_color TEXT DEFAULT '#cba6f7';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- Seed owner + admin
UPDATE profiles SET role = 'owner' WHERE username = 'pidgeon-religion';
UPDATE profiles SET role = 'admin' WHERE role = 'admin' AND username != 'pidgeon-religion';

-- ── Helper: is user site-wide admin or owner? ───────────────
-- NOTE: param names MUST match originals so CREATE OR REPLACE works

CREATE OR REPLACE FUNCTION is_user_site_admin(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = is_user_site_admin.uid AND role IN ('admin', 'owner')
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_user_admin(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = is_user_admin.uid AND role IN ('admin', 'owner')
  );
END;
$$;

-- ── Membership helper (bypasses RLS to avoid recursion) ──────

DROP FUNCTION IF EXISTS is_server_member(uuid, int) CASCADE;
DROP FUNCTION IF EXISTS is_server_member(uuid, bigint) CASCADE;

CREATE OR REPLACE FUNCTION is_server_member(uid uuid, sid bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM server_members
    WHERE user_id = is_server_member.uid AND server_id = is_server_member.sid
  );
END;
$$;

-- ── Permission helper (site-wide override) ──────────────────

DROP FUNCTION IF EXISTS check_server_permission(uuid, bigint, text) CASCADE;

CREATE OR REPLACE FUNCTION check_server_permission(
  uid uuid, sid bigint, perm text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  site_role text;
BEGIN
  SELECT role INTO site_role FROM profiles WHERE id = check_server_permission.uid;
  IF site_role IN ('admin', 'owner') THEN
    RETURN TRUE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM server_members sm
    JOIN server_roles sr ON sr.id = sm.role_id
    WHERE sm.user_id = check_server_permission.uid
      AND sm.server_id = check_server_permission.sid
      AND (sr.permissions->>check_server_permission.perm)::boolean = TRUE
  );
END;
$$;

-- ── Existing RLS policies (broadened) ──────────────────────

DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read all messages" ON messages;
CREATE POLICY "Admins can read all messages" ON messages
  FOR SELECT USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete messages" ON messages;
CREATE POLICY "Admins can delete messages" ON messages
  FOR DELETE USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read all friend_requests" ON friend_requests;
CREATE POLICY "Admins can read all friend_requests" ON friend_requests
  FOR SELECT USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete friend_requests" ON friend_requests;
CREATE POLICY "Admins can delete friend_requests" ON friend_requests
  FOR DELETE USING (is_user_admin(auth.uid()));

-- User-level policies for friend_requests

DROP POLICY IF EXISTS "Users can send friend requests" ON friend_requests;
CREATE POLICY "Users can send friend requests" ON friend_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their friend requests" ON friend_requests;
CREATE POLICY "Users can view their friend requests" ON friend_requests
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their friend requests" ON friend_requests;
CREATE POLICY "Users can update their friend requests" ON friend_requests
  FOR UPDATE USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their friend requests" ON friend_requests;
CREATE POLICY "Users can delete their friend requests" ON friend_requests
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read all chats" ON chats;
CREATE POLICY "Admins can read all chats" ON chats
  FOR SELECT USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read all chat_members" ON chat_members;
CREATE POLICY "Admins can read all chat_members" ON chat_members
  FOR SELECT USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can read chat members in their chats" ON chat_members;
CREATE POLICY "Users can read chat members in their chats" ON chat_members
  FOR SELECT USING (
    chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can read all calls" ON calls;
CREATE POLICY "Admins can read all calls" ON calls
  FOR SELECT USING (is_user_admin(auth.uid()));

-- ── DM helper ──────────────────────────────────────────────

DROP FUNCTION IF EXISTS find_or_create_dm(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION find_or_create_dm(user_a uuid, user_b uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_chat_id int;
  new_chat_id int;
BEGIN
  SELECT c.id INTO existing_chat_id
  FROM chats c
  WHERE EXISTS (
    SELECT 1 FROM chat_members cm1
    WHERE cm1.chat_id = c.id AND cm1.user_id = user_a
  )
  AND EXISTS (
    SELECT 1 FROM chat_members cm2
    WHERE cm2.chat_id = c.id AND cm2.user_id = user_b
  )
  AND (SELECT COUNT(*) FROM chat_members WHERE chat_id = c.id) = 2
  LIMIT 1;

  IF existing_chat_id IS NOT NULL THEN
    RETURN existing_chat_id;
  END IF;

  INSERT INTO chats (created_by) VALUES (user_a) RETURNING id INTO new_chat_id;
  INSERT INTO chat_members (chat_id, user_id) VALUES (new_chat_id, user_a), (new_chat_id, user_b);

  RETURN new_chat_id;
END;
$$;

-- ── Chat member lookup (bypasses RLS for unauthenticated member reads) ──

DROP FUNCTION IF EXISTS get_chat_members(int) CASCADE;
CREATE OR REPLACE FUNCTION get_chat_members(chat_id_input int)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT cm.user_id FROM chat_members cm WHERE cm.chat_id = chat_id_input;
END;
$$;

-- ── SERVERS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS servers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  icon_url TEXT,
  banner_color TEXT DEFAULT '#313244',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE servers ENABLE ROW LEVEL SECURITY;

-- Migrate existing tables that might lack newer columns
ALTER TABLE servers ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS banner_color TEXT DEFAULT '#313244';

DROP POLICY IF EXISTS "Members can view servers" ON servers;
DROP POLICY IF EXISTS "Anyone can view servers" ON servers;
CREATE POLICY "Anyone can view servers" ON servers
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can create servers" ON servers;
CREATE POLICY "Users can create servers" ON servers
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Owner can update server" ON servers;
CREATE POLICY "Owner can update server" ON servers
  FOR UPDATE USING (
    owner_id = auth.uid() OR is_user_admin(auth.uid())
  );

-- ── SERVER ROLES ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS server_roles (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE server_roles ENABLE ROW LEVEL SECURITY;

-- Migrate existing tables that might lack newer columns
ALTER TABLE server_roles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}';
ALTER TABLE server_roles ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;

DROP POLICY IF EXISTS "Members can view roles" ON server_roles;
CREATE POLICY "Members can view roles" ON server_roles
  FOR SELECT USING (
    is_server_member(auth.uid(), server_id)
    OR is_user_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Server admins can manage roles" ON server_roles;
CREATE POLICY "Server admins can insert roles" ON server_roles
  FOR INSERT WITH CHECK (
    check_server_permission(auth.uid(), server_id, 'manage_roles')
    OR is_user_admin(auth.uid())
  );
CREATE POLICY "Server admins can update roles" ON server_roles
  FOR UPDATE USING (
    check_server_permission(auth.uid(), server_roles.server_id, 'manage_roles')
    OR is_user_admin(auth.uid())
  );
CREATE POLICY "Server admins can delete roles" ON server_roles
  FOR DELETE USING (
    check_server_permission(auth.uid(), server_roles.server_id, 'manage_roles')
    OR is_user_admin(auth.uid())
  );

-- ── SERVER MEMBERS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS server_members (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id INT REFERENCES server_roles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(server_id, user_id)
);

ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;

-- Migrate existing tables that might lack newer columns
ALTER TABLE server_members ADD COLUMN IF NOT EXISTS role_id INT REFERENCES server_roles(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Members can view members" ON server_members;
CREATE POLICY "Members can view members" ON server_members
  FOR SELECT USING (
    is_server_member(auth.uid(), server_id)
    OR is_user_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Server admins can manage members" ON server_members;
CREATE POLICY "Server admins can manage members" ON server_members
  FOR UPDATE USING (
    check_server_permission(auth.uid(), server_members.server_id, 'manage_server')
    OR is_user_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Server admins can kick members" ON server_members;
CREATE POLICY "Server admins can kick members" ON server_members
  FOR DELETE USING (
    check_server_permission(auth.uid(), server_members.server_id, 'manage_server')
    OR is_user_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can join via invite" ON server_members;
CREATE POLICY "Users can join via invite" ON server_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND NOT is_server_member(auth.uid(), server_id)
  );

-- Allow users to delete their own membership (leave server)
DROP POLICY IF EXISTS "Users can leave servers" ON server_members;
CREATE POLICY "Users can leave servers" ON server_members
  FOR DELETE USING (user_id = auth.uid());

-- ── CHANNELS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'voice')),
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- Migrate existing tables that might lack newer columns
ALTER TABLE channels ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;

DROP POLICY IF EXISTS "Members can view channels" ON channels;
CREATE POLICY "Members can view channels" ON channels
  FOR SELECT USING (
    is_server_member(auth.uid(), server_id)
    OR is_user_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Server admins can manage channels" ON channels;
CREATE POLICY "Members can create channels" ON channels
  FOR INSERT WITH CHECK (
    is_server_member(auth.uid(), server_id)
    OR is_user_admin(auth.uid())
  );
CREATE POLICY "Server admins can update channels" ON channels
  FOR UPDATE USING (
    is_server_member(auth.uid(), channels.server_id)
    OR is_user_admin(auth.uid())
  );
CREATE POLICY "Server admins can delete channels" ON channels
  FOR DELETE USING (
    is_server_member(auth.uid(), channels.server_id)
    OR is_user_admin(auth.uid())
  );

-- ── Messages: add channel + edit support ────────────────────

ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id INT REFERENCES channels(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;

-- Allow channel messages (no chat_id) to exist
ALTER TABLE messages ALTER COLUMN chat_id DROP NOT NULL;

-- ── Message RLS: channel moderators can edit/delete ─────────

DROP POLICY IF EXISTS "Members can read channel messages" ON messages;
CREATE POLICY "Members can read channel messages" ON messages
  FOR SELECT USING (
    channel_id IS NULL
    OR is_server_member(auth.uid(), (SELECT server_id FROM channels WHERE id = channel_id))
    OR is_user_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Members can send channel messages" ON messages;
CREATE POLICY "Members can send channel messages" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      channel_id IS NULL
      OR is_server_member(auth.uid(), (SELECT server_id FROM channels WHERE id = channel_id))
    )
  );

DROP POLICY IF EXISTS "Users can update own messages" ON messages;
CREATE POLICY "Users can update own messages" ON messages
  FOR UPDATE USING (
    sender_id = auth.uid()
    OR (channel_id IS NOT NULL AND is_server_member(auth.uid(), (SELECT server_id FROM channels WHERE id = channel_id)))
    OR is_user_admin(auth.uid())
  );

-- ── VOICE PARTICIPANTS ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS voice_participants (
  id SERIAL PRIMARY KEY,
  channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

ALTER TABLE voice_participants ENABLE ROW LEVEL SECURITY;

-- Migrate existing tables that might lack newer columns
ALTER TABLE voice_participants ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();

DROP POLICY IF EXISTS "Members can view voice participants" ON voice_participants;
CREATE POLICY "Members can view voice participants" ON voice_participants
  FOR SELECT USING (
    is_server_member(auth.uid(), (SELECT server_id FROM channels WHERE id = channel_id))
    OR is_user_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can join voice" ON voice_participants;
CREATE POLICY "Users can join voice" ON voice_participants
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can leave voice" ON voice_participants;
CREATE POLICY "Users can leave voice" ON voice_participants
  FOR DELETE USING (user_id = auth.uid());

-- ── Auto-create default roles when a server is created ──────

CREATE OR REPLACE FUNCTION create_default_server_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_role_id int;
BEGIN
  -- Clean slate for this server (handles retries / stale data)
  DELETE FROM server_roles WHERE server_id = NEW.id;

  INSERT INTO server_roles (server_id, name, color, permissions, position) VALUES
    (NEW.id, 'Admin',     '#ed8796',
      '{"manage_messages":true,"manage_channels":true,"manage_server":true,"kick_members":true,"ban_members":true,"manage_roles":true}'::jsonb, 0),
    (NEW.id, 'Moderator', '#8aadf4',
      '{"manage_messages":true,"manage_channels":false,"manage_server":false,"kick_members":false,"ban_members":false,"manage_roles":false}'::jsonb, 1),
    (NEW.id, 'Member',    NULL,
      '{"manage_messages":false,"manage_channels":false,"manage_server":false,"kick_members":false,"ban_members":false,"manage_roles":false}'::jsonb, 2);

  SELECT id INTO admin_role_id FROM server_roles WHERE server_id = NEW.id AND name = 'Admin';

  INSERT INTO server_members (server_id, user_id, role_id)
    VALUES (NEW.id, NEW.owner_id, admin_role_id)
    ON CONFLICT (server_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_server_roles ON servers;
CREATE TRIGGER trg_create_default_server_roles
  AFTER INSERT ON servers
  FOR EACH ROW EXECUTE FUNCTION create_default_server_roles();

-- ── Nuke all servers (run this in SQL editor to wipe everything) ──
-- CREATE OR REPLACE FUNCTION nuke_all_servers() RETURNS void
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- BEGIN
--   DELETE FROM servers;
-- END;
-- $$;
-- SELECT nuke_all_servers();

-- ── Enable Realtime for profiles table ──────────────────────
-- Required for postgres_changes subscriptions (profile-updates, presence)
-- Run in Supabase SQL editor or apply via dashboard: Replication → profiles

-- Create the publication if it doesn't exist yet
DO $$
BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Add profiles to the publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Add friend_requests to the publication (for real-time friend request & friend list updates)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- Add server_members to the publication (for real-time server membership changes)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE server_members;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- ── RPC: update own last_seen (bypasses RLS) ─────────────────

CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET last_seen = NOW() WHERE id = auth.uid();
END;
$$;

-- ── RPC: mark offline immediately (called from beforeunload) ──

CREATE OR REPLACE FUNCTION go_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET last_seen = NULL WHERE id = auth.uid();
END;
$$;

-- ── RPC: mark idle (set last_seen to 90s ago, called on tab hide) ──

CREATE OR REPLACE FUNCTION set_idle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET last_seen = NOW() - INTERVAL '90 seconds' WHERE id = auth.uid();
END;
$$;

-- ── RPC: delete DM chat + all messages between two users ──

CREATE OR REPLACE FUNCTION delete_dm(other_user UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chat_id_var INT;
BEGIN
  SELECT cm.chat_id INTO chat_id_var
  FROM chat_members cm
  WHERE cm.user_id IN (auth.uid(), other_user)
  GROUP BY cm.chat_id
  HAVING COUNT(*) = 2
  LIMIT 1;

  IF chat_id_var IS NOT NULL THEN
    DELETE FROM messages WHERE chat_id = chat_id_var;
    DELETE FROM chat_members WHERE chat_id = chat_id_var;
    DELETE FROM chats WHERE id = chat_id_var;
  END IF;
END;
$$;

-- ============================================================
-- UNREAD MESSAGES — last_read_at tracking
-- Remove everything from here to "END UNREAD" to disable
-- ============================================================

-- Add last_read_at to existing chat_members
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ DEFAULT NOW();

-- Create channel read state table
CREATE TABLE IF NOT EXISTS channel_last_read (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_id)
);

ALTER TABLE channel_last_read ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their channel_last_read" ON channel_last_read;
CREATE POLICY "Users can manage their channel_last_read" ON channel_last_read
  FOR ALL USING (user_id = auth.uid());

-- Add messages to the publication for real-time unread updates
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- RPC: get DM chat info + unread counts
CREATE OR REPLACE FUNCTION get_user_chat_info(p_user_id UUID)
RETURNS TABLE(chat_id INT, other_user_id UUID, unread_count BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (array_agg(cm1.chat_id ORDER BY (SELECT max(created_at) FROM messages WHERE chat_id = cm1.chat_id) DESC NULLS LAST))[1] as chat_id,
    cm2.user_id,
    COALESCE(SUM(
      (SELECT COUNT(*) FROM messages m
       WHERE m.chat_id = cm1.chat_id
         AND m.sender_id != p_user_id
         AND m.created_at > COALESCE(cm1.last_read_at, '1970-01-01'))
    ), 0)::bigint as unread_count
  FROM chat_members cm1
  JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id AND cm2.user_id != p_user_id
  WHERE cm1.user_id = p_user_id
  GROUP BY cm2.user_id
$$;

-- RPC: get unread counts for all channels the user can see
CREATE OR REPLACE FUNCTION get_all_channel_unreads(p_user_id UUID)
RETURNS TABLE(channel_id INT, unread_count BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
    (SELECT COUNT(*) FROM messages m
     WHERE m.channel_id = c.id
       AND m.sender_id != p_user_id
       AND m.created_at > COALESCE(clr.last_read_at, '1970-01-01'))
  FROM channels c
  JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = p_user_id
  LEFT JOIN channel_last_read clr ON clr.channel_id = c.id AND clr.user_id = p_user_id
$$;

-- RPC: mark a DM chat as read
CREATE OR REPLACE FUNCTION mark_chat_read(p_chat_id INT, p_user_id UUID)
RETURNS void
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE chat_members SET last_read_at = NOW()
  WHERE chat_id = p_chat_id AND user_id = p_user_id
$$;

-- RPC: mark a channel as read
CREATE OR REPLACE FUNCTION mark_channel_read(p_channel_id INT, p_user_id UUID)
RETURNS void
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO channel_last_read (user_id, channel_id, last_read_at)
  VALUES (p_user_id, p_channel_id, NOW())
  ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_at = NOW()
$$;
-- END UNREAD MESSAGES --
