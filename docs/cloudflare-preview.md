# Cloudflare sınağı — əsas domen yeni Railway hesabındadır

## Cari vəziyyət: 2026-10-15

Sahibin açıq təsdiqi ilə `https://erp.artmoniya.com` yeni Railway hesabındakı
ERP-yə keçirilib. Deployment `9513b193-9ac2-4ae4-9dae-b9d6ffbb435d`, build ID
`b6fa8843-cf95-45f8-b329-6fbb50124151`. Railway ownership doğrulanıb və sertifikat
`VALID/COMPLETE` göstərir. Əsas domen üzrə 12 canlı yoxlama keçib; mövcud etibarlı
brauzer sessiyası ilə panel açılıb. Yeni giriş/MFA, tələbə/maliyyə əməliyyatları və
qəbz/PDF üzrə funksional qəbul sahibi tərəfindən aparılmalıdır.

Cloudflare Worker-in ERP Custom Domain bağlantısı və köhnə Railway-dəki domen
bağı çıxarılıb. Yeni proxied `CNAME erp -> i71ib3s3.up.railway.app` və yeni
`_railway-verify.erp` TXT qeydi saxlanılıb. Root domen və email qeydləri dəyişməyib.
Yeni Railway APP/MCP URL-ləri əsas domenə uyğundur. Eyni Supabase bazası, Auth və
Storage saxlanılıb; migration, seed və məlumat köçürməsi işlədilməyib.

Yeni yerləşdirmə GitHub `main` commit `bfe31bf2bc9b7282178bfab07adb054dcdc15de9`
əsasında ayrıca managed worktree-dən hazırlanıb. Tam texniki təhvil sənədi həmin
worktree-də `docs/railway-account-migration.md` faylındadır. Aşağıdakı Worker
problemləri tarixi sınaq nəticələridir və əsas domen artıq bu Worker-ə getmir.

Əvvəlki sınaqda `erp.artmoniya.com` `artmonia-erp-preview` Worker-inə Custom Domain kimi
bağlanmışdı. `NEXT_PUBLIC_APP_URL=https://erp.artmoniya.com` və
`MCP_PUBLIC_URL=https://erp.artmoniya.com/mcp` ilə build yerləşdirilib.
Worker versiyası: `45d9c878-3dbd-4182-8d2f-b9424adf6788`;
build ID: `6d76a64b-ccfc-4039-acae-9257eb344247`.

**Bu, işlək ERP keçidinin təsdiqi deyil.** Domen/HTTPS, health və versiya
yoxlamaları keçsə də, mövcud etibarlı brauzer sessiyası ilə paneldə iki maneə tapıldı:

- Workers Free runtime logu `/dashboard`, bildiriş və sessiya sorğularında
  `exceededCpu` / `Worker exceeded CPU time limit` göstərir. Free limit 10 ms-dir;
  ödənişli plan aktivləşdirilməyib.
- Hazır yerli iş nüsxəsindəki yeni gündəlik hesabat `erp.course_sales` cədvəlinə
  müraciət edir; production baza `42P01` (relation does not exist) qaytarır.
  Bu dəyişikliklər yerli `main`-in `9112bcc` commit-indən sonrakı uncommitted
  işlərdədir. Onları avtomatik migration ilə production-a tətbiq etməyin.
  Növbəti deploy üçün baza ilə uyğun kod versiyasını ayrıca hazırlayın;
  sahibin yerli dəyişikliklərini geri çevirməyin.

Supabase bazası/faylları və MFA siyasəti dəyişdirilməyib. Funksional qəbul,
GitHub avtomatik deploy və Railway-də qalan Meta cron işi tamamlanmayıb.
Vercel nəzərdən keçirilib, ora yeni deploy edilməyib; istifadəçi yeni Railway
hesabını seçib.

Əvvəlki DNS: proxied `CNAME erp.artmoniya.com -> o6aqxvfs.up.railway.app`, TTL Auto.
Bu qeyd Cloudflare Custom Domain yaradılarkən əvəzləndi. Əvvəlki Railway ünvanı
keçiddən əvvəl də `Application not found` qaytarırdı: DNS-i geri dəyişmək təkbaşına
işlək Railway tətbiqini bərpa etmir. Domen dashboard-da idarə edilir; Wrangler
konfiqurasiyasına boş `routes` siyahısı əlavə edib bu bağlantını silməyin.

