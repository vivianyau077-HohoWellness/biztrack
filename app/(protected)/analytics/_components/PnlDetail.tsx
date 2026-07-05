'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// Full line-by-line P&L, transcribed exactly from the uploaded statements (2026).
// To add a month: append a Statement below (or send me the P&L and I'll add it).
type Line = { label: string; amt: number }
type Section = { name: string; items: Line[]; subtotal: number }
type Statement = { id: string; label: string; revenue: Line[]; totalRevenue: number; sections: Section[]; totalExpenses: number; netProfit: number }

const S: Statement[] = [
  {
    id: 'on-jan', label: "Online · Jan'26", totalRevenue: 590501.88, totalExpenses: 404051.88, netProfit: 186450.00,
    revenue: [{ label: 'Total Sales', amt: 590501.88 }],
    sections: [
      { name: 'Product Related Costing', subtotal: 159372.31, items: [
        { label: 'Dhealthy 330ml Cactus Gel (25.07 × 195)', amt: 4888.65 },
        { label: 'Diamond Drink 500ml (49.35 × 2372)', amt: 117058.20 },
        { label: 'Diamond Drink 25gm (2.30 × 6)', amt: 13.80 },
        { label: 'Diamond Drink 25ml×10 Box (26.78 × 1397)', amt: 37411.66 },
      ] },
      { name: 'Shipping Fee', subtotal: 8991.73, items: [
        { label: 'Lazada Shipping Fee', amt: 116.39 },
        { label: 'Shopee Shipping Fee', amt: 375.34 },
        { label: 'Postage Charges', amt: 8406.00 },
        { label: 'Gold Coin Transport (Alimall)', amt: 94.00 },
      ] },
      { name: 'Marketing Expenses', subtotal: 184647.01, items: [
        { label: 'Meta Verified Fee', amt: 272.69 },
        { label: 'Withholding tax 8%', amt: 20.20 },
        { label: 'Meta Ads Spend', amt: 167673.36 },
        { label: 'Withholding tax 8% (Meta Ads)', amt: 12297.28 },
        { label: 'Manychats', amt: 1955.36 },
        { label: 'Withholding tax 10%', amt: 193.60 },
        { label: 'E-commerce (Chanlel Soft Solutions)', amt: 2234.52 },
      ] },
      { name: 'Other Expenses', subtotal: 51040.84, items: [
        { label: 'Atome Fee', amt: 332.53 },
        { label: 'Packaging Fee', amt: 6379.78 },
        { label: 'Lazada Commission Fee', amt: 1424.69 },
        { label: 'Shopee Commission Fee', amt: 21188.78 },
        { label: 'Overhead Expenses', amt: 4000.00 },
        { label: 'Hoho Wellness Marketer (3%)', amt: 17715.06 },
      ] },
    ],
  },
  {
    id: 'on-feb', label: "Online · Feb'26", totalRevenue: 624164.00, totalExpenses: 458701.57, netProfit: 165462.43,
    revenue: [
      { label: 'Total Sales', amt: 565405.00 },
      { label: 'Singapore Sales (Rate 3.0)', amt: 59466.00 },
      { label: 'Adjust Rejected Sales (DO:121372)', amt: -707.00 },
    ],
    sections: [
      { name: 'Product Related Costing', subtotal: 165144.53, items: [
        { label: 'Dhealthy 330ml Cactus Gel (25.07 × 132)', amt: 3309.24 },
        { label: 'Diamond Drink 500ml (49.35 × 2539)', amt: 125299.65 },
        { label: 'Diamond Drink 25gm (2.30 × 15)', amt: 34.50 },
        { label: 'Diamond Drink 25ml×10 Box (26.78 × 1363)', amt: 36501.14 },
      ] },
      { name: 'Shipping Fee', subtotal: 23558.02, items: [
        { label: 'Lazada Shipping Fee', amt: 232.04 },
        { label: 'Shopee Shipping Fee', amt: 140.78 },
        { label: 'Singapore Postage Charges', amt: 6138.00 },
        { label: 'Postage Charges', amt: 17047.20 },
      ] },
      { name: 'Marketing Expenses', subtotal: 216225.26, items: [
        { label: 'Meta Verified Fee', amt: 272.69 },
        { label: 'Withholding tax 8%', amt: 20.20 },
        { label: 'Meta Ads Spend', amt: 198899.62 },
        { label: 'Withholding tax 8% (Meta Ads)', amt: 14587.43 },
        { label: 'Manychats', amt: 2225.01 },
        { label: 'Withholding tax 10%', amt: 220.30 },
      ] },
      { name: 'Other Expenses', subtotal: 53773.76, items: [
        { label: 'Atome Fee', amt: 168.33 },
        { label: 'Packaging Fee', amt: 5571.51 },
        { label: 'Lazada Commission Fee', amt: 2226.50 },
        { label: 'Shopee Commission Fee', amt: 23082.50 },
        { label: 'Overhead Expenses', amt: 4000.00 },
        { label: 'Hoho Wellness Marketer (3%)', amt: 18724.92 },
      ] },
    ],
  },
  {
    id: 'on-mar', label: "Online · Mar'26", totalRevenue: 763232.71, totalExpenses: 607702.63, netProfit: 155530.08,
    revenue: [
      { label: 'Total Sales', amt: 601059.03 },
      { label: 'Singapore Sales (Rate 3)', amt: 166765.68 },
      { label: 'Adjust Rejected Sales', amt: -4592.00 },
    ],
    sections: [
      { name: 'Product Related Costing', subtotal: 212262.51, items: [
        { label: 'Dhealthy 330ml Cactus Gel (25.07 × 78)', amt: 1955.46 },
        { label: 'Diamond Drink 500ml (49.35 × 3315)', amt: 163595.25 },
        { label: 'Diamond Drink 25gm (2.30 × 25)', amt: 57.50 },
        { label: 'Diamond Drink 25ml×10 Box (26.78 × 1685)', amt: 45124.30 },
        { label: 'Dhealthy 215ml Cactus Gel (15.30 × 100)', amt: 1530.00 },
      ] },
      { name: 'Shipping Fee', subtotal: 38904.98, items: [
        { label: 'Lazada Shipping Fee', amt: 168.23 },
        { label: 'Shopee Shipping Fee', amt: 216.13 },
        { label: 'Singapore Postage Charges', amt: 17490.00 },
        { label: 'Postage Charges', amt: 21030.62 },
      ] },
      { name: 'Marketing Expenses', subtotal: 293453.50, items: [
        { label: 'Tastefully Malaysia (Exhibition)', amt: 10070.00 },
        { label: 'Channel Soft (Kiplepay integration)', amt: 432.00 },
        { label: 'Meta Verified Fee', amt: 272.69 },
        { label: 'Withholding tax 8%', amt: 20.20 },
        { label: 'Meta Ads Spend', amt: 260938.29 },
        { label: 'Withholding tax 8% (Meta Ads)', amt: 19137.39 },
        { label: 'Manychats', amt: 2350.24 },
        { label: 'Withholding tax 10%', amt: 232.70 },
      ] },
      { name: 'Other Expenses', subtotal: 63081.64, items: [
        { label: 'Atome Fee', amt: 542.67 },
        { label: 'Kiplepay monthly fee (Jan–Mar)', amt: 1449.48 },
        { label: 'Packaging Fee', amt: 7712.50 },
        { label: 'Lazada Commission Fee', amt: 2672.14 },
        { label: 'Shopee Commission Fee', amt: 23807.87 },
        { label: 'Overhead Expenses', amt: 4000.00 },
        { label: 'Hoho Wellness Marketer (3%)', amt: 22896.98 },
      ] },
    ],
  },
  {
    id: 'on-apr', label: "Online · Apr'26", totalRevenue: 537674.90, totalExpenses: 422569.45, netProfit: 115105.45,
    revenue: [
      { label: 'Total Sales', amt: 346934.00 },
      { label: 'Shopee Sales', amt: 76010.64 },
      { label: 'Singapore Sales (Rate 3)', amt: 114730.26 },
    ],
    sections: [
      { name: 'Product Related Costing', subtotal: 144878.03, items: [
        { label: 'Diamond Drink 500ml (49.35 × 2351)', amt: 116021.85 },
        { label: 'Diamond Drink 25gm (2.30 × 3)', amt: 6.90 },
        { label: 'Diamond Drink 25ml×10 Box (26.78 × 991)', amt: 26538.98 },
        { label: 'Dhealthy 215ml Cactus Gel (15.30 × 151)', amt: 2310.30 },
      ] },
      { name: 'Shipping Fee', subtotal: 27820.10, items: [
        { label: 'Lazada Shipping Fee', amt: 57.87 },
        { label: 'Shopee Shipping Fee', amt: 346.09 },
        { label: 'Singapore Postage Charges', amt: 10626.00 },
        { label: 'Postage Charges', amt: 16790.14 },
      ] },
      { name: 'Marketing Expenses', subtotal: 199720.49, items: [
        { label: 'Meta Ads Spend', amt: 184817.53 },
        { label: 'Withholding tax 8% (Meta Ads)', amt: 13554.64 },
        { label: 'Manychats - Paid by Janice Sun', amt: 980.52 },
        { label: 'Manychats - Paid by Itscoll', amt: 245.23 },
        { label: 'Withholding tax 10%', amt: 122.58 },
      ] },
      { name: 'Tastefully Expo Expenses', subtotal: 4236.41, items: [
        { label: 'Hand Truck', amt: 80.08 },
        { label: 'TnG Soundbox', amt: 210.96 },
        { label: 'Hand Truck', amt: 80.06 },
        { label: 'Wooden Plant Display Stand', amt: 57.22 },
        { label: 'Call Bell / Service Bell', amt: 9.84 },
        { label: 'Table Cloth Cover', amt: 54.87 },
        { label: 'Plastic Serving Food Tray', amt: 9.62 },
        { label: 'Paper Sampling Cup', amt: 51.81 },
        { label: 'Dhealthy Uniform (One Sport)', amt: 452.00 },
        { label: 'Roll up Banner', amt: 97.70 },
        { label: 'Dynamic & Creative Media', amt: 2882.25 },
        { label: "D'HEALTHY Brochure", amt: 250.00 },
      ] },
      { name: 'Other Expenses', subtotal: 45914.42, items: [
        { label: 'Whatsapp Business Account (27–30/4)', amt: 2870.64 },
        { label: 'Credit Card Machine monthly fee', amt: 50.00 },
        { label: 'Atome Fee', amt: 141.87 },
        { label: 'Kiplepay monthly fee (Apr)', amt: 116.70 },
        { label: 'Packaging Fee', amt: 5059.40 },
        { label: 'Lazada Commission Fee', amt: 929.68 },
        { label: 'Shopee Commission Fee', amt: 16615.88 },
        { label: 'Overhead Expenses', amt: 4000.00 },
        { label: 'Hoho Wellness Marketer (3%)', amt: 16130.25 },
      ] },
    ],
  },
  {
    id: 'on-may', label: "Online · May'26", totalRevenue: 611191.50, totalExpenses: 495272.36, netProfit: 115919.14,
    revenue: [
      { label: 'Total Sales', amt: 383155.00 },
      { label: 'Shopee Sales', amt: 118986.16 },
      { label: 'Singapore Sales (Rate 3)', amt: 96071.34 },
      { label: 'Tastefully Sales', amt: 12979.00 },
    ],
    sections: [
      { name: 'Product Related Costing', subtotal: 170570.76, items: [
        { label: 'Dhealthy 330ml Cactus Gel (25.07 × 2)', amt: 50.14 },
        { label: 'Diamond Drink 500ml (49.35 × 2978)', amt: 146964.30 },
        { label: 'Diamond Drink 25gm (2.30 × 49)', amt: 112.70 },
        { label: 'Diamond Drink 25ml×10 Box (26.78 × 804)', amt: 21531.12 },
        { label: 'Dhealthy 215ml Cactus Gel (15.30 × 125)', amt: 1912.50 },
      ] },
      { name: 'Shipping Fee', subtotal: 13607.28, items: [
        { label: 'Lazada Shipping Fee', amt: 101.14 },
        { label: 'Shopee Shipping Fee', amt: 37.83 },
        { label: 'Singapore Postage Charges', amt: 7752.00 },
        { label: 'Postage Charges', amt: 5716.31 },
      ] },
      { name: 'Marketing Expenses', subtotal: 250248.71, items: [
        { label: 'Roller Up Banner (E-Print)', amt: 463.10 },
        { label: 'KOL Payment - Ho Yen Yen', amt: 400.00 },
        { label: 'Meta Verified Fee', amt: 272.69 },
        { label: 'Withholding tax 8%', amt: 20.20 },
        { label: 'Meta Ads Spend', amt: 230694.44 },
        { label: 'Withholding tax 8% (Meta Ads)', amt: 16919.28 },
        { label: 'Manychats - Paid by Janice Sun', amt: 1160.04 },
        { label: 'Manychats - Paid by Itscoll', amt: 184.50 },
        { label: 'Withholding tax 10%', amt: 134.45 },
      ] },
      { name: 'Tastefully Expo Expenses', subtotal: 1625.10, items: [
        { label: 'Lunch after set up (Hai Di Lao 7/5)', amt: 439.00 },
        { label: 'Parking Fee (7/5)', amt: 8.00 },
        { label: 'Foamboard', amt: 250.00 },
        { label: 'Lunch + Dinner (8–10)', amt: 520.20 },
        { label: 'Parking Fee Pavilion 2 (8–10)', amt: 59.00 },
        { label: 'Transportation - Grab (8–10)', amt: 35.00 },
        { label: 'Food Tray', amt: 11.80 },
        { label: 'Cloth Clip (Mr DIY)', amt: 12.10 },
        { label: 'Bill Book', amt: 15.00 },
        { label: 'Tack-It', amt: 7.50 },
        { label: 'Printing Fee', amt: 30.00 },
        { label: 'Opp Tape 48mm', amt: 9.60 },
        { label: 'Opp Tape Dispenser', amt: 15.80 },
        { label: 'Mineral Water', amt: 7.10 },
        { label: 'Tarpauline Canvas', amt: 25.00 },
        { label: 'Promoter work Pavilion 2 (9/5)', amt: 180.00 },
      ] },
      { name: 'Other Expenses', subtotal: 59220.51, items: [
        { label: 'Whatsapp Business Account', amt: 2339.79 },
        { label: 'Credit Card Machine monthly fee', amt: 50.00 },
        { label: 'Atome Fee', amt: 673.32 },
        { label: 'Kiplepay Year Charges (Apr26–Mar27)', amt: 375.84 },
        { label: 'Packaging Fee', amt: 4917.49 },
        { label: 'Lazada Commission Fee', amt: 1180.19 },
        { label: 'Shopee Commission Fee', amt: 27348.13 },
        { label: 'Overhead Expenses', amt: 4000.00 },
        { label: 'Hoho Wellness Marketer (3%)', amt: 18335.75 },
      ] },
    ],
  },
  {
    id: 'off-jan', label: "Offline · Jan'26", totalRevenue: 108499.20, totalExpenses: 49551.67, netProfit: 58947.53,
    revenue: [{ label: 'Offline Sales', amt: 108499.20 }],
    sections: [
      { name: 'Product Related Costing', subtotal: 40438.32, items: [
        { label: 'Dhealthy 330ml Cactus Gel (25.07 × 40)', amt: 1002.80 },
        { label: 'Diamond Drink 500ml (49.35 × 636)', amt: 31386.60 },
        { label: 'Diamond Drink 25gm (2.30 × 251)', amt: 577.30 },
        { label: 'Diamond Drink 25ml×10 Box (26.78 × 279)', amt: 7471.62 },
      ] },
      { name: 'Shipping Fee', subtotal: 5099.46, items: [
        { label: 'Postage Charges', amt: 5099.46 },
      ] },
      { name: 'Other Expenses', subtotal: 4013.89, items: [
        { label: 'Packaging Fee', amt: 758.91 },
        { label: 'Hoho Wellness Marketer (3%)', amt: 3254.98 },
      ] },
    ],
  },
  {
    id: 'off-feb', label: "Offline · Feb'26", totalRevenue: 125662.50, totalExpenses: 57519.02, netProfit: 68143.49,
    revenue: [{ label: 'Offline Sales', amt: 125662.50 }],
    sections: [
      { name: 'Product Related Costing', subtotal: 47195.71, items: [
        { label: 'Dhealthy 330ml Cactus Gel (25.07 × 27)', amt: 676.89 },
        { label: 'Diamond Drink 500ml (49.35 × 736)', amt: 36321.60 },
        { label: 'Diamond Drink 25gm (2.30 × 370)', amt: 851.00 },
        { label: 'Diamond Drink 25ml×10 Box (26.78 × 349)', amt: 9346.22 },
      ] },
      { name: 'Shipping Fee', subtotal: 6035.15, items: [
        { label: 'Postage Charges', amt: 6035.15 },
      ] },
      { name: 'Other Expenses', subtotal: 4288.16, items: [
        { label: 'Packaging Fee', amt: 518.28 },
        { label: 'Hoho Wellness Marketer (3%)', amt: 3769.88 },
      ] },
    ],
  },
]

