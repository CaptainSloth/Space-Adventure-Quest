import { Sector, Planet, SectorType } from './types'

const PLANET_TYPES = ['terran', 'volcanic', 'ice', 'gas_giant', 'desert', 'ocean', 'barren']

export const generateGalaxy = (numSectors: number = 500): { sectors: Sector[], planets: Planet[] } => {
  const sectors: Sector[] = []
  const planets: Planet[] = []

  // Create base sectors
  for (let i = 1; i <= numSectors; i++) {
    let type: SectorType = 'normal'
    let name = `Sector ${i}`
    
    // Tiered Sector Types
    if (i === 1) {
      type = 'home_alliance'
      name = 'Terra Prime'
    } else if (i === numSectors) {
      type = 'home_empire'
      name = 'Fortress Krath'
    } else if (i > numSectors * 0.8) {
      // Deep Space (401-500)
      const roll = Math.random()
      if (roll < 0.1) type = 'black_hole'
      else if (roll < 0.3) type = 'asteroid_field'
      else if (roll < 0.5) type = 'nebula'
      else type = 'normal'
      name = `Deep Space ${i}`
    } else if (i > numSectors * 0.2) {
      // Rim Space (101-400)
      const roll = Math.random()
      if (roll < 0.05) type = 'station'
      else if (roll < 0.15) type = 'nebula'
      else type = 'normal'
    }

    sectors.push({
      id: i,
      name,
      type,
      warps: [],
      portType: Math.random() < 0.4 ? Math.floor(Math.random() * 8) + 1 : undefined
    })

    // Generate 0-5 planets per sector
    const numPlanets = type === 'black_hole' ? 0 : Math.floor(Math.random() * 6)
    for (let j = 0; j < numPlanets; j++) {
      const pType = PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)]
      planets.push({
        id: Math.random().toString(36).substring(7),
        sectorId: i,
        name: `Planet ${i}-${j + 1}`,
        type: pType as any,
        population: 0,
        maxPopulation: pType === 'terran' ? 100000 : 10000,
        credits: 0,
        fighters: 0,
        shields: 0,
        oreMiners: 0,
        fuelMiners: 0,
        equipmentMiners: 0,
        taxRate: 0.1,
        accessPolicy: 'open',
        createdAt: new Date().toISOString()
      })
    }
  }

  // 1. Ensure path from 1 to numSectors
  for (let i = 1; i < numSectors; i++) {
    connect(sectors, i, i + 1)
  }

  // 2. Add extra random warps (2-6 total per sector)
  for (let i = 1; i <= numSectors; i++) {
    const sector = sectors[i - 1]
    const connectionsToMake = Math.floor(Math.random() * 4) + 1 
    
    for (let j = 0; j < connectionsToMake; j++) {
      if (sector.warps.length >= 6) break
      
      // Core sectors (1-100) connect locally
      // Deep sectors (400+) can connect anywhere (wormholes)
      const isDeep = sector.id > numSectors * 0.8
      const range = isDeep ? numSectors : 50
      
      const targetId = Math.max(1, Math.min(numSectors, i + Math.floor(Math.random() * range * 2) - range))
      if (targetId !== i) {
        connect(sectors, i, targetId)
      }
    }
  }

  return { sectors, planets }
}

function connect(sectors: Sector[], id1: number, id2: number) {
  const s1 = sectors[id1 - 1]
  const s2 = sectors[id2 - 1]

  if (s1.warps.length < 6 && s2.warps.length < 6) {
    if (!s1.warps.includes(id2)) s1.warps.push(id2)
    if (!s2.warps.includes(id1)) s2.warps.push(id1)
  }
}
