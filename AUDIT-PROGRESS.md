# Audit holati — 2026-11-18

Rejalashtirilgan lokal audit va umumiy regressiya tekshiruvi yakunlandi. Ushbu qayd v2.42.0 chiqarilishidan oldingi tekshiruv natijalarini saqlaydi. Audit paytida production deploy, haqiqiy brauzer va tashqi xizmatlar tekshiruvi bajarilmagan; relizning joylashtirish holati GitHub va Vercel’da alohida qayd etiladi.

## Yakunlangan tekshiruvlar

### OCR va roster

- Tasdiqlangan eski IGN’lar rosterga bog‘lanadi; guest Shadow bilan rosterdagi Shadow as always ajratiladi.
- Natija ekranidagi standart hero portretlari tekshiriladi. Noaniq hero avtomatik tasdiqlanmaydi.
- Battle ID, natija va davomiylik tekshiriladi; turli ekranlardagi qatorlar faqat pozitsiya bo‘yicha birlashtirilmaydi.
- Rasmda yo‘q raqamlar taxmin bilan to‘ldirilmaydi; mavjud ma’lumotlar keyingi rasm bilan yo‘qotilmaydi.
- Oldin ruxsat berilgan 4 juft rasmning saqlangan OCR natijalarida 168/168 tekshirilgan raqam mos keldi. Hero sinovida 9 portretdan 7 tasi avtomatik qabul qilindi, 2 ta Aulus qo‘lda tasdiqlashga qoldi. Bu kichik namuna umumiy aniqlik kafolati emas.
- Ushbu bosqichning 159 ta maqsadli testi o‘tgan. Rasmlar rasmiy match tarixiga import qilinmagan.

### Saqlash va backup/restore

- Turso fayllari va storage revision bitta izchil snapshotdan o‘qiladi.
- Har bir yozish/o‘chirish amali SQL darajasida kutilgan revision bilan tekshiriladi va bitta atomar batchda bajariladi. Parallel saqlashdagi konflikt yangi snapshot bilan qayta ishlanadi.
- SQL xatosida butun batch bekor qilinadi. Commit javobi yo‘qolgan noaniq tarmoq xatosida callback avtomatik takrorlanmaydi.
- Backup va restore ilova bilan bir xil backendni tanlaydi. Turso sozlanganida eski Redis credentials uni almashtirmaydi.
- Backup haqiqiy storage revision va jamoaga xos namespace bilan eksport qilinadi. Eksport va dry-run bazani yaratmaydi, submissionlarni qisqartirmaydi.
- Eski `null` submission yozuvlari saqlanadi; boshqa noto‘g‘ri JSON hujjatlari rad etiladi.
- Restore joriy revision, jamoa identifikatori va tiklashdan oldingi nusxani talab qiladi. Lokal tiklash mashqi alohida skriptga chiqarildi: `scripts/verify-team-recovery.mjs`.

### Telegram va API kirish nazorati

