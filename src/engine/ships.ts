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
  isLegendary?: boolean
}

export const SHIP_TEMPLATES: ShipTemplate[] = [
  // TIER 1 - Scouts & Interceptors
  { id: 'wasp', name: 'Wasp', baseHolds: 5, baseShields: 10, baseFighters: 0, baseCost: 500, tier: 1, description: 'Basic scout.' },
  { id: 'dart', name: 'Dart', baseHolds: 3, baseShields: 15, baseFighters: 0, baseCost: 600, tier: 1, description: 'Fast interceptor.' },
  { id: 'gnat', name: 'Gnat', baseHolds: 2, baseShields: 5, baseFighters: 0, baseCost: 300, tier: 1, description: 'Tiny, nimble probe.' },
  { id: 'mosquito', name: 'Mosquito', baseHolds: 4, baseShields: 12, baseFighters: 0, baseCost: 550, tier: 1, description: 'Irritatingly fast.' },
  
  // TIER 2 - Traders & Scavengers
  { id: 'hauler', name: 'Hauler', baseHolds: 25, baseShields: 5, baseFighters: 0, baseCost: 1200, tier: 2, description: 'Basic trade vessel.' },
  { id: 'vulture', name: 'Vulture', baseHolds: 15, baseShields: 30, baseFighters: 2, baseCost: 1800, tier: 2, description: 'Armed scavenger.' },
  { id: 'mule', name: 'Mule', baseHolds: 40, baseShields: 10, baseFighters: 0, baseCost: 2200, tier: 2, description: 'Heavy freighter.' },
  { id: 'badger', name: 'Badger', baseHolds: 12, baseShields: 40, baseFighters: 1, baseCost: 2000, tier: 2, description: 'Tough industrial ship.' },

  // TIER 3 - Frigates & Heavy Combat
  { id: 'falcon', name: 'Falcon', baseHolds: 10, baseShields: 60, baseFighters: 5, baseCost: 3500, tier: 3, description: 'Combat frigate.' },
  { id: 'viper', name: 'Viper', baseHolds: 8, baseShields: 45, baseFighters: 3, baseCost: 3200, tier: 3, description: 'Strike craft.' },
  { id: 'hammer', name: 'Hammer', baseHolds: 12, baseShields: 100, baseFighters: 2, baseCost: 4500, tier: 3, description: 'Battering ram frigate.' },
  { id: 'spectre', name: 'Spectre', baseHolds: 6, baseShields: 30, baseFighters: 4, baseCost: 5000, tier: 3, description: 'Electronic warfare vessel.' },

  // TIER 4 - Cruisers
  { id: 'warhawk', name: 'Warhawk', baseHolds: 20, baseShields: 150, baseFighters: 10, baseCost: 8500, tier: 4, description: 'Heavy cruiser.' },
  { id: 'goliath', name: 'Goliath', baseHolds: 60, baseShields: 100, baseFighters: 5, baseCost: 9000, tier: 4, description: 'Bulk transport cruiser.' },
  { id: 'chimera', name: 'Chimera', baseHolds: 15, baseShields: 120, baseFighters: 15, baseCost: 11000, tier: 4, description: 'Multi-role cruiser.' },

  // TIER 5 - Capital Ships
  { id: 'titan', name: 'Titan', baseHolds: 100, baseShields: 300, baseFighters: 25, baseCost: 25000, tier: 5, description: 'Capital ship.' },
  { id: 'leviathan', name: 'Leviathan', baseHolds: 150, baseShields: 250, baseFighters: 20, baseCost: 28000, tier: 5, description: 'Massive carrier.' },
  { id: 'behemoth', name: 'Behemoth', baseHolds: 300, baseShields: 150, baseFighters: 10, baseCost: 30000, tier: 5, description: 'Extreme cargo hauler.' }
]

