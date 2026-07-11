export type AppErrorDetails = {
  message: string;
  title: string;
  code?: string;
};

const NETWORK_ERROR_PATTERN =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed/i;
const PERMISSION_ERROR_PATTERN =
  /unauthorized|forbidden|permission|icaz[əe]|giriş icazəsi/i;
const TIMEOUT_ERROR_PATTERN = /timeout|timed out|vaxt limiti/i;

export function getAppErrorDetails(
  error: unknown,
  fallback = "Əməliyyat tamamlanmadı. Bir az sonra yenidən cəhd edin."
): AppErrorDetails {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return {
      title: "Məlumat təkrarlanır",
      message: "Bu məlumat artıq sistemdə mövcuddur.",
      code: "DUPLICATE_RECORD",
    };
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : fallback;
  const message = rawMessage.trim() || fallback;

  if (NETWORK_ERROR_PATTERN.test(message)) {
    return {
      title: "Bağlantı problemi",
      message: "İnternet bağlantısını yoxlayın və yenidən cəhd edin.",
      code: "NETWORK_ERROR",
    };
  }

  if (PERMISSION_ERROR_PATTERN.test(message)) {
    return {
      title: "Giriş məhdudlaşdırılıb",
      message: "Bu əməliyyat üçün hesabınızda lazımi icazə yoxdur.",
      code: "PERMISSION_ERROR",
    };
  }

  if (TIMEOUT_ERROR_PATTERN.test(message)) {
    return {
      title: "Sorğu gecikdi",
      message: "Server vaxtında cavab vermədi. Yenidən cəhd edin.",
      code: "TIMEOUT_ERROR",
    };
  }

  return {
    title: "Əməliyyat alınmadı",
    message,
  };
}
