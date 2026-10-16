/**
 * 日記去識別化與反向還原（PII Masking & Restoring）
 *
 *   sanitize(原文) → { masked, mapping }   // masked 才可送往 LLM
 *   restore(LLM 回覆, mapping) → 還原真實名稱 // 寫入資料庫與回傳前端前執行
 *
 * 偵測分三層，全部在「原文」上找出候選片段，再依優先序解決重疊：
 *   1. Regex：Email、身分證/居留證、信用卡（Luhn）、電話、精確日期、長串號碼
 *   2. 自訂私密詞：使用者指定一定要遮蔽的詞
 *   3. 啟發式 NER：人名（姓氏 + 稱謂 / 語境線索）、機構（字典 + 後綴）、地點（縣市 + 區/路後綴）
 *
 * mapping 只應存在於單次請求的記憶體中，不可寫入資料庫或日誌。
 * 限制：啟發式規則無法涵蓋所有人名與地名（例如沒有稱謂、沒有語境線索的名字），
 * 寧可多遮也不少遮；漏網的情況可透過 customTerms 補強。
 */

export type EntityType =
  | "PERSON"
  | "ORG"
  | "LOC"
  | "PHONE"
  | "EMAIL"
  | "NATIONAL_ID"
  | "CREDIT_CARD"
  | "DATE"
  | "NUMBER";

export const TOKEN_LABELS: Record<EntityType, string> = {
  PERSON: "人名",
  ORG: "公司",
  LOC: "地點",
  PHONE: "電話",
  EMAIL: "信箱",
  NATIONAL_ID: "身分證",
  CREDIT_CARD: "卡號",
  DATE: "日期",
  NUMBER: "號碼",
};

// LLM 自行捏造了對照表中不存在的代號時，以中性詞替代，避免使用者看到方括號代號
const FALLBACK_TEXT: Record<EntityType, string> = {
  PERSON: "對方",
  ORG: "那個單位",
  LOC: "那個地方",
  PHONE: "那支電話",
  EMAIL: "那個信箱",
  NATIONAL_ID: "證件號碼",
  CREDIT_CARD: "卡號",
  DATE: "那一天",
  NUMBER: "那組號碼",
};

const LABEL_TO_TYPE = Object.fromEntries(
  Object.entries(TOKEN_LABELS).map(([type, label]) => [label, type as EntityType]),
) as Record<string, EntityType>;

export type MappingTable = Record<string, string>; // { "[人名_1]": "王經理" }

export type CustomTerm = { term: string; type: EntityType };

export type SanitizeResult = {
  masked: string;
  mapping: MappingTable;
  /** 各類實體遮蔽數量，可安全寫入日誌（不含原文） */
  stats: Partial<Record<EntityType, number>>;
};

type Span = { start: number; end: number; type: EntityType; priority: number };

// ---------------------------------------------------------------------------
// 第一層：Regex
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 身分證（第二碼 1/2）與新式居留證（第二碼 8/9）
const NATIONAL_ID_RE = /(?<![A-Za-z0-9])[A-Za-z][1289]\d{8}(?![A-Za-z0-9])/g;
const MOBILE_RE = /(?<!\d)(?:\+886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g;
const LANDLINE_RE = /(?<!\d)(?:\(0\d{1,2}\)|0[2-8]\d?)[-\s]?\d{3,4}[-\s]?\d{4}(?:\s*(?:#|分機)\s*\d{1,5})?(?!\d)/g;
const CARD_CANDIDATE_RE = /(?<!\d)(?:\d[-\s]?){12,18}\d(?!\d)/g;
const LONG_NUMBER_RE = /(?<!\d)\d{8,}(?!\d)/g;
const DATE_RES = [
  // 2024年3月15日、2024/03/15、2024-3-15、民國113年3月15日
  /(?:民國\s*)?\d{2,4}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2}(?:\s*[日號])?/g,
  // 3月15日、3月15號
  /(?<!\d)\d{1,2}\s*月\s*\d{1,2}\s*[日號]/g,
];

/** 台灣身分證檢查碼：英文字母代碼 + 各位數加權後總和需為 10 的倍數 */
export function isValidTaiwanId(id: string): boolean {
  const LETTER_CODES = "ABCDEFGHJKLMNPQRSTUVXYWZIO"; // 依序對應 10 ~ 35
  const upper = id.toUpperCase();
  if (!/^[A-Z][1289]\d{8}$/.test(upper)) return false;
  const code = LETTER_CODES.indexOf(upper[0]) + 10;
  const digits = upper.slice(1).split("").map(Number);
  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  let sum = Math.floor(code / 10) + (code % 10) * 9;
  for (let i = 0; i < 8; i++) sum += digits[i] * weights[i];
  sum += digits[8];
  return sum % 10 === 0;
}

export function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

function regexSpans(text: string): Span[] {
  const spans: Span[] = [];
  const push = (re: RegExp, type: EntityType, priority: number, accept?: (m: string) => boolean) => {
    for (const m of text.matchAll(re)) {
      if (accept && !accept(m[0])) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, type, priority });
    }
  };

  push(EMAIL_RE, "EMAIL", 100);
  // 格式符合即遮蔽（寧可多遮），檢查碼僅用於測試與未來的信心分數
  push(NATIONAL_ID_RE, "NATIONAL_ID", 95);
  push(CARD_CANDIDATE_RE, "CREDIT_CARD", 90, (m) => isLuhnValid(m.replace(/\D/g, "")));
  push(MOBILE_RE, "PHONE", 85);
  push(LANDLINE_RE, "PHONE", 85);
  for (const re of DATE_RES) push(re, "DATE", 80);
  // 其他長串號碼（帳號、訂單、未通過 Luhn 的卡號）
  push(LONG_NUMBER_RE, "NUMBER", 70);
  return spans;
}

