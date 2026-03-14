-- V7: Fix "permission denied for table users" + Course invitation system
--
-- 1. Fix auth.users access in RLS policies
-- 2. Add RPC functions for accepting/declining course invitations
-- 3. Allow invited users to see course info

-- ═══════════════════════════════════════════════════════════
-- 1. Helper: get current user email (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
  SELECT email FROM auth.users WHERE id = auth.uid();
$fn$;

-- Fix pending_roles policies
DROP POLICY IF EXISTS "Users read own pending" ON pending_roles;
CREATE POLICY "Users read own pending" ON pending_roles FOR SELECT
  USING (email = get_my_email());

DROP POLICY IF EXISTS "Users delete own pending" ON pending_roles;
CREATE POLICY "Users delete own pending" ON pending_roles FOR DELETE
  USING (email = get_my_email());

-- Fix pending_invitations policies
DROP POLICY IF EXISTS "Users read own invitations" ON pending_invitations;
CREATE POLICY "Users read own invitations" ON pending_invitations FOR SELECT
  USING (email = get_my_email());

DROP POLICY IF EXISTS "Users delete own invitations" ON pending_invitations;
CREATE POLICY "Users delete own invitations" ON pending_invitations FOR DELETE
  USING (email = get_my_email());

-- ═══════════════════════════════════════════════════════════
-- 2. Allow invited users to see course info (for invitation cards)
-- ═══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Invited users can view courses" ON courses;
CREATE POLICY "Invited users can view courses" ON courses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pending_invitations pi
    WHERE pi.course_id = courses.id AND pi.email = get_my_email()
  ));

-- ═══════════════════════════════════════════════════════════
-- 3. RPC: Accept course invitation
--    Atomically: enroll user + delete invitation
--    SECURITY DEFINER bypasses RLS
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.accept_course_invitation(p_invitation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inv RECORD;
  v_email TEXT;
BEGIN
  v_email := (SELECT email FROM auth.users WHERE id = auth.uid());
  IF v_email IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_inv FROM pending_invitations
  WHERE id = p_invitation_id AND email = v_email;

  IF v_inv IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;

  -- Enroll user in course
  INSERT INTO course_enrollments (course_id, user_id, role, invited_by)
  VALUES (v_inv.course_id, auth.uid(), v_inv.role, v_inv.invited_by)
  ON CONFLICT (course_id, user_id) DO UPDATE SET role = v_inv.role;

  -- Delete processed invitation
  DELETE FROM pending_invitations WHERE id = p_invitation_id;

  RETURN json_build_object('success', true, 'course_id', v_inv.course_id);
END;
$fn$;

-- ═══════════════════════════════════════════════════════════
-- 4. RPC: Decline course invitation
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.decline_course_invitation(p_invitation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_email TEXT;
  v_rows INT;
BEGIN
  v_email := (SELECT email FROM auth.users WHERE id = auth.uid());

  DELETE FROM pending_invitations
  WHERE id = p_invitation_id AND email = v_email;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$fn$;
