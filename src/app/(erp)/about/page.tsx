import "@/modules/about/about-page.css";
import { AboutWorkspace } from "@/modules/about/about-workspace";
import { getAboutProfile } from "@/modules/about/queries";
import { requireErpActor } from "@/server/auth/actor";

export default async function AboutPage() {
  const [profile, actor] = await Promise.all([
    getAboutProfile(),
    requireErpActor(),
  ]);

  return (
    <AboutWorkspace
      initialProfile={profile}
      canEdit={actor.roles.includes("SUPER_ADMIN")}
    />
  );
}
