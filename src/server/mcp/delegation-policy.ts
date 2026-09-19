export type DelegationEvidence = {
  sourceValid: boolean;
  sourceAal: string | null;
  sourceUserId: string;
  oauthUserId: string;
  oauthClientId: string | null;
  approvedClientId: string;
  oauthCreatedAt: Date;
  approvedAt: Date;
};

// An OAuth session cannot borrow an unrelated user's, client's, or older grant.
export function permitsMfaDelegation(evidence: DelegationEvidence): boolean {
  return evidence.sourceValid && evidence.sourceAal === "aal2" &&
    evidence.sourceUserId === evidence.oauthUserId &&
    evidence.oauthClientId === evidence.approvedClientId &&
    Number.isFinite(evidence.approvedAt.getTime()) &&
    evidence.oauthCreatedAt.getTime() >= evidence.approvedAt.getTime();
}
