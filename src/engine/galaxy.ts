import { Sector } from './types'

export const generateGalaxy = (numSectors: number = 500): Sector[] => {
  const sectors: Sector[] = []

  // Create base sectors
  for (let i = 1; i <= numSectors; i++) {
    sectors.push({
      id: i,
      name: i === 1 ? 'Terra Prime' : i === numSectors ? 'Fortress Krath' : `Sector ${i}`,
      type: i === 1 ? 'home_alliance' : i === numSectors ? 'home_empire' : 'normal',
      warps: [],
      portType: Math.random() < 0.4 ? Math.floor(Math.random() * 8) + 1 : undefined
    })
  }

  // Generate warp connections using a simplified "nearest neighbor" or random graph approach
  // We need to ensure connectivity. A simple way is to connect i to i+1 randomly,
  // and then add some random shortcuts.
  
  // 1. Ensure path from 1 to numSectors
  for (let i = 1; i < numSectors; i++) {
    connect(sectors, i, i + 1)
  }

  // 2. Add extra random warps (2-6 total per sector)
  for (let i = 1; i <= numSectors; i++) {
    const sector = sectors[i - 1]
    const connectionsToMake = Math.floor(Math.random() * 4) + 1 // Add 1-4 more
    
    for (let j = 0; j < connectionsToMake; j++) {
      if (sector.warps.length >= 6) break

      // Pick a random target within a reasonable range to avoid "long jumps" everywhere
      const range = 50
      const targetId = Math.max(1, Math.min(numSectors, i + Math.floor(Math.random() * range * 2) - range))
      
      if (targetId !== i) {
        connect(sectors, i, targetId)
      }
    }
  }

  return sectors
}

function connect(sectors: Sector[], id1: number, id2: number) {
  const s1 = sectors[id1 - 1]
  const s2 = sectors[id2 - 1]

  if (s1.warps.length < 6 && s2.warps.length < 6) {
    if (!s1.warps.includes(id2)) s1.warps.push(id2)
    if (!s2.warps.includes(id1)) s2.warps.push(id1)
  }
}
