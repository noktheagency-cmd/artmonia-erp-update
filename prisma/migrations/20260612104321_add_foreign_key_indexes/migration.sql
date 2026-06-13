-- CreateIndex
CREATE INDEX "exports_requested_by_id_idx" ON "exports"("requested_by_id");

-- CreateIndex
CREATE INDEX "invoices_enrollment_id_idx" ON "invoices"("enrollment_id");

-- CreateIndex
CREATE INDEX "lead_stage_history_changed_by_id_idx" ON "lead_stage_history"("changed_by_id");

-- CreateIndex
CREATE INDEX "leads_contact_id_idx" ON "leads"("contact_id");

-- CreateIndex
CREATE INDEX "leads_program_interest_id_idx" ON "leads"("program_interest_id");

-- CreateIndex
CREATE INDEX "payments_created_by_id_idx" ON "payments"("created_by_id");

-- CreateIndex
CREATE INDEX "program_pricing_versions_created_by_id_idx" ON "program_pricing_versions"("created_by_id");

-- CreateIndex
CREATE INDEX "refund_adjustments_invoice_id_idx" ON "refund_adjustments"("invoice_id");

-- CreateIndex
CREATE INDEX "refund_adjustments_payment_id_idx" ON "refund_adjustments"("payment_id");

-- CreateIndex
CREATE INDEX "refund_adjustments_requested_by_id_idx" ON "refund_adjustments"("requested_by_id");

-- CreateIndex
CREATE INDEX "refund_adjustments_finance_approved_by_id_idx" ON "refund_adjustments"("finance_approved_by_id");

-- CreateIndex
CREATE INDEX "refund_adjustments_owner_approved_by_id_idx" ON "refund_adjustments"("owner_approved_by_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "student_relationships_related_contact_id_idx" ON "student_relationships"("related_contact_id");

-- CreateIndex
CREATE INDEX "student_status_history_changed_by_id_idx" ON "student_status_history"("changed_by_id");

-- CreateIndex
CREATE INDEX "students_contact_id_idx" ON "students"("contact_id");

-- CreateIndex
CREATE INDEX "targets_owner_user_id_idx" ON "targets"("owner_user_id");

-- CreateIndex
CREATE INDEX "targets_program_id_idx" ON "targets"("program_id");

-- CreateIndex
CREATE INDEX "targets_manager_id_idx" ON "targets"("manager_id");

-- CreateIndex
CREATE INDEX "tasks_created_by_id_idx" ON "tasks"("created_by_id");

-- CreateIndex
CREATE INDEX "teacher_assignment_history_old_teacher_id_idx" ON "teacher_assignment_history"("old_teacher_id");

-- CreateIndex
CREATE INDEX "teacher_assignment_history_new_teacher_id_idx" ON "teacher_assignment_history"("new_teacher_id");

-- CreateIndex
CREATE INDEX "teacher_assignment_history_changed_by_id_idx" ON "teacher_assignment_history"("changed_by_id");

-- CreateIndex
CREATE INDEX "teacher_contract_rules_created_by_id_idx" ON "teacher_contract_rules"("created_by_id");

-- CreateIndex
CREATE INDEX "teacher_payout_lines_enrollment_id_idx" ON "teacher_payout_lines"("enrollment_id");

-- CreateIndex
CREATE INDEX "teacher_payout_lines_payment_id_idx" ON "teacher_payout_lines"("payment_id");

-- CreateIndex
CREATE INDEX "teacher_payouts_generated_by_id_idx" ON "teacher_payouts"("generated_by_id");

-- CreateIndex
CREATE INDEX "teacher_payouts_approved_by_id_idx" ON "teacher_payouts"("approved_by_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");