Canlı girişsiz domen yoxlamaları: health/version 200, dashboard 307 → login,
MCP metadata əsas domeni göstərir, same-origin malformed JSON 400,
cross-origin mutation 403, köhnə static upload 404. Build/TypeScript və
3 auth/origin testi keçdi; girişdən sonrakı qəbul və PDF/fayl sınağı uğurlu sayılmır.

## İlkin sınaq mərhələsi

Bu konfiqurasiya `artmonia-erp-preview` Worker-i üçündür. Əsas domen, Railway
yerləşdirməsi, Supabase bazası və mövcud fayl anbarları dəyişdirilmir. Cloudflare
tərəfində migration, seed, cron, yeni baza, R2 bucket və ya ödənişli plan yaradılmır.

Nəzərdə tutulan sınaq ünvanı: `https://artmonia-erp-preview.noktheagency.workers.dev`.
Bu sənəd özü uğurlu yerləşdirmənin təsdiqi deyil; faktiki deploy nəticəsini yoxlayın.

2026-10-15 tarixində Worker uğurla yerləşdirildi. Cloudflare hesabının Workers
plans səhifəsi `Free`, `$0`, `Current plan` göstərdi. Ölçü hesabatı təxminən
6.24 MiB gzip olsa da, bu hesabda deployment qəbul edildi; sənəddəki ümumi
limitlərə əsaslanıb gələcək deploy-ların mütləq keçəcəyini fərz etməyin.
İlkin sınaqda yoxlanmış deployment: `47de9827-faa1-48bd-a176-c0d3a2751ac1`.
Workers Prisma düzəlişindən sonrakı paket: təxminən 8.92 MiB gzip; deployment qəbul edildi.
Canlı `/api/version` cavabı və brauzerə göndərilən JS eyni build ID-ni daşıyır.

## Quruluş

- `wrangler.jsonc`: yalnız `workers.dev` ünvanı, statik asset-lər və özünə service binding.
- `open-next.config.ts`: OpenNext, əlavə paylaşılan cache anbarı olmadan.
- `CLOUDFLARE_PREVIEW=true`: Prisma bağlantılarını sorğu çərçivəsində yaradır;
  `maxUses: 1` bağlantının başqa Worker sorğusunda yenidən istifadəsini dayandırır.
