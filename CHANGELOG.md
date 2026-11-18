# Eclipse Esports — Versiya Yangiliklari (Changelog)

Barcha yangilanishlar, yangi funksiyalar, arxitektura o'zgarishlari va tuzatishlar xronologik tartibda quyida keltirilgan. Tizim [Semantic Versioning](https://semver.org/) (SemVer) standartiga amal qiladi.

---

## [v2.42.0] — 2026-11-18

- OCR ekran mosligi, roster aliaslari, guest ajratish va noaniq hero uchun qo‘lda tekshirish kuchaytirildi. PNG dekodlash yoki ikki rasm birlashishi 100% aniqlik kafolati emas.
- Saqlash, backup/restore va parallel yozishlar tekshirildi. Hajm oshsa yozish aniq xato bilan to‘xtaydi; rasmiy match tarixi limitga moslash uchun kesilmaydi. Qoralamalar, backup va yuborilmagan o‘zgarishlar joy ochish uchun o‘chirilmaydi.
- Telegram webhook va kapitan amallari uchun kirish nazorati, analytics review holatlari va noma’lum qiymatlar tuzatildi.
- Lord/Turtle kiritish va OCR talabi olib tashlandi; eski saqlangan qiymatlar saqlanadi.
- Frontendda tartibli deferred yuklash, qayta urinish, kutish chegaralari, qidiruv va CSP bilan mos tugmalar tekshirildi. Brauzer tezligi o‘lchanmagan.
- Bot bo‘sh roster/hero poolni uydirma namuna bilan to‘ldirmaydi. Comfort, Backup va Learning toifalari web va botda saqlangan ma’noda ko‘rsatiladi. Noma’lum natija mag‘lubiyat deb sanalmaydi.
- Lokal reliz tekshiruvi: 614/614 test va 90 manba fayli syntax tekshiruvi o‘tdi. 284 match, 7 o‘yinchi va ularning barcha maydonlari backup/import/restore tekshiruvlarida saqlandi.
- Batafsil dalillar va cheklovlar: [AUDIT-PROGRESS.md](AUDIT-PROGRESS.md). Quyidagi tarixiy reliz qaydlari joriy xatti-harakat uchun kafolat emas; auditdagi tuzatishlar ustuvor.

---

## [v2.41.0] — 2026-11-15

- **Turso adapteri (`lib/turso-store.js`):** Mantiqiy JSON hujjatlar SQLite’da revision nazorati bilan saqlanadi. Turso sozlanganda u tanlanadi; Redis alternativ backend, avtomatik parallel backup emas.
- **Submission retention:** Tasdiqlash vaqtida eng ko‘pi bilan 50 ta approved submission hujjati saqlanadi. Redis adapteri hajm bosimida yopilgan submissionlarni ham qisqartirishi mumkin. Bu rasmiy matchlarni o‘chirmaydi va barcha hajm chegaralarini bekor qilmaydi.
- **Ikki skrinshot va PNG:** Scoreboard/Data birlashtirish va `node:zlib` asosidagi PNG dekoderi qo‘shildi. Ekranlar mosligi va o‘qilgan qiymatlarni tekshirish zarur; noaniq portret qo‘lda tanlanadi.
- **Production bundle (`scripts/build.mjs`):** Asosiy classic JS fayllari birlashtiriladi, CSS ixchamlanadi. Modullar, shriftlar va boshqa aktivlar alohida qoladi. “38 so‘rovdan 2 taga” yoki “3–4x tezlashdi” degan avvalgi da’volar o‘lchov bilan tasdiqlanmagan.
- **Telegram callback:** `finally` yo‘li orqali callback javobi yuborishga urinish va foydalanuvchi bo‘yicha limitlar qo‘shildi. Tarmoqdagi yetkazilish kafolatlanmaydi.

---

## [v2.38.0] — 2026-11-13

> **Asosiy yo‘nalish:** Real Trio Matching, Matematik Yaxlitlik Muhri va Telegram Albom Integratsiyasi.

- **Real Trio Matching va Asl Ismlar:**
  - 3 kishilik (Trio) o‘yinlarda tasodifiy 2 ta begona o‘yinchi (`guest`) jamoa statistikasidan avtomatik ajratilib chiqarildi.
  - O‘yinchilarning klan teglari (`FS `, `Uchx `, `◆`, `亗`) tozalangan holda ularning doimiy haqiqiy ismlari (Husniddin, Sanjar, Shohruh, Otabek, Nabixo'ja, Ulug'bek) bilan bog‘landi.
- **Matematik Yaxlitlik Muhri:**
  - Skrinshotdagi umumiy jamoaviy killar soni o‘yinchilar killari yig‘indisiga (`sum(kills) == teamKills`) tengligi tekshiriladigan qat’iy algoritm qo‘shildi.
- **Telegram MediaGroup (Albom):**
  - Ketma-ket yuborilgan skrinshotlar bitta albomga birlashtirilib, bot orqali kapitan tasdig‘iga yuborish yo‘lga qo‘yildi.

---

## [v2.37.0] — 2026-11-11

> **Asosiy yo‘nalish:** Birlashgan Match Hub, Canvas WebP Rasm Siqish va CSS Konsolidatsiyasi.

- **Birlashgan Match Hub:**
  - AI OCR skaner, multi-match batch upload va qo‘lda kiritish yagona markazga birlashtirildi.
  - Fayllarni tashlash (drag & drop) o‘lchamiga qarab yakka yoki ommaviy yuklashga avtomatik taqsimlash.
- **Mijoz Tomonida Rasm Siqish (Canvas WebP):**
  - Brauzerning o‘zidayoq skrinshotlar 90–95% gacha siqilib, serverga 5–8 MB o‘rniga ~300 KB hajmda yuborilishi ta’minlandi. Vercel 413 hajmiy xatoliklari to‘liq bartaraf etildi.
- **CSS Konsolidatsiyasi:**
  - Barcha tarqoq CSS fayllari (`v221.css`, `v225.css`, `v227.css`) asosiy `css/style.css` ga birlashtirildi.
  - Mobil ekranlar uchun gorizontal skrollsiz ixcham kartochkalar dizayni yaratildi.
