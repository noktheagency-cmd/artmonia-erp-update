import "server-only";

import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv, requireEnv } from "@/server/env";
import { HR_DOCUMENT_MAX_BYTES } from "@/server/storage/hr-documents-public";

const MIME_EXTENSIONS = new Map([
  ["application/pdf", "pdf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
]);

let client: S3Client | undefined;

function r2Client() {
  if (client) return client;
  const accountId = requireEnv("CLOUDFLARE_R2_ACCOUNT_ID");
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

function bucket() {
  return requireEnv("CLOUDFLARE_R2_HR_BUCKET");
}

export function validateHrDocument(input: {
  name: string;
  type: string;
  size: number;
}) {
  const name = input.name.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
  if (!name) throw new Error("Fayl adı boş ola bilməz");
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > HR_DOCUMENT_MAX_BYTES) {
    throw new Error("Sənədin ölçüsü 15 MB-dan böyük ola bilməz");
  }
  const extension = MIME_EXTENSIONS.get(input.type);
  if (!extension) {
    throw new Error("Yalnız PDF, Word, Excel, PNG və JPEG sənədləri qəbul edilir");
  }
  return { name, mimeType: input.type, size: input.size, extension };
}

export function createHrDocumentObjectKey(employeeId: string, extension: string) {
  if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !/^[a-z0-9]{2,5}$/i.test(extension)) {
    throw new Error("Sənəd yolu düzgün deyil");
  }
  return `hr-employees/${employeeId}/${randomUUID()}.${extension.toLowerCase()}`;
}

export function isHrDocumentObjectKey(employeeId: string, objectKey: string) {
  return new RegExp(`^hr-employees/${employeeId}/[0-9a-f-]{36}\\.[a-z0-9]{2,5}$`, "i").test(objectKey);
}

export async function createHrDocumentUploadUrl(input: {
  objectKey: string;
  mimeType: string;
  size: number;
}) {
  return getSignedUrl(
    r2Client(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: input.objectKey,
      ContentType: input.mimeType,
      ContentLength: input.size,
    }),
    { expiresIn: 300 },
  );
}

export async function verifyHrDocumentUpload(objectKey: string) {
  const result = await r2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: objectKey }));
  return {
    size: Number(result.ContentLength ?? 0),
    mimeType: result.ContentType ?? "",
  };
}

export async function createHrDocumentDownloadUrl(objectKey: string) {
  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({ Bucket: bucket(), Key: objectKey }),
    { expiresIn: 90 },
  );
}

export function hrDocumentStorageConfigured() {
  const env = getEnv();
  return Boolean(
    env.CLOUDFLARE_R2_ACCOUNT_ID &&
      env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      env.CLOUDFLARE_R2_HR_BUCKET,
  );
}
