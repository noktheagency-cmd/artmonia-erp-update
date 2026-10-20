# BK-01…BK-25 — təsdiqlənmiş biznes qaydaları

Mənbə: `Artmonia-ERP-Biznes-Mentiqi-2026-10-18.pdf` v1.0 (18 oktyabr 2026).  
Bu extract repo-da offline istinad üçündür; PDF ilə ziddiyyət olarsa PDF üstünlük təşkil edir.

## Qaydalar

| Kod | Qayda |
|-----|--------|
| **BK-01** | Tələbə kartının yaradılması satış və aktivləşmə deyil. |
| **BK-02** | Uyğun satış üçün müqavilə təsdiqi və cari qəbul üçün bir ödənişdə minimum 20 AZN lazımdır. |
| **BK-03** | Bir qəbul dövrü bir satış yaradır; avans və qalıq təkrar satış deyil. |
| **BK-04** | Ödəniş etməyən müraciət/tələbə satış sayılmır. |
| **BK-05** | İlk aylıq dərsə qədər ilk dövrün tam haqqı qəbul edilməli və sistemdə qeydə alınmalıdır. |
| **BK-06** | Tam ödənişdən sonra ilk faktiki aylıq dərs iştirakı avtomatik aktivləşdirir. |
| **BK-07** | Aylıq hesablaşma həmin ilk faktiki dərsdən başlayır. Plan və ödəniş tarixi onu əvəz etmir. |
| **BK-08** | Planlaşdırılmış ilk dərs baş tutmayıbsa dövr başlamır; yeni plan üçün xəbərdarlıq yaranır. |
| **BK-09** | Dövr başladıqdan sonra tələbənin buraxdığı dərs batmış sayılır; əvəz və tarix sürüşməsi yaratmır. |
| **BK-10** | Dondurma yalnız yeri saxlayır; aylıq haqq tam davam edir və ödəniş günü dəyişmir. |
| **BK-11** | Dondurma və dayandırma yalnız menecerin manual əməliyyatıdır; 14 günlük avtomatik dayandırma yoxdur. |
| **BK-12** | Dayandırma yeri azad edir; əvvəlki borc və tarixçə saxlanılır. |
| **BK-13** | Dondurmadan qayıdış yeni satış deyil. STOPPED tələbənin uyğun təkrar qəbulu satış və KPI-a daxildir. |
| **BK-14** | Aylıq davam ödənişi və paket yüksəltmə yeni qəbul satışı deyil. |
| **BK-15** | İlk ay tamamlanmadan paket yüksəltmə yoxdur; ikinci dövrə keçiddə mümkündür. |
| **BK-16** | Konsultasiya və sınaq əsas hesabatda birləşdirilmiş görüş axınıdır. |
| **BK-17** | Görüş paket almaq üçün məcburi deyil; görüşsüz birbaşa qəbul mümkündür. |
| **BK-18** | Görüşdə iştirak etmiş şəxs qeydiyyata çevrilərkən əvvəl iştirak faktı təsdiqlənir. |
| **BK-19** | Zəng cəhdi, telefonu açma, real danışıq və WhatsApp cavabı fərqli faktlardır. |
| **BK-20** | Aylıq satış satış tarixinə, müraciət qrupu isə ilkin müraciət tarixinə görə qurulur. |
| **BK-21** | Panel, KPI və satış detalları eyni uyğun satış mənbəyindən hesablanır. |
| **BK-22** | Müraciət mərhələləri kartı bütün dövrü göstərir; kliklə açılan siyahı eyni əhatədədir. |
| **BK-23** | Kartın sayı ilə filtrli detallar uyğun gəlməlidir. |
| **BK-24** | Əsas ekran sadədir; hesablama və audit detalları Ətraflıda açılır. |
| **BK-25** | Köhnə fərdi istisnalar ümumi qaydanın tətbiqində təsdiqsiz toplu dəyişdirilmir. |

## Açıq sərhədlər (AQ — owner qərarı)

| Kod | Məsələ | Hazırkı sərhəd |
|-----|--------|----------------|
| AQ-01 | İlk dərs 29/30/31 → qısa ay | Gün sürüşməsi ayrıca seçilməlidir |
| AQ-02 | Manual stop dövr ortası maliyyə | Əvvəlki borc qalır; prorata açıq |
| AQ-03 | Paket endirmə / dövr ortası keçid | İlk ay yüksəltmə qadağası təsdiqli; qalanı genişlənməyib |
| AQ-04 | Müəssisə/müəllim səbəbli kompensasiya | Avtomatik gün dəyişməsi yoxdur |
| AQ-05 | Refund / KPI reversal | Dondurmada əvvəlki pul qaytarılmır |
| AQ-06 | Birdəfəlik xidmətin KPI yeri | Aylıq borc yaratmır; avtomatik qəbul satışı deyil |
| AQ-07 | Köhnə data / geri tarixli import | Sübutsuz bulk backfill yoxdur |

## Kod xəritəsi

Bax: `docs/business-workflow-decisions.md`, `docs/owner-acceptance-checklist.md`, `npm run test:acceptance`.
