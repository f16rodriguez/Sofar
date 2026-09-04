"use client";

// The daily question (M4) arrives at a local hour, so the book needs to know
// where the person's day is. The browser knows; the person confirms.

import { useEffect, useState } from "react";

const FALLBACK = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

export default function TimezoneSelect({ saved }: { saved: string }) {
  const [zones, setZones] = useState<string[]>(FALLBACK);
  const [value, setValue] = useState(saved);

  useEffect(() => {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const all = intl.supportedValuesOf?.("timeZone");
    if (all && all.length > 0) setZones(all);
    // Never confirmed a zone yet: offer the one the browser is in.
    if (saved === "UTC") {
      const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (here) setValue(here);
    }
  }, [saved]);

  const options = zones.includes(value) ? zones : [value, ...zones];
  return (
    <select name="timezone" className="input" value={value} onChange={(e) => setValue(e.target.value)}>
      {options.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
