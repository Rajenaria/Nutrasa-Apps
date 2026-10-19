-- Up Migration
-- Closed definition only. Controlled admin ownership/ACL installation is a separate approval.
CREATE FUNCTION nutrasa.catalog_transition_capability(p_actor_firebase_uid text, p_subject_id uuid, p_capability text, p_scope text, p_action text, p_expected_event_id uuid, p_reason text, p_request_id text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $writer$
DECLARE
  v_actor_id uuid;
  v_actor_status text;
  v_recipient_status text;
  v_authorized boolean;
  v_pointer uuid;
  v_latest_id uuid;
  v_latest_action text;
  v_event_id uuid;
BEGIN
  IF session_user::text <> pg_catalog.current_database() || '_writer'
    OR current_user::text <> pg_catalog.current_database() || '_executor' THEN
    RAISE EXCEPTION 'Capability caller rejected.' USING ERRCODE = '42501';
  END IF;
  IF p_actor_firebase_uid IS NULL OR p_actor_firebase_uid !~ '[^[:space:]]'
    OR p_subject_id IS NULL OR p_capability IS NULL OR p_scope IS NULL OR p_action IS NULL
    OR p_reason IS NULL OR p_reason !~ '[^[:space:]]'
    OR p_request_id IS NULL OR p_request_id !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'Invalid capability transition.' USING ERRCODE = '22023';
  END IF;
  IF p_scope COLLATE "C" <> 'CATALOG' OR p_action COLLATE "C" NOT IN ('GRANT', 'REVOKE')
    OR p_capability COLLATE "C" NOT IN ('catalog.source_permission.review', 'catalog.nutrition.review',
      'catalog.publication.publish', 'catalog.publication.withdraw') THEN
    RAISE EXCEPTION 'Capability delegation rejected.' USING ERRCODE = '42501';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Capability transaction rejected.' USING ERRCODE = '55000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(1314214994, 1);
  -- Separate post-wait statements observe newly committed authority under READ COMMITTED.
  SELECT u.id, u.account_status INTO v_actor_id, v_actor_status
    FROM nutrasa.app_users u WHERE u.firebase_uid = p_actor_firebase_uid COLLATE "C";
  IF v_actor_id IS NULL OR v_actor_status <> 'ACTIVE' OR v_actor_id = p_subject_id THEN
    RAISE EXCEPTION 'Capability actor rejected.' USING ERRCODE = '42501';
  END IF;
  SELECT u.account_status INTO v_recipient_status FROM nutrasa.app_users u WHERE u.id = p_subject_id;
  IF v_recipient_status IS NULL OR (p_action = 'GRANT' AND v_recipient_status <> 'ACTIVE') THEN
    RAISE EXCEPTION 'Capability recipient rejected.' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM nutrasa.catalog_capability_assignments a
    JOIN nutrasa.catalog_capability_events e
      ON (e.subject_id, e.capability, e.scope, e.id) = (a.subject_id, a.capability, a.scope, a.last_event_id)
    WHERE a.subject_id = v_actor_id AND a.scope = 'CATALOG' COLLATE "C"
      AND a.capability = CASE p_action WHEN 'GRANT' THEN 'catalog.capability.grant' ELSE 'catalog.capability.revoke' END COLLATE "C"
      AND e.action = 'GRANT'
      AND NOT EXISTS (SELECT 1 FROM nutrasa.catalog_capability_events newer
        WHERE newer.subject_id = a.subject_id AND newer.capability = a.capability AND newer.scope = a.scope
          AND newer.event_number > e.event_number)
  ) INTO v_authorized;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Capability authority rejected.' USING ERRCODE = '42501';
  END IF;
  SELECT a.last_event_id INTO v_pointer FROM nutrasa.catalog_capability_assignments a
    WHERE a.subject_id = p_subject_id AND a.capability = p_capability COLLATE "C" AND a.scope = p_scope COLLATE "C";
  SELECT e.id, e.action INTO v_latest_id, v_latest_action FROM nutrasa.catalog_capability_events e
    WHERE e.subject_id = p_subject_id AND e.capability = p_capability COLLATE "C" AND e.scope = p_scope COLLATE "C"
    ORDER BY e.event_number DESC LIMIT 1;
  IF v_pointer IS DISTINCT FROM v_latest_id OR p_expected_event_id IS DISTINCT FROM v_pointer THEN
    RAISE EXCEPTION 'Capability state rejected.' USING ERRCODE = '55000';
  END IF;
  IF (p_action = 'GRANT' AND v_latest_action = 'GRANT')
    OR (p_action = 'REVOKE' AND (v_latest_action IS NULL OR v_latest_action <> 'GRANT')) THEN
    RAISE EXCEPTION 'Duplicate capability transition.' USING ERRCODE = '55000';
  END IF;
  INSERT INTO nutrasa.catalog_capability_events (subject_id, capability, scope, action, actor_subject_id, reason, request_id)
    VALUES (p_subject_id, p_capability, p_scope, p_action, v_actor_id, p_reason, p_request_id) RETURNING id INTO v_event_id;
  INSERT INTO nutrasa.catalog_capability_assignments (subject_id, capability, scope, last_event_id)
    VALUES (p_subject_id, p_capability, p_scope, v_event_id)
    ON CONFLICT (subject_id, capability, scope) DO UPDATE SET last_event_id = EXCLUDED.last_event_id;
  RETURN v_event_id;
END;
$writer$;
REVOKE EXECUTE ON FUNCTION nutrasa.catalog_transition_capability(text,uuid,text,text,text,uuid,text,text) FROM PUBLIC;
-- Any inherited nonowner function ACL aborts the whole definition/history/checksum transaction.
SELECT 1 / ((NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace,
    LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
  WHERE n.nspname = 'nutrasa' AND p.proname = 'catalog_transition_capability' AND a.grantee <> p.proowner
))::integer);

-- Down Migration
-- Approved admin must first close callers and hand ownership back. Authority history is never dropped.
DROP FUNCTION nutrasa.catalog_transition_capability(text,uuid,text,text,text,uuid,text,text);