- Webhook POST uchun bot tokeni va webhook siri majburiy. Sozlama bo‘lmasa 503, so‘rov siri mos kelmasa 401 qaytadi; ma’lumot o‘qish, OCR yoki yozish boshlanmaydi.
- Shaxsiy buyruqlar va rasmlar kapitan yoki `TELEGRAM_ALLOWED_USER_IDS` ro‘yxatidagi foydalanuvchilarga beriladi. Faqat sozlangan jamoa guruhining inson a’zolari guruh buyruqlarini ishlata oladi.
- Barcha `sub_*` callbacklar — tasdiqlash, rad etish, hero tanlash/tahrirlash va bekor qilish — kapitanning `from.id` qiymati bilan tekshiriladi. Guruh ID’si, username yoki bo‘sh sozlama kapitan huquqini bermaydi.
- Kapitan `TELEGRAM_CAPTAIN_USER_ID` orqali belgilanadi; u yo‘q bo‘lsa, musbat shaxsiy `TELEGRAM_CHAT_ID` eski sozlamalar uchun ishlaydi. Manfiy guruh ID’si bu huquqni bermaydi.
- Webhook va lokal polling bir xil kirish tekshiruvidan foydalanadi. Polling server modullarini environment yuklanganidan keyin import qiladi.
- Kunlik hisobot yuborish amali bekor qilingan admin sessiyasini rad etadi. Bot tokeni `/api/sync` orqali faqat roster va matchlarni o‘qishi mumkin; umumiy eksport yoki yozish huquqini bermaydi.
- Hero tahrirlash callbacklariga yetib bormayotgan dependencylar tuzatildi; testda faqat kapitanning amali tegishli funksiyaga yetib bordi.
- 71/71 maqsadli test, 88 ta ilova faylining syntax tekshiruvi, polling skripti syntax tekshiruvi va `git diff --check` o‘tdi. Dalil: `archive/security-evaluation/tests.log`.
- Telegram, Gemini yoki production bazaga ushbu bosqichda so‘rov yuborilmadi. Testlar sun’iy ma’lumotlar va stubbed so‘rovlar bilan bajarildi; 284 ta rasmiy match o‘zgartirilmadi.
- Workspace’dagi `.env.local` va `.env.production.local` fayllarida Telegram sozlamalari topilmadi. Ishga tushirishdan oldin haqiqiy secret va ruxsatli ID’lar sozlanishi kerak; production konfiguratsiyasi va real Telegram yetkazilishi bu bosqichda tekshirilmagan. [DEPLOYMENT.md](DEPLOYMENT.md) va `.env.example` yangilandi.

### Normalizatsiya va analytics ma’lumotlari yaxlitligi

- Qayta saqlash, import, migratsiya va hero katalogiga bog‘lash eski `dataIssues`, `needsReview`, `validForAnalytics: false` va `needs_review` holatini saqlaydi. Takroriy qatnashchi olib tashlangani yoki davomiylik kanonik qiymatga keltirilgani tekshiruv tugaganini anglatmaydi.
- `draft` holati server va brauzer normalizatsiyasida yo‘qolmaydi. Tekshiruvdagi yoki qoralama matchlar web statistikasi, match insightlari, haftalik va Telegram hisobotlariga qo‘shilmaydi; tarixdan o‘chirilmaydi.
- Kapitan matchni tahrirlashda sababni ko‘radi. Tekshiruvni tugatish uchun dastlab belgilanmagan “Ma’lumotlarni tekshirdim va xatolarni tuzatdim” tanlovi qo‘shildi. Oddiy saqlash ogohlantirishni yechmaydi; bu tanlov lokal qoralamadan tiklanmaydi.
- Server review amalini admin sessiyasi, `expectedUpdatedAt` va draft validatsiyasi bilan tekshiradi. Eski versiya yoki noto‘g‘ri tahrir bazaga yozilmaydi. Qo‘lda tahrirlangan yozuv oldingi OCR tasdig‘ini meros olmaydi.
- To‘g‘ri, lekin qisman to‘ldirilgan Practice Lite matchlari statistikada qoladi; mavjud bo‘lmagan ko‘rsatkichlar `null` bo‘lib qoladi.
- 190/190 maqsadli test, 88 ta ilova faylining syntax tekshiruvi va `git diff --check` o‘tdi. Dalillar: `archive/quality-evaluation/tests.log` va `syntax.log`.
- 284 match va 7 o‘yinchili backup faqat lokal o‘qildi. Barcha match maydonlari normalizatsiyadan so‘ng aynan teng; qayta normalizatsiya natijani o‘zgartirmaydi. Eski va yangi hisoblashda jamoa, o‘yinchi va hero statistikasi teng. Team 5: 6, individual/squad: 278. Dalil: `archive/quality-evaluation/history-report.json`.
- Ushbu bosqichda production, Telegram yoki Gemini so‘rovlari yuborilmadi. DOM testlari Node/jsdom ichida bajarildi; haqiqiy brauzer tekshiruvi va deploy bajarilmadi.

