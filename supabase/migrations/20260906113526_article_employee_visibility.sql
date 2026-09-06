ALTER TABLE erp.knowledge_articles ADD COLUMN inherit_audience boolean NOT NULL DEFAULT true;
CREATE TABLE erp.knowledge_article_audiences (
  article_id uuid NOT NULL REFERENCES erp.knowledge_articles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  employee_id uuid NOT NULL REFERENCES erp.hr_employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (article_id, employee_id)
);
CREATE INDEX knowledge_article_audiences_employee_id_article_id_idx ON erp.knowledge_article_audiences(employee_id, article_id);
ALTER TABLE erp.knowledge_article_audiences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE erp.knowledge_article_audiences FROM anon, authenticated;
