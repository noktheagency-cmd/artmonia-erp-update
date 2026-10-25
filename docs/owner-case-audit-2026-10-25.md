# Owner halları üzrə audit — 25.10.2026

Sonrakı 18–28-ci hallar və onların tətbiq/yoxlama nəticələri [26 oktyabr auditində](owner-case-audit-2026-10-26.md) saxlanılıb.

## Əhatə və tətbiq

Hədəf owner-in seçdiyi `https://artmonia-erp.vercel.app/` və verdiyi bağlantı ilə təsdiqlənən `xgxlwbqaojbptrgosxtj` bazasıdır. Əsas `Artmoni-erp-final` bazası ilə eyni tələbə ID-ləri olmasına baxmayaraq, həmin əsas bazaya bu düzəlişlər yazılmayıb. Bağlantı sirrləri fayllarda saxlanılmayıb.

Maliyyə dəyişikliklərindən əvvəl `tmp/owner-case-audit-20261025/` altında gitignored surətlər saxlanılıb. Eyni bərpa məlumatları transaction daxilində auditə də yazılıb. Plan əvvəl tam icra edilərək rollback ilə yoxlanıb; sonra tətbiq edilib. Snapshot dəyişərsə əməliyyat yazmadan dayanır. Təkrar tətbiq yeni qəbz və ya düzəliş yaratmır.

## 1–3 və 11. Tələbə düzəlişlərinin son nəticəsi

| Tələbə / kod | Cari paket və başlanğıc | Cari borc | Növbəti ödəniş |
| --- | --- | --- | --- |
| Mahitac (Matica) Poladova / ART-2853 | 04.10.2026 · 79 AZN / 4 dərs | 0 AZN | 04.11.2026 |
| Təranə Həsənli / ART-1392 | Baza paket · 04.10.2026 · 149 AZN / 8 dərs | 0 AZN | 04.11.2026 |
| Heydər Həsənli / ART-2592 | Uşaq qrupu · 04.10.2026 · 100 AZN / 8 dərs | 0 AZN | 04.11.2026 |
| Gülay Kərimzadə / ART-1186 | İlk faktiki dərs 05.10.2026 | 0 AZN | 05.11.2026 |

- İlk texniki düzəlişdə köhnə PAUSED paket fakturaları VOID edilib, mövcud ödənişlər düzgün cari paketə bölünüb. Təranənin sentyabr üzrə 149 AZN və Heydərin sentyabr üzrə 60 AZN köhnə qalıqları owner-in borcsuz tarixi vəziyyət tələbinə əsasən ayrıca istisna kimi auditlə ləğv edilib.
- Owner daha sonra Matica üçün avqust dondurmasından **yalnız 4 oktyabrda** qayıdışı və **cəmi bir dəfə 79 AZN** alındığını dəqiqləşdirib. Buna görə yanlış sentyabr dövrü və `5e07fde4-2b8d-47aa-9037-683080781123` dublikat qəbz çıxarılıb. Oktyabrın 79 AZN qəbzi saxlanılıb. Cari paket və slotun başlanğıcı 4 oktyabra düzəldilib. Əvvəlki status/audit qeydləri silinməyib; düzgün dondurma və qayıdış tarixçəsi əlavə qeydlərlə tamamlanıb. Orijinal ilk dərs 1 aprel olaraq qalır.
- Heydərin iyuldakı 100 AZN-i təkrar istifadə edilməyib. Owner ayrıca **04.10.2026, nağd 100 AZN** təsdiqlədiyi üçün həmin günə yeni qəbz və bölgü yaradılıb. Cari anchor 4 oktyabr, orijinal ilk dərs 28 fevraldır.
- Gülayın qeydiyyatı bazada **30.09.2026**-dır; mətndəki 2025 rəqəmi ilə fərq saxlanılıb. 1 oktyabr jurnalında ABSENT, 5 oktyabrda ilk PRESENT var. Səhv 1 oktyabr anchor-u və ilk dərs qeydi bu faktlara uyğun 5 oktyabra düzəldilib. Qeydiyyat və ödəniş tarixləri dəyişdirilməyib.
- Texniki əməliyyatların actor-u ERP-də başqa insan kimi göstərilməyib: auditdə `Codex maintenance / explicit owner request` və təsdiqin səbəbi saxlanılıb.

## 4 və 10. Təhsil pilləsi və şəxsi profil

Nazlı Abdullayevanın profili ART-3572 ilə tapılıb. Təhsil pilləsi həm tələbədə, həm bağlı müraciətdə boşdur; owner konkret pillə bildirmədiyi üçün dəyər təxmin edilməyib. Hira Şəncanın profili ART-1206 ilə tapılıb, adı artıq düzgündür.