### Katta tarix migratsiyasi va sync hajmi

- Migratsiya endi tarixni 2500 match yoki rosterni 50 o‘yinchigacha kesib yozmaydi. Chegaradan oshgan eski lokal yozuvlar baytma-bayt saqlanadi, o‘qish va eksport ishlaydi; tahrirlash va cloud bilan almashtirish aniq xabar bilan to‘xtaydi.
- Import, cloud yuklab olish va konfliktlarni birlashtirish barcha kolleksiyalarni yozishdan oldin tekshiradi. Yozish paytida xotira xatosi chiqsa, shu urinishda o‘zgargan kalitlar oldingi holatiga qaytariladi. Qoralamalar, OCR dalillari, backup va yuborilmagan o‘zgarishlar joy ochish uchun o‘chirilmaydi. Bu sinxron xato uchun rollback; brauzer yopilishi yoki qurilma uzilishiga qarshi tranzaksiya kafolati emas.
- Konflikt bazasining to‘liq nusxasi sig‘masa, yozuv xeshlari saqlanadigan ixcham variant sinab ko‘riladi. U bir vaqtning o‘zida qilingan tahrirlarni aniqlaydi; ayrim konfliktlar qo‘lda tanlashni talab qiladi.
- Oddiy server yozuvlari — sync, submission tasdig‘i va match tahriri — umumiy chegarani qo‘llaydi: 2500 match, 50 o‘yinchi, 300 hero va 1 500 000 bayt ixcham UTF-8 JSON. Bo‘shliqlar hisobiga hajm sarflanmaydi. Bu cheksiz tarix yoki avtomatik arxivlash yechimi emas.
- Hajm oshganda 413 javobi sabab va chegarani qaytaradi; lokal o‘zgarishlar pending holatda qoladi. Server qabul qilgan javobdan keyin lokal revisionni saqlash xatosi ham pending belgini o‘chirmaydi. Backup/restore alohida to‘liq snapshot yo‘lidan foydalanadi va tarixni bu chegaralarga moslab kesmaydi.
- 20 ta yangi capacity testi bilan birga 161/161 maqsadli test, 89 ta ilova faylining syntax tekshiruvi va `git diff --check` o‘tdi. Dalillar: `archive/capacity-evaluation/tests.log` va `syntax.log`.
- 284 match va 7 o‘yinchili backup lokal xotiradagi migratsiya va snapshot almashtirish bilan tekshirildi: barcha match va o‘yinchi maydonlari teng; backup fayli o‘zgarmagan. Asosiy hujjat 974 293 baytdan 634 167 baytga tushadi — 34,9% kichikroq. Dalil: `archive/capacity-evaluation/history-report.json`.
- Ushbu bosqichda real brauzer, production, Telegram yoki Gemini so‘rovlari bajarilmadi. Testlar lokal fixture va xotiradagi saqlash bilan bajarildi. Operator yo‘riqnomasi `BACKUP-MAC.md` yangilandi.

### Coach, scouting va noma’lum ko‘rsatkichlar

