-- Up Migration
CREATE TABLE nutrasa.app_users (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  firebase_uid text COLLATE "C" NOT NULL UNIQUE,
  email_display text,
  email_verified_cache boolean,
  account_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT app_users_firebase_uid_nonblank_check CHECK (firebase_uid ~ '[^[:space:]]'),
  CONSTRAINT app_users_account_status_check CHECK (account_status IN ('ACTIVE', 'PENDING_DELETION', 'DELETED'))
);

CREATE TABLE nutrasa.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES nutrasa.app_users(id) ON DELETE CASCADE,
  date_of_birth date NOT NULL,
  height_cm numeric(8,2) NOT NULL,
  calculation_parameter text NOT NULL,
  activity_level text NOT NULL,
  goal_type text NOT NULL,
  target_weight_kg numeric(10,3),
  body_type_visual text,
  onboarding_completed_at timestamptz NOT NULL,
  profile_revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT user_profiles_date_of_birth_finite_check CHECK (pg_catalog.isfinite(date_of_birth)),
  CONSTRAINT user_profiles_height_cm_check CHECK (
    height_cm > 0 AND height_cm NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT user_profiles_calculation_parameter_nonblank_check CHECK (calculation_parameter ~ '[^[:space:]]'),
  CONSTRAINT user_profiles_activity_level_check CHECK (activity_level IN ('very_low', 'light', 'moderate', 'high', 'very_high')),
  CONSTRAINT user_profiles_goal_type_check CHECK (goal_type IN ('maintenance', 'cutting', 'bulking', 'muscle_gain')),
  CONSTRAINT user_profiles_target_weight_kg_check CHECK (
    target_weight_kg > 0 AND target_weight_kg NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
  ),
  CONSTRAINT user_profiles_target_weight_required_check CHECK (
    goal_type NOT IN ('cutting', 'bulking') OR target_weight_kg IS NOT NULL
  ),
  CONSTRAINT user_profiles_profile_revision_check CHECK (profile_revision > 0)
);

CREATE TABLE nutrasa.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES nutrasa.user_profiles(user_id) ON DELETE CASCADE,
  language_code text NOT NULL,
  time_zone text NOT NULL,
  preferred_weight_unit text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT user_preferences_language_code_nonblank_check CHECK (language_code ~ '[^[:space:]]'),
  CONSTRAINT user_preferences_time_zone_nonblank_check CHECK (time_zone ~ '[^[:space:]]'),
  CONSTRAINT user_preferences_weight_unit_check CHECK (preferred_weight_unit IN ('kg', 'lb'))
);

CREATE TABLE nutrasa.privacy_acknowledgements (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES nutrasa.app_users(id) ON DELETE RESTRICT,
  notice_version text NOT NULL,
  ack_type text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (user_id, notice_version, ack_type),
  CONSTRAINT privacy_acknowledgements_notice_version_nonblank_check CHECK (notice_version ~ '[^[:space:]]'),
  CONSTRAINT privacy_acknowledgements_ack_type_nonblank_check CHECK (ack_type ~ '[^[:space:]]')
);

-- Down Migration
DROP TABLE nutrasa.privacy_acknowledgements;
DROP TABLE nutrasa.user_preferences;
DROP TABLE nutrasa.user_profiles;
DROP TABLE nutrasa.app_users;
