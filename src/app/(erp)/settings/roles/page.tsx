import { RolePermissionsWorkspace } from "@/modules/roles/role-permissions-workspace";
import { getRolePermissionMatrix } from "@/modules/roles/queries";

export const dynamic = "force-dynamic";

export default async function RolePermissionsPage() {
  const data = await getRolePermissionMatrix();
  return <RolePermissionsWorkspace initialData={data} />;
}
