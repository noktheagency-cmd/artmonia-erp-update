# Gün sonu satış hesabatı

Dashboard-un aşağı hissəsində İsmət və Vaqifin mövcud ERP hesabları üçün göstərilir. Server həm hesab ID-sini, həm də dashboard, CRM, tələbə, ödəniş və tapşırıq oxuma icazələrinin ALL əhatəsini yoxlayır. Hesabat həmişə Bakı vaxtı ilə cari gün üçündür; dashboard-un maliyyə tarix filtrindən asılı deyil.

- Yeni lead: bu gün yaradılan müraciətlər. Əlaqə: həmin müraciətlərin CONTACTED, QUALIFIED, TRIAL_LESSON, TRIAL_CONSULTATION və ya REGISTERED mərhələsinə keçməsi. Cavabsız əlaqə qeydi olmayan yeni müraciətlərdir; zəng provayderindən təsdiqlənmiş nəticə deyil.
- Görüşlər: CRM profilində “Konsultasiya / sınaq nəticələri” bölməsində qeydə alınan, görüş tarixi bu gün olan konsultasiya və sınaqlar. Baş tutdu və gəlmədi açıq şəkildə qeyd edilir; nəticəsiz və ləğv edilmiş görüşlər ayrılır. Köhnə nextFollowUpAt xatırlatmalarından nəticə təxmin edilmir.
- Satış: mövcud companySalesCountSql qaydası (qeydiyyat və uyğun ödənişli aktiv qayıdış). Ödəniş: paidAt bu gün olan tələbə ödənişlərinin decimal cəmi. Test tələbələri çıxarılır.
- Follow-up: bu gün tamamlanan lead_follow_up tapşırıqları; əlaqə tarixi bu gündən əvvəl olan açıq lead-lər; sabaha əlaqəsi planlanan açıq lead-lər. Bağlanmış/çevrilmiş və tarixsiz lead-lər gecikmiş sayılmır.
- Donduran/dayandıran: effectiveAt bu gün olan faktiki status keçidləri, hər kateqoriyada fərqli tələbə sayı. Test tələbələri çıxarılır.

## Görüş saxlama müqaviləsi

Mövcud erp.tasks cədvəli istifadə edilir; yeni miqrasiya tələb olunmur. type=lead_appointment, entityType=lead, entityId=lead.id. description görüş növüdür (CONSULTATION/TRIAL), completionNote nəticədir (SCHEDULED/ATTENDED/NO_SHOW/CANCELLED). dueAt seçilmiş Bakı gününün günortasıdır. OPEN planlanmış, DONE nəticəsi qeyd edilmiş, CANCELLED ləğv edilmiş görüşdür.

Unikal idempotencyKey lead ID + tarix + növdən ibarətdir. Hər lead üçün gündə hər növdən bir görüş saxlanır. Eyni açarla təkrar göndəriş və nəticə düzəlişi mövcud qeydi yeniləyir. Tarix/növ dəyişdikdə başqa görüş yaranır; yanlış əvvəlki qeyd ləğv edilməlidir. Gələcək tarixə baş tutdu/gəlmədi yazmaq qadağandır.

Server mövcud CRM redaktə və qeyd əhatəsi yoxlamasını tətbiq edir, lead sətrini tranzaksiyada kilidləyir və nəticə dəyişikliklərini auditə yazır. Görüşlər ümumi tapşırıq iş sahəsindən çıxarılır. CRM interfeysində son 30 görüş göstərilir. Dashboard sayları SQL aqreqatlarıdır və 30 qeyd limiti ilə məhdudlaşmır.