Qeydiyyatın bütün əlaqəli seçimləri aktiv təhsil kataloqundan alınır. `İşləyir` / `işləyir` kimi birmənalı hərf variantları serverdə aktiv kanonik dəyərə çevrilir. Ad və digər şəxsi məlumatların redaktəsi standart olaraq PROFILE_ONLY rejimindədir. Paket dəyişmək üçün ayrıca seçim var. Dəyişdirilməyən köhnə təhsil pilləsi kataloqdan silinsə belə ad redaktəsini bloklamır. İcazə və kataloq yaradılması qaydaları saxlanır.

## 5. Hər gəliş üzrə birdəfəlik dərs

26.10.2026 dəqiqləşdirməsi ilə xidmət “Qonaq dərs” adlanır. Cari axın, hesablama və qəbul addımları [qonaq dərs müqaviləsində](guest-lessons.md) saxlanılır.

- İlk qeydiyyat Yeni tələbə və ya CRM qeydiyyat modalındakı “Birdəfəlik ödənişli — qonaq dərs” seçimindən başlayır. `/students/single-lessons` yalnız jurnaldır; oradan yeni tələbə yaradılmır, mövcud tələbəyə yeni gəliş təyin edilir.
- Qonaq dərs satış və aktiv tələbə deyil; aylıq paket, avtomatik dövr və növbəti ay borcu yaratmır. Pul yalnız həmin dərsin fakturasına ayrılır. Ümumi gəlir və tələbə göstəricilərindən ayrı göstərilir.
- İştirak və ödəniş tamamlananda faizli müəllimə müqavilə faizi, sabit maaşlı müəllimə əlavə 35% hesablanır. Test ödənişləri real maaş və gəlirdən çıxarılır.
- Əvvəlki qeydiyyat, scope, idempotency və aylıq tələbənin mövcud paketini qoruma qaydaları saxlanılır.

Schema Vercel bazasında əvvəl tətbiq olunub. Sonrakı kod dəyişikliklərinin deploy statusu bu auditlə təsdiqlənmir.

## 6. Axtarış

Ümumi axtarışdakı müddətsiz nəticə cache-i, o cümlədən boş nəticənin saxlanması çıxarılıb. Köhnə/abort edilmiş sorğu yeni cavabın üzərinə yazmır. Xətada və boş nəticədə refresh tələb etməyən təkrar axtarış var. Tələbə və CRM siyahısı adın hissələrini müxtəlif sırada və Azərbaycan klaviaturası olmadan da tapır. `Kerimzade Gulay` canlı Vercel DB sorğusunda ART-1186-nı tapıb.

## 7. Arxiv borcu

Owner-in köhnə qaydalara aid arxiv qalıqlarının ləğvi göstərişi üzrə 43 STOPPED tələbənin 47 fakturasında **4.976 AZN** qalıq bağlanıb. Tam ödənilməmiş fakturalar VOID edilib. Qismən ödənilmiş iki fakturada 56 AZN və 40 AZN ödənmiş hissə saxlanılıb, yalnız qalıq ləğv olunub; ilkin məbləğ və səbəb auditdədir. Bu əməliyyat pul daxilolmasını artırmayıb və refund yaratmayıb. Son sorğuda arxiv üzrə açıq faktura sayı və balans 0-dır. Yeni qaydalara əsasən gələcək legitim borcları avtomatik silən daimi mexanizm əlavə edilməyib.

## 8. Follow-up və sınaq analitikası

26.10.2026 dəqiqləşdirməsi: ayrıca müəllim nəticələri cədvəli tələb olunmadığı üçün owner-in göstərişi ilə CRM icmalından çıxarıldı. Yalnız həmin UI paneli və ona məxsus CSS silindi; görüş analitikası, tarix filtrləri və follow-up hesablama düzəlişləri saxlanıldı.

25 oktyabr düzəlişində CRM icmalına müəllimlər üzrə sınaq təyinatı, iştirak, gəlməmə, uğurlu/itirilmiş nəticə və gözləmə cədvəli əlavə edilmişdi. Saxlanılan hesablamada dövr müraciətin yaradılmasına deyil, görüşün Bakı tarixinə tətbiq olunur. Əvvəlki ay yaradılmış müraciətin bu aykı sınağı da sayılır. Uğurlu nəticə iştirakdan sonrakı ləğv edilməmiş uyğun satışla, uğursuz nəticə iştirak edib sonra LOST olan müraciətlə müəyyən olunur; cavabı gözləyənlər təxminlə uğursuz sayılmır.

