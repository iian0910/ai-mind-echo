import { describe, expect, it } from "vitest";
import {
  isLuhnValid,
  isValidTaiwanId,
  restore,
  sanitize,
} from "@/lib/piiSanitizer";

// 斷言原文片段已被遮蔽，且對照表能還原
function expectMasked(text: string, surface: string, label: string) {
  const { masked, mapping } = sanitize(text);
  expect(masked).not.toContain(surface);
  const token = Object.keys(mapping).find((t) => mapping[t] === surface);
  expect(token, `「${surface}」應被遮蔽，實際：${masked}`).toBeDefined();
  expect(token).toMatch(new RegExp(`^\\[${label}_\\d+\\]$`));
}

describe("第一層：Regex", () => {
  it.each([
    ["請寄到 amy.chen@example.com 給我", "amy.chen@example.com", "信箱"],
    ["他的身分證是 A123456789", "A123456789", "身分證"],
    ["手機 0912-345-678 打不通", "0912-345-678", "電話"],
    ["打 0912345678 給我", "0912345678", "電話"],
    ["國際碼 +886 912 345 678", "+886 912 345 678", "電話"],
    ["公司電話 02-2345-6789 分機 123", "02-2345-6789 分機 123", "電話"],
    ["刷了 4111 1111 1111 1111 這張卡", "4111 1111 1111 1111", "卡號"],
    ["2024年3月15日那天", "2024年3月15日", "日期"],
    ["約在 2024/03/15 見面", "2024/03/15", "日期"],
    ["3月15號要交報告", "3月15號", "日期"],
    ["訂單編號 123456789012", "123456789012", "號碼"],
  ])("「%s」遮蔽 %s", (text, surface, label) => {
    expectMasked(text, surface, label);
  });

  it("未通過 Luhn 的長串數字歸為一般號碼而非卡號", () => {
    const { mapping } = sanitize("帳號 1234567812345678");
    expect(mapping).toEqual({ "[號碼_1]": "1234567812345678" });
  });

  it("一般數字不遮蔽", () => {
    expect(sanitize("今天走了 8000 步，喝了 3 杯水").masked).toBe(
      "今天走了 8000 步，喝了 3 杯水",
    );
  });
});

describe("檢查碼工具", () => {
  it("台灣身分證", () => {
    expect(isValidTaiwanId("A123456789")).toBe(true);
    expect(isValidTaiwanId("A123456788")).toBe(false);
    expect(isValidTaiwanId("A323456789")).toBe(false);
  });

  it("Luhn", () => {
    expect(isLuhnValid("4111111111111111")).toBe(true);
    expect(isLuhnValid("4111111111111112")).toBe(false);
    expect(isLuhnValid("0")).toBe(false);
  });
});

describe("第三層：啟發式 NER", () => {
  it.each([
    ["今天又被王經理罵了", "王經理", "人名"],
    ["陳小美老師說我進步了", "陳小美老師", "人名"],
    ["跟陳志明吵了一架", "陳志明", "人名"],
    ["小美說她也很累", "小美", "人名"],
    ["晚上打給小美（她最懂我）", "小美", "人名"],
    ["跟 Kevin 聊到很晚", "Kevin", "人名"],
    ["歐陽娜娜老師很溫柔", "歐陽娜娜老師", "人名"],
    ["陳志明今天很煩", "陳志明", "人名"],
    ["工作好累。林雅婷又把報告丟給我", "林雅婷", "人名"],
    ["結果黃建宏竟然沒來", "黃建宏", "人名"],
    ["Kevin 說我做不好", "Kevin", "人名"],
    ["結果 Amy 又遲到", "Amy", "人名"],
  ])("人名：「%s」", (text, surface, label) => {
    expectMasked(text, surface, label);
  });

  it.each([
    ["我在台積電上班", "台積電", "公司"],
    ["面試了宏遠興業股份有限公司", "宏遠興業股份有限公司", "公司"],
    ["今天去台大醫院回診", "台大醫院", "公司"],
  ])("機構：「%s」", (text, surface, label) => {
    expectMasked(text, surface, label);
  });

  it.each([
    ["搬到新竹之後", "新竹", "地點"],
    ["住在信義區", "信義區", "地點"],
    ["在中山北路二段 15 巷 3 號樓下", "中山北路二段 15 巷 3 號", "地點"],
    ["在板橋站等車", "板橋站", "地點"],
  ])("地點：「%s」", (text, surface, label) => {
    expectMasked(text, surface, label);
  });

  it.each([
    "許多事情都讓我很高興",
    "曾經以為自己做不到",
    "我想去公司附近走走",
    "這家公司的氣氛不錯",
    "今天天氣很好，心情也很溫暖",
    "小心不要感冒",
    "阿姨煮的湯很好喝",
    "馬上就要放假了",
    "對方覺得我想太多",
    "給小孩買了玩具",
    "明天要早起",
    "高興都來不及",
    "馬上又要開會",
    "方法很多，慢慢來",
    "OK 啦",
  ])("常用詞不誤判：「%s」", (text) => {
    const { masked, mapping } = sanitize(text);
    expect(mapping).toEqual({});
    expect(masked).toBe(text);
  });

  it("名字擴散：全名出現過後，單獨的名字也會遮蔽", () => {
    const { masked, mapping } = sanitize("跟陳志明吵架。後來志明傳訊息道歉");
    expect(masked).not.toContain("志明");
    expect(Object.values(mapping)).toEqual(expect.arrayContaining(["陳志明", "志明"]));
  });

  it("名字擴散：稱謂不算在名字裡", () => {
    const { masked } = sanitize("陳小美老師人很好，小美上課很有趣");
    expect(masked).not.toContain("小美");
  });
});

