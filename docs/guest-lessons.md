# Qonaq dərs — cari müqavilə, 26.10.2026

Qonaq dərs aylıq paket deyil: şəxs seçdiyi tarix və saatda bir dəfə iştirak edir və həmin gəlişi ödəyir. Eyni şəxs aylar sonra təkrar gələ bilər; aradakı aylara borc yazılmır.

## Qeydiyyat və cədvəl

Birbaşa yeni tələbə yaradılarkən CRM müraciəti və təhsil səviyyəsi istəyə bağlıdır. Seçilməmiş form sahələri (`__empty__` daxil olmaqla) serverdə boş dəyərə çevrilir; müraciət seçilməyibsə `student.create`, seçilibsə `crm.lead.convert` icazəsi yoxlanılır. Düzgün olmayan, boş olmayan müraciət ID-si rədd edilir.

1. Yeni tələbə və ya Follow-up → Qeydiyyata al modalında **Birdəfəlik ödənişli — qonaq dərs** işarələnir. Konsultasiya/sınaq görüşünün iştirak təsdiqi tələb olunursa, CRM modalının əvvəlində təsdiq bloku və həmin görüşün Bakı vaxtı ilə tarix/saatı göstərilir.
2. Şəxsi məlumat, proqram, müəllim, konkret tarix/saat, müddət, otaq və dərs haqqı daxil edilir. Aylıq paket və satış yaradılmır. CRM müraciəti profilə bağlanır; satış mərhələsinə avtomatik keçirilməz.
3. `/students/single-lessons` yalnız axtarış, davamiyyət filtri və cədvəldən ibarətdir. Status seçimi dərhal, axtarış 300 ms fasilədən sonra avtomatik tətbiq olunur; səhifələmə sıfırlanır, seçilmiş tələbə filtri saxlanır. Tələbəyə klik etdikdə davamiyyət, ödəniş və **Yeni gəliş təyin et** açılır. Bu səhifədə yeni tələbə yaratmaq yoxdur.
4. Slot planlayıcısında **Qonaq dərslərin vaxtları** yaxın 31 gün üçün dəqiq tarixli gəlişləri göstərir. Təqvimdə də “Qonaq dərs” adı ilə görünür. Həftəlik təkrarlanan paket yeri yaradılmır.

## Maliyyə və saylar

- Qonaq profilində `SLOT_WAITING`, dayandırılmış aylıq billing və qonaq badge-i olur; enrollment yoxdursa aktiv tələbə sayına daxil deyil. Mövcud aylıq tələbənin əlavə qonaq dərsi onun aylıq paketini dəyişmir.
- Ödəniş `ONE_OFF` / `ONE_TIME` kimi yalnız dərsin öz fakturasına ayrılır. Ümumi satış, gəlir, aylıq yığım, CLV, aktiv tələbə, marketinq və bonus göstəricilərinə əlavə edilmir. Maliyyə jurnalında **Qonaq dərs** kimi, ayrıca qonaq məbləğində göstərilir.
- Müəllim payı yalnız **ödəniş + iştirak** tamamlandıqda yaranır. Faizli müəllimdə uyğun müqavilə faizi; sabit maaşda əsas maaşa əlavə **35%**. Təkrar əməliyyat payı iki dəfə yaratmır; təsdiqlənmiş payout və manual düzəlişlər qorunur.
- Əvvəlcədən ödəniş mümkündür. Ödənişli dərsin ləğvi avtomatik geri ödəmə yaratmır. Gələcək dərsə iştirak yazılmır; eyni tələbənin üst-üstə düşən gəlişləri bloklanır.
- Mövcud server icazələri və ASSIGNED/ALL scope-ları bütün oxuma/yazma yollarında saxlanılır.

## Görünən demo qeydləri

İstifadəçinin ayrıca istəyi ilə yalnız `xgxlwbqaojbptrgosxtj` Vercel bazasında saxlanılıb. Adlar uydurmadır, real telefon və e-poçt istifadə edilməyib. Faktiki pul qəbulu deyil.

| Kod | Uydurma ad | Dərs | Test ödənişi |
| --- | --- | --- | --- |
| GUEST-DEMO-01 | Mina Həsənli | 26.10.2026 12:00, Gəldi | 25 AZN |
| GUEST-DEMO-02 | Rauf Quliyev | 27.10.2026 15:00, Planlaşdırılıb | 30 AZN |
| GUEST-DEMO-03 | Leyla İsmayılova | 28.10.2026 17:00, Planlaşdırılıb | 20 AZN |
| GUEST-DEMO-01 | Mina Həsənli | 01.12.2026 16:00, Planlaşdırılıb | 25 AZN |

Hər gəlişdə mövcud aktiv müəllim və uyğun proqram var. Profil `isTestData=true`, qeydi `[guest-lesson-demo]` ilə işarələnib. Yalnız qonaq jurnalı, onun ödəniş jurnalı və dərs vaxtları bu işarəli demoları “Test” nişanı ilə göstərir. Ümumi tələbə siyahısı və göstəricilər test profillərini çıxarır. Davamiyyət/ödəniş test profilində real müəllimin payout-unu yenidən hesablamır.

Yaratma skripti: `node --import tsx scripts/seed-guest-lesson-demo.ts`. Standart rejim rollback edir; `--apply` saxlayır. Hədəfi yoxlayır, transaction və sabit ID-lər istifadə edir, mövcud demoları dəyişmir. Operator ayrı passiv texniki qeyddir: giriş hesabı və rolu yoxdur. Audit insanın adından əməliyyat göstərmir.

## Yoxlama

- `GUEST-DEMO` ilə qonaq jurnalında axtarın: 3 ad, 4 ödənilmiş dərs görünməlidir. Mina üzərindən yeni gəliş pəncərəsini açın.
- Slot səhifəsində 27–28 oktyabr gəlişlərini, təqvimdə tarixləri və **Qonaq dərs · Test** nişanını yoxlayın. Dekabr gəlişi oktyabrın 31 günlük slot siyahısında görünmür; həmin tarix üçün təqvimdə görünür.
- Maliyyə jurnalında oktyabr tarixi ilə test qəbzləri işarələnir. Demo cəmi 100 AZN-dir, real gəlir və qonaq gəliri KPI-sına daxil deyil. Yeni dərs əlavə etmək üçün yenə həmin test profilini istifadə edin.
- Kod və DB dəyişiklikləri ayrı statuslardır. Bu işdə demo DB yazısı yoxlanıb; kod üçün ayrıca deploy icra edilməyib.