// ---------------------------------------------------------------------------
// 第三層：啟發式 NER
// ---------------------------------------------------------------------------

const COMPOUND_SURNAMES = ["歐陽", "司馬", "諸葛", "上官", "張簡", "范姜", "張廖", "簡廖", "東方"];
const SINGLE_SURNAMES =
  "陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯孫魏翁戴范宋方鄧杜傅侯曹溫薛丁馬蔣唐卓藍馮姚石董紀歐程連古汪湯姜田康鄒白涂尤巫韓龔嚴袁鍾黎金阮陸倪夏童邵柳";

// 以姓氏字開頭、但其實是常用詞的組合，命中時不視為人名
const SURNAME_FALSE_FRIENDS = [
  "許多", "許久", "曾經", "周末", "周圍", "周遭", "高中", "高興", "高層", "高雄", "高鐵", "高速", "方便", "方法",
  "方向", "方式", "方面", "何時", "何必", "何況", "文件", "白天", "白色", "金錢", "金額", "石頭", "江湖", "林口",
  "黃金", "溫度", "溫柔", "溫暖", "馬上", "馬路", "夏天", "童年", "程度", "程式", "連續", "連絡", "連結", "古代",
  "田野", "康復", "嚴重", "嚴格", "袁", "陸續", "柳", "游泳", "施工", "沈默", "戴著", "石化", "姚", "傅", "卓越",
  "藍色", "紀錄", "紀念", "歐洲", "湯匙", "唐突", "孫子", "龔", "朱", "杜", "余", "曹", "董事", "邱", "易",
];

// 常見功能詞與動詞：人名與機構/地點前綴不會包含這些字
// 「大、小、中、明」雖常見於功能詞，但也常出現在人名與地名（陳小美、志明、台大、中山路），故不列入
const STOP_CHARS =
  "的了是在有和跟與被把對說講叫問找給讓去來到要會想很也都又還就才而但並及或嗎呢吧啊喔哦啦耶我你妳他她它們這那個些一不沒今昨天早晚上下午裡外前後時候吵聊吃喝看見罵笑哭走打傳約碰遇面起過著得地家班條間所幾某該每多少新舊回從離";

const HAN_NOT_STOP = `(?:(?![${STOP_CHARS}])\\p{Script=Han})`;
const SURNAME = `(?:${COMPOUND_SURNAMES.join("|")}|[${SINGLE_SURNAMES}])`;

// 稱謂由長到短排列，確保「總經理」優先於「總」、「小姐」優先於「姐」
const TITLES = [
  "董事長", "總經理", "執行長", "副總", "總監", "經理", "副理", "協理", "主任", "主管", "老闆", "老師", "教授",
  "醫師", "醫生", "護理師", "心理師", "律師", "會計師", "組長", "課長", "處長", "部長", "科長", "店長", "學長",
  "學姊", "學姐", "學弟", "學妹", "同學", "先生", "小姐", "太太", "媽媽", "爸爸", "阿姨", "叔叔", "伯伯",
  "奶奶", "爺爺", "阿嬤", "阿公", "姊", "姐", "哥", "董", "總",
];

