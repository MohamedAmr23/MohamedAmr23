#!/usr/bin/env node
// Generates a "Contribution Trail" heatmap SVG (dark + light) styled to match
// the agent-console signal/ocean/solar palettes used by generate-hero.mjs.
// Data source: GitHub's public contribution calendar HTML fragment
// (https://github.com/users/<username>/contributions) — no auth required.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig, repositoryRoot } from "./lib/config.mjs";

const paletteDefinitions = {
  signal: {
    dark: { bgStart: "#020617", bgEnd: "#11152F", panel: "#07111F", border: "#1E293B", primary: "#E5E7EB", muted: "#64748B", cyan: "#22D3EE", blue: "#38BDF8", violet: "#7C3AED", empty: "#0B1424" },
    light: { bgStart: "#F8FBFF", bgEnd: "#F5F3FF", panel: "#FFFFFF", border: "#E2E8F0", primary: "#172554", muted: "#64748B", cyan: "#0891B2", blue: "#2563EB", violet: "#6D28D9", empty: "#E7ECF5" }
  },
  ocean: {
    dark: { bgStart: "#02131A", bgEnd: "#111827", panel: "#061A22", border: "#123047", primary: "#E5F6F8", muted: "#6B8791", cyan: "#2DD4BF", blue: "#38BDF8", violet: "#6366F1", empty: "#0B1F27" },
    light: { bgStart: "#F4FCFC", bgEnd: "#F4F7FF", panel: "#FFFFFF", border: "#DCEEF0", primary: "#123047", muted: "#64748B", cyan: "#0F766E", blue: "#0284C7", violet: "#4F46E5", empty: "#E7F4F4" }
  },
  solar: {
    dark: { bgStart: "#090D14", bgEnd: "#1D1720", panel: "#10141C", border: "#292524", primary: "#F3F4F6", muted: "#7C8495", cyan: "#22D3EE", blue: "#60A5FA", violet: "#F59E0B", empty: "#151217" },
    light: { bgStart: "#FBFCFE", bgEnd: "#FFF8ED", panel: "#FFFFFF", border: "#F1E4CE", primary: "#292524", muted: "#78716C", cyan: "#0891B2", blue: "#2563EB", violet: "#B45309", empty: "#F4EFE3" }
  }
};

function levelColor(colors, level) {
  switch (Number(level)) {
    case 0: return colors.empty;
    case 1: return colors.cyan + "55";
    case 2: return colors.cyan + "AA";
    case 3: return colors.blue;
    case 4: return colors.violet;
    default: return colors.empty;
  }
}

