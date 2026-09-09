CREATE TABLE erp.auth_rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiry_idx ON erp.auth_rate_limits (expires_at);
ALTER TABLE erp.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp.auth_rate_limits FROM PUBLIC, anon, authenticated;
