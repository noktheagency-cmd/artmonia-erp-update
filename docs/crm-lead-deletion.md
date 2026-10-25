# CRM müraciətinin silinməsi

Müraciətin sadəcə açıq və ya yenidən planlaşdırılarkən ləğv edilmiş izləmə planının olması silinməyə mane olmur. Bu planlar faktiki əlaqə və ya tamamlanmış əməliyyat deyil. Müraciət `crm.lead.delete` icazəsi və həmin icazənin ALL/ASSIGNED əhatəsi daxilində, 1–500 simvolluq səbəblə silinə bilər. Redaktə icazəsi ayrıca silinmə icazəsini əvəz etmir.

Server lead sətrini kilidləyir, faktları yoxlayır, müraciət + planlar + mərhələ tarixçəsi + köhnə tapşırıqların surətini və səbəbi yeni `lead.delete` audit qeydinə yazır. Açıq/ləğv edilmiş tamamlanmamış planlar və tamamlanmamış köhnə tapşırıqlar təmizləndikdən sonra müraciət silinir. Bunlar bir tranzaksiyadadır; audit yazısı və ya silinmə uğursuz olsa, dəyişikliklər geri qaytarılır. Plan bu arada tamamlanıbsa, silinmə dayandırılır. Mövcud audit qeydləri dəyişdirilmir.

Faktiki əlaqə hadisəsi, görüş qeydi, tamamlanmış izləmə işi/tapşırıq, tələbəyə çevrilmə və ya satış olan müraciətlər üçün silinmə qadağası saxlanır. Belə müraciətləri səbəb yazaraq “İtirilib” statusuna keçirmək lazımdır. Oxu və audit yükü məhduddur: ümumi tarixçə 500 sətrdən böyükdürsə silinmə dayandırılır.

Əlaqə şəxsi yalnız başqa müraciət, tələbə, müəllim, tələbə əlaqəsi və faktiki əlaqə tarixçəsi tərəfindən istifadə olunmursa təmizlənir. Silinmə əməliyyatı bağlı tələbə, ödəniş və satış qeydlərini silmir. Sxem və foreign key qaydaları dəyişdirilməyib.

## Yoxlama

Yalnız test məqsədilə yaradılmış müraciətdə izləmə tarixini dəyişin, sonra səbəb yazaraq silin. Köhnə ləğv olunmuş və cari açıq plan silinməyə mane olmamalıdır. Təsdiqdən sonra müraciət siyahıda görünməməli, auditdə səbəb və planların surəti qalmalıdır. İcazəsiz və başqa menecerə aid ASSIGNED sorğusu rədd edilməlidir. Avtomatik sınaqlar `src/modules/crm/lead-deletion-service.test.ts` faylındadır.
