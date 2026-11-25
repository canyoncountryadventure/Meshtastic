-- Owner-only station QA/QC. Raw telemetry is immutable.
CREATE TABLE IF NOT EXISTS public.qaqc_settings (
  node_num bigint NOT NULL,
  series_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  checks jsonb NOT NULL DEFAULT '{"spike":true,"step":true,"gap":true,"flatline":false,"peer":true}'::jsonb,
  sigma double precision NOT NULL DEFAULT 4 CHECK(sigma BETWEEN 2 AND 8),
  sensitivity double precision NOT NULL DEFAULT 1 CHECK(sensitivity BETWEEN 0.5 AND 2.5),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(node_num,series_key)
);
CREATE TABLE IF NOT EXISTS public.qaqc_reviews (
  observation_id bigint NOT NULL,
  node_num bigint NOT NULL,
  series_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','rejected','needs_review')),
  note text NOT NULL DEFAULT '',
  reviewer text NOT NULL DEFAULT 'watershed_owner',
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY(observation_id,series_key)
);
CREATE TABLE IF NOT EXISTS public.qaqc_audit (
  id bigserial PRIMARY KEY,
  observation_id bigint NOT NULL,
  node_num bigint NOT NULL,
  series_key text NOT NULL,
  previous_decision text,
  new_decision text,
  note text NOT NULL DEFAULT '',
  reviewer text NOT NULL DEFAULT 'watershed_owner',
  changed_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS qaqc_audit_time_idx ON public.qaqc_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS qaqc_reviews_node_idx ON public.qaqc_reviews(node_num,series_key);
