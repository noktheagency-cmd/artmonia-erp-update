# CRM müraciət siyahısının tarix filtri

Müraciət Siyahısı bölməsində ayrıca tarix sətri var. İlkin seçim cari Bakı ayının ilk və son günüdür. “Yaradılma tarixi” müraciətin əlavə olunduğu tarixə, “Növbəti addım / görüş tarixi” isə cari planın `leads.next_follow_up_at` tarixinə görə süzür. Görüş planlaşdırma əməliyyatı həmin sahəni görüşün tarixi ilə sinxronlaşdırır; zəng və digər izləmə planları da bu tarix filtrinə daxildir. Bitmiş/ləğv edilmiş görüş tarixçəsi bu filtrin mənbəyi deyil.

“Növbəti həftənin planları” gələn bazar ertəsindən bazar gününədək, “Gələn ayın planları” gələn ayın bütün günlərini seçir və plan tarixini tətbiq edir. İstənilən həftə və ay üçün başlanğıc/bitmə tarixlərini ayrıca seçmək olar. “Bütün tarixlər” cədvəlin tarix məhdudiyyətini götürür; digər status, məsul və axtarış filtrləri saxlanır.

URL parametrləri: `listDateBy=created|planned`, `listFrom=YYYY-MM-DD`, `listTo=YYYY-MM-DD`. Yenilənmə, profil əməliyyatından geri dönüş və filtrli ixrac seçimi bu parametrləri saxlayır. Sorğunun cache açarında tarix növü və aralığı ayrıca iştirak edir. Başlanğıc daxil, bitmədən sonrakı Bakı gecə yarısı xaricdir. Yanlış tarix və tərs aralıq bütün siyahını açmır: nəticə boş və səhv mesajı görünür.

Açıq tətbiq edilmiş tarix aralığı ciddi filtrdir: kritik prioritet və konsultasiya/sınaq statusu aralıqdan kənar müraciəti nəticəyə əlavə etmir. Bu halda müraciətin yaradılma dövrü ilə plan dövrü kəsişdirilmir. İlkin siyahının əvvəlki cari dövr + bugünkü + açıq kritik qaydası və bütün dövrü göstərən mərhələ kartları saxlanır; mərhələ kartına keçid ayrıca siyahı tarixini təmizləyir. Bu filtr Bu gün/Sabah kartlarını və satış analitikasının dövrünü dəyişmir.

## İstifadəçi yoxlaması

1. CRM → Müraciət Siyahısı → “Gələn ayın planları”: əvvəlki aylarda yaradılmış, gələn aya görüş/izləmə planı olan müraciət görünməlidir.
2. “Növbəti həftənin planları”: başlanğıc bazar ertəsi, bitmə bazar günü olmalıdır. Aylararası həftə də tam göstərilməlidir.
3. “Tarix növü”nü və sərbəst aralığı dəyişib “Tətbiq et” seçin; axtarış/status/məsul filtri və səhifə yeniləməsi aralığı saxlamalıdır.
4. “Bütün tarixlər”dən sonra tarix xaricindəki filtrlər qalmalıdır; profil modalı həmin müraciətin planını göstərməlidir.

Avtomatik sərhəd və SQL testləri: `src/modules/crm/list-date-filter.test.ts`. Browser qəbul yoxlaması istifadəçi tərəfindən aparılır.