- Matchning yakuniy davomiyligi va W/L natijalaridan early/late kuchi, objective nazorati yoki mag‘lubiyat sababi haqida xulosa chiqarilmaydi. Web, kunlik rasm va Telegram hisobotlari bu ma’lumotlarning chegarasini ko‘rsatadi; taktika uchun VOD kerakligi yoziladi.
- Davomiyligi noma’lum matchga 15 daqiqa yoki 0 daqiqa berilmaydi. Bunday matchlar davomiylik guruhlariga kirmaydi va alohida sanaladi. Qoralama, tekshiruvdagi va natijasi noma’lum matchlar kunlik hisobga kiritilmaydi.
- Matchi yo‘q o‘yinchining radarida survival yoki boshqa reytinglar yaratilmaydi. Noma’lum qiymat haqiqiy noldan ajratiladi; gold share’dan GPM taxmin qilinmaydi. Radar shkalasi o‘yin mahorati yoki uslubiga hukm sifatida berilmaydi.
- Yangi scouting ro‘yxati bo‘sh boshlanadi; oxirgi yozuv o‘chirilsa, uydirma jamoalar qayta paydo bo‘lmaydi. Eski namuna yozuvlari o‘chirilmaydi, lekin foydalanuvchi ularning dalillarini alohida tasdiqlamaguncha ishonchli kuzatuv sifatida ishlatilmaydi. Buzilgan yoki sig‘may qolgan lokal yozuvlar ustidan yozilmaydi.
- Foydalanuvchi talabiga ko‘ra Lord/Turtle kiritish maydonlari, OCR’dan so‘rash, ko‘rinadigan hisoblagichlar va shu raqamlarga asoslangan tavsiyalar olib tashlandi. Eski matchlarda saqlangan qiymatlar, jumladan oddiy tahrirdan keyin ham, saqlanadi.
- 12 ta yangi maqsadli test bilan birga 248/248 test va 89 ta ilova faylining syntax tekshiruvi o‘tdi. Dalillar: `archive/coaching-evaluation/tests.log` va `syntax.log`.
- Haqiqiy backupdagi 284 match va 7 o‘yinchi normalizatsiya, lokal import/eksport va analytics bilan tekshirildi: barcha maydonlar teng, backup o‘zgarmagan. 285 coach konteksti va qayd etilgan kunlarning web/Telegram hisobotlari lokal hisoblandi. Dalil: `archive/coaching-evaluation/history-report.json`.
- Ushbu bosqichda production, Telegram yoki Gemini so‘rovlari yuborilmadi. DOM tekshiruvlari Node/jsdom ichida bajarildi; haqiqiy brauzer sinovi va deploy bajarilmadi.

### Frontend yuklanishi, qidiruv, median va CSP

- Asosiy va ommaviy sahifalarning oddiy skriptlari tartibini saqlagan holda `defer` bilan yuklanadi. Production bundle ham shu tartibda ishlaydi; JS/CSS bundle havolalari tarkib xeshi bilan yangilanadi. Haqiqiy brauzer tezligi yoki paint vaqti bu bosqichda o‘lchanmagan.
- Mustaqil boshlash skripti barcha deferred skript va modullar uchun `DOMContentLoaded`ni kutadi. Ilova fayli yuklanmasa yoki boshlash xato bersa, cheksiz animatsiya o‘rniga qayta yuklash tugmasi chiqadi; jamoa sahifasi yopiq qoladi. Animatsiya API’si bo‘lmasa, ilova ishlashda davom etadi.
- Kirish tekshiruvi va login so‘rovlarining har biri uchun 15 soniya, Meta Lab’ning o‘qish so‘rovlari uchun 20 soniya kutish chegarasi qo‘yildi. Chegara javob tanasini o‘qishni ham qoplaydi. Kech kelgan javob sessiya ochmaydi yoki eskirgan kesh yozmaydi; qayta urinish mumkin. Meta Lab’dagi oldingi yuklanish yangi tanlovni qayta chizmaydi.
- Match tarixi qidiruvi tez ketma-ket yozishda 150 ms kutib, bir marta yangilanadi. Enter, filtr va qidiruvni tozalash darhol ishlaydi; matn terish kompozitsiyasi tugamaguncha filtrlanmaydi. Boshqa sahifaga o‘tilganda kutayotgan yangilanish bekor qilinadi; qaytilganda qidiruv va filtr saqlanadi.
- Qidiruv amaldagi va arxivlangan roster nomlarini ham hisobga oladi, yangilangan match/rosterdan foydalanadi. Noma’lum natija mag‘lubiyat sifatida filtrlanmaydi. Qidiruv natijasi bo‘shligi match tarixi yo‘qligidan alohida ko‘rsatiladi.
- Median juft to‘plamda ikki o‘rta qiymatni o‘rtachalaydi; bu formula to‘g‘ri edi. Son o‘qishdagi xato tuzatildi: bo‘sh joy, boolean, array va object son hisoblanmaydi; haqiqiy 0 va raqamli satr saqlanadi. Forma grafigi har nuqta uchun tarixni qayta saralamaydi.
- CSP bloklayotgan ikki match kiritish tugmasining inline handlerlari olib tashlandi; tashqi skriptdagi hodisa tinglovchilari ishlatiladi. `script-src 'self'` saqlandi, `unsafe-inline` yoki `unsafe-eval` qo‘shilmadi.
- 17 ta yangi maqsadli test bilan jami 221/221 test, 90 ta ilova faylining syntax tekshiruvi va `git diff --check` o‘tdi. Production bundle vaqtinchalik lokal buildda tekshirildi. Dalillar: `archive/frontend-evaluation/tests.log` va `syntax.log`.
- Haqiqiy backupdagi 284 match va 7 o‘yinchining barcha maydonlari lokal import/eksportdan keyin teng. Median/analytics o‘zgarishi 33 ta avvalgi/yangi hisoblash taqqoslashida mavjud tarix natijalarini o‘zgartirmadi; barcha 7 roster nomi bilan qidirish tekshirildi. Backup va analytics kirish ma’lumotlari o‘zgarmagan. Dalil: `archive/frontend-evaluation/history-report.json`.
- Testlar VM/jsdom va sun’iy tarmoq javoblari bilan lokal bajarildi. Haqiqiy brauzerda CSP ijrosi, vizual/tezlik o‘lchovi, production, Telegram, Gemini so‘rovlari va deploy bajarilmadi.

