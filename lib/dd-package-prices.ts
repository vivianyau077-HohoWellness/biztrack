// Canonical DD package prices, sourced from the Lark price table
// "01 DD packages" (SKUs -> DD price, MYR). Used so the analytics breakdowns
// show the listed package price instead of the averaged order total (which is
// skewed by shipping / promos). If a package isn't listed here, callers fall
// back to the averaged order price.
//
// To update: edit the price table in Lark, then update the pairs below.

const RAW_PRICES: [string, number][] = [
  ['1 Bottle', 229],
  ['1 Bottle + 1 Box', 328],
  ['🔵 2 Bottles ✅', 438],
  ['2 Bottles', 438],
  ['2 Boxes Free 1 Box', 328],
  ['4 Boxes Free 2 Box', 608],
  ['3 Bottles + 3 CG', 608],
  ['3 Bottles + 1 Box', 608],
  ['4瓶送1瓶', 878],
  ['5瓶送1瓶', 1037],
  ['1 Box（Shopee）', 208],
  ['1 Bottle（Shopee）', 282],
  ['1 Bottle + 1 Box（Shopee）', 405],
  ['🔵 2 Bottle（Shopee）', 538],
  ['3 Bottles（Shopee）', 748],
  ['2 Box FREE 1 Box（Shopee）', 405],
  ['4 Box FREE 2 Box（Shopee）', 748],
  ['3 Bottles', 608],
  ['3 Bottles + 1 Box（Shopee）', 748],
  ['3 Bottles + 3 CG（Shopee）', 748],
  ['4盒送3盒', 608],
  ['4盒送3盒（Shopee）', 748],
  ['PWP 1 Box（Shopee）', 208],
  ['1 Box', 169],
  ['PWP 1 Box', 99],
  ['PWP 2 Box', 198],
  ['Cactus 1 Bottle', 169],
  ['Cactus 2 FREE 1 Bottle', 328],
  ['Cactus 1 Bottle（Shopee）', 203],
  ['Cactus 2 FREE 1 Bottle（Shopee）', 394],
  ['3瓶送 2盒 回购', 707],
  ['5瓶送2瓶 回购', 1067],
  ['6瓶送2瓶 回购', 1267],
  ['8瓶送2盒 回购', 1438],
  ['20瓶1年配套', 2888],
  ['10瓶半年配套', 1548],
  ['1 CG 60ml', 39],
  ['（早鸟）707', 707],
  ['（早鸟）1108', 1108],
  ['（早鸟）1438', 1438],
  ['（早鸟）848 shopee', 848],
  ['（早鸟）1328 shopee', 1328],
  ['（早鸟）1728 shopee', 1728],
  ['直播 707', 707],
  ['直播 1108', 1108],
  ['直播 1438', 1438],
  ['直播 5188', 5188],
  ['CNY 707', 707],
  ['CNY 1438', 1438],
  ['PWP cactus Gel', 99],
  ['【SG】 3 Bottles 1 Box $ 311.74 (Shopee)', 940],
  ['CNY 3瓶2盒 (Shopee)', 848],
  ['CNY 8瓶2盒 (Shopee)', 1726],
  ['【SG】 3 Bottles 1 CS $ 311.74 (Shopee)', 940],
  ['【SG】2 Bottle  $174', 522],
  ['【SG】1 Bottle  $88', 264],
  ['【SG】1 Bottle + 1 Box $138', 414],
  ['【SG】1 Box $68', 204],
  ['【SG】PWP 1 Box $ 38', 114],
  ['【SG】3 Bottles 1 Box $238', 714],
  ['【SG】3 Bottles 1 Box $248 [1.0]', 744],
  ['【SG】7 Bottles  $508', 1524],
  ['【SG】PWP 2 Box $ 76', 228],
  ['【SG】8瓶+2盒 回购 $578 ✅', 1734],
  ['【SG】3瓶+2盒 回购 $276 ✅', 828],
  ['【SG】1 Bottle (Shopee) $ 115.54', 347],
  ['【SG】2 Bottle (Shopee) $ 234 ✅', 702],
  ['🟠【$348.8】4送1瓶 PROMO', 1044],
  ['🟠4送1瓶 PROMO', 868],
  ['🟠8送3瓶 PROMO', 1736],
  ['🟠【$276】3瓶2盒 PROMO', 828],
  ['🟠【$578】8瓶2盒 PROMO', 1734],
  ['🟠 4送1瓶 Shopee PROMO', 1042],
  ['🟠8送3瓶 Shopee PROMO', 2083],
  ['【SG】1 Bottle + 1 Box $180.94 (Shopee)', 543],
  ['【SG】3 Bottles 1 CS $238', 714],
  ['【SG】1 Bottle + 1 Box $148 [1.0]', 444],
  ['3瓶 + 2盒', 707],
  ['3瓶 1Cactus Gel 1盒', 707],
  ['🔵 3瓶 1 CG 1盒 [Shopee]', 848],
  ['🔵 3瓶 2盒 [Shopee]', 848],
  ['🔵 4瓶 1盒 5包 回购', 868],
  ['🔵 7瓶送2盒 回购', 1414],
  ['1 Bottle（Shopee）1.0 ✅', 318],
  ['🔵【SG】3 Bottles + 2 Box $288', 864],
  ['🔵【SG】2 Bottle $178 ✅', 534],
  ['🔵【SG】4瓶+1盒5包 回购 $348', 1044],
  ['🔴 10瓶 Flash Deal', 1662],
  ['🔵【SG】3 Bottles + 2 Box $388 (Shopee)', 1164],
  ['🔵 4瓶 1盒 回购', 798],
  ['🔵【SG】4 Bottles 1 Box $328 ✅', 984],
  ['🔵 4瓶 1 CG NEW ✅', 798],
  ['🔵 4瓶 1盒 [Shopee]', 958],
  ['🔵 4瓶 1 CG [Shopee]', 958],
  ['🔵 10瓶 回购 ✅', 1695],
  ['🔵  4瓶2盒 回购 ✅', 897],
  ['🔵【SG】4 Bottles + 1 Box $410 (Shopee) ✅', 1182],
  ['【SG】1 Bottle (Shopee) $ 148 [1.0] ✅', 444],
  ['🔵 2 Bottle（Shopee）1.0 ✅', 548],
  ['🔵 3瓶 2盒 [Shopee] 1.0 ✅', 884],
  ['🔵 4瓶 1盒 [Shopee] 1.0 ✅', 998],
  ['🔵 4瓶 1 CG [Shopee] 1.0 ✅', 998],
  ['🔵 4瓶 1 盒 NEW ✅', 798],
  ['🔴 4瓶2盒 Flash Deal', 864],
]

// Normalize a package name for fuzzy matching: drop colour/check emojis,
// unify full-width parentheses & spaces, lowercase. So "🔵 2 Bottles ✅" and
// "2 Bottles" both map to the same key.
const EMOJIS = ['🔵', '🔴', '🟠', '🟡', '🟢', '⚪', '✅', '⭐', '️']
function normKey(s: string): string {
  let out = (s ?? '').toString()
  for (const e of EMOJIS) out = out.split(e).join('')
  out = out.replace(/（/g, '(').replace(/）/g, ')')
  out = out.replace(/\s+/g, ' ').trim().toLowerCase()
  return out
}

const PRICE_MAP = new Map<string, number>()
for (const [name, price] of RAW_PRICES) {
  const k = normKey(name)
  if (k && !PRICE_MAP.has(k)) PRICE_MAP.set(k, price)
}

// Returns the listed DD price for a package name, or 0 if not listed.
export function getDdPackagePrice(name: string): number {
  return PRICE_MAP.get(normKey(name)) ?? 0
}
