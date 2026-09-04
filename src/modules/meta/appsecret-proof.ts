export type MetaApiErrorShape = {
  message?: string;
  code?: number;
};

export function isInvalidMetaAppSecretProof(error?: MetaApiErrorShape) {
  return error?.code === 100 && /appsecret_proof/i.test(error.message ?? "");
}
