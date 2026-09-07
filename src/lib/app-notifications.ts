import { unstable_rethrow } from "next/navigation";
import { getAppErrorDetails } from "@/lib/app-errors";
import { announceStaleVersion } from "@/lib/app-version";

export type AppNotificationTone = "success" | "error" | "warning" | "info";

export type AppNotificationInput = {
  title: string;
  message?: string;
  tone?: AppNotificationTone;
  duration?: number;
};

export const APP_NOTIFICATION_EVENT = "artmonia:notification";

export function notify(input: AppNotificationInput) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<AppNotificationInput>(APP_NOTIFICATION_EVENT, {
      detail: input,
    })
  );
}

export function notifySuccess(title: string, message?: string) {
  notify({ title, message, tone: "success" });
}

export function notifyError(
  error: unknown,
  fallback?: string,
  title?: string
) {
  unstable_rethrow(error);
  const details = getAppErrorDetails(error, fallback);
  if (details.code === "STALE_APP_VERSION") {
    announceStaleVersion();
    return;
  }
  notify({
    title: title ?? details.title,
    message: details.message,
    tone: "error",
    duration: 6500,
  });
}

export function notifyCaughtError(
  error: unknown,
  fallback?: string,
  title?: string
) {
  unstable_rethrow(error);
  const details = getAppErrorDetails(error, fallback);
  if (details.code === "STALE_APP_VERSION") {
    announceStaleVersion();
    return details.message;
  }
  notify({
    title: title ?? details.title,
    message: details.message,
    tone: "error",
    duration: 6500,
  });
  return details.message;
}

export async function tryCatchWithToast<T>(
  operation: () => Promise<T>,
  options: {
    fallback?: string;
    errorTitle?: string;
    successTitle?: string;
    successMessage?: string;
  } = {}
): Promise<T | undefined> {
  try {
    const result = await operation();
    if (options.successTitle) {
      notifySuccess(options.successTitle, options.successMessage);
    }
    return result;
  } catch (error) {
    notifyError(error, options.fallback, options.errorTitle);
    return undefined;
  }
}
