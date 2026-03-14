-- V7: Fix "permission denied for table users" + Course invitation system
--
-- After running: if functions not found, reload schema cache in Supabase Dashboard

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
-- 3. RPC: Invite to course (with duplicate checks)
-- ═══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.invite_to_course(UUID, TEXT, TEXT, UUID);

CREATE FUNCTION public.invite_to_course(
  p_course_id UUID,
  p_email TEXT,
  p_role TEXT,
  p_invited_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_target_id UUID;
  v_existing RECORD;
BEGIN
  -- Check if user already enrolled
  SELECT id INTO v_target_id FROM auth.users WHERE email = p_email;
  IF v_target_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM course_enrollments
    WHERE course_id = p_course_id AND user_id = v_target_id;
    IF v_existing IS NOT NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Пользователь уже записан на этот курс (роль: ' || v_existing.role || ')'
      );
    END IF;
  END IF;

  -- Check if invitation already exists
  SELECT * INTO v_existing FROM pending_invitations
  WHERE course_id = p_course_id AND email = p_email;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Приглашение уже отправлено этому пользователю'
    );
  END IF;

  -- Create invitation
  INSERT INTO pending_invitations (course_id, email, role, invited_by)
  VALUES (p_course_id, p_email, p_role, p_invited_by);

  RETURN json_build_object('success', true);
END;
$fn$;

-- ═══════════════════════════════════════════════════════════
-- 4. RPC: Accept course invitation
-- ═══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.accept_course_invitation(UUID);

CREATE FUNCTION public.accept_course_invitation(p_invitation_id UUID)
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

  INSERT INTO course_enrollments (course_id, user_id, role, invited_by)
  VALUES (v_inv.course_id, auth.uid(), v_inv.role, v_inv.invited_by)
  ON CONFLICT (course_id, user_id) DO UPDATE SET role = v_inv.role;

  DELETE FROM pending_invitations WHERE id = p_invitation_id;

  RETURN json_build_object('success', true, 'course_id', v_inv.course_id);
END;
$fn$;

-- ═══════════════════════════════════════════════════════════
-- 5. RPC: Decline course invitation
-- ═══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.decline_course_invitation(UUID);

CREATE FUNCTION public.decline_course_invitation(p_invitation_id UUID)
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

-- ═══════════════════════════════════════════════════════════
-- 6. Reload PostgREST schema cache
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 7. Cleanup: remove invitations where user is already enrolled
-- ═══════════════════════════════════════════════════════════

DELETE FROM pending_invitations pi
WHERE EXISTS (
  SELECT 1 FROM auth.users u
  JOIN course_enrollments ce ON ce.user_id = u.id AND ce.course_id = pi.course_id
  WHERE u.email = pi.email
);

NOTIFY pgrst, 'reload schema';
