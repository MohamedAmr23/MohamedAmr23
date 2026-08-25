#!/usr/bin/env node
// Generates a "Top Languages" pie chart SVG (dark + light) styled to match
// the agent-console signal/ocean/solar palettes. Self-hosted so it never
// depends on the (often unstable) public github-readme-stats.vercel.app.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig, repositoryRoot } from "./lib/config.mjs";

const paletteDefinitions = {
  signal: {
    dark: { bgStart: "#020617", bgEnd: "#11152F", panel: "#07111F", border: "#1E293B", primary: "#E5E7EB", muted: "#64748B", accents: ["#22D3EE", "#38BDF8", "#7C3AED", "#2DD4BF", "#F472B6", "#FACC15", "#818CF8", "#34D399"] },
    light: { bgStart: "#F8FBFF", bgEnd: "#F5F3FF", panel: "#FFFFFF", border: "#E2E8F0", primary: "#172554", muted: "#64748B", accents: ["#0891B2", "#2563EB", "#6D28D9", "#0D9488", "#DB2777", "#CA8A04", "#4F46E5", "#059669"] }
  }
};

async function githubFetch(path) {
  const token = process.env.GITHUB_TOKEN;
  const headers = { "User-Agent": "profile-readme-generator", Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path} returned ${res.status}: ${await res.text()}`);
  return res.json();
}

async function collectLanguages(username) {
  const repos = await githubFetch(`/users/${username}/repos?per_page=100&type=owner`);
  const totals = {};

  for (const repo of repos) {
    if (repo.fork || repo.archived) continue;
    try {
      const langs = await githubFetch(`/repos/${username}/${repo.name}/languages`);
      for (const [lang, bytes] of Object.entries(langs)) {
        totals[lang] = (totals[lang] || 0) + bytes;
      }
    } catch {
      // Skip repos we can't read (e.g. rare permission edge cases)
    }
  }
  return totals;
}

function toSlices(totals, maxSlices = 8) {
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxSlices);
  const rest = sorted.slice(maxSlices).reduce((a, [, v]) => a + v, 0);
  const slices = top.map(([name, bytes]) => ({ name, pct: bytes / total }));
  if (rest > 0) slices.push({ name: "Other", pct: rest / total });
  return slices;
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const toXY = (angle) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  const [x1, y1] = toXY(startAngle);
  const [x2, y2] = toXY(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

function buildSvg({ slices, username, mode, width = 560 }) {
  const colors = paletteDefinitions.signal[mode];
  const height = 300;
  const cx = 170;
  const cy = 155;
  const r = 92;

  let angle = -Math.PI / 2;
  const paths = slices.map((slice, i) => {
    const sweep = slice.pct * Math.PI * 2;
    const path = describeArc(cx, cy, r, angle, angle + sweep);
    angle += sweep;
    const color = colors.accents[i % colors.accents.length];
    return `<path d="${path}" fill="${color}" stroke="${colors.panel}" stroke-width="2"><title>${slice.name}: ${(slice.pct * 100).toFixed(1)}%</title></path>`;
  }).join("");

  const legend = slices.map((slice, i) => {
    const color = colors.accents[i % colors.accents.length];
    const y = 40 + i * 24;
    return `
      <rect x="330" y="${y}" width="12" height="12" rx="3" fill="${color}"/>
      <text x="350" y="${y + 10.5}" font-family="Consolas, 'Courier New', monospace" font-size="12" fill="${colors.primary}">${slice.name}</text>
      <text x="${width - 26}" y="${y + 10.5}" text-anchor="end" font-family="Consolas, 'Courier New', monospace" font-size="12" fill="${colors.muted}">${(slice.pct * 100).toFixed(1)}%</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${username} top languages</title>
<desc id="desc">A pie chart of the most-used languages across public, non-fork repositories.</desc>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${colors.bgStart}"/>
<stop offset="1" stop-color="${colors.bgEnd}"/>
</linearGradient>
</defs>
<rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="url(#bg)" stroke="${colors.border}"/>
<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="10" fill="${colors.panel}" stroke="${colors.border}"/>
<text x="26" y="30" font-family="Consolas, 'Courier New', monospace" font-size="12" letter-spacing="1.5" fill="${colors.accents[0]}">TOP.LANGUAGES</text>
${paths}
${legend}
</svg>`;
}

async function main() {
  const config = await loadConfig();
  const username = config.profile.username;

  const totals = await collectLanguages(username);
  if (Object.keys(totals).length === 0) throw new Error("No language data found across public repositories.");
  const slices = toSlices(totals);

  const outDir = resolve(repositoryRoot, "assets/hero");
  await mkdir(outDir, { recursive: true });

  await writeFile(resolve(outDir, "top-languages-dark.svg"), buildSvg({ slices, username, mode: "dark" }));
  await writeFile(resolve(outDir, "top-languages-light.svg"), buildSvg({ slices, username, mode: "light" }));

  console.log(`Top languages generated: ${slices.map((s) => s.name).join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
