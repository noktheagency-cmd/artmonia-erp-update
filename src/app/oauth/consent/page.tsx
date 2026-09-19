import { AppRole } from "@/generated/prisma/client";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getCurrentErpUser } from "@/server/auth/session";
import { isApprovedMcpOAuthClient } from "@/server/mcp/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { decideOAuthConsent } from "./actions";
import { recordMfaDelegation } from "@/server/mcp/delegation";
import styles from "./styles.module.css";

type ConsentPageProps = {
  searchParams: Promise<{ authorization_id?: string }>;
};

const scopeLabels: Record<string, string> = {
  openid: "Hesab kimliyinizi təsdiqləmək",
  email: "E-poçt ünvanınızı tanımaq",
  profile: "Profil məlumatınızı tanımaq",
};

export default async function OAuthConsentPage({
  searchParams,
}: ConsentPageProps) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) {
    return <ConsentError message="OAuth sorğusunun identifikatoru yoxdur." />;
  }

  const currentUser = await getCurrentErpUser(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
  if (!currentUser) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(next)}` as Route);
  }

  if (!currentUser.roles.includes(AppRole.SUPER_ADMIN)) {
    return (
      <ConsentError message="Bu connector-u yalnız ERP Founder hesabı qoşa bilər." />
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !data) {
    return <ConsentError message="OAuth sorğusu etibarsızdır və ya vaxtı bitib." />;
  }

  if (!("authorization_id" in data)) {
    // Supabase can auto-approve an already-consented client. Bind that new
    // authorization to this verified MFA session before releasing the code.
    await recordMfaDelegation(authorizationId, currentUser);
    redirect(data.redirect_url as Route);
  }

  if (!isApprovedMcpOAuthClient(data.client.id)) {
    return <ConsentError message="Bu OAuth tətbiqi ERP connector-u üçün təsdiqlənməyib." />;
  }

  const scopes = data.scope.split(/\s+/).filter(Boolean);

  return (
    <main className={styles.screen}>
      <section className={styles.card}>
        <div className={styles.brand}>ARTMONIA ERP</div>
        <p className={styles.eyebrow}>Founder connector</p>
        <h1>ERP məlumatlarını oxuma icazəsi verilsin?</h1>
        <p className={styles.intro}>
          <strong>{data.client.name}</strong> sizin Founder hesabınızla
          Artmonia ERP-yə yalnız oxuma rejimində qoşulmaq istəyir.
        </p>

        <div className={styles.permissions}>
          <h2>Connector bunları edə biləcək</h2>
          <ul>
            <li>ERP göstəricilərini və maliyyə xülasələrini oxumaq</li>
            <li>Tələbə, CRM, işçi, tapşırıq və audit məlumatlarını axtarmaq</li>
            <li>Data-keyfiyyət və əməliyyat riskləri üzrə audit aparmaq</li>
          </ul>
        </div>

        <div className={styles.guardrail}>
          Məlumat əlavə etmək, dəyişmək, silmək və ödəniş əməliyyatı aparmaq
          mümkün deyil. Bütün MCP oxuları ERP audit jurnalına yazılır.
        </div>

        <details className={styles.details}>
          <summary>Texniki icazələr</summary>
          <ul>
            {scopes.map((scope) => (
              <li key={scope}>{scopeLabels[scope] ?? scope}</li>
            ))}
          </ul>
          <p>Hesab: {currentUser.email}</p>
        </details>

        <form action={decideOAuthConsent} className={styles.actions}>
          <input
            type="hidden"
            name="authorizationId"
            value={data.authorization_id}
          />
          <button name="decision" value="deny" className={styles.deny}>
            İmtina et
          </button>
          <button name="decision" value="approve" className={styles.approve}>
            İcazə ver
          </button>
        </form>
      </section>
    </main>
  );
}

function ConsentError({ message }: { message: string }) {
  return (
    <main className={styles.screen}>
      <section className={styles.card}>
        <div className={styles.brand}>ARTMONIA ERP</div>
        <p className={styles.eyebrow}>Connector xətası</p>
        <h1>Qoşulma tamamlanmadı</h1>
        <p className={styles.intro}>{message}</p>
      </section>
    </main>
  );
}
