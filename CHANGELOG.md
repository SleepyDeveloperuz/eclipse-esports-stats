# Eclipse Esports — Versiya Yangiliklari (Changelog)

Barcha yangilanishlar, yangi funksiyalar, arxitektura o'zgarishlari va tuzatishlar xronologik tartibda quyida keltirilgan. Tizim [Semantic Versioning](https://semver.org/) (SemVer) standartiga amal qiladi.

---

## [v2.41.0] — 2026-11-15 (Hozirgi reliz)

> **Asosiy yo‘nalish:** Turso Serverless SQLite bazasi, Dual-Screenshot Fusion tahlili, iOS/PNG Hero Matcher va Yagona Production Asset Bundling.

### 🗄️ Ma’lumotlar Bazasi va Xotira (Database & Storage)
- **Turso Serverless SQLite integratsiyasi (`lib/turso-database.js`):**
  - Redis 5.9 MB monolit JSON xotira chegarasidan to‘liq voz kechilib, atomar tranzaksiyalarni qo‘llab-quvvatlovchi Turso Serverless SQLite bazasiga o‘tildi.
  - SQLite jadvallarida arizalar, jamoa o‘yinlari va o‘yinchilar statistikasi relatsion tuzilmaga keltirildi.
- **Tasdiqlangan arizalar uchun avtomatik arxivlash (Circular Retention):**
  - Tasdiqlangan (`approved`) arizalar hajmi 50 tadan oshganda eng eski yozuvlar avtomatik tozalanadi. Natijada Redis yoki SQLite bazasi hech qachon `TEAM_STORAGE_FULL (413)` xatosiga uchramaydi.
- **LocalStorage Xavfsiz Tozalash (`js/data.js` - `safeStorageSet`):**
  - Brauzer xotirasi (`QuotaExceededError`) to‘lib qolganda, zaxira nusxalar (`eclipse_last_backup`) va bulutga yuborilishi kutilayotgan o‘zgarishlar (`eclipse_cloud_pending_write`) daxlsiz saqlanadi. Faqat vaqtinchalik hisoblangan keshlar va tahrir qoralamalari tozalanadi.

### 🎯 AI, OCR & Tasvir Tahlili (AI & Vision)
- **Dual-Screenshot Fusion (Ikki Skrinshotni Avtomatik Birlashtirish):**
  - MLBB Scoreboard (KDA, Gold, Medallar) va Data/Damage (Hero Damage, Turret Damage, Damage Taken, Teamfight %) skrinshotlari yuborilganda ikkala rasm o‘zaro solishtirilib, 100% to‘liq metrikalarga ega bitta yozuvga aylantiriladi.
  - `damageTaken` va `damageReceived` maydonlari sinxronlashtirildi, `scanSnapshot` jarayonida zararlar yo‘qolib ketishi bartaraf etildi.
- **Sof PNG Pikselli Qahramon Tanigich (`lib/server-hero-matcher.js`):**
  - Node.js ichki `node:zlib` moduli asosida qo‘shimcha tashqi kutubxonalarsiz ishlovchi yengil PNG dekoderi (`decodePng`) yaratildi.
  - iPhone (iOS) va Telegram orqali siqilmasdan yuborilgan PNG formatidagi skrinshotlar ham 100% piksellar bo‘yicha aniq taniladi.
- **Gemini OCR Modellari Yangilanishi:**
  - Eskirgan Gemini 1.5 modellari rasmiy eng so‘nggi `gemini-2.5-flash` va `gemini-2.0-flash` versiyalariga yangilandi.

### ⚡ Tezlik va Unifikatsiya (Performance & Architecture)
- **Yagona Production Asset Bundle (`scripts/build.mjs`):**
  - Sayt yuklanishida 38 ta alohida JavaScript va CSS fayllari o‘rniga Vercel build jarayonida avtomatik ravishda bitta `public/js/bundle.min.js` (980 KB) va bitta `public/css/bundle.min.css` (336 KB) yaratiladi.
  - Bosh sahifa ochilishida tarmoq so‘rovlari soni 38 tadan 2 taga qisqardi, yuklanish tezligi 3-4 barobarga oshdi.
- **Yagona `escapeHtml` Xavfsizlik Funksiyasi:**
  - 6 ta turli modulda takrorlangan mahalliy `escapeHtml` funksiyalari olib tashlanib, `js/date-utils.js` orqali global `window.escapeHtml` ga birlashtirildi. XSS xavflariga qarshi to‘liq himoya ta’minlandi.

### 🤖 Telegram Bot & Webhook
- **Kafolatlangan Fallback `answerCallbackQuery`:**
  - Telegram bot orqali `[✅ Tasdiqlash]` yoki `[❌ Rad etish]` tugmalari bosilganda tugmadagi aylanayotgan loading spinner qotib qolmasligi uchun `try/finally` blokida kafolatlangan javob uzatish kiritildi.
- **Shaxsiy Limitlar Boshqaruvi:**
  - Bot so‘rovlari va xavfsizlik limitlari umumiy jamoa hisobidan emas, balki har bir foydalanuvchining shaxsiy Telegram ID si bo‘yicha hisoblanadi.

### 🧪 Sinovlar va Sifat Nazorati (CI/CD)
- Avtomatlashtirilgan testlar soni **480 tadan 500 taga** oshirildi.
- 85 ta manba fayli qat’iy sintaktik tekshiruvdan o‘tkazildi, 0 ta xatolik va 0 ta ogohlantirish qayd etildi.

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
