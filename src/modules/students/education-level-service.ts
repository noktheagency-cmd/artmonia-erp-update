import type { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";
import { normalizeAzerbaijaniSearch } from "@/modules/shared/search-text";

/** Catalog values are canonical; an unchanged historical value must not block a rename. */
export async function resolveStudentEducationLevel(tx: Prisma.TransactionClient, requested?: string, preserved?: string | null) {
  if (!requested) return null;
  if (requested === preserved) return {value:requested,isActive:false};
  const exact = await tx.dropdownCatalogOption.findUnique({where:{catalog_value:{catalog:"STUDENT_EDUCATION_LEVEL",value:requested}},select:{value:true,isActive:true}});
  if (exact?.isActive) return exact;
  const active = await tx.dropdownCatalogOption.findMany({where:{catalog:"STUDENT_EDUCATION_LEVEL",isActive:true},select:{value:true},orderBy:{value:"asc"},take:201});
  const matches = active.filter(option=>normalizeAzerbaijaniSearch(option.value)===normalizeAzerbaijaniSearch(requested));
  if (active.length<=200 && matches.length===1) return {value:matches[0].value,isActive:true};
  throw new PublicActionError("Təhsil səviyyəsi aktiv siyahıda tapılmadı. Siyahıdan yenidən seçin.");
}
