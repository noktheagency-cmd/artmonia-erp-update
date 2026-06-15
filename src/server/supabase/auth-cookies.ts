type NamedCookie = {
  name: string;
};

export function hasSupabaseAuthCookie(
  cookies: NamedCookie[],
  supabaseUrl: string | undefined
) {
  const storageKey = getSupabaseAuthStorageKey(supabaseUrl);

  return cookies.some(({ name }) => {
    if (storageKey) {
      return name === storageKey || name.startsWith(`${storageKey}.`);
    }

    return name.startsWith("sb-") && name.includes("-auth-token");
  });
}

function getSupabaseAuthStorageKey(supabaseUrl: string | undefined) {
  if (!supabaseUrl) {
    return null;
  }

  try {
    const [projectRef] = new URL(supabaseUrl).hostname.split(".");
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}
