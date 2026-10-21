-- Public email-verified subscriptions and station-silence alerts.
-- Apply only to moab_watersheds. Existing owner rules and email history are unchanged.
ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS owner_email TEXT;
CREATE INDEX IF NOT EXISTS watershed_alert_rules_owner_email
  ON public.alert_rules(owner_email) WHERE owner_email IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.watershed_public_email_access (
  email TEXT PRIMARY KEY,
  token_hash TEXT,
  token_expires_at TIMESTAMPTZ,
  last_requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.watershed_public_email_access TO watersheds_app;
ALTER TABLE public.alert_rules DROP CONSTRAINT IF EXISTS watershed_alert_offline_hours_check;
ALTER TABLE public.alert_rules ADD CONSTRAINT watershed_alert_offline_hours_check
 CHECK (parameter <> 'offline_hours' OR
   (direction='above' AND threshold>=1 AND threshold<=168 AND reset_value=0));
