/* Guards the invariants that make the map playable. Run in CI on every push. */

import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('assets/data/portfolio.json', 'utf8'));
const problems = [];

const need = (cond, message) => { if (!cond) problems.push(message); };

need(config.meta?.name, 'meta.name is missing');
need(Array.isArray(config.experience) && config.experience.length, 'experience is empty');
need(config.map?.world?.width && config.map?.world?.height, 'map.world is missing');

// One canvas holds the whole world sheet; iOS Safari refuses above ~16.7 Mpx.
const megapixels = (config.map.world.width * config.map.world.height) / 1e6;
need(megapixels <= 16, `world sheet is ${megapixels.toFixed(1)} Mpx — over the ~16 Mpx canvas ceiling`);

for (const entry of config.experience) {
  const label = entry.id || entry.company;
  need(entry.id, `${label}: missing id`);
  need(entry.bullets?.length, `${label}: no bullets`);

  const mission = entry.mission;
  if (!mission) { problems.push(`${label}: no mission`); continue; }

  const have = new Set((mission.tools || []).map(t => t.domain));
  for (const tool of mission.tools || []) {
    need(config.tools?.[tool.kind], `${label}: tool "${tool.name}" has unknown kind "${tool.kind}"`);
    need(config.domains?.[tool.domain], `${label}: tool "${tool.name}" has unknown domain "${tool.domain}"`);
  }

  for (const id of mission.incidents || []) {
    const incident = config.incidents?.[id];
    if (!incident) { problems.push(`${label}: unknown incident "${id}"`); continue; }
    // The whole mechanic: an incident with no matching tool cannot be killed.
    need(have.has(incident.weakTo),
      `${label}: "${incident.name}" is weak to ${incident.weakTo}, but no tool covers that — mission is unwinnable`);
  }

  need(mission.waves > 0, `${label}: waves must be positive`);
  need(mission.keepHp > 0, `${label}: keepHp must be positive`);
}

if (problems.length) {
  console.error('portfolio.json failed validation:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`portfolio.json OK — ${config.experience.length} keeps, ${Object.keys(config.incidents || {}).length} incident types, world ${megapixels.toFixed(1)} Mpx`);
