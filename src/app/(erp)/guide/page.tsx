import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, CheckCheck, ChevronDown, CircleCheck, Info, ListOrdered } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireErpPageActor } from "@/server/auth/page-actor";
import { can } from "@/server/rbac/permissions";
import { guideResources, guideStages } from "@/modules/guide/workflow";
import "./guide.css";

export const dynamic = "force-dynamic";

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const actor = await requireErpPageActor("/guide");
  const requestedStep = (await searchParams).step;
  const selectedIndex = Math.max(0, guideStages.findIndex((stage) => stage.id === requestedStep));
  const stage = guideStages[selectedIndex];
  const previous = guideStages[selectedIndex - 1];
  const next = guideStages[selectedIndex + 1];
  const moduleLinks = stage.links.filter((link) => link.permissions.some((permission) => can(actor.permissions, permission)));
  const resources = guideResources.filter((resource) => resource.permissions.some((permission) => can(actor.permissions, permission)));

  return (
    <main className="guide-page">
      <header className="guide-header">
        <span className="guide-header-icon" aria-hidden="true"><BookOpen size={24} /></span>
        <div>
          <h1>İş axını bələdçisi</h1>
          <p>Follow-up-dan tələbəyə keçidə, ilk dərsdən gündəlik nəzarətə qədər prosesi ardıcıl izləyin.</p>
        </div>
      </header>

      <div className="guide-workspace">
        <nav className="guide-navigation" aria-label="İş axınının mərhələləri">
          <div className="guide-navigation-title"><ListOrdered size={17} aria-hidden="true" />İşin ardıcıllığı</div>
          <ol>
            {guideStages.map((item, index) => (
              <li key={item.id}>
                <Link
                  href={{ pathname: "/guide", query: { step: item.id }, hash: "guide-stage-title" }}
                  aria-current={item.id === stage.id ? "step" : undefined}
                  prefetch={false}
                >
                  <span className="guide-stage-number" aria-hidden="true">{index + 1}</span>
                  <span className="guide-navigation-copy"><strong>{item.shortTitle}</strong><small>{item.caption}</small></span>
                  <ArrowRight className="guide-navigation-arrow" size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
          <p className="guide-navigation-note">Mərhələni seçin, addımları izləyin və nəticəni yoxladıqdan sonra davam edin.</p>
        </nav>

        <section className="guide-current-stage" aria-labelledby="guide-stage-title">
          <header className="guide-stage-header">
            <p className="guide-stage-position">Mərhələ {selectedIndex + 1} / {guideStages.length}</p>
            <h2 id="guide-stage-title" tabIndex={-1} aria-live="polite">{selectedIndex + 1}. {stage.title}</h2>
            <p>{stage.description}</p>
          </header>

          <div className="guide-start"><strong>Nə vaxt başlayır?</strong><p>{stage.startWhen}</p></div>

          <ol className="guide-instructions" aria-label={stage.shortTitle + ": əməliyyat addımları"}>
            {stage.steps.map((step, index) => (
              <li key={step.title}>
                <span className="guide-instruction-number" aria-hidden="true">{selectedIndex + 1}.{index + 1}</span>
                <div><h3>{step.title}</h3><p>{step.description}</p></div>
              </li>
            ))}
          </ol>

          <section className="guide-decisions" aria-labelledby="guide-decisions-title">
            <h3 id="guide-decisions-title">Nəticəyə görə necə davam edək?</h3>
            <dl>{stage.decisions.map((decision) => (
              <div key={decision.when}><dt>{decision.when}</dt><dd>{decision.then}</dd></div>
            ))}</dl>
          </section>

          <div className="guide-reminder"><Info size={17} aria-hidden="true" /><p>{stage.reminder}</p></div>
          <section className="guide-result" aria-labelledby="guide-result-title">
            <CircleCheck size={20} aria-hidden="true" />
            <div><h3 id="guide-result-title">Mərhələnin sonunda</h3><p>{stage.result}</p></div>
          </section>

          {moduleLinks.length > 0 ? (
            <div className="guide-module-links" aria-label="Əməliyyatı sistemdə aç">
              {moduleLinks.map((link) => (
                <Link key={link.href} href={link.href} className={buttonVariants({ variant: "outline", size: "lg" })}>
                  {link.label}<ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : <p className="guide-access-note">Bu mərhələnin əməliyyatlarını uyğun icazəsi olan məsul əməkdaş tamamlayır.</p>}

          <footer className="guide-pagination" aria-label="Mərhələlər arasında keçid">
            {previous ? (
              <Link href={{ pathname: "/guide", query: { step: previous.id }, hash: "guide-stage-title" }} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <ArrowLeft data-icon="inline-start" aria-hidden="true" />Əvvəlki mərhələ
              </Link>
            ) : <span className="guide-pagination-start">Proses buradan başlayır</span>}
            {next ? (
              <Link href={{ pathname: "/guide", query: { step: next.id }, hash: "guide-stage-title" }} className={buttonVariants({ size: "lg" })}>
                <span>Növbəti: {next.shortTitle}</span><ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            ) : (
              <Link href={{ pathname: "/guide", query: { step: guideStages[0].id }, hash: "guide-stage-title" }} className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <CheckCheck data-icon="inline-start" aria-hidden="true" />Ardıcıllığa yenidən bax
              </Link>
            )}
          </footer>
        </section>
      </div>

      {resources.length > 0 ? (
        <section className="guide-resources" aria-labelledby="guide-resources-title">
          <header><h2 id="guide-resources-title">Digər gündəlik əməliyyatlar</h2><p>Əsas tələbə axını ilə yanaşı görülən dəstək işləri.</p></header>
          <div className="guide-resource-list">
            {resources.map((resource) => (
              <details key={resource.href} className="guide-resource">
                <summary><span><strong>{resource.label}</strong><small>{resource.description}</small></span><ChevronDown size={18} aria-hidden="true" /></summary>
                <div className="guide-resource-content">
                  <ol>{resource.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  <Link href={resource.href}>{resource.label}<ArrowRight size={15} aria-hidden="true" /></Link>
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
