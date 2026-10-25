# Follow-up qeydiyyatında təhsil pilləsi

Qeydiyyat modalı təhsil səviyyələrini `STUDENT_EDUCATION_LEVEL` kataloqunun aktiv qeydlərindən alır. Eyni kataloq müraciət və tələbə redaktəsində işlədilir. `listRegistrationPackageOptions` üçün mövcud `crm.lead.convert` yoxlaması saxlanır; kataloqda yeni seçim yaratmaq mövcud `settings.manage` icazəsinə tabedir.

Əvvəlki modal sabit `Orta təhsil`, `Bakalavr` və s. siyahısını göstərirdi. 25.10.2026 yoxlamasında bu sabit seçimlərin hamısı bazada deaktiv idi, aktiv seçimlər isə `Orta təhsil alır`, `Universitetdə təhsil alır`, `Uşaqdır, hələ məktəbə gedmir` və s. idi. Buna görə seçim siyahısı backend yoxlamasına uyğun gəlmirdi.

Axtarışlı FormSelect saxlanmış dəyərin kataloqda hələ yüklənməməsini boş seçim kimi göndərmir. İstifadəçi açıq şəkildə boş seçim edərsə boş qalır. Deaktiv/mövcud olmayan təhsil səviyyəsini backend yenə qəbul etmir; bu düzəliş yoxlamanı keçmir və kataloq qeydlərini aktivləşdirmir. Qeydiyyatın mövcud transaction-u təsdiqlənmiş dəyəri həm tələbəyə, həm müraciətə yazır.

## İstifadəçi yoxlaması

1. `/crm` → müraciət → **Qeydiyyata al** → **Təhsil səviyyəsi**: aktiv kataloq seçimləri və axtarış görünməlidir. İcazəli hesabda yeni seçim əlavə etmək də mümkündür.
2. Təhsil pilləsi artıq seçilmiş müraciətdə dropdown-u açmadan qeydiyyatı tamamlayın: tələbə profilində həmin dəyər qalmalıdır.
3. Başqa pillə seçib qeydiyyatı tamamlayın: yeni dəyər saxlanmalıdır. Açıq şəkildə boş seçim edildikdə əvvəlki dəyər geri qaytarılmamalıdır.

SSR/form göndərişi regressiya yoxlaması: `src/components/ui/select-value.test.ts`. Brauzer qəbul yoxlaması istifadəçi tərəfindən aparılır; diaqnostika zamanı canlı qeydiyyat və ya ödəniş yaradılmır.
