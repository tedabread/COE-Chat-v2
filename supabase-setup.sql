-- Admin role and outline color
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_outline_color TEXT DEFAULT '#cba6f7';

-- Seed the first admin
UPDATE profiles SET role = 'admin' WHERE username = 'pidgeon-religion';

-- Helper function to check if a user is admin (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION is_user_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND role = 'admin')
$$;

-- RLS: allow admins to read all profiles
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles
  FOR SELECT USING (is_user_admin(auth.uid()));

-- RLS: allow admins to update all profiles
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles
  FOR UPDATE USING (is_user_admin(auth.uid()));

-- RLS: allow admins to read all messages
DROP POLICY IF EXISTS "Admins can read all messages" ON messages;
CREATE POLICY "Admins can read all messages" ON messages
  FOR SELECT USING (is_user_admin(auth.uid()));

-- RLS: allow admins to delete messages
DROP POLICY IF EXISTS "Admins can delete messages" ON messages;
CREATE POLICY "Admins can delete messages" ON messages
  FOR DELETE USING (is_user_admin(auth.uid()));

-- RLS: allow admins to read friend_requests
DROP POLICY IF EXISTS "Admins can read all friend_requests" ON friend_requests;
CREATE POLICY "Admins can read all friend_requests" ON friend_requests
  FOR SELECT USING (is_user_admin(auth.uid()));

-- RLS: allow admins to delete friend_requests
DROP POLICY IF EXISTS "Admins can delete friend_requests" ON friend_requests;
CREATE POLICY "Admins can delete friend_requests" ON friend_requests
  FOR DELETE USING (is_user_admin(auth.uid()));

-- RLS: allow admins to read chats and chat_members
DROP POLICY IF EXISTS "Admins can read all chats" ON chats;
CREATE POLICY "Admins can read all chats" ON chats
  FOR SELECT USING (is_user_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read all chat_members" ON chat_members;
CREATE POLICY "Admins can read all chat_members" ON chat_members
  FOR SELECT USING (is_user_admin(auth.uid()));

-- RLS: allow admins to read calls
DROP POLICY IF EXISTS "Admins can read all calls" ON calls;
CREATE POLICY "Admins can read all calls" ON calls
  FOR SELECT USING (is_user_admin(auth.uid()));