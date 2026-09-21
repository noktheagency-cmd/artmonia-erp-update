# Mobil yeniliklərin website mənbəyinə keçidi

21 sentyabr 2026: istifadəçi mobil tərəfdə keçidin hazır olduğunu təsdiqlədi.

- Yeniliklərin mənbəyi `artmonia-website` Supabase layihəsində
  `public.site_sections`, `key = news_items`, `is_published = true` filtridir.
- Mobil inteqrasiyanı mobile developer idarə edir; ERP bu mənbəni sinxronlaşdırmır.
- ERP `/groups` səhifəsində köhnə “Mobil akademiya elanları” paneli və ona aid
  məlumat sorğusu çıxarılıb. Yeni xəbərlər website adminindən idarə olunur.
- Mövcud `academy_announcements` məlumatları silinməyib. Akademik bildirişlər,
  push və geriyə uyğun mövcud API cavabları dəyişdirilməyib. Mobil yeniliklər
  üçün köhnə ERP elanlarına fallback edilməməlidir.
- Mobil və website canlı E2E nəticəsi bu ERP dəyişiklikləri ilə ayrıca
  yoxlanılmayıb; mobil hazırlıq istifadəçinin təsdiqinə əsaslanır.