async function fetchCalendar(username) {
  const res = await fetch(`https://github.com/users/${username}/contributions`, {
    headers: { "User-Agent": `${username}-profile-readme` }
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status} while fetching the contribution calendar.`);
  const html = await res.text();

  const totalMatch = html.match(/<h2[^>]*>\s*([\d,]+)\s*\n\s*contributions/);
  const total = totalMatch ? totalMatch[1] : "0";

  const cellRegex = /data-date="([\d-]+)" id="contribution-day-component-(\d+)-(\d+)" data-level="(\d)"/g;
  const cells = [];
  let match;
  while ((match = cellRegex.exec(html)) !== null) {
    const [, date, weekday, week, level] = match;
    cells.push({ date, weekday: Number(weekday), week: Number(week), level: Number(level) });
  }
  if (cells.length === 0) throw new Error("Could not parse any contribution cells. GitHub markup may have changed.");
  return { total, cells };
}

function monthLabels(cells) {
  const labels = [];
  let lastMonth = null;
  let lastWeek = -Infinity;
  for (let week = 0; week <= Math.max(...cells.map((c) => c.week)); week++) {
    const weekCells = cells.filter((c) => c.week === week);
    if (weekCells.length === 0) continue;
    const firstDate = weekCells.reduce((a, b) => (a.date < b.date ? a : b));
    const month = new Date(firstDate.date + "T00:00:00Z").toLocaleString("en", { month: "short" });
    if (month !== lastMonth && week - lastWeek >= 3) {
      labels.push({ week, month });
      lastMonth = month;
      lastWeek = week;
    }
  }
  return labels;
}

function buildSvg({ cells, total, username, palette, mode, width }) {
  const colors = paletteDefinitions[palette][mode];
  const gridLeft = 34;
  const rightMargin = 26;
  const gridTop = 56;
  const weeks = Math.max(...cells.map((c) => c.week)) + 1;

  const availableWidth = width - gridLeft - rightMargin;
  const pitch = availableWidth / weeks;
  const gap = Math.max(2, Math.round(pitch * 0.22));
  const cell = Math.round(pitch - gap);
  const gridWidth = weeks * (cell + gap) - gap;

  const height = gridTop + 7 * (cell + gap) + 34;
  const panelWidth = width;

  const rects = cells.map(({ week, weekday, level, date }) => {
    const x = gridLeft + week * (cell + gap);
    const y = gridTop + weekday * (cell + gap);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${Math.max(2, cell * 0.22)}" fill="${levelColor(colors, level)}"><title>${date}: level ${level}</title></rect>`;
  }).join("");

  const months = monthLabels(cells).map(({ week, month }) => {
    const x = gridLeft + week * (cell + gap);
    return `<text x="${x}" y="${gridTop - 14}" font-family="Consolas, 'Courier New', monospace" font-size="12" fill="${colors.muted}">${month}</text>`;
  }).join("");

  const legendX = gridLeft;
  const legendY = height - 14;
  const legendCells = [0, 1, 2, 3, 4].map((lvl, i) => {
    const x = legendX + 46 + i * (cell + gap);
    return `<rect x="${x}" y="${legendY - cell + 3}" width="${cell}" height="${cell}" rx="${Math.max(2, cell * 0.22)}" fill="${levelColor(colors, lvl)}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${height}" viewBox="0 0 ${panelWidth} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${username} contribution trail</title>
<desc id="desc">A ${total}-contribution heatmap over the last year, styled to match the profile console theme.</desc>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${colors.bgStart}"/>
<stop offset="1" stop-color="${colors.bgEnd}"/>
</linearGradient>
</defs>
<rect x="0" y="0" width="${panelWidth}" height="${height}" rx="14" fill="url(#bg)" stroke="${colors.border}"/>
<rect x="12" y="12" width="${panelWidth - 24}" height="${height - 24}" rx="10" fill="${colors.panel}" stroke="${colors.border}"/>
<text x="26" y="30" font-family="Consolas, 'Courier New', monospace" font-size="12" letter-spacing="1.5" fill="${colors.cyan}">CONTRIBUTION.TRAIL</text>
<text x="${panelWidth - 26}" y="30" text-anchor="end" font-family="Consolas, 'Courier New', monospace" font-size="12" fill="${colors.muted}">${total} in the last year</text>
${months}
${rects}
<text x="${legendX}" y="${legendY + 4}" font-family="Consolas, 'Courier New', monospace" font-size="10" fill="${colors.muted}">Less</text>
${legendCells}
<text x="${legendX + 46 + 5 * (cell + gap) + 6}" y="${legendY + 4}" font-family="Consolas, 'Courier New', monospace" font-size="10" fill="${colors.muted}">More</text>
</svg>`;
}

async function main() {
  const config = await loadConfig();
  const username = config.profile.username;
  const palette = config.appearance.palette;
  const { total, cells } = await fetchCalendar(username);

  const outDir = resolve(repositoryRoot, "assets/hero");
  await mkdir(outDir, { recursive: true });

  const darkSvg = buildSvg({ cells, total, username, palette, mode: "dark", width: 1180 });
  const lightSvg = buildSvg({ cells, total, username, palette, mode: "light", width: 1180 });

  await writeFile(resolve(outDir, "contribution-trail-dark.svg"), darkSvg);
  await writeFile(resolve(outDir, "contribution-trail-light.svg"), lightSvg);

  console.log(`Contribution trail generated: ${total} contributions, ${cells.length} days.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