export const LEGENDARY_SHIPS: GeneratedShip[] = [
  {
    templateId: 'legend_killer',
    instanceName: '`%1THE PLANET KILLER` %7',
    holds: 50,
    shields: 1500,
    fighters: 100,
    cost: 250000,
    description: 'A terrifying relic of the Great Warp Collapse.',
    tier: 10,
    modifiers: ['Cursed', 'Ancient'],
    isLegendary: true
  },
  {
    templateId: 'legend_void',
    instanceName: '`%dGHOST OF THE VOID` %7',
    holds: 10,
    shields: 500,
    fighters: 50,
    cost: 180000,
    description: 'Its hull shimmers between dimensions.',
    tier: 10,
    modifiers: ['Phasing', 'Ethereal'],
    isLegendary: true
  },
  {
    templateId: 'legend_gold',
    instanceName: '`%bMIDAS TOUCH` %7',
    holds: 1000,
    shields: 100,
    fighters: 0,
    cost: 500000,
    description: 'The ultimate trading vessel. Pure gold plating.',
    tier: 10,
    modifiers: ['Opulent', 'Gilded'],
    isLegendary: true
  },
  {
    templateId: 'legend_shadow',
    instanceName: '`%8SHADOW OF THE EMPIRE` %7',
    holds: 20,
    shields: 800,
    fighters: 40,
    cost: 220000,
    description: 'The Emperors personal stealth yacht.',
    tier: 10,
    modifiers: ['Hidden', 'Imperial'],
    isLegendary: true
  }
]

export const SHIP_PREFIXES: ShipModifier[] = [
  { name: 'Reinforced', holdsMod: 1, shieldsMod: 1.5, fightersMod: 1, costMod: 1.3, desc: 'Extra hull plating.' },
  { name: 'Stealth', holdsMod: 0.8, shieldsMod: 0.8, fightersMod: 1, costMod: 1.5, desc: 'Low radar signature.' },
  { name: 'Heavy', holdsMod: 1.2, shieldsMod: 1.2, fightersMod: 1.2, costMod: 1.4, desc: 'Bulkier frame.' },
  { name: 'Ancient', holdsMod: 1, shieldsMod: 2, fightersMod: 1, costMod: 3, desc: 'Forgotten technology.' },
  { name: 'Rusty', holdsMod: 0.9, shieldsMod: 0.7, fightersMod: 1, costMod: 0.5, desc: 'Barely holding together.' },
  { name: 'Prototype', holdsMod: 1, shieldsMod: 1.1, fightersMod: 1.5, costMod: 2, desc: 'Experimental systems.' },
  { name: 'Sleek', holdsMod: 0.9, shieldsMod: 1, fightersMod: 1, costMod: 1.2, desc: 'Aerodynamic design.' },
  { name: 'Armored', holdsMod: 1, shieldsMod: 1.8, fightersMod: 0.8, costMod: 1.6, desc: 'Plated for war.' }
]

export const SHIP_SUFFIXES: ShipModifier[] = [
  { name: 'Mk.II', holdsMod: 1.1, shieldsMod: 1.1, fightersMod: 1.1, costMod: 1.2, desc: 'Improved model.' },
  { name: 'Mk.III', holdsMod: 1.2, shieldsMod: 1.2, fightersMod: 1.2, costMod: 1.5, desc: 'Advanced model.' },
  { name: 'Elite', holdsMod: 1.3, shieldsMod: 1.3, fightersMod: 1.3, costMod: 2, desc: 'Top of the line.' },
  { name: 'Custom', holdsMod: 1.5, shieldsMod: 1, fightersMod: 1, costMod: 1.4, desc: 'Modified for storage.' },
  { name: 'Intercept', holdsMod: 0.7, shieldsMod: 1.2, fightersMod: 1.5, costMod: 1.8, desc: 'Combat tuned.' }
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

export function getRandomShipyardStock(count: number = 5): GeneratedShip[] {
  const stock: GeneratedShip[] = []
  for (let i = 0; i < count; i++) {
    // 5% chance for a Legendary ship
    if (Math.random() < 0.05) {
      const legend = LEGENDARY_SHIPS[Math.floor(Math.random() * LEGENDARY_SHIPS.length)]
      stock.push(legend)
      continue
    }

    const tIdx = Math.floor(Math.random() * SHIP_TEMPLATES.length)
    const pIdx = Math.random() > 0.4 ? Math.floor(Math.random() * SHIP_PREFIXES.length) : undefined
    const sIdx = Math.random() > 0.4 ? Math.floor(Math.random() * SHIP_SUFFIXES.length) : undefined
    stock.push(generateShip(SHIP_TEMPLATES[tIdx].id, pIdx, sIdx))
  }
  return stock
}
