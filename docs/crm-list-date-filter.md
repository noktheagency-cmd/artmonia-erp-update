# CRM müraciət siyahısının tarix filtri

Müraciət Siyahısı bölməsində ayrıca tarix sətri var. İlkin seçim cari Bakı ayının ilk və son günüdür. “Yaradılma tarixi” müraciətin əlavə olunduğu tarixə, “Növbəti addım / görüş tarixi” isə cari planın `leads.next_follow_up_at` tarixinə görə süzür. Görüş planlaşdırma əməliyyatı həmin sahəni görüşün tarixi ilə sinxronlaşdırır; zəng və digər izləmə planları da bu tarix filtrinə daxildir. Bitmiş/ləğv edilmiş görüş tarixçəsi bu filtrin mənbəyi deyil.

“Növbəti həftə” gələn bazar ertəsindən bazar gününədək, “Gələn ay” gələn ayın bütün günlərini seçir və plan tarixini tətbiq edir. İstənilən həftə və ay üçün başlanğıc/bitmə tarixlərini ayrıca seçmək olar. “Bütün tarixlər” cədvəlin tarix məhdudiyyətini götürür; digər status, məsul və axtarış filtrləri saxlanır. Aktiv sürətli seçim fərqlənir. Tarix sahələri və tətbiq düyməsi eyni ölçüdədir, dar ekranda sahələr uyğun sıralanır.

URL parametrləri: `listDateBy=created|planned`, `listFrom=YYYY-MM-DD`, `listTo=YYYY-MM-DD`. Yenilənmə, profil əməliyyatından geri dönüş və filtrli ixrac seçimi bu parametrləri saxlayır. Sorğunun cache açarında tarix növü və aralığı ayrıca iştirak edir. Başlanğıc daxil, bitmədən sonrakı Bakı gecə yarısı xaricdir. Yanlış tarix və tərs aralıq bütün siyahını açmır: nəticə boş və səhv mesajı görünür.

“Müraciət siyahısı” başlığının altındakı say cədvəlin tarix, status, axtarış və digər aktiv filtrlərinə uyğun serverdə hesablanan `listTotalCount` nəticəsidir. Bu say yalnız açıq səhifədəki sətirləri deyil, bütün uyğun nəticələri əhatə edir; siyahı tabındakı və aktiv filtr sətrindəki sayla eynidir.

Açıq tətbiq edilmiş tarix aralığı ciddi filtrdir: kritik prioritet və konsultasiya/sınaq statusu aralıqdan kənar müraciəti nəticəyə əlavə etmir. Bu halda müraciətin yaradılma dövrü ilə plan dövrü kəsişdirilmir. İlkin siyahının əvvəlki cari dövr + bugünkü + açıq kritik qaydası və bütün dövrü göstərən mərhələ kartları saxlanır; mərhələ kartına keçid ayrıca siyahı tarixini təmizləyir. Bu filtr Bu gün/Sabah kartlarını və satış analitikasının dövrünü dəyişmir.

## İstifadəçi yoxlaması

1. CRM → Müraciət Siyahısı → “Gələn ay”: əvvəlki aylarda yaradılmış, gələn aya görüş/izləmə planı olan müraciət görünməlidir.
2. “Növbəti həftə”: başlanğıc bazar ertəsi, bitmə bazar günü olmalıdır. Aylararası həftə də tam göstərilməlidir.
3. “Tarix növü”nü və sərbəst aralığı dəyişib “Tətbiq et” seçin; axtarış/status/məsul filtri və səhifə yeniləməsi aralığı saxlamalıdır.
4. “Bütün tarixlər”dən sonra tarix xaricindəki filtrlər qalmalıdır; profil modalı həmin müraciətin planını göstərməlidir.
5. “Bu ay” və “Konsultasiya/Sınaq” statusunu birlikdə seçin: cədvəlin başlığındakı say siyahı tabındakı və aktiv filtr sətrindəki sayla eyni olmalıdır. Nəticəsiz axtarışda say `0` olmalıdır.

Avtomatik sərhəd və SQL testləri: `src/modules/crm/list-date-filter.test.ts`. Browser qəbul yoxlaması istifadəçi tərəfindən aparılır.
