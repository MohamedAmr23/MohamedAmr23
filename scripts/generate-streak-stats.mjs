#!/usr/bin/env node
// Generates a "Streak Stats" card SVG (dark + light) styled to match the
// agent-console signal/ocean/solar palettes. Self-hosted so it never depends
// on the (often unstable) public streak-stats.demolab.com service.
// Data source: GitHub's public contribution calendar HTML fragment.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig, repositoryRoot } from "./lib/config.mjs";

const paletteDefinitions = {
  signal: {
    dark: { bgStart: "#020617", bgEnd: "#11152F", panel: "#07111F", border: "#1E293B", primary: "#E5E7EB", muted: "#64748B", accent: "#22D3EE", flame: "#7C3AED" },
    light: { bgStart: "#F8FBFF", bgEnd: "#F5F3FF", panel: "#FFFFFF", border: "#E2E8F0", primary: "#172554", muted: "#64748B", accent: "#0891B2", flame: "#6D28D9" }
  }
};

async function fetchCalendar(username) {
  const res = await fetch(`https://github.com/users/${username}/contributions`, {
    headers: { "User-Agent": `${username}-profile-readme` }
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status} while fetching the contribution calendar.`);
  const html = await res.text();

  const totalMatch = html.match(/<h2[^>]*>\s*([\d,]+)\s*\n\s*contributions/);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : 0;

  const cellRegex = /data-date="([\d-]+)" id="contribution-day-component-\d+-\d+" data-level="(\d)"/g;
  const days = [];
  let match;
  while ((match = cellRegex.exec(html)) !== null) {
    days.push({ date: match[1], hasContribution: Number(match[2]) > 0 });
  }
  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { total, days };
}

function computeStreaks(days) {
  let longest = 0;
  let running = 0;
  let current = 0;
  let currentStart = null;
  let currentEnd = null;
  let longestStart = null;
  let longestEnd = null;
  let runStart = null;

  for (const day of days) {
    if (day.hasContribution) {
      if (running === 0) runStart = day.date;
      running += 1;
      if (running > longest) {
        longest = running;
        longestStart = runStart;
        longestEnd = day.date;
      }
    } else {
      running = 0;
    }
  }

  // Current streak: walk backwards from the most recent day.
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].hasContribution) {
      current += 1;
      currentEnd = currentEnd || days[i].date;
      currentStart = days[i].date;
    } else {
      // Allow the streak to still be "current" if today has no contribution yet.
      if (current === 0 && i === days.length - 1) continue;
      break;
    }
  }

  const fmt = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric" }) : "-";

  return {
    current,
    longest,
    currentRange: current ? `${fmt(currentStart)} - ${fmt(currentEnd)}` : "No active streak",
    longestRange: longest ? `${fmt(longestStart)} - ${fmt(longestEnd)}` : "-"
  };
}

function buildSvg({ total, streaks, username, mode, width = 720, height = 200 }) {
  const colors = paletteDefinitions.signal[mode];
  const colWidth = width / 3;

  const column = (x, value, label, sub, accent) => `
    <text x="${x}" y="${height / 2 - 14}" text-anchor="middle" font-family="Consolas, 'Courier New', monospace" font-size="34" font-weight="bold" fill="${accent}">${value}</text>
    <text x="${x}" y="${height / 2 + 14}" text-anchor="middle" font-family="Consolas, 'Courier New', monospace" font-size="12" letter-spacing="1" fill="${colors.primary}">${label}</text>
    <text x="${x}" y="${height / 2 + 32}" text-anchor="middle" font-family="Consolas, 'Courier New', monospace" font-size="10" fill="${colors.muted}">${sub}</text>`;

  const divider = (x) => `<line x1="${x}" y1="32" x2="${x}" y2="${height - 32}" stroke="${colors.border}" stroke-width="1"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${username} streak stats</title>
<desc id="desc">Total contributions, current streak, and longest streak over the last year.</desc>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${colors.bgStart}"/>
<stop offset="1" stop-color="${colors.bgEnd}"/>
</linearGradient>
</defs>
<rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="url(#bg)" stroke="${colors.border}"/>
<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="10" fill="${colors.panel}" stroke="${colors.border}"/>
<text x="26" y="30" font-family="Consolas, 'Courier New', monospace" font-size="12" letter-spacing="1.5" fill="${colors.accent}">STREAK.STATS</text>
${column(colWidth * 0.5, total.toLocaleString("en"), "TOTAL (1Y)", "contributions", colors.primary)}
${divider(colWidth)}
${column(colWidth * 1.5, streaks.current, "CURRENT STREAK", streaks.currentRange, colors.flame)}
${divider(colWidth * 2)}
${column(colWidth * 2.5, streaks.longest, "LONGEST STREAK", streaks.longestRange, colors.accent)}
</svg>`;
}

async function main() {
  const config = await loadConfig();
  const username = config.profile.username;

  const { total, days } = await fetchCalendar(username);
  const streaks = computeStreaks(days);

  const outDir = resolve(repositoryRoot, "assets/hero");
  await mkdir(outDir, { recursive: true });

  await writeFile(resolve(outDir, "streak-stats-dark.svg"), buildSvg({ total, streaks, username, mode: "dark" }));
  await writeFile(resolve(outDir, "streak-stats-light.svg"), buildSvg({ total, streaks, username, mode: "light" }));

  console.log(`Streak stats generated: total=${total}, current=${streaks.current}, longest=${streaks.longest}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