// 姓氏 + 0~2 字名 + 稱謂：王經理、陳小美老師
const PERSON_TITLE_RE = new RegExp(`${SURNAME}${HAN_NOT_STOP}{0,2}?(?:${TITLES.join("|")})`, "gu");

// 語境線索 + 姓氏 + 1~2 字名：跟陳志明吵架、被林雅婷罵
// 不含「對」：「對方覺得」會被誤判為姓方的人
const PERSON_CUES = [
  "跟", "和", "與", "被", "叫", "找", "問", "告訴", "給", "讓", "幫", "陪", "同事", "朋友", "男友",
  "女友", "老公", "老婆", "前任", "室友", "主管", "老闆", "客戶", "閨蜜", "兄弟",
];
const PERSON_CUE_RE = new RegExp(
  `(?<=${PERSON_CUES.join("|")})${SURNAME}${HAN_NOT_STOP}{1,2}`,
  "gu",
);

// 小名：小美說、阿明又… —— 僅在後面接常見動作時才判定，避免「小心」「阿姨」
const NICKNAME_RE =
  /(?:小|阿)(?![心時孩朋姐姊姨伯公嬤婆嬸舅孩事說])\p{Script=Han}(?=說|講|跟|和|今天|昨天|又|一直|都|也|問|叫|傳|打|罵|笑|哭|約|找|覺得|好像)/gu;

// 語境線索 + 小名：打給小美（、跟阿哲去
const NICKNAME_CUE_RE = new RegExp(
  `(?<=${PERSON_CUES.join("|")})(?:小|阿)(?![心時孩朋姐姊姨伯公嬤婆嬸舅事說費忙組吃點])\\p{Script=Han}`,
  "gu",
);

// 語境線索 + 英文名：跟 Kevin 吵架
const PERSON_LATIN_RE = new RegExp(`(?<=(?:${PERSON_CUES.join("|")})\\s?)[A-Z][a-z]{2,}`, "g");

const KNOWN_ORGS = [
  "台積電", "鴻海", "聯發科", "中華電信", "台灣大哥大", "遠傳", "華碩", "宏碁", "廣達", "仁寶", "和碩", "國泰",
  "富邦", "中信", "玉山", "台新", "長榮", "華航", "統一", "全聯", "全家", "萊爾富", "7-11", "家樂福", "蝦皮",
  "momo", "台大", "清大", "交大", "陽明交大", "成大", "政大", "師大", "台科大", "北科大", "Google", "Microsoft",
  "Apple", "Amazon", "Meta", "Netflix", "Nvidia", "輝達", "微軟", "谷歌",
];
const ORG_SUFFIXES = [
  "股份有限公司", "有限公司", "公司", "集團", "企業", "銀行", "醫院", "診所", "大學", "高中", "國中", "國小",
  "學院", "科技", "電子", "事務所", "基金會", "協會", "工作室", "出版社", "百貨", "補習班",
];
// 前綴需 2~6 個非功能字，避免「去公司」「這家公司」被誤判
const ORG_SUFFIX_RE = new RegExp(`${HAN_NOT_STOP}{2,6}(?:${ORG_SUFFIXES.join("|")})+`, "gu");

const COUNTIES = [
  "台北", "臺北", "新北", "桃園", "新竹", "苗栗", "台中", "臺中", "彰化", "南投", "雲林", "嘉義", "台南", "臺南",
  "高雄", "屏東", "宜蘭", "花蓮", "台東", "臺東", "澎湖", "金門", "馬祖", "連江", "基隆",
];
const COUNTY_RE = new RegExp(`(?:${COUNTIES.join("|")})(?:市|縣)?`, "g");
// 信義區、竹北市、礁溪鄉
const DISTRICT_RE = new RegExp(`${HAN_NOT_STOP}{2}(?:區|鄉|鎮)`, "gu");
// 中山北路二段 15 巷 3 號 5 樓
const ROAD_RE = new RegExp(
  `${HAN_NOT_STOP}{2,4}(?:路|街|大道)(?:\\s*[\\d一二三四五六七八九十]+\\s*段)?(?:\\s*\\d+\\s*巷)?(?:\\s*\\d+\\s*弄)?(?:\\s*\\d+\\s*號)?(?:\\s*\\d+\\s*樓)?`,
  "gu",
);
// 捷運/車站名：市府站、板橋站
const STATION_RE = new RegExp(`${HAN_NOT_STOP}{2,4}(?:捷運站|車站|站)(?![長務])`, "gu");

