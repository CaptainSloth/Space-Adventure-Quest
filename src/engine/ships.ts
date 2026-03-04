export interface ShipTemplate {
  id: string
  name: string
  baseHolds: number
  baseShields: number
  baseFighters: number
  baseCost: number
  description: string
  tier: number
}

export interface ShipModifier {
  name: string
  holdsMod: number
  shieldsMod: number
  fightersMod: number
  costMod: number
  desc: string
}

export interface GeneratedShip {
  templateId: string
  instanceName: string
  holds: number
  shields: number
  fighters: number
  cost: number
  description: string
  tier: number
  modifiers: string[]
}

export const SHIP_TEMPLATES: ShipTemplate[] = [
  { id: 'wasp', name: 'Wasp', baseHolds: 5, baseShields: 10, baseFighters: 0, baseCost: 500, tier: 1, description: 'Basic scout.' },
  { id: 'dart', name: 'Dart', baseHolds: 3, baseShields: 15, baseFighters: 0, baseCost: 600, tier: 1, description: 'Fast interceptor.' },
  { id: 'hauler', name: 'Hauler', baseHolds: 20, baseShields: 5, baseFighters: 0, baseCost: 1000, tier: 2, description: 'Trade vessel.' },
  { id: 'falcon', name: 'Falcon', baseHolds: 10, baseShields: 50, baseFighters: 5, baseCost: 2500, tier: 3, description: 'Combat frigate.' },
  { id: 'vulture', name: 'Vulture', baseHolds: 15, baseShields: 30, baseFighters: 2, baseCost: 1800, tier: 2, description: 'Scavenger ship.' },
  { id: 'titan', name: 'Titan', baseHolds: 50, baseShields: 200, baseFighters: 20, baseCost: 15000, tier: 5, description: 'Capital ship.' },
  // ... Imagine 50+ more here
]

export const SHIP_PREFIXES: ShipModifier[] = [
  { name: 'Reinforced', holdsMod: 0, shieldsMod: 1.5, fightersMod: 1, costMod: 1.3, desc: 'Extra hull plating.' },
  { name: 'Stealth', holdsMod: 0.8, shieldsMod: 0.8, fightersMod: 1, costMod: 1.5, desc: 'Low radar signature.' },
  { name: 'Heavy', holdsMod: 1.2, shieldsMod: 1.2, fightersMod: 1.2, costMod: 1.4, desc: 'Bulkier frame.' },
  { name: 'Ancient', holdsMod: 1, shieldsMod: 2, fightersMod: 1, costMod: 3, desc: 'Forgotten technology.' },
  { name: 'Rusty', holdsMod: 0.9, shieldsMod: 0.7, fightersMod: 1, costMod: 0.5, desc: 'Barely holding together.' },
  { name: 'Prototype', holdsMod: 1, shieldsMod: 1.1, fightersMod: 1.5, costMod: 2, desc: 'Experimental systems.' }
]

export const SHIP_SUFFIXES: ShipModifier[] = [
  { name: 'Mk.II', holdsMod: 1.1, shieldsMod: 1.1, fightersMod: 1.1, costMod: 1.2, desc: 'Improved model.' },
  { name: 'Mk.III', holdsMod: 1.2, shieldsMod: 1.2, fightersMod: 1.2, costMod: 1.5, desc: 'Advanced model.' },
  { name: 'Elite', holdsMod: 1.3, shieldsMod: 1.3, fightersMod: 1.3, costMod: 2, desc: 'Top of the line.' },
  { name: 'Custom', holdsMod: 1.5, shieldsMod: 1, fightersMod: 1, costMod: 1.4, desc: 'Modified for storage.' }
]

export function generateShip(templateId: string, prefixIdx?: number, suffixIdx?: number): GeneratedShip {
  const template = SHIP_TEMPLATES.find(t => t.id === templateId) || SHIP_TEMPLATES[0]
  const prefix = prefixIdx !== undefined ? SHIP_PREFIXES[prefixIdx] : null
  const suffix = suffixIdx !== undefined ? SHIP_SUFFIXES[suffixIdx] : null

  let holds = template.baseHolds
  let shields = template.baseShields
  let fighters = template.baseFighters
  let cost = template.baseCost
  let name = template.name
  let desc = template.description
  const activeMods: string[] = []

  if (prefix) {
    holds *= prefix.holdsMod
    shields *= prefix.shieldsMod
    fighters *= prefix.fightersMod
    cost *= prefix.costMod
    name = `${prefix.name} ${name}`
    desc = `${prefix.desc} ${desc}`
    activeMods.push(prefix.name)
  }

  if (suffix) {
    holds *= suffix.holdsMod
    shields *= suffix.shieldsMod
    fighters *= suffix.fightersMod
    cost *= suffix.costMod
    name = `${name} ${suffix.name}`
    desc = `${desc} ${suffix.desc}`
    activeMods.push(suffix.name)
  }

  return {
    templateId: template.id,
    instanceName: name,
    holds: Math.floor(holds),
    shields: Math.floor(shields),
    fighters: Math.floor(fighters),
    cost: Math.floor(cost),
    description: desc,
    tier: template.tier,
    modifiers: activeMods
  }
}

export function getRandomShipyardStock(count: number = 3): GeneratedShip[] {
  const stock: GeneratedShip[] = []
  for (let i = 0; i < count; i++) {
    const tIdx = Math.floor(Math.random() * SHIP_TEMPLATES.length)
    const pIdx = Math.random() > 0.5 ? Math.floor(Math.random() * SHIP_PREFIXES.length) : undefined
    const sIdx = Math.random() > 0.5 ? Math.floor(Math.random() * SHIP_SUFFIXES.length) : undefined
    stock.push(generateShip(SHIP_TEMPLATES[tIdx].id, pIdx, sIdx))
  }
  return stock
}
