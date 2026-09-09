export function needsMfa(roles: readonly string[], hasVerifiedFactor: boolean, assuranceLevel: unknown) {
  return assuranceLevel !== "aal2" &&
    (hasVerifiedFactor || roles.some((role) => ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)));
}