describe("第二層：自訂私密詞", () => {
  it("使用者指定的詞一定遮蔽", () => {
    const { masked, mapping } = sanitize("今天和阿哲去海邊", {
      customTerms: [{ term: "阿哲", type: "PERSON" }],
    });
    expect(masked).toBe("今天和[人名_1]去海邊");
    expect(mapping).toEqual({ "[人名_1]": "阿哲" });
  });

  it("空白詞被忽略", () => {
    expect(sanitize("你好", { customTerms: [{ term: "  ", type: "ORG" }] }).mapping).toEqual({});
  });
});

describe("代號化", () => {
  it("同一實體重複出現共用同一個代號", () => {
    const { masked, mapping } = sanitize("王經理今天又找我，王經理真的很煩");
    expect(masked).toBe("[人名_1]今天又找我，[人名_1]真的很煩");
    expect(Object.keys(mapping)).toHaveLength(1);
  });

  it("不同實體依出現順序編號", () => {
    const { mapping } = sanitize("王經理和林主任都在台積電");
    expect(mapping).toEqual({
      "[人名_1]": "王經理",
      "[人名_2]": "林主任",
      "[公司_1]": "台積電",
    });
  });

  it("重疊時高優先序者勝出：Email 不會被拆成人名或號碼", () => {
    const { masked } = sanitize("寄信給 wang123456789@mail.com");
    expect(masked).toBe("寄信給 [信箱_1]");
  });

  it("stats 只有數量，不含原文", () => {
    const { stats } = sanitize("王經理打給 0912345678");
    expect(stats).toEqual({ PERSON: 1, PHONE: 1 });
    expect(JSON.stringify(stats)).not.toContain("王");
  });

  it("綜合日記：送往 LLM 的文字不含任何原始個資", () => {
    const diary =
      "2024年3月15日，在台積電被王經理當眾罵，下班後打給小美（0912-345-678），她要我搬回新竹。";
    const { masked, mapping } = sanitize(diary);
    for (const secret of ["2024年3月15日", "台積電", "王經理", "小美", "0912-345-678", "新竹"]) {
      expect(masked).not.toContain(secret);
    }
    expect(restore(masked, mapping)).toBe(diary);
  });
});

describe("反向還原", () => {
  const { mapping } = sanitize("王經理在台積電");

  it("標準代號", () => {
    expect(restore("聽起來[人名_1]讓你很受傷", mapping)).toBe("聽起來王經理讓你很受傷");
  });

  it.each([
    "［人名_1］",
    "【人名_1】",
    "[人名 1]",
    "[人名-1]",
    "[人名1]",
    "[ 人名_1 ]",
    "[人名_01]",
  ])("容忍 LLM 改寫的格式：%s", (token) => {
    expect(restore(`${token}在[公司_1]`, mapping)).toBe("王經理在台積電");
  });

  it("對照表中不存在的代號以中性詞替代", () => {
    expect(restore("[人名_9]和[地點_2]", mapping)).toBe("對方和那個地方");
  });

  it("一般方括號文字不受影響", () => {
    expect(restore("[備註] 你可以慢慢來", mapping)).toBe("[備註] 你可以慢慢來");
  });
});