## Saqlash bosqichining dalillari

- 74/74 maqsadli test o‘tdi: mustaqil SQLite ulanishlaridagi parallel yozish, snapshot izchilligi, rollback, eskirgan restore, backup saqlanishi, sync va submission yo‘llari.
- 87 ta ilova faylining syntax tekshiruvi, uchta backup/restore skriptining syntax tekshiruvi va `git diff --check` o‘tdi.
- Haqiqiy backup: 284 match, 7 o‘yinchi, 59 mantiqiy fayl, storage revision 651.
- Alohida vaqtinchalik lokal SQLite bazasiga tiklash muvaffaqiyatli: storage revision 652. Match va o‘yinchi maydonlari teng, asosiy hujjatdan tashqari fayllar baytma-bayt teng. Faqat restore metadata yangilandi.
- 284 matchning barcha maydonlari avvalgi nazorat nusxasidagi saqlab qolingan matchlarga aynan teng. Roster ham o‘zgarmagan.
- Matchlar fingerprinti: `1d67ecba5f292deecd9084aa01d38ec17a88feda4d085768ac79f42b07d21e95`.
- Production ma’lumotlari ushbu bosqichda faqat o‘qildi; masofaviy restore yoki boshqa yozuv bajarilmadi.

Mahalliy, Git’dan chiqarilgan dalillar: `archive/storage-evaluation/tests.log`, `recovery-report.json`, `history-integrity-report.json` va `team-backup.json`. Backup shaxsiy ma’lumotlarni saqlaydi; uni repoga qo‘shmaslik kerak.

## Yakuniy regressiya — 2026-11-18

