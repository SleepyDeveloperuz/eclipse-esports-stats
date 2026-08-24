window.TrainingManager = class TrainingManager {
  constructor(dataStore) {
    this.db = dataStore;
    this.STORAGE_KEY = 'mlbb-jamoa-dasturi-progress';
    this.state = {};
    this.currentSubTab = 'team-program'; // 'team-program' or 'personal-playbook'
    this.currentTeamTab = 'roadmap';    // 'roadmap', 'weekly', 'roles', 'team', 'strategy', 'coach'
    this.currentRole = 'gold';          // for role basics checklist
    this.currentWeekPhase = 0;          // for weekly schedule phase (0 to 3)
    this.currentPlaybookTab = 'universal'; // 'universal', 'roam', 'jungle', 'mid', 'gold', 'exp'

    this.initData();
    this.loadState();
  }

  initData() {
    this.roleData = {
      gold: {
        name: "Gold Laner",
        tag: "Asosiy zarar manbai — Marksman",
        icon: "fa-gem",
        color: "#ffd700",
        items: [
          "Har mashqda CS (Creep Score) samaradorligini kuzating — maqsad: boy berilgan minion sonini minimal darajaga tushirish",
          "Teamfightda doim maksimal hujum masofasida (max attack range) turishni mashq qiling, hech qachon oldingi qatorga birinchi bo'lib chiqmang",
          "Har o'yin uchun 2-3 ta core item ketma-ketligini (asosiy va raqib tank/burst holatiga qarab) mukammal yodda tuting",
          "Turret, Lord va Turtle'ga qachon xavfsiz zarar berish mumkinligini xaritadagi dushman pozitsiyasiga qarab aniq bilib oling",
          "Xarita holatiga qarab zudlik bilan chekinish (retreat) yoki surish (push) qarorini tezda qabul qilishni mashq qiling",
          "Fight boshlanishidan oldin eng xavfsiz positioning burchagini tanlashni va dushman assasin/dive herolaridan himoyalanishni o'rganing"
        ]
      },
      exp: {
        name: "EXP Laner",
        tag: "Solo lane — Fighter / Frontline Tank",
        icon: "fa-shield-halved",
        color: "#f59e0b",
        items: [
          "Raqib bilan duel (trade) oynalarini uning asosiy cooldown'lariga qarab hisoblashni mashq qiling",
          "Minion wave'ni qachon push (surish), qachon freeze (ushlab turish) va qachon crash qilish kerakligini farqlashni o'rganing",
          "Lane'dan qachon rotatsiya qilib Mid yoki Jungle'ga yordamga borish foydali ekanini aniqlang",
          "Jamoaviy jangda (engage) to'g'ri vaqtni his qilishni mashq qiling — na erta va na kech kiring",
          "Split-push qarorini qachon qabul qilish va qachon jamoaga qo'shilish kerakligini bilib oling",
          "Tank/Frontline hero o'ynasangiz, o'z carry'ingizni peel qilish (himoya qilish) mexanikasini mustahkamlang"
        ]
      },
      mid: {
        name: "Mid Laner",
        tag: "Mage — Xarita nazorati va tezkor rotatsiya",
        icon: "fa-wand-magic-sparkles",
        color: "#00d4ff",
        items: [
          "Asosiy kombo va skillshot'laringizni yuqori aniqlik bilan nishonga tekkizishni mashq qiling",
          "Mid lane wave'ni imkon qadar tez tozalab, side lane'larga yordam uchun qo'shimcha vaqt yarating",
          "Gold va EXP lane'larga muntazam gank qilib, ustunlik yaratish odatini shakllantiring",
          "Har fight oldidan mana va asosiy cooldown holatingizni to'g'ri hisoblashni odat qiling",
          "Fight paytida orqa burchakda turib, raqibning eng xavfli qahramonlariga maksimal AOE zarar berishga e'tibor qarating",
          "Raqib mid o'yinchisining harakatini doimiy kuzatib, jamoaga \"MIA\" (yo'qoldi) signallarini o'z vaqtida bering"
        ]
      },
      jungle: {
        name: "Jungler",
        tag: "Buff, Gank, Retribution va Objective Master",
        icon: "fa-bolt",
        color: "#a855f7",
        items: [
          "Jungle clear yo'lingizni optimallashtirib, barcha camp'larni eng kam vaqtda tozalashni mashq qiling",
          "Turtle va Lord spawn vaqtlarini aniq hisoblab, jangdan 20 soniya oldin pozitsiya oling",
          "Gank uchun eng foydali va dushman qochish imkoni bo'lmagan lane holatini tanlashni mashq qiling",
          "Retribution timing'ini (camp/objective HP taxminan 10-15% qolganda) xatosiz bosishni Practice'da avtomatlashtiring",
          "Raqib junglerining yo'nalishini kuzatib, dushman bufflarini o'g'irlash (counter-jungle) imkoniyatlarini toping",
          "Buff va objective respawn vaqtlarini jamoa a'zolari bilan ovozli comms orqali muvofiqlashtiring"
        ]
      },
      roam: {
        name: "Roamer",
        tag: "Tank / Support — Vision, Initsiatsiya va Shot-Calling",
        icon: "fa-compass",
        color: "#10b981",
        items: [
          "Xaritada dushman o'tishi shart bo'lgan tor yo'laklar va butalar (bush) ichiga chuqur vision (ward/tekshiruv) bering",
          "Fight boshlash (engage) va chekinish (disengage) vaqtini sovuqqonlik bilan his qilishni mashq qiling",
          "Gold Laner va Mid'ni dushman hujumidan himoya qilishni (peel) pozitsiyada birinchi o'ringa qo'ying",
          "Jamoa rotatsiyasini ovoz bilan boshqarishga tayyor bo'ling — asosiy shot-caller (IGL) siz bo'lasiz",
          "Lord yoki Turtle jangidan 20-30 soniya oldin dushman vision'ini tozalab, jamoangizga xavfsiz pozitsiya hozirlang",
          "Har jangdan so'ng kimni himoya qila olmaganingizni yoki qayerda xato initsiatsiya qilganingizni tahlil qiling"
        ]
      }
    };

    this.teamItems = [
      "Teamfightda ustuvor nishonni (focus target) jangdan oldin aniq kelishib oling",
      "Rotatsiyada doim birgalikda harakat qiling — rejasiz yakka holda bo'linmang (split-push taktikasi bundan mustasno)",
      "Lord yoki Turtle chiqishidan 20-30 soniya oldin butun jamoa bo'lib o'sha hududga yig'iling",
      "Comms'da aniq va qisqa xabar bering: \"MIA\", \"Ulti yo'q\", \"Flicker ishlatdi\", \"HP kam\" kabi",
      "Jangdan so'ng All-in (hujumni davom ettirish) yoki Retreat (chekinish) qarorini birgalikda va zudlik bilan qabul qiling",
      "Natijadan qat'i nazar jamoadoshlarni o'yin paytida ayblamasdan, yuqori jamoaviy kayfiyatni saqlang"
    ];

    this.strategyItems = [
      "Jamoangiz uchun asosiy tarkib (composition) falsafasini tanlang: Protect-the-Carry, Wombo-Combo All-In, Split-Push yoki Poke/Pick-off",
      "Har o'yin oldidan ban strategiyasini belgilang — dushmanning eng kuchli taktikasi yoki qahramonlarini zararsizlantiring",
      "Draft boshida bir nechta rolga mos keluvchi (flex) qahramonlarni oling, asosiy strategiyani keyinroq oching",
      "Raqib tarkibining zaif tomonlariga qarshi counter-pick qilish imkoniyatlarini tezda aniqlashni o'rganing",
      "Rasmiy turnirlar va scrimlarda raqib jamoalarning doimiy o'yin uslubi va sevimli herolarini oldindan o'rganing (Scouting)",
      "Har bir tanlov (pick) nega amalga oshirilganini butun tarkibga tushunarli qilib yetkazing",
      "Pick order'da kim birinchi va kim oxirgi o'rinda tanlashini rollarning xavfsizligiga qarab oldindan rejalashtiring"
    ];

    this.coachItems = [
      "Haftalik jadvalda shaxsiy individual mashg'ulotlar uchun alohida vaqt ajrating",
      "Kamida 2 ta, imkon qadar 3 ta rolda chuqur qahramonlar zaxirasiga (hero pool) ega bo'ling",
      "Scrimlarda turli rollarni sinab ko'rib, jamoaning har bir chizig'idagi qiyinchiliklarni ichidan his qiling",
      "Har bir o'yinchi bilan alohida, xolis suhbat o'tkazib, shaxsiy o'sish maqsadlarini belgilab boring",
      "O'yindan keyingi tahlillarni (Debrief/VOD Review) shaxsiyatga tegmasdan, sof fakt va xatolar asosida o'tkazing",
      "O'z o'yiningizni ham doimiy yozib olib tahlil qiling — yetakchi va murabbiy ham uzluksiz o'sishi kerak"
    ];

    this.roadmapPhases = [
      {
        title: "0. Rol Sinovi (Trial)",
        weeks: "0-hafta",
        goal: "Dastur boshlanishidan oldin: har bir o'yinchini 11 mezon va Rol Matritsasi orqali sinovdan o'tkazing va asosiy rolni aniqlang. Noto'g'ri rolda vaqt yo'qotmaslik uchun bu eng muhim poydevordir.",
        focus: "Baholash & Rol Tanlovi",
        tab: "roles"
      },
      {
        title: "1. Individual Asoslar",
        weeks: "1–3 hafta",
        goal: "Har bir jamoadosh o'z rolida mustahkam mexanika, CS aniqligi, kombo va mikro-ko'nikmalarga ega bo'ladi.",
        focus: "Rol asoslari & Micro",
        tab: "roles"
      },
      {
        title: "2. Jamoaviy Muvofiqlashtirish",
        weeks: "4–6 hafta",
        goal: "Individual mahorat jamoaviy o'yinga ulanadi — 5 kishi bir kishidek rotatsiya qilishi va teamfight intizomi.",
        focus: "Jamoaviy ko'nikmalar",
        tab: "team"
      },
      {
        title: "3. Strategiya va Draft",
        weeks: "7–9 hafta",
        goal: "Draft falsafasi shakllanadi, pick-ban strategiyasi, raqibni scouting qilish va kompozitsiya boshqaruvi.",
        focus: "Strategiya & Pick/Ban",
        tab: "strategy"
      },
      {
        title: "4. Musobaqaga Tayyorgarlik",
        weeks: "10–12 hafta",
        goal: "Scrim yuklamasi oshadi, mental barqarorlik va real turnir bosimiga psixologik tayyorgarlik mustahkamlanadi.",
        focus: "Turnir & Mental Tayyorgarlik",
        tab: "coach"
      }
    ];

    this.weeklyPhases = [
      {
        label: "1–3 hafta (Individual)",
        note: "Individual asoslar bosqichi — ko'proq mikro-mexanika va combo mashqlari, kamroq scrim.",
        days: [
          ["Dushanba", "Individual mashq — Hero pool va minion last-hit mashqi"],
          ["Seshanba", "Individual mashq — Kombolar va xavfsiz positioning"],
          ["Chorshanba", "Individual mashq + O'z rolingiz bo'yicha pro VOD tahlili"],
          ["Payshanba", "Draft / Pick-ban mashqi va kompozitsiya tahlili"],
          ["Juma", "Scrim — Boshqa jamoa bilan 5v5 sinov o'yini"],
          ["Shanba", "VOD tahlili — O'z o'yiningizdagi 3 ta asosiy xato"],
          ["Yakshanba", "Dam olish va psixologik tiklanish"]
        ]
      },
      {
        label: "4–6 hafta (Muvofiqlashtirish)",
        note: "Jamoaviy muvofiqlashtirish bosqichi — individual mashg'ulot va jamoaviy scrimlar teng taqsimlanadi.",
        days: [
          ["Dushanba", "Individual mashq — Signature qahramonlarni mukammallashtirish"],
          ["Seshanba", "Jamoaviy mashq — Rotatsiya, xarita nazorati va comms intizomi"],
          ["Chorshanba", "Draft / Pick-ban mashqi (Jamoa bilan birga)"],
          ["Payshanba", "Scrim — Boshqa jamoa bilan 5v5 o'yinlar"],
          ["Juma", "Scrim — Boshqa jamoa bilan 5v5 o'yinlar"],
          ["Shanba", "VOD tahlili — Jamoaviy teamfight va rotatsiya xatolari"],
          ["Yakshanba", "Dam olish yoki yengil individual mashq"]
        ]
      },
      {
        label: "7–9 hafta (Strategiya)",
        note: "Strategiya va draft bosqichi — tarkiblarni moslashtirish va raqib counter-play.",
        days: [
          ["Dushanba", "Individual mashq — Counter-pick qahramonlarini o'rganish"],
          ["Seshanba", "Draft strategiyasi, meta tahlili va raqib scouting"],
          ["Chorshanba", "Draft / Pick-ban mashqi (Turli kompozitsiyalar)"],
          ["Payshanba", "Scrim — Boshqa jamoa bilan 5v5 o'yinlar"],
          ["Juma", "Scrim — Boshqa jamoa bilan 5v5 o'yinlar"],
          ["Shanba", "VOD tahlili — O'z o'yinlar + Dunyo chempionati pro matchlari"],
          ["Yakshanba", "Dam olish yoki yengil mashq"]
        ]
      },
      {
        label: "10–12 hafta (Turnir)",
        note: "Musobaqaga tayyorgarlik — scrim intensivligi eng yuqori darajaga chiqadi.",
        days: [
          ["Dushanba", "Scrim — Boshqa jamoa bilan 5v5 o'yinlar"],
          ["Seshanba", "Individual mashq — Aniqlangan zaif nuqtalarni bartaraf etish"],
          ["Chorshanba", "Draft / Pick-ban mashqi va final tayyorgarlik"],
          ["Payshanba", "Scrim — Boshqa jamoa bilan 5v5 o'yinlar"],
          ["Juma", "Scrim — Boshqa jamoa bilan 5v5 o'yinlar"],
          ["Shanba", "VOD tahlili + Mental tayyorgarlik va jamoaviy kelishuv"],
          ["Yakshanba", "Dam olish — Turnir oldidan to'liq dam olish o'ta muhim"]
        ]
      }
    ];

    this.personalPlaybook = {
      universal: {
        label: "Umumiy Asoslar",
        badge: null,
        note: "Bu bo'lim BARCHA rollar va butun jamoa uchun umumiy poydevor — birinchi navbatda shu yerdan boshlang.",
        micro: [
          { t: "Last-hit Mashqi (CS)", d: "Custom Room'da (bot bilan, bo'sh xarita) har kuni 5 daqiqa faqat minion urishga bag'ishlang. Maqsad — har wave'dagi barcha minionlarni maksimal darajada o'zingiz olish." },
          { t: "Combo Avtomatlashtirish", d: "Practice Mode'da asosiy 2-3 heroingizning kombolarini avval SEKIN va xatosiz bajaring, keyin asta tezlashtiring. Ketma-ketlik qo'l xotirasiga (muscle memory) o'tishi shart." },
          { t: "Kamera & Radar Intizomi", d: "Har 2-3 soniyada minimap'ga ko'z tashlash odatini shakllantiring. Bu ongli harakat emas, avtomatik refleksga aylanishi lozim." }
        ],
        macro: [
          { t: "Xarita O'qishning 3 Savoli", d: "Har safar minimap'ga qaraganda: (1) Ko'rinmayotgan dushman bormi? (2) Turtle/Lord taymeri nechada? (3) O'z jamoam qayerda va qanday yordam bera olaman?" },
          { t: "O'lim Tahlili Odati", d: "Har safar o'lganingizda o'zingizga savol bering: \"Buning oldini olish uchun 5 soniya oldin nima qilsam bo'lardi?\" Bu savol xatolarni takrorlamaslik refleksini yaratadi." }
        ],
        timing: [
          { t: "Turtle Vaqti", d: "2:00 daqiqada birinchi marta paydo bo'ladi, olingandan so'ng har 2 daqiqada qayta chiqadi. 8:00 dan keyin Lord'ga aylanadi." },
          { t: "Lord Vaqti", d: "Birinchi marta 8:00 da chiqadi. 8:00–18:00 oralig'ida taxminan har 3 daqiqada, 18:00 dan keyin (Enhanced Lord) har 2 daqiqada chiqadi." }
        ],
        advanced: [
          { t: "Dushman Cooldown Tracking", d: "Nafaqat o'z rolingizdagi duelchi, balki BUTUN raqib jamoaning eng xavfli 2-3 qobiliyatini (Ultimate, Flicker, asosiy Stun) hisoblab jangga kiring." },
          { t: "Raqib Pattern'ini O'qish", d: "Raqib o'yinchilarining takrorlanuvchi odatlarini (masalan, \"bu jungler doim Turtle oldidan chap butadan aylanadi\") 2-3 o'yindan keyin ilg'ab oling." },
          { t: "Tempo Trade (Almashish)", d: "Ba'zan kichik narsani (bitta tashqi turret) ataylab berib, o'sha paytda xaritaning narigi burchagida kattaroq yutuqqa (Lord yoki 2 ta turret) erishing." },
          { t: "VOD'ni 3 Bosqichda Ko'rish", d: "1-marta: umumiy o'yin oqimi. 2-marta: faqat o'z xatolaringiz. 3-marta: faqat raqibning harakatlari va xatolarini o'rganish." }
        ],
        drills: [
          "Har kuni 5 daqiqa Custom Room'da faqat minion last-hit mashqi",
          "Haftada 2 marta Practice Mode'da kombolarni avtomatlashtirish (sekin → tez)",
          "Har bir mag'lubiyatli o'yindan so'ng kamida 1 ta o'lim sababini aniq tahlil qilish"
        ]
      },
      roam: {
        label: "Roam (Asosiy Rol)",
        badge: "primary",
        note: "ASOSIY NOMZOD ROL — haftalik mashq vaqtingizning kamida yarmini shu yerga qarating. Mikrogacha chuqur o'rganing!",
        micro: [
          { t: "Engage & Initsiatsiya Vaqti", d: "CC (Stun/Nazorat)ni raqibning Flicker yoki himoya spell'i ishlatilganidan KEYIN bosing, oldin emas — aks holda kombo zoye ketadi." },
          { t: "Peel Mexanikasi (Carry Himoyasi)", d: "Gold laneringizga hujum bo'lganda, kimga qayerda turishni emas, hujum qilayotgan dushmanga zudlik bilan CC ishlatib yo'lini to'sishni odat qiling." },
          { t: "Chuqur Vision (Ko'rish)", d: "Ward yoki buta tekshiruvini faqat o'z yoningizda emas, dushman albatta o'tishi kerak bo'lgan asosiy daryo chorrahalarida ta'minlang." }
        ],
        macro: [
          { t: "Xavfsiz Rotatsiya Qarori", d: "Gold laneringiz xavfsiz farm qilayotgan paytda boshqa lane'ga 15-20 soniyalik tezkor yordamga boring, ammo doim qaytish vaqtini hisoblang." },
          { t: "Ovozli Shot-Calling (IGL)", d: "Har bir muhim harakat oldidan (Lord olamiz, chekinamiz, ambush qilamiz) ovoz chiqarib buyruq bering. Jamoa sizning aniq ovozingizga tayanishi lozim." },
          { t: "Vision Asosidagi Qarorlar", d: "Raqib xaritada ko'rinmasa, ularning oxirgi joyi va o'tgan vaqtga qarab qaysi butada pistirma qurayotganini oldindan taxmin qiling." }
        ],
        timing: [
          { t: "Objective Oldidan Butalarni Tozalash", d: "Turtle yoki Lord chiqishidan 20-30 soniya oldin hudud atrofidagi raqibni haydab, burchaklarni tozalang — vision urushida yutgan jangda yutadi." },
          { t: "Item Power Spikes", d: "Roaming item passivlari va asosiy mudofaa buyumlarining tayyor bo'lish vaqtini hisobga olib jangga kiring." }
        ],
        advanced: [
          { t: "Fake-Engage (Aldamchi Hujum)", d: "CC tayyor turganini ko'rsatib, dushmanning asosiy qochish qobiliyatlarini majburan sarflating, ammo o'zingiz chuqur kirmang." },
          { t: "Faol Vision Denial", d: "Faqat ko'rish maydoni yaratish emas, balki raqibning harakatlanish nuqtalarini to'sib, ularni xaritada butunlay \"ko'r\" holatga keltiring." },
          { t: "Multi-Threat Bosim", d: "Bir vaqtning o'zida ham markaziy jang tahdidini, ham yon lane xavfsizligini ta'minlovchi marshrutlar bo'ylab harakatlaning." }
        ],
        drills: [
          "Har bir scrim o'yinida kamida 5 ta muvaffaqiyatli ovozli shot-call berganingizni tekshiring",
          "Haftada 1 marta faqat Roamer rolida ranked o'ynab, faqat vision va peel timing'iga diqqat qarating",
          "VOD tahlilida faqat o'z carry'laringizni qutqara olgan yoki ololmagan epizodlaringizni ko'rib chiqing"
        ]
      },
      jungle: {
        label: "Jungle",
        badge: "secondary",
        note: "Direktor va Murabbiy darajasida tushunish uchun — VOD tahlili, jungler bilan muloqot va draftda to'g'ri qaror qilish uchun kerak.",
        micro: [
          { t: "Retribution Vaqtlashi", d: "Monster HP 10-15% qolganda bosing. Juda erta bosilsa raqib o'g'irlashi mumkin, kech qolsangiz o'zingiz yutqazasiz." },
          { t: "Jungle Marshrutini Avtomatlashtirish", d: "Buff camp'lardan boshlab eng tezkor aylanish yo'lini Practice Mode'da sekundomer bilan mashq qiling." },
          { t: "Gank Kombolari", d: "Lane'ga kirishdan oldin dushmanning qochish spell'i ishlatilgan yoki yo'qligini tekshirib kiring." }
        ],
        macro: [
          { t: "Xaritani Baholash", d: "Qaysi lane bosim ostida ekanini va qaysi dushman lane'i oson gank bo'lishini ko'rib, marshrutni o'zgartiring." },
          { t: "Farm vs Gank Balansi", d: "Jamoa oldinda bo'lsa agressiv gank qiling; orqada qolsangiz avval o'z darajangiz va oltiningizni tiklab oling." },
          { t: "Objective Nazorati", d: "Lord/Turtle jangiga faqat jamoadoshlar tayyor bo'lganda kiring; aks holda orqada poylab o'g'irlashga (steal) harakat qiling." }
        ],
        timing: [
          { t: "Level 4 Spike", d: "Odatda birinchi jungle tozalashdan keyin (~1:30-1:50) Level 4 ultimate ochiladi va birinchi jiddiy gank amalga oshiriladi." },
          { t: "Camp Respawn", d: "Katta bufflar 2 daqiqada, kichik kemplar tezroq qayta tug'iladi — vaqtni behuda yo'qotmaslik uchun marshrutni uzluksiz qiling." }
        ],
        advanced: [
          { t: "Counter-Jungling", d: "Raqib jungler narigi lane'da ko'ringan paytda uning qarama-qarshi tomonidagi qimmatli camp'larini zudlik bilan o'g'irlang." },
          { t: "Ko'rinmas Psixologik Bosim", d: "Xaritada uzoq vaqt ko'rinmasdan dushmanning barcha lane'larini ehtiyotkor va passiv o'ynashga majburlang." }
        ],
        drills: [
          "Practice Mode'da to'liq jungle tozalashni sekundomer bilan 3 marta takrorlang",
          "Jungleringiz bilan VOD ko'rganda: uning rotatsiya tezligi va Retribution timing'ini baholang"
        ]
      },
      mid: {
        label: "Mid",
        badge: "secondary",
        note: "Direktor va Murabbiy darajasida tushunish uchun — Mid o'yinchisi bilan tahlil qilish va kompozitsiya tuzish uchun.",
        micro: [
          { t: "Wave Clear Tezligi", d: "AOE skillarni eng kam harakat bilan butun minion to'dasini yo'q qiladigan tartibda mashq qiling." },
          { t: "Poke & Masofa", d: "Eng uzoq masofali skillni birinchi, eng qisqasini xavfsiz bo'lganda ishlatish refleksini shakllantiring." },
          { t: "Mana Boshqaruvi", d: "Har bir skilldan so'ng keyingi kutilmagan jang uchun yetarli mana qolishini nazorat qiling." }
        ],
        macro: [
          { t: "Tezkor Rotatsiya", d: "Mid wave tozalangach, 2 soniya ichida qaysi side-lane'ga yordam berish kerakligini hal qiling." },
          { t: "Axborot Markazi", d: "Markazda bo'lganingiz uchun dushman harakatlarini birinchi bo'lib ko'rasiz va jamoaga tez xabar bering." },
          { t: "Prioritet Nishon", d: "Jangda eng birinchi kimni yo'q qilish kerakligini (dushman carry yoki mage) oldindan belgilang." }
        ],
        timing: [
          { t: "Wave Push Holati", d: "Minionlar raqib minorasi tomon ketayotganda rotatsiya qiling; o'z tomoningizda bo'lsa birinchi tozalab keyin harakatlaning." }
        ],
        advanced: [
          { t: "Sinxron Bo'lmagan Roaming", d: "Raqib mid roam qilganda orqasidan ko'r-ko'rona ergashmang — yo o'z lane'ingizni push qiling, yoki qarama-qarshi tomonga zarba bering." }
        ],
        drills: [
          "Mid o'yinchingiz bilan VOD ko'rganda: uning har bir rotatsiya qarorini 3 soniyalik qoidaga solib baholang"
        ]
      },
      gold: {
        label: "Gold",
        badge: "secondary",
        note: "Direktor va Murabbiy darajasida tushunish uchun — Gold Lanerning o'sish dinamikasi va xatolarini tahlil qilish uchun.",
        micro: [
          { t: "CS Aniqligi", d: "Minionlarning 90%+ qismini aynan o'zi so'nggi zarba bilan olishini ta'minlash." },
          { t: "Kiting Texnikasi", d: "Zarba berib, darhol orqaga yoki xavfsiz tomonga qadam tashlash (Hit & Run) refleksini mukammallashtirish." },
          { t: "Eng Xavfsiz Burchak", d: "Teamfightda eng orqa qatorda turib, faqat ko'ringan eng xavfsiz nishonga maksimal zarba berish." }
        ],
        macro: [
          { t: "Farm Ustuvorligi", d: "Xavf bo'lmasa DOIM farm qilish — faqat 100% yutuqli jang bo'lsagina jamoaga qo'shilish." },
          { t: "Vaziyatga Qarab Build", d: "Raqibda ko'p tank bo'lsa penetration buyumlari, burst bo'lsa himoya buyumini erta olish." }
        ],
        timing: [
          { t: "2-Item Power Spike", d: "Odatda 2 ta asosiy buyum tayyor bo'lgach (~10-12 daqiqa) Gold Laner jang taqdirini hal qiluvchi kuchga kiradi." }
        ],
        advanced: [
          { t: "Kechikkan Kirish (Late Entry)", d: "Raqibda xavfli assassinlar bo'lsa, jangga birinchi emas, dushmanning asosiy ultilari ishlatilgach kirish." }
        ],
        drills: [
          "Gold Laner bilan 10-daqiqalik CS va Gold miqdorini har hafta jadvalda solishtirib boring"
        ]
      },
      exp: {
        label: "EXP",
        badge: "secondary",
        note: "Direktor va Murabbiy darajasida tushunish uchun — EXP Lanerning duel va jamoaviy jangdagi o'rnini baholash uchun.",
        micro: [
          { t: "Trading Ritmi", d: "Skill cooldown ustunligi bor paytda hujum qilish, bo'lmaganda chekinish." },
          { t: "Wave Boshqaruvi", d: "Freeze (ushlash) va Crash (minora tagiga tiqish) orqali raqibni oltin va tajribadan quruq qoldirish." }
        ],
        macro: [
          { t: "Split-Push Tahdidi", d: "Yakka o'zi uzoq laniyani surib, raqibning 2 kishisini o'ziga jalb qilish va jamoaga 4v3 ustunlik yaratish." },
          { t: "Frontline & Initsiatsiya", d: "Lord janglarida oldinda turib dushman ko'rish maydonini yopish va jang boshlash." }
        ],
        timing: [
          { t: "Turtle Jangiga Yetib Kelish", d: "Birinchi va ikkinchi Turtle paytida EXP lane minionlarini surib qo'yib, jamoaga yordamga kelish." }
        ],
        advanced: [
          { t: "Wave-Crash Rotatsiyasi", d: "Minionlarni dushman minorasi ostiga to'liq surib, dushman tozalaguncha 30 soniyalik xavfsiz oynada rotatsiya qilish." }
        ],
        drills: [
          "EXP o'yinchingiz bilan VOD ko'rganda: uning trade oynalaridan qanchalik to'g'ri foydalanganini tekshiring"
        ]
      }
    };
  }

  // --- STATE PERSISTENCE ---
  loadState() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this.state = raw ? JSON.parse(raw) : {};
    } catch (e) {
      this.state = {};
    }
  }

  saveState() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error("Failed to save training state", e);
    }
  }

  resetProgress() {
    if (window.EclipseApp && window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
      if (window.showToast) window.showToast("Progressni tozalash uchun Admin paroli talab qilinadi", "warning");
      window.EclipseApp.authManager.showLoginModal();
      return;
    }
    if (!confirm("Barcha mashg'ulot va reja progressini tozalashni xohlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.")) return;
    this.state = {};
    this.saveState();
    this.renderTrainingHub('trainingContainer');
    if (window.EclipseApp && window.EclipseApp.cloudSync) {
      window.EclipseApp.cloudSync.syncUp();
    }
    if (window.showToast) window.showToast("Mashg'ulot progressi tozalandi", "warning");
  }

  keyFor(section, idx, role) {
    return role ? `${section}-${role}-${idx}` : `${section}-${idx}`;
  }

  toggleCheckItem(k, el) {
    if (window.EclipseApp && window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
      if (window.showToast) window.showToast("Mashg'ulot rejasini belgilash uchun Admin paroli talab qilinadi", "warning");
      window.EclipseApp.authManager.showLoginModal();
      return;
    }
    this.state[k] = !this.state[k];
    if (el) el.classList.toggle('checked', !!this.state[k]);
    this.saveState();
    this.updateProgressSummary();
    if (window.EclipseApp && window.EclipseApp.cloudSync) {
      window.EclipseApp.cloudSync.syncUp();
    }
  }

  getTotalItemsCount() {
    const rolesCount = Object.values(this.roleData).reduce((sum, r) => sum + r.items.length, 0);
    return rolesCount + this.teamItems.length + this.strategyItems.length + this.coachItems.length;
  }

  getCompletedItemsCount() {
    return Object.values(this.state).filter(Boolean).length;
  }

  updateProgressSummary() {
    if (typeof document === 'undefined') return;
    const total = this.getTotalItemsCount();
    const done = this.getCompletedItemsCount();
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const fillEl = document.getElementById('training-progress-fill');
    const pctEl = document.getElementById('training-progress-pct');
    const countEl = document.getElementById('training-progress-count');

    if (fillEl) fillEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (countEl) countEl.textContent = `${done} / ${total} band bajarildi`;
  }

  // --- MAIN RENDERER ---
  renderTrainingHub(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <!-- TOP OVERVIEW HERO -->
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0, 212, 255, 0.05) 0%, var(--bg-card-glass) 100%); border: 1px solid var(--primary);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1.5rem;">
          <div style="max-width:650px;">
            <span class="badge" style="background:linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%); color:#000; font-weight:800; margin-bottom:0.5rem;">
              <i class="fa-solid fa-graduation-cap"></i> ECLIPSE ESPORTS ACADEMY
            </span>
            <h2 style="font-size:2rem; color:var(--text-primary); margin:0.25rem 0 0.5rem 0;">Jamoa Akademiyasi & Shaxsiy Playbook</h2>
            <p style="color:var(--text-secondary); margin:0; font-size:0.95rem; line-height:1.6;">
              Asoslardan tortib to professional musobaqagacha bo'lgan <strong>12 haftalik rivojlanish dasturi</strong>, har bir rol bo'yicha <strong>Micro, Macro va Timing yo'riqnomalari</strong> hamda doimiy amaliy cheklistlar.
            </p>
          </div>
          <div style="text-align:right;">
            <button class="btn btn-secondary btn-sm" id="training-reset-btn" style="border-color:rgba(239,68,68,0.4); color:var(--danger);">
              <i class="fa-solid fa-arrow-rotate-left"></i> Progressni Tozalash
            </button>
          </div>
        </div>

        <!-- PROGRESS BAR SUMMARY -->
        <div style="margin-top:1.5rem; background:rgba(0,0,0,0.3); border:1px solid var(--border-light); border-radius:12px; padding:1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:0.5rem;">
            <span style="font-size:0.875rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">
              <i class="fa-solid fa-bars-progress" style="color:var(--primary); margin-right:4px;"></i> Umumiy Akademiya Progressi
            </span>
            <span id="training-progress-pct" style="font-size:1.4rem; font-weight:800; color:var(--secondary);">0%</span>
          </div>
          <div class="rate-meter-track" style="height:10px; border-radius:6px; background:rgba(0,0,0,0.5);">
            <div id="training-progress-fill" class="rate-meter-fill fill-winrate-god" style="width:0%;"></div>
          </div>
          <span id="training-progress-count" style="display:block; margin-top:0.5rem; font-size:0.8rem; color:var(--text-muted);">
            0 / 50 band bajarildi
          </span>
        </div>
      </div>

      <!-- MAIN SUBTABS (TEAM PROGRAM VS PERSONAL PLAYBOOK) -->
      <div class="tabs mb-4" id="trainingHubSubTabs">
        <button class="tab-btn ${this.currentSubTab === 'team-program' ? 'active' : ''}" data-subtab="team-program">
          <i class="fa-solid fa-users-gear"></i> 1. Jamoa Rivojlanish Dasturi (12 Hafta & Cheklistlar)
        </button>
        <button class="tab-btn ${this.currentSubTab === 'personal-playbook' ? 'active' : ''}" data-subtab="personal-playbook">
          <i class="fa-solid fa-book-skull"></i> 2. Shaxsiy Mashg'ulot Yo'riqnomasi (heavenlyyy Playbook)
        </button>
      </div>

      <!-- CONTAINER 1: TEAM PROGRAM -->
      <div id="trainingTeamProgramView" class="${this.currentSubTab === 'team-program' ? '' : 'hidden'}">
        <!-- SUB-NAV FOR TEAM PROGRAM -->
        <div class="tabs mb-4" id="teamProgramSubTabs" style="border-bottom:1px solid var(--border-light); padding-bottom:0.5rem;">
          <button class="tab-btn ${this.currentTeamTab === 'roadmap' ? 'active' : ''}" data-tab="roadmap"><i class="fa-solid fa-map-location-dot"></i> 4 Bosqichli Yo'l</button>
          <button class="tab-btn ${this.currentTeamTab === 'weekly' ? 'active' : ''}" data-tab="weekly"><i class="fa-solid fa-calendar-days"></i> Haftalik Jadval</button>
          <button class="tab-btn ${this.currentTeamTab === 'roles' ? 'active' : ''}" data-tab="roles"><i class="fa-solid fa-user-ninja"></i> Rol Asoslari</button>
          <button class="tab-btn ${this.currentTeamTab === 'team' ? 'active' : ''}" data-tab="team"><i class="fa-solid fa-handshake"></i> Jamoaviy Ko'nikmalar</button>
          <button class="tab-btn ${this.currentTeamTab === 'strategy' ? 'active' : ''}" data-tab="strategy"><i class="fa-solid fa-chess"></i> Strategiya & Draft</button>
          <button class="tab-btn ${this.currentTeamTab === 'coach' ? 'active' : ''}" data-tab="coach"><i class="fa-solid fa-user-tie"></i> Murabbiy + Flex</button>
        </div>

        <div id="teamProgramContent"></div>
      </div>

      <!-- CONTAINER 2: PERSONAL PLAYBOOK -->
      <div id="trainingPersonalPlaybookView" class="${this.currentSubTab === 'personal-playbook' ? '' : 'hidden'}">
        <div id="personalPlaybookContent"></div>
      </div>
    `;

    // Bind subtab switches
    container.querySelectorAll('#trainingHubSubTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        container.querySelectorAll('#trainingHubSubTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSubTab = btn.dataset.subtab;

        const teamView = document.getElementById('trainingTeamProgramView');
        const playView = document.getElementById('trainingPersonalPlaybookView');
        if (teamView) teamView.classList.toggle('hidden', this.currentSubTab !== 'team-program');
        if (playView) playView.classList.toggle('hidden', this.currentSubTab !== 'personal-playbook');

        if (this.currentSubTab === 'team-program') {
          this.renderTeamProgramContent();
        } else {
          this.renderPersonalPlaybookContent();
        }
      });
    });

    // Reset button
    document.getElementById('training-reset-btn')?.addEventListener('click', () => this.resetProgress());

    // Render initial subview
    if (this.currentSubTab === 'team-program') {
      this.renderTeamProgramContent();
    } else {
      this.renderPersonalPlaybookContent();
    }

    this.updateProgressSummary();
  }

  // --- SUBVIEW 1: TEAM PROGRAM CONTENT ---
  renderTeamProgramContent() {
    const container = document.getElementById('teamProgramContent');
    if (!container) return;

    const navTabs = document.querySelectorAll('#teamProgramSubTabs .tab-btn');
    navTabs.forEach(btn => {
      btn.onclick = () => {
        navTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTeamTab = btn.dataset.tab;
        this.renderTeamProgramTab();
      };
    });

    this.renderTeamProgramTab();
  }

  renderTeamProgramTab() {
    const container = document.getElementById('teamProgramContent');
    if (!container) return;

    switch (this.currentTeamTab) {
      case 'roadmap':
        this.renderRoadmap(container);
        break;
      case 'weekly':
        this.renderWeekly(container);
        break;
      case 'roles':
        this.renderRoleChecklists(container);
        break;
      case 'team':
        this.renderSimpleChecklist(container, "Jamoaviy Ko'nikmalar", "5 kishi bir kishidek harakat qilishi, kommandalar intizomi va jamoaviy ruh.", this.teamItems, 'team');
        break;
      case 'strategy':
        this.renderSimpleChecklist(container, "Strategiya & Draft (Pick-Ban)", "G'alaba ko'pincha pick-ban ekranida boshlanadi. Kompozitsiya va counter-pick ko'nikmalari.", this.strategyItems, 'strategy');
        break;
      case 'coach':
        this.renderSimpleChecklist(container, "Murabbiy & Flex O'yinchi", "Jamoa direktori, murabbiy va o'rinbosar flex o'yinchi sifatida o'z ustingizda ishlash qoidalari.", this.coachItems, 'coach');
        break;
    }
  }

  renderRoadmap(container) {
    let html = `
      <div class="card mb-4">
        <h3 class="card-title mb-2"><i class="fa-solid fa-map-location-dot" style="color:var(--primary);"></i> 4 Bosqichli Rivojlanish Yo'l Xaritasi</h3>
        <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:1.25rem;">
          Har bir bosqichga bosing — to'g'ridan-to'g'ri tegishli mashg'ulot bo'limiga o'tasiz.
        </p>

        <div style="display:flex; flex-direction:column; gap:1rem;">
    `;

    this.roadmapPhases.forEach((p, idx) => {
      html += `
        <div class="phase-card" data-tab="${p.tab}" style="position:relative; background:rgba(0,0,0,0.3); border:1px solid var(--border-light); border-radius:12px; padding:1.25rem; cursor:pointer; transition:all 0.2s ease;">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <span style="background:rgba(255,215,0,0.15); color:var(--secondary); font-weight:800; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,215,0,0.3);">
                ${idx}
              </span>
              <h4 style="color:var(--text-primary); font-size:1.15rem; margin:0;">${p.title}</h4>
            </div>
            <span class="badge" style="background:rgba(0,212,255,0.15); color:var(--primary); border:1px solid rgba(0,212,255,0.3); font-size:0.8rem;">
              ${p.weeks}
            </span>
          </div>
          <p style="color:var(--text-secondary); font-size:0.9rem; margin:0 0 0.75rem 0; line-height:1.5;">${p.goal}</p>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:0.75rem;">
              Asosiy diqqat: <strong style="color:var(--secondary);">${p.focus}</strong>
            </span>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.phase-card').forEach(card => {
      card.addEventListener('click', () => {
        const targetTab = card.dataset.tab;
        const subTabBtn = document.querySelector(`#teamProgramSubTabs .tab-btn[data-tab="${targetTab}"]`);
        if (subTabBtn) subTabBtn.click();
      });
    });
  }

  renderWeekly(container) {
    let phaseBtnsHtml = this.weeklyPhases.map((p, idx) => `
      <button class="filter-chip ${idx === this.currentWeekPhase ? 'active' : ''}" data-phase="${idx}">
        <i class="fa-regular fa-calendar-check"></i> ${p.label}
      </button>
    `).join('');

    const currentPhase = this.weeklyPhases[this.currentWeekPhase];

    let daysHtml = currentPhase.days.map(([day, act]) => `
      <div class="card" style="background:rgba(0,0,0,0.25); border:1px solid var(--border-light); padding:1rem;">
        <div style="color:var(--secondary); font-weight:800; font-size:0.95rem; margin-bottom:0.4rem;">
          <i class="fa-solid fa-clock" style="margin-right:4px;"></i> ${day}
        </div>
        <div style="font-size:0.875rem; color:var(--text-secondary); line-height:1.45;">${act}</div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="card mb-4">
        <h3 class="card-title mb-2"><i class="fa-solid fa-calendar-days" style="color:var(--primary);"></i> Haftalik Mashg'ulot & Scrim Jadvali</h3>
        <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:1rem;">
          Namuna jadval — jamoangizning o'qish, ish va namoz vaqtlariga moslab sozlang. Har bir bosqichda individual mashq va jamoaviy 5v5 Scrim nisbati o'zgarib boradi.
        </p>

        <div class="filter-bar mb-3">
          <label>Bosqichni tanlang:</label>
          ${phaseBtnsHtml}
        </div>

        <div style="background:rgba(0,212,255,0.05); border:1px solid rgba(0,212,255,0.2); border-radius:8px; padding:0.75rem 1rem; margin-bottom:1.25rem; font-size:0.875rem; color:var(--primary);">
          <i class="fa-solid fa-circle-info"></i> <strong>Bosqich tavsifi:</strong> ${currentPhase.note}
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem;">
          ${daysHtml}
        </div>
      </div>
    `;

    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        this.currentWeekPhase = parseInt(e.currentTarget.dataset.phase);
        this.renderWeekly(container);
      });
    });
  }

  renderRoleChecklists(container) {
    const roleKeys = Object.keys(this.roleData);
    let roleBtnsHtml = roleKeys.map(k => {
      const r = this.roleData[k];
      return `
        <button class="filter-chip ${k === this.currentRole ? 'active' : ''}" data-role="${k}" style="border-color:${r.color};">
          <i class="fa-solid ${r.icon}" style="color:${r.color};"></i> ${r.name}
        </button>
      `;
    }).join('');

    const currentR = this.roleData[this.currentRole];

    let itemsHtml = currentR.items.map((itemText, idx) => {
      const key = this.keyFor('role', idx, this.currentRole);
      const isChecked = !!this.state[key];
      return `
        <div class="check-item ${isChecked ? 'checked' : ''}" data-key="${key}" style="display:flex; align-items:flex-start; gap:0.75rem; background:rgba(0,0,0,0.3); border:1px solid ${isChecked ? 'rgba(16,185,129,0.4)' : 'var(--border-light)'}; border-radius:10px; padding:0.9rem 1.1rem; cursor:pointer; transition:all 0.2s ease; margin-bottom:0.6rem;">
          <div class="check-box" style="width:22px; height:22px; border-radius:6px; border:2px solid ${isChecked ? 'var(--success)' : 'var(--text-muted)'}; background:${isChecked ? 'var(--success)' : 'transparent'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;">
            ${isChecked ? '<i class="fa-solid fa-check" style="color:#000; font-size:0.75rem;"></i>' : ''}
          </div>
          <div class="check-text" style="font-size:0.925rem; line-height:1.5; color:${isChecked ? 'var(--text-muted)' : 'var(--text-primary)'}; ${isChecked ? 'text-decoration:line-through;' : ''}">
            ${itemText}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="card mb-4">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
          <div>
            <h3 class="card-title mb-1"><i class="fa-solid fa-user-ninja" style="color:var(--secondary);"></i> Rol Asoslari Cheklisti</h3>
            <p style="color:var(--text-muted); font-size:0.875rem; margin:0;">
              Rolni tanlang va ushbu chiziqda o'yinchi egallashi shart bo'lgan bazaviy ko'nikmalarni belgilab boring.
            </p>
          </div>
        </div>

        <div class="filter-bar mb-3">
          ${roleBtnsHtml}
        </div>

        <div style="background:rgba(255,255,255,0.02); border-left:4px solid ${currentR.color}; border-radius:0 8px 8px 0; padding:0.6rem 1rem; margin-bottom:1.25rem;">
          <strong style="color:${currentR.color}; font-size:1.05rem;">${currentR.name}</strong>
          <span style="color:var(--text-muted); font-size:0.85rem; margin-left:0.5rem;">— ${currentR.tag}</span>
        </div>

        <div class="checklist-container">
          ${itemsHtml}
        </div>
      </div>
    `;

    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        this.currentRole = e.currentTarget.dataset.role;
        this.renderRoleChecklists(container);
      });
    });

    container.querySelectorAll('.check-item').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.dataset.key;
        this.toggleCheckItem(k, el);
        this.renderRoleChecklists(container);
      });
    });
  }

  renderSimpleChecklist(container, title, desc, items, sectionKey) {
    let itemsHtml = items.map((itemText, idx) => {
      const key = this.keyFor(sectionKey, idx);
      const isChecked = !!this.state[key];
      return `
        <div class="check-item ${isChecked ? 'checked' : ''}" data-key="${key}" style="display:flex; align-items:flex-start; gap:0.75rem; background:rgba(0,0,0,0.3); border:1px solid ${isChecked ? 'rgba(16,185,129,0.4)' : 'var(--border-light)'}; border-radius:10px; padding:0.9rem 1.1rem; cursor:pointer; transition:all 0.2s ease; margin-bottom:0.6rem;">
          <div class="check-box" style="width:22px; height:22px; border-radius:6px; border:2px solid ${isChecked ? 'var(--success)' : 'var(--text-muted)'}; background:${isChecked ? 'var(--success)' : 'transparent'}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;">
            ${isChecked ? '<i class="fa-solid fa-check" style="color:#000; font-size:0.75rem;"></i>' : ''}
          </div>
          <div class="check-text" style="font-size:0.925rem; line-height:1.5; color:${isChecked ? 'var(--text-muted)' : 'var(--text-primary)'}; ${isChecked ? 'text-decoration:line-through;' : ''}">
            ${itemText}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="card mb-4">
        <h3 class="card-title mb-1"><i class="fa-solid fa-list-check" style="color:var(--primary);"></i> ${title}</h3>
        <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:1.25rem;">${desc}</p>
        <div class="checklist-container">
          ${itemsHtml}
        </div>
      </div>
    `;

    container.querySelectorAll('.check-item').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.dataset.key;
        this.toggleCheckItem(k, el);
        this.renderSimpleChecklist(container, title, desc, items, sectionKey);
      });
    });
  }

  // --- SUBVIEW 2: PERSONAL PLAYBOOK CONTENT ---
  renderPersonalPlaybookContent() {
    const container = document.getElementById('personalPlaybookContent');
    if (!container) return;

    const roleKeys = Object.keys(this.personalPlaybook);
    let tabBtnsHtml = roleKeys.map(k => {
      const g = this.personalPlaybook[k];
      const isPrimary = g.badge === 'primary';
      return `
        <button class="filter-chip ${k === this.currentPlaybookTab ? 'active' : ''} ${isPrimary ? 'primary-chip' : ''}" data-role="${k}" style="${isPrimary ? 'border-color:var(--secondary); font-weight:bold;' : ''}">
          ${isPrimary ? '<i class="fa-solid fa-crown" style="color:var(--secondary);"></i>' : ''}
          ${g.label}
        </button>
      `;
    }).join('');

    const currentGuide = this.personalPlaybook[this.currentPlaybookTab];

    const makeCards = (title, num, items, borderAccent = 'var(--primary)') => {
      if (!items || items.length === 0) return '';
      return `
        <div class="mb-4">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
            <span style="background:rgba(255,255,255,0.08); color:var(--secondary); font-weight:800; font-size:0.8rem; padding:2px 8px; border-radius:6px;">${num}</span>
            <h4 style="font-size:1.2rem; color:var(--text-primary); margin:0;">${title}</h4>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
            ${items.map(it => `
              <div class="card" style="background:rgba(0,0,0,0.3); border:1px solid var(--border-light); border-top:3px solid ${borderAccent}; padding:1.1rem;">
                <h5 style="color:var(--secondary); font-size:1rem; margin-bottom:0.4rem;"><i class="fa-solid fa-circle-dot" style="font-size:0.65rem; margin-right:4px;"></i> ${it.t}</h5>
                <p style="color:var(--text-secondary); font-size:0.875rem; line-height:1.55; margin:0;">${it.d}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    const makeDrills = (title, num, drills) => {
      if (!drills || drills.length === 0) return '';
      return `
        <div class="mb-4">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
            <span style="background:rgba(255,255,255,0.08); color:var(--secondary); font-weight:800; font-size:0.8rem; padding:2px 8px; border-radius:6px;">${num}</span>
            <h4 style="font-size:1.2rem; color:var(--text-primary); margin:0;">${title}</h4>
          </div>
          <div class="card" style="background:rgba(0,0,0,0.3); border:1px solid var(--border-light); padding:1rem;">
            ${drills.map(d => `
              <div style="display:flex; align-items:flex-start; gap:0.75rem; padding:0.6rem 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.9rem; color:var(--text-primary);">
                <i class="fa-solid fa-arrow-right" style="color:var(--success); margin-top:3px;"></i>
                <span>${d}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    container.innerHTML = `
      <div class="card mb-4">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
          <div>
            <h3 class="card-title mb-1"><i class="fa-solid fa-book-skull" style="color:var(--secondary);"></i> heavenlyyy — Shaxsiy Mashg'ulot & Rol Yo'riqnomasi</h3>
            <p style="color:var(--text-muted); font-size:0.875rem; margin:0;">
              Direktor, murabbiy va Roam asosiy o'yinchisi sifatida Micro, Macro, Timing va Advanced strategiyalar.
            </p>
          </div>
        </div>

        <div class="filter-bar mb-3">
          ${tabBtnsHtml}
        </div>

        ${currentGuide.note ? `
          <div style="background:rgba(255,215,0,0.06); border:1px solid rgba(255,215,0,0.25); border-radius:8px; padding:0.75rem 1rem; margin-bottom:1.5rem; font-size:0.875rem; color:var(--secondary);">
            <i class="fa-solid fa-lightbulb"></i> <strong>Eslatma:</strong> ${currentGuide.note}
          </div>
        ` : ''}

        ${makeCards("01. Micro Ko'nikmalar", "MICRO", currentGuide.micro, "var(--primary)")}
        ${makeCards("02. Macro & Xarita Taktikasi", "MACRO", currentGuide.macro, "var(--secondary)")}
        ${makeCards("03. Timing & Taymerlar", "TIMING", currentGuide.timing, "#f59e0b")}
        ${makeCards("04. Advanced Professional Taktikalar", "ADVANCED", currentGuide.advanced, "var(--success)")}
        ${makeDrills("05. Haftalik Amaliy Mashqlar (Drills)", "DRILLS", currentGuide.drills)}
      </div>
    `;

    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        this.currentPlaybookTab = e.currentTarget.dataset.role;
        this.renderPersonalPlaybookContent();
      });
    });
  }
};
