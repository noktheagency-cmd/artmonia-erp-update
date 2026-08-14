CREATE TABLE "erp"."about_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "singleton_key" VARCHAR(32) NOT NULL DEFAULT 'primary',
    "title" VARCHAR(80) NOT NULL,
    "tagline" VARCHAR(180) NOT NULL,
    "story" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "vision" TEXT NOT NULL,
    "values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "about_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "about_profiles_singleton_key_key"
ON "erp"."about_profiles"("singleton_key");

CREATE INDEX "about_profiles_updated_by_id_idx"
ON "erp"."about_profiles"("updated_by_id");

ALTER TABLE "erp"."about_profiles"
ADD CONSTRAINT "about_profiles_updated_by_id_fkey"
FOREIGN KEY ("updated_by_id") REFERENCES "erp"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "erp"."about_profiles" (
    "singleton_key",
    "title",
    "tagline",
    "story",
    "mission",
    "vision",
    "values",
    "updated_at"
) VALUES (
    'primary',
    'Biz kimik',
    'İncəsənəti öyrənmək, yaratmaq və paylaşmaq üçün canlı bir yaradıcılıq mühiti.',
    'Artmonia fərqli yaş və təcrübə səviyyələrindən olan insanları incəsənət ətrafında birləşdirən yaradıcı təhsil məkanıdır. Burada hər bir iştirakçının öz üslubunu kəşf etməsi, texniki bacarıqlarını inkişaf etdirməsi və ideyalarını inamla ifadə etməsi üçün düşünülmüş öyrənmə təcrübəsi qururuq.',
    'İncəsənət təhsilini sistemli, ilhamverici və hər kəs üçün əlçatan təcrübəyə çevirmək.',
    'Yaradıcılığın gündəlik həyatın təbii hissəsi olduğu güclü və açıq bir icma formalaşdırmaq.',
    ARRAY['Yaradıcılıq', 'İnkişaf', 'Səmimiyyət', 'Birlik']::TEXT[],
    CURRENT_TIMESTAMP
);