function startsWithFalseFriend(candidate: string): boolean {
  return SURNAME_FALSE_FRIENDS.some((w) => candidate.startsWith(w));
}

function nerSpans(text: string): Span[] {
  const spans: Span[] = [];
  const push = (re: RegExp, type: EntityType, priority: number, accept?: (m: string) => boolean) => {
    for (const m of text.matchAll(re)) {
      if (accept && !accept(m[0])) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, type, priority });
    }
  };
  const notFalseFriend = (m: string) => !startsWithFalseFriend(m);

  for (const org of KNOWN_ORGS) {
    push(new RegExp(escapeRegExp(org), "gi"), "ORG", 50);
  }
  push(ORG_SUFFIX_RE, "ORG", 50);

  push(COUNTY_RE, "LOC", 45);
  push(DISTRICT_RE, "LOC", 45);
  push(ROAD_RE, "LOC", 45);
  push(STATION_RE, "LOC", 45);

  push(PERSON_TITLE_RE, "PERSON", 40, notFalseFriend);
  push(PERSON_CUE_RE, "PERSON", 40, notFalseFriend);
  push(NICKNAME_RE, "PERSON", 40);
  push(NICKNAME_CUE_RE, "PERSON", 40);
  push(PERSON_LATIN_RE, "PERSON", 40);
  return spans;
}

// ---------------------------------------------------------------------------
// 合併、代號化與還原
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function customSpans(text: string, terms: CustomTerm[]): Span[] {
  const spans: Span[] = [];
  for (const { term, type } of terms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    for (const m of text.matchAll(new RegExp(escapeRegExp(trimmed), "gi"))) {
      spans.push({ start: m.index, end: m.index + m[0].length, type, priority: 60 });
    }
  }
  return spans;
}

/** 依優先序（同優先序則取較長者）挑出互不重疊的片段 */
function resolveOverlaps(spans: Span[]): Span[] {
  const ordered = [...spans].sort(
    (a, b) => b.priority - a.priority || b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const accepted: Span[] = [];
  for (const span of ordered) {
    if (accepted.every((s) => span.end <= s.start || span.start >= s.end)) {
      accepted.push(span);
    }
  }
  return accepted.sort((a, b) => a.start - b.start);
}

export function sanitize(text: string, options: { customTerms?: CustomTerm[] } = {}): SanitizeResult {
  const spans = resolveOverlaps([
    ...regexSpans(text),
    ...customSpans(text, options.customTerms ?? []),
    ...nerSpans(text),
  ]);

  const mapping: MappingTable = {};
  const tokenBySurface = new Map<string, string>();
  const counters: Partial<Record<EntityType, number>> = {};

  let masked = "";
  let cursor = 0;
  for (const span of spans) {
    const surface = text.slice(span.start, span.end);
    // 同類型、同字面的實體共用一個代號（忽略大小寫與空白差異）
    const key = `${span.type}:${surface.toLowerCase().replace(/\s+/g, "")}`;
    let token = tokenBySurface.get(key);
    if (!token) {
      counters[span.type] = (counters[span.type] ?? 0) + 1;
      token = `[${TOKEN_LABELS[span.type]}_${counters[span.type]}]`;
      tokenBySurface.set(key, token);
      mapping[token] = surface;
    }
    masked += text.slice(cursor, span.start) + token;
    cursor = span.end;
  }
  masked += text.slice(cursor);

  return { masked, mapping, stats: counters };
}

// 容忍 LLM 改寫代號格式：全形括號、【】、底線變成空白或連字號、甚至省略底線
const TOKEN_IN_OUTPUT_RE = new RegExp(
  `[\\[［【]\\s*(${Object.values(TOKEN_LABELS).join("|")})\\s*[_＿\\-－\\s]?\\s*(\\d+)\\s*[\\]］】]`,
  "g",
);

export function restore(text: string, mapping: MappingTable): string {
  return text.replace(TOKEN_IN_OUTPUT_RE, (_whole, label: string, num: string) => {
    const canonical = `[${label}_${Number(num)}]`;
    return mapping[canonical] ?? FALLBACK_TEXT[LABEL_TO_TYPE[label]];
  });
}