Tamamlanmamış və gecikmiş görüş sayı bütün dövrləri əhatə edir. Bugünkü follow-up sayında yaradılma ayı məhdudiyyəti çıxarılıb. Köhnə qeyddə müəllim yoxdursa analitika nəticəsində `Müəllim təyin edilməyib` saxlanır; müəllim təxmin edilmir. Tarixi reminder planları real görüşlə eyni günə düşürsə iki dəfə sayılmır. Sınaq analitikası görüş qeydlərini sayır; təkrar sınaq ayrıca görüşdür.

## 9. Satış sayı

25.10.2026 yoxlamasında Vercel bazasında həmin gün üçün uyğun satış sayı **0**, pul qəbzi sayı **0** olub. Ümumi satış jurnalı 26 qeyddir. Yeni təsdiqlənmiş Heydər qəbzinin faktiki tarixi 4 oktyabr olduğundan bugünkü satış/pula əlavə edilmir; bu davam ödənişi yeni qəbul satışı yaratmır. Panel və gündəlik hesabatın mənbəyi `course_sales.qualified_at` olaraq qalır. Köhnə UNCLASSIFIED qəbzlər müqavilə/qəbul sübutu olmadan avtomatik yeni satışa çevrilməyib.

## Aktiv tələbə sayı və oxşar hallar

Canlı cari statusla 143 aktiv tələbə, 4 oktyabr sonuna tarixçə ilə 107 aktiv tələbə oxunub. Owner-in sonradan daxil edəcəyini bildirdiyi, adı göstərilməmiş köhnə tələbələr əlavə edilməyib və say 110-a sabitlənməyib. Ödəniş, tələbə statusu və satış ayrı faktlar olaraq qalır.

Son auditdə ödənmiş qəbul pulunun açıq ilk fakturaya bölünməməsi, cari ayda köhnə PAUSED və yeni ACTIVE paketə yanaşı açıq borc yazılması və Gülay üçün istifadə edilən dəqiq sübut şərtlərinə uyğun əlavə hal tapılmayıb. Təkcə plan/anchor fərqi başqa tarixi tələbəyə maliyyə düzəlişi etmək üçün kifayət sayılmayıb.

## Təkrarlanmanın qarşısı

1. Aylıq invoice/payment yolları yalnız dövrə uyğun aktiv paketdən istifadə edir; STOPPED və ödənişi dayandırılmış hesablar yeni aylıq borc yaratmır.
2. Scheduler aktiv və artıq başlamış paketi, həmin ayın tarifini, manual ödəniş gününü və freeze tarixçəsini nəzərə alır; köhnə ayların boşluqlarını avtomatik borca çevirmir.
3. İlk faktiki iştirak cari anchor-u DB guard-ı yalnız transaction çərçivəsində açaraq və actor-u ötürərək dəyişir. Əvvəlki dövrün manual günü yeni dövrə daşınmır; tarixi ayların qaydaları saxlanır.
4. İlk iştirak fakturası açıldıqda yalnız həmin tamamlanmış qəbulun xərclənməmiş pulları ona ayrılır; köhnə qəbzlər ikinci dəfə istifadə edilmir.
5. Qayıdışdan əvvəlki PAUSED proqram yeni qəbulda eyni proqramın seçilməsinə mane olmur. Cari ACTIVE paket və yeni qayıdışın PAUSED qaralaması dublikatdan qorunur.

Prisma miqrasiyaları: `20261025190000_single_lessons`, `20261025191000_current_enrollment_billing_job`, `20261025192000_due_rules_current_cycle`. Vercel-də tətbiq edilib, checksum və tətbiq tarixləri `erp._prisma_migrations`-da saxlanılıb. Başqa mühitə deploy ayrıca həmin mühitin migration qaydalarına tabedir.

## Owner üçün qısa qəbul addımları

1. Üç əvvəlki problemli profili yeniləyin: borc 0, cari dövr 04.10, növbəti ödəniş 04.11. Gülayda 05.10 / 05.11 olmalıdır.
2. Kod deployundan sonra [qonaq dərs qəbul addımlarını](guest-lessons.md) izləyin. İşarələnmiş demo profilləri üzərində test ödənişləri real pul və maaşa təsir etmir.
3. `/crm`: keçən ay yaradılmış, bu ay sınağa yazılmış müraciəti icmalda yoxlayın; mövcud görüş və follow-up göstəricilərini yoxlayın. Ayrı müəllim nəticələri cədvəli çıxarılıb.
4. Nazlının profilində təhsil pilləsini seçib saxlayın; Hiranın adını şəxsi redaktə rejimində yoxlayın. Axtarışda `Gulay`, `Kerimzade Gulay` və təkrar eyni adı sınayın.

Brauzer/E2E qəbulu owner üstünlüyünə uyğun icra edilməyib. Kod deployu bu audit əməliyyatı tərəfindən edilməyib; DB düzəlişi ilə kodun Vercel-də dərc olunması ayrı statuslardır.
