type ValidationIssue = {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  format?: string;
};

type ValidationError = {
  issues: readonly ValidationIssue[];
};

const fieldLabels: Record<string, string> = {
  campaignId: "Kampaniya",
  contactId: "Əlaqə",
  enrollmentId: "Qeydiyyat",
  eventId: "Tədbir",
  expenseId: "Xərc",
  groupId: "Qrup",
  leadId: "Müraciət",
  managerId: "Menecer",
  membershipId: "Qrup üzvlüyü",
  ownerUserId: "Məsul şəxs",
  participantId: "İştirakçı",
  paymentId: "Ödəniş",
  programId: "Proqram",
  roleId: "Rol",
  studentId: "Tələbə",
  taskId: "Tapşırıq",
  teacherId: "Müəllim",
  userId: "İstifadəçi",
};

export function getPublicValidationMessage(error: ValidationError) {
  const issue = error.issues[0];
  if (!issue) {
    return "Daxil edilən məlumatlar düzgün deyil.";
  }

  const field = getIssueField(issue);

  if (
    issue.code === "invalid_type" &&
    (field === "idempotencyKey" || field?.endsWith("Id"))
  ) {
    if (field === "idempotencyKey") {
      return "Sorğunu göndərmək mümkün olmadı. Səhifəni yeniləyib yenidən cəhd edin.";
    }

    const label = fieldLabels[field];
    return label ? `${label} seçilməlidir.` : "Seçim edilməlidir.";
  }

  if (issue.code === "invalid_format" && issue.format === "uuid") {
    if (field === "idempotencyKey") {
      return "Sorğunu göndərmək mümkün olmadı. Səhifəni yeniləyib yenidən cəhd edin.";
    }

    const label = field ? fieldLabels[field] : undefined;
    return label
      ? `${label} düzgün seçilməyib.`
      : "Seçilmiş məlumat düzgün deyil.";
  }

  return issue.message || "Daxil edilən məlumatlar düzgün deyil.";
}

export function isUuidDatabaseError(message: string) {
  return /invalid input syntax for type uuid|invalid uuid|uuid[^\n]{0,40}invalid/i.test(message);
}

function getIssueField(issue: ValidationIssue) {
  for (let index = issue.path.length - 1; index >= 0; index -= 1) {
    const segment = issue.path[index];
    if (typeof segment === "string") {
      return segment;
    }
  }

  return undefined;
}
