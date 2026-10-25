# HR bonus görünüşü və RBAC

`/hr` səhifəsi bonus məlumatını `getHrBonusData` server sorğusundan Server Component payload-u ilə alır. Bonus oxuması üçün ayrıca açıq REST endpoint yoxdur. RBAC filtri brauzerdə gizlətmə ilə deyil, kampaniya, iştirakçı, etap bonusu və şəxsi göstəricinin backend sorğularında tətbiq olunur.

- `hr.bonus.read=ASSIGNED`: əməkdaşın özü üçün uyğun (`isEligible`) iştirakçı qeydi olan kampaniyalar görünür. Eyni departamentə aid olmaq kifayət etmir. Başqa işçinin iştirakçı və bonus qeydləri payload-a daxil edilmir. HR əməkdaş profili ilə bağlanmamış hesab üçün nəticə boşdur.
- `hr.bonus.read=ALL` və ya kampaniya idarəçisi: bütün uyğun kampaniyalar və komanda nəticələri görünür. İdarə/təsdiq/maliyyəyə göndərmə icazələri dəyişdirilməyib.
- Şəxsi satış göstəricisi kampaniya tarixləri daxilində `course_sales.owner_id = hr_employees.user_id` ilə hesablanır. Test tələbələri, ləğv edilmiş satışlar və gələcək faktiki satış tarixləri çıxarılır. Kampaniyanın son günü daxil edilir. Şəxsi nəticə tapılmayanda komanda cəmi əvəz kimi götürülmür.
- Şəxsi satış görünüşündə “Şəxsi nəticə” yazılır. Kampaniyaya ümumi manual düzəliş fərdi satış sayına əlavə edilmir. İdarəçinin komanda cəmi və manual düzəlişi saxlanır. Qeyri-satış kampaniyalarının hesablama qaydası dəyişdirilməyib.
- ASSIGNED görünüşünün keçmiş etap nəticəsi yalnız həmin əməkdaşın ləğv edilməmiş bonus qeydinə əsaslanır. Başqa iştirakçının açdığı etapın ümumi sayı şəxsi nəticə kimi qaytarılmır. Bonusun hesablanması, təsdiqi, maliyyəyə göndərilməsi və saxlanmış maliyyə tarixçəsi dəyişdirilmir.

## 25.10.2026 diaqnostikası

Canlı DB-də şəkildəki sentyabr kampaniyasının yalnız bir uyğun iştirakçısı var. Digər satış menecerlərində də görünməsi departamentə görə açılan əvvəlki filtrin nəticəsidir. Satış rolunun bonus oxu icazəsi `ASSIGNED`-dir.

`33` keçmiş etapların `reached_value` sahəsində saxlanıb. Sentyabr üzrə tələbə qeydiyyatlarının sayı Ayşəndə 33, Ləmanda 3-dür; bunlar avtomatik təsdiqli ödənişli satış sayı sayılmır. Yoxlanmış DB-də `course_sales` jurnalı boşdur və kampaniyalarda manual düzəliş yoxdur. Bu səbəbdən cari kodun canonical jurnal hesabı sıfırdır; keçmiş etap/bonus göstəricisi cari satış sayı ilə eyni mənbə deyil. Tarixi satışları jurnala keçirmək üçün ayrıca mənbə/uyğunluq yoxlaması və review edilmiş backfill lazımdır. Bu düzəliş zamanı DB-də kampaniya, satış, bonus və ödəniş qeydləri dəyişdirilməyib.

## İstifadəçi yoxlaması

1. İki fərqli menecer hesabı ilə HR → Bonus bölməsini açın: hər hesab yalnız özünə təyin edilmiş kampaniyaları görməlidir. Kampaniyası olmayan hesabda boş vəziyyət görünməlidir.
2. Ortalıq test kampaniyasının iki iştirakçısının fərqli satışları varsa, onların şəxsi nəticələri fərqli olmalıdır; heç bir şəxsi satış yoxdursa sıfır göstərilməlidir.
3. ALL səlahiyyətli hesabda komanda nəticəsini yoxlayın. Şəxsi və komanda görünüşləri düzgün adlandırılmalıdır.

Avtomatik testlər `src/modules/hr/bonus-access.test.ts` faylındadır. Browser/API qəbul yoxlaması istifadəçi tərəfindən aparılır.