function rm(n: number) { return (n < 0 ? '-RM ' : 'RM ') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function pctOf(a: number, b: number) { return b ? Math.round((a / b) * 100) : 0 }

const MONTHS = ["Jan'26", "Feb'26", "Mar'26", "Apr'26", "May'26"]

function findSt(ch: 'online' | 'offline', m: string): Statement | undefined {
  const pre = ch === 'online' ? 'Online' : 'Offline'
  return S.find(s => s.label === `${pre} · ${m}`)
}
function mergeSt(a: Statement | undefined, b: Statement | undefined, m: string): Statement {
  if (a && !b) return { ...a, id: 'ov', label: `Overall · ${m}` }
  if (b && !a) return { ...b, id: 'ov', label: `Overall · ${m}` }
  if (!a && !b) return { id: 'ov', label: `Overall · ${m}`, revenue: [], totalRevenue: 0, sections: [], totalExpenses: 0, netProfit: 0 }
  const names: string[] = a!.sections.map(s => s.name)
  for (const s of b!.sections) if (!names.includes(s.name)) names.push(s.name)
  const sections: Section[] = names.map(n => {
    const sa = a!.sections.find(s => s.name === n)
    const sb = b!.sections.find(s => s.name === n)
    return { name: n, items: [...(sa?.items ?? []), ...(sb?.items ?? [])], subtotal: (sa?.subtotal ?? 0) + (sb?.subtotal ?? 0) }
  })
  return {
    id: 'ov', label: `Overall · ${m}`,
    revenue: [...a!.revenue.map(r => ({ label: r.label + ' (Online)', amt: r.amt })), ...b!.revenue.map(r => ({ label: r.label + ' (Offline)', amt: r.amt }))],
    totalRevenue: a!.totalRevenue + b!.totalRevenue, sections,
    totalExpenses: a!.totalExpenses + b!.totalExpenses, netProfit: a!.netProfit + b!.netProfit,
  }
}
function getSt(ch: 'online' | 'offline' | 'overall', m: string): Statement {
  if (ch === 'overall') return mergeSt(findSt('online', m), findSt('offline', m), m)
  return findSt(ch, m) ?? { id: 'none', label: m, revenue: [], totalRevenue: 0, sections: [], totalExpenses: 0, netProfit: 0 }
}

export default function PnlDetail() {
  const [ch, setCh] = useState<'online' | 'offline' | 'overall'>('online')
  const [m, setM] = useState("May'26")
  const st = getSt(ch, m)
  const accent = ch === 'offline' ? '#0F766E' : ch === 'overall' ? '#7E57C2' : '#1C7293'
  const hasData = st.totalRevenue > 0 || st.sections.length > 0

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold mr-1">P&L</h3>
          <div className="flex gap-1.5">
            {(['online', 'offline', 'overall'] as const).map(c => (
              <button key={c} onClick={() => setCh(c)}
                className={cn('text-xs px-3 py-1.5 rounded-md border font-medium', ch === c ? 'text-white' : 'hover:bg-muted')}
                style={ch === c ? { background: accent, borderColor: accent } : {}}>
                {c === 'online' ? 'Online' : c === 'offline' ? 'Offline' : 'Overall (合并)'}
              </button>
            ))}
          </div>
          <select value={m} onChange={e => setM(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
            {MONTHS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>

        {!hasData ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No P&L data for this channel / month.</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {/* Revenue */}
              <tr className="bg-muted/50"><td className="px-3 py-1.5 font-semibold" colSpan={2}>Revenue</td></tr>
              {st.revenue.map((l, i) => (
                <tr key={'r' + i} className="border-b last:border-0">
                  <td className="px-3 py-1.5 pl-6 text-muted-foreground">{l.label}</td>
                  <td className="px-3 py-1.5 text-right">{rm(l.amt)}</td>
                </tr>
              ))}
              <tr className="border-b bg-green-50">
                <td className="px-3 py-1.5 font-semibold">Total Revenue</td>
                <td className="px-3 py-1.5 text-right font-semibold">{rm(st.totalRevenue)} · 100%</td>
              </tr>

              {/* Expense sections */}
              {st.sections.map((sec, si) => (
                <FragmentSection key={si} sec={sec} rev={st.totalRevenue} />
              ))}

              {/* Totals */}
              <tr className="border-t-2 bg-muted/40">
                <td className="px-3 py-2 font-semibold">Total Expenses</td>
                <td className="px-3 py-2 text-right font-semibold">{rm(st.totalExpenses)} · {pctOf(st.totalExpenses, st.totalRevenue)}%</td>
              </tr>
              <tr className="bg-yellow-50">
                <td className="px-3 py-2 font-bold text-sm">Net Profit</td>
                <td className="px-3 py-2 text-right font-bold text-sm">{rm(st.netProfit)} · {pctOf(st.netProfit, st.totalRevenue)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </CardContent>
    </Card>
  )
}

function FragmentSection({ sec, rev }: { sec: Section; rev: number }) {
  return (
    <>
      <tr className="bg-muted/50">
        <td className="px-3 py-1.5 font-semibold">{sec.name}</td>
        <td className="px-3 py-1.5 text-right font-semibold text-muted-foreground">{pctOf(sec.subtotal, rev)}%</td>
      </tr>
      {sec.items.map((l, i) => (
        <tr key={i} className="border-b last:border-0">
          <td className="px-3 py-1.5 pl-6 text-muted-foreground">{l.label}</td>
          <td className="px-3 py-1.5 text-right">{rm(l.amt)}</td>
        </tr>
      ))}
      <tr className="border-b">
        <td className="px-3 py-1.5 pl-6 font-medium">Subtotal — {sec.name}</td>
        <td className="px-3 py-1.5 text-right font-medium">{rm(sec.subtotal)}</td>
      </tr>
    </>
  )
}
