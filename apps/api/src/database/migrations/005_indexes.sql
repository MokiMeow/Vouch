CREATE INDEX IF NOT EXISTS campaigns_workspace_created ON campaigns(workspace_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS runs_campaign_created ON runs(campaign_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_run_created ON reviews(run_id,created_at);