- Yakuniy ko‘rikda Telegram roster/hero pool bo‘sh toifalarni oldindan yozilgan namunalar bilan to‘ldirishi topildi va tuzatildi. Bot faqat saqlangan faol rosterni ko‘rsatadi; birinchi o‘yinchi yoki IGN asosida kapitan belgilamaydi, haqiqiy ism yoki rolni taxmin qilmaydi.
- Web va bot hero pool toifalari saqlangan `comfort`, `backup`, `learning` ma’nosida ko‘rsatiladi. Ro‘yxat uzunligidan “100% turnirga tayyor” yoki banlarga chidamlilik bahosi yaratilmaydi. Hero pool yozuvlari o‘zgartirilmaydi.
- Umumiy Telegram hisoboti noma’lum natijani mag‘lubiyat deb sanamaydi; Ranked, Scrim, Turnir, Casual va noma’lum formatlar ajratiladi. Kunlik hisobot ham kanonik W/L natijasidan foydalanadi. Roster, pool va hisobotdagi nomlar HTML sifatida ishlamaydi; maxsus object kalitlariga teng nomlar hisoblagichlarni buzmaydi.
- README, COACH, changelog va ilovadagi joriy reliz tavsifi amaldagi cheklovlarga moslandi. Cheksiz xotira, 100% OCR aniqligi va o‘lchanmagan 3–4x tezlik da’volari tuzatildi.
- 7 ta yangi regressiya testi va hero pool ko‘rsatish sinovi bilan yakuniy **614/614 test o‘tdi**: **0 fail, 0 skip, 0 cancelled**. To‘liq gate `tests/*.test.js` va `scripts/ui-regression.test.mjs`ni qamraydi. 90 ta manba fayli syntax tekshiruvidan o‘tdi, `git diff --check` toza.
- `npm run build` muvaffaqiyatli tugadi; lokal `public/` artefaktlari yaratildi. Test jarayonlariga production credentials uzatilmagan. Dalil: `archive/final-evaluation/build.log`.
- Haqiqiy backupdagi **284 match va 7 o‘yinchining barcha maydonlari saqlangan**. Lokal import/eksport, 33 analytics taqqoslashi va 7 roster nomi bilan qidirish o‘tdi. Asl backup SHA-256: `5985f0dd7803305be014c712291f04f84a209d26b0bacd0fed9f0afd5d2d2ed3`. Dalil: `archive/final-evaluation/history-report.json`.
- 59 mantiqiy fayl alohida vaqtinchalik SQLite bazasiga muvaffaqiyatli tiklandi; storage revision 651 → 652. Matchlar, roster va boshqa saqlangan maydonlar teng; faqat restore metadata yangilandi. Asl backup o‘zgarmagan, masofaviy yozuvlar yo‘q. Dalil: `archive/final-evaluation/recovery-report.json`.
- Oldin ruxsat berilgan 4 juft rasmning saqlangan OCR natijalari qayta tekshirildi: **168/168 mos**, tashqi OCR so‘rovi yo‘q. Bu cached qiymatlarni etalon bilan taqqoslash; yangi OCR ishlatish yoki umumiy aniqlik kafolati emas. Dalil: `archive/final-evaluation/cached-ocr.log`.

## Yakunning chegaralari

- Testlar mavjud **Node v26.12.0** bilan o‘tkazildi. Loyihada belgilangan **Node 24.x** bu muhitda mavjud emas; o‘rnatilmadi va aynan shu runtime bilan tekshirish bajarilmadi.
- UI sinovlari VM/jsdomda bajarildi. Haqiqiy brauzerda vizual ko‘rinish, CSP ijrosi va tezlik o‘lchovi bajarilmagan.
- Ushbu yakuniy bosqichda production, Telegram yoki Gemini so‘rovlari, yangi screenshot importi, deploy, commit va push bajarilmadi. Production konfiguratsiyasi va real Telegram yetkazilishi tasdiqlanmagan.
- Lokal audit tugagan. v2.42.0 relizini chiqarish alohida bosqich: Node 24.x gate, brauzer smoke tekshiruvi va tegishli tashqi xizmatlar konfiguratsiyasi shu muhitlarda tekshiriladi.

Operator yo‘riqnomalari: [BACKUP-MAC.md](BACKUP-MAC.md) va [DEPLOYMENT.md](DEPLOYMENT.md). Shaxsiy backup va test dalillari `archive/` ichida Git’dan chiqarilgan holda qoladi.
