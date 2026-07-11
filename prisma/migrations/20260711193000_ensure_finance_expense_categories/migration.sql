INSERT INTO "erp"."finance_expense_categories"
  ("id", "name", "description", "is_system", "created_at", "updated_at")
VALUES
  ('268bfe6b-c1bc-48a8-8c9a-91d2b1e55be1', 'Maas', 'Statik və faizlə hesablanan əməkhaqqı xərcləri', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cb4092bc-39bf-4c32-90f2-32b8b4e71b58', 'Icare', 'Studiya, filial və otaq icarələri', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('48a9d38a-e87c-460a-a54f-77f69a889fa4', 'Diger', 'Digər cari və birdəfəlik xərclər', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description",
  "is_system" = true,
  "updated_at" = CURRENT_TIMESTAMP;