- Build skripti cari sxemin ayrıca, ignored surətindən `runtime = "workerd"`
  olan `src/generated/prisma-cloudflare` müştərisini yaradır. Cloudflare üçün
  Turbopack alias-ı həmin müştərini seçir. Normal Node müştərisi və əsas Prisma
  sxemi dəyişdirilmir. Bu, Workers-də qadağan olan dinamik WASM kompilyasiyasını
  statik WASM importu ilə əvəz edir.
  Generator üçün [Prisma-nın Workers təlimatına](https://www.prisma.io/docs/guides/v7/deployment/cloudflare-workers) baxın.
- Şəkillər mövcud anbarlardan gəlir; ödənişli Images binding tələb edilmir.
- Məxfi runtime dəyişənləri Wrangler secrets kimi verilir. Build yalnız
  `NEXT_PUBLIC_*` dəyişənlərini və `wrangler.jsonc` daxilindəki açıq dəyişənləri götürür.
- Build-in sonunda adapterin `.env.local` surəti paketdən çıxarılır; runtime
  konfiqurasiyası yalnız Cloudflare secrets və açıq vars-dan gəlir. Köhnə lokal
  `public/uploads/` faylları statik asset kimi yayımlanmır.
- Cloudflare build skripti server və brauzer üçün bir `NEXT_PUBLIC_APP_BUILD_ID`
  yaradır; təzə açılmış səhifədə yanlış yenilənmə bildirişi yaranmır.

## Əllə yerləşdirmə

Node 22–24 və npm istifadə edin. Şəxsi konfiqurasiyanı ignored
`tmp/cloudflare-preview/secrets.json` faylında JSON obyekt kimi hazırlayın.
Məxfi dəyərləri repoya, loglara və sənədlərə daxil etməyin.

```sh
npm ci
npm run build:cloudflare
npm run deploy:cloudflare
```

Build bazaya migration tətbiq etmir. Development actor və Railway-ə məxsus
xidmət dəyişənləri sınağa köçürülmür. `ALLOW_DEMO_SEED=false` saxlanılır.
2026-10-15 dəyişən sinxronlaşdırmasında Railway production xidmətinin 35 tətbiq
dəyişəni (`DIRECT_URL` və `NODE_ENV` daxil) encrypted Worker secrets kimi yazıldı.
11 `RAILWAY_*` dəyişəni daşınmadı; `NEXT_PUBLIC_APP_URL` və `MCP_PUBLIC_URL`
sınaq ünvanında saxlanıldı. Heç bir migration və seed əmri işlədilmədi.

İlk giriş cəhdindəki “Giriş müvəqqəti əlçatan deyil” xətası üçün dəyişənlərin
əvvəlki 33 dəyərinin Railway ilə eyni olduğu yoxlandı. Ayrı `workerd` müştərisi
ilə localhost-da Cloudflare runtime sınağı `SELECT 1` və
`SELECT 1 FROM erp.auth_rate_limits LIMIT 0` sorğularını uğurla icra etdi.
Bu sınaq məlumat yazmır və istifadəçinin giriş/MFA yoxlamasını əvəz etmir.

OpenNext 1.20.11 üçün build skriptində məhdud uyğunluq düzəlişləri var:
[upstream #1400](https://github.com/opennextjs/opennextjs-cloudflare/issues/1400)
üzrə traced OpenTelemetry ESM girişinin yoxlanması və Windows-da qovluq
symlink-ləri üçün junction istifadəsi. Adapter yenilənərkən düzəlişləri yenidən
nəzərdən keçirin. Node middleware dəstəyi adapterdə eksperimentaldır.

Turbopack-ın geniş WASM trace-i inkişaf alətlərinin istifadə olunmayan mühərriklərini
də paketə sala bilir. Bu layihənin generated WASM loader-i yalnız faktiki PostgreSQL
compiler-i ilə eyni baytlara malik modulları seçir. Əlavə native server WASM
kitabxanası daxil edilərsə, həmin qaydanı yenidən nəzərdən keçirin.
`scripts/cloudflare-wasm.mjs` eyni məzmunlu statik WASM importlarını bir faylda
birləşdirir. Son paketdə PostgreSQL compiler-i və Next-in iki OG modulu olmaqla
3 unikal WASM modulu saxlanılır; istifadə olunmayan CLI mühərrikləri yerləşdirilmir.

## Sahibin yoxlaması

1. Sınaq ünvanında mövcud hesabla giriş və MFA-nı yoxlayın.
2. Tələbələr və maliyyə səhifəsində mövcud məlumatları müqayisə edin.
3. İcazəniz olan qəbz/faylı və PDF ixracını açın.

Sınaq eyni real bazaya bağlıdır: burada edilən dəyişikliklər əsas sistemdə də görünür.
İstifadəçi təsdiqindən əvvəl domen/DNS və əsas inteqrasiya webhook ünvanlarını dəyişməyin.

Avtomatik yoxlamalar: Next/OpenNext production build, TypeScript və lint
(0 xəta, 5 mövcud xəbərdarlıq), 359 keçən test və 17 buraxılan test.
Canlı ilkin yoxlamalar: health/login 200, girişsiz dashboard 307 → login,
qorunan API və qəbz 401, kənar origin ilə mutation 403, köhnə statik upload 404.
Bunlar girişdən sonrakı ERP axınlarının və bazanın funksional yoxlamasını əvəz etmir.
Runtime dependency audit 0 tapıntı göstərdi; tam auditdə development alətlərinin
33 tapıntısı (5 moderate, 27 high, 1 critical) qalır. Tam `npm audit --audit-level=high`
uğurlu sayılmamalıdır.

## GitHub bağlantısı

İlk sınaq cari yerli iş nüsxəsindən CLI ilə yerləşdirilir. GitHub-da olmayan
dəyişikliklər avtomatik olaraq ora göndərilmir. Sonradan Cloudflare Workers Builds
ilə repoya bağlamaq olar: build `npm run build:cloudflare`, deploy
`npx opennextjs-cloudflare deploy`. Runtime secrets Cloudflare-də saxlanmalı,
`NEXT_PUBLIC_*` dəyişənləri build mühitinə ayrıca verilməlidir. CI-də lokal
`tmp/cloudflare-preview/secrets.json` faylını tələb edən npm deploy skriptini işlətməyin.
