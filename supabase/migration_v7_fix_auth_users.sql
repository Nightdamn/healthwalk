-- V7: Fix "permission denied for table users"
--
-- Problem: RLS policies on pending_roles and pending_invitations
-- use (SELECT email FROM auth.users WHERE id = auth.uid())
-- but authenticated users cannot SELECT from auth.users.
--
-- Solution: SECURITY DEFINER function that safely returns
-- current user email, bypassing auth.users restriction.

-- 1. Helper function to get current user email
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT email FROM auth.users WHERE id = auth.uid();
$fn$;

-- 2. Fix pending_roles policies
DROP POLICY IF EXISTS "Users read own pending" ON pending_roles;
CREATE POLICY "Users read own pending" ON pending_roles FOR SELECT
  USING (email = get_my_email());

DROP POLICY IF EXISTS "Users delete own pending" ON pending_roles;
CREATE POLICY "Users delete own pending" ON pending_roles FOR DELETE
  USING (email = get_my_email());

-- 3. Fix pending_invitations policies
DROP POLICY IF EXISTS "Users read own invitations" ON pending_invitations;
CREATE POLICY "Users read own invitations" ON pending_invitations FOR SELECT
  USING (email = get_my_email());

DROP POLICY IF EXISTS "Users delete own invitations" ON pending_invitations;
CREATE POLICY "Users delete own invitations" ON pending_invitations FOR DELETE
  USING (email = get_my_email());
