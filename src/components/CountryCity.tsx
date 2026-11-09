"use client";

import { useState } from "react";
import type { Market } from "@/discovery/markets";

/** Country picker plus a city box whose suggestions follow the chosen country. Any city can be typed. */
export function CountryCity({ markets, disabled, country = "IN", city = "Chennai" }: { markets: Market[]; disabled?: boolean; country?: string; city?: string }) {
  const [cc, setCc] = useState(country);
  const [name, setName] = useState(city);
  const m = markets.find((x) => x.code === cc) ?? markets[0];
  return (
    <>
      <label>Country
        <select name="country" value={cc} disabled={disabled} onChange={(e) => {
          const next = markets.find((x) => x.code === e.target.value)!;
          setCc(next.code);
          if (!next.cities.includes(name)) setName(next.cities[0]);
        }}>
          {markets.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
        </select>
      </label>
      <label>City
        <input name="city" list={`cities-${m.code}`} value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} required />
        <datalist id={`cities-${m.code}`}>{m.cities.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
    </>
  );
}
