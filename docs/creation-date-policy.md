# Müraciət və tələbə yaradılmasında tarix sərhədi

Yeni müraciət, tələbə əlavə etmə və CRM müraciətindən tələbəyə çevirmə zamanı Bakı təqviminin cari ayından əvvəlki aylara məlumat yazmaq olmaz. Cari ayın bu gündən əvvəlki günlərini seçmək olar; qeydiyyat, ilk dərs və növbəti addım gələcək aya da planlaşdırıla bilər.

- Yeni müraciətdə növbəti addım tarixi yoxlanılır. Müraciətin yaradılma vaxtı server tərəfindən yazılır.
- Tələbə əlavə ediləndə qeydiyyat və manual ilk dərs tarixi yoxlanılır. CRM çevirməsində qeydiyyat tarixi avtomatik bu gündür, ilk dərs tarixi yoxlanılır.
- İlkin ödənişin faktiki tarixi və aid olduğu ay da əvvəlki aya düşə bilməz. Faktiki ödənişin gələcək tarixə yazılmasını qadağan edən mövcud qayda qüvvədədir. Xidmət ayı cari və ya gələcək ay ola bilər; fərqli ay üçün mövcud təsdiq qaydası saxlanır.
- Yaratma formalarının təqvimləri minimum ayı, ay/il siyahısını və geri keçid düymələrini məhdudlaşdırır. Server eyni qaydanı ayrıca yoxlayır; açıq qalmış forma yeni ayda göndərilsə, köhnə ay rədd edilir.
- Tələbə yaratma sorğusunun artıq uğurla tamamlanmış idempotent təkrarı yeni qeyd yaratmır və yeni ay sərhədi ilə təkrar yoxlanmır.

Bu sərhəd mövcud qeydlərin redaktəsinə, keçmiş hesabatlara və mövcud tələbələrin davam ödənişlərinə tətbiq edilmir.

## İstifadəçi yoxlaması

1. CRM → Yeni müraciət → Növbəti addım tarixi: cari aydan əvvəlki aya və ilə keçmək mümkün olmamalıdır; cari və gələcək ay seçilməlidir.
2. Tələbələr → Yeni tələbə → Qeydiyyat tarixi və Manual ilk dərs: eyni sərhədi yoxlayın.
3. Hər iki tələbə yaratma yolunda ilkin ödəniş: faktiki tarix cari ayın ilk günündən bu günədək; aid olduğu ay cari və gələcək aylardan seçilməlidir.
4. CRM → Müraciət → Tələbəyə çevir: ilk dərs və ilkin ödəniş sahələrini də yoxlayın.

Avtomatik sərhəd testləri `src/modules/shared/creation-date-policy.test.ts` və `src/components/ui/calendar-range.test.ts` fayllarındadır. Bunlar browser acceptance yoxlamasını əvəz etmir.
