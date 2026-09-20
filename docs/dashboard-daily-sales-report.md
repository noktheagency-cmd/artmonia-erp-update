# Gün sonu satış hesabatı

Dashboard-un aşağı hissəsində İsmət və Vaqifin mövcud ERP hesabları üçün göstərilir. Server həm hesab ID-sini, həm də dashboard, CRM, tələbə, ödəniş və tapşırıq oxuma icazələrinin ALL əhatəsini yoxlayır. Kartın daxili filtrində yalnız Bakı vaxtı ilə bu gün, dünən və 2 gün əvvəl seçilir. İlkin seçim bu gündür; dashboard-un maliyyə tarix filtrindən asılı deyil. Hər sorğuda server tarix sərhədini yenidən yoxlayır; köhnə, gələcək və yanlış tarixlər rədd edilir. Bu, bu gün daxil olmaqla 3 təqvim günüdür, sürüşən 72 saat deyil.

- Yeni lead: seçilən gün yaradılan müraciətlər. Əlaqə: həmin günün sonunadək CONTACTED, QUALIFIED, TRIAL_LESSON, TRIAL_CONSULTATION və ya REGISTERED mərhələsinə keçməsi. Sonrakı günün cari mərhələsi əvvəlki günün əlaqəsi sayılmır; mərhələ tarixçəsi nəzərə alınır. Cavabsız əlaqə qeydi olmayan yeni müraciətlərdir; zəng provayderindən təsdiqlənmiş nəticə deyil.
- Görüşlər: CRM profilində “Konsultasiya / sınaq nəticələri” bölməsində qeydə alınan, görüş tarixi seçilən gün olan konsultasiya və sınaqların hazırkı nəticələri. Baş tutdu və gəlmədi açıq şəkildə qeyd edilir; nəticəsiz və ləğv edilmiş görüşlər ayrılır. Köhnə nextFollowUpAt xatırlatmalarından nəticə təxmin edilmir.
- Satış: mövcud companySalesCountSql qaydası (qeydiyyat və uyğun ödənişli aktiv qayıdış). Ödəniş: paidAt seçilən gün olan tələbə ödənişlərinin decimal cəmi. Test tələbələri çıxarılır.
- Follow-up: seçilən gün tamamlanan lead_follow_up tapşırıqları. Gecikmiş və növbəti günə plan göstəriciləri seçilən günün sonunadək yaradılmış, hazırda açıq lead-lərin cari nextFollowUpAt dəyərindən hesablanır. Bu sahənin tarixçəsi saxlanmadığı üçün həmin göstəricilər tarixi snapshot deyil; popup bunu bildirir. Bağlanmış/çevrilmiş və tarixsiz lead-lər gecikmiş sayılmır.
- Donduran/dayandıran: effectiveAt seçilən gün olan faktiki status keçidləri, hər kateqoriyada fərqli tələbə sayı. Test tələbələri çıxarılır.

Filtr dəyişdikdə yalnız kartın server sorğusu yenilənir. Yüklənərkən idarəetmə düymələri bloklanır; xəta olduqda əvvəlki tarix və rəqəmlər saxlanılır, xəta göstərilir. Popup seçilmiş günə uyğun məlumat verir.

## Görüş saxlama müqaviləsi

Mövcud erp.tasks cədvəli istifadə edilir; yeni miqrasiya tələb olunmur. type=lead_appointment, entityType=lead, entityId=lead.id. description görüş növüdür (CONSULTATION/TRIAL), completionNote nəticədir (SCHEDULED/ATTENDED/NO_SHOW/CANCELLED). dueAt seçilmiş Bakı gününün günortasıdır. OPEN planlanmış, DONE nəticəsi qeyd edilmiş, CANCELLED ləğv edilmiş görüşdür.

Unikal idempotencyKey lead ID + tarix + növdən ibarətdir. Hər lead üçün gündə hər növdən bir görüş saxlanır. Eyni açarla təkrar göndəriş və nəticə düzəlişi mövcud qeydi yeniləyir. Tarix/növ dəyişdikdə başqa görüş yaranır; yanlış əvvəlki qeyd ləğv edilməlidir. Gələcək tarixə baş tutdu/gəlmədi yazmaq qadağandır.

Server mövcud CRM redaktə və qeyd əhatəsi yoxlamasını tətbiq edir, lead sətrini tranzaksiyada kilidləyir və nəticə dəyişikliklərini auditə yazır. Görüşlər ümumi tapşırıq iş sahəsindən çıxarılır. CRM interfeysində son 30 görüş göstərilir. Dashboard sayları SQL aqreqatlarıdır və 30 qeyd limiti ilə məhdudlaşmır.
