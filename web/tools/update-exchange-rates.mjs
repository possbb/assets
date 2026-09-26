import { writeFile } from "node:fs/promises";

// Only public reference rates are requested. No portfolio information is sent.
const response = await fetch("https://api.frankfurter.dev/v2/rates?base=CNY&providers=ecb", { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Exchange rate provider: ${response.status}`);
const rows = await response.json();
if (!Array.isArray(rows) || !rows.length) throw new Error("Empty exchange rates");
const date = rows[0].date;
const rates = { CNY: 1 };
for (const row of rows) {
  if (row.base !== "CNY" || row.date !== date || !/^[A-Z]{3}$/.test(row.quote) || !Number.isFinite(row.rate) || row.rate <= 0) throw new Error("Invalid exchange rate response");
  rates[row.quote] = 1 / row.rate;
}
if (!rates.USD || !rates.HKD || !rates.EUR || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Missing required rates");
await writeFile(new URL("../public/exchange-rates.json", import.meta.url), JSON.stringify({ date, fetchedAt: new Date().toISOString(), source: "Frankfurter / ECB", rates }, null, 2));
console.log(`Published reference rates: ${date}, ${Object.keys(rates).length} currencies`);
