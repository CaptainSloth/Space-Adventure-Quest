import { app } from 'electron'
import { GameState, SceneViewModel, SceneId, SerializableSceneViewModel, CombatSide, OnlinePlayer, ChatMessage, GlobalEvent } from '../types'
import { getPortInventory } from '../trading'
import { initCombat, processCombatRound } from '../combat'
import { dbOps } from '../../main/db'

export type SceneRegistry = {
  [K in SceneId]?: (state: GameState) => SceneViewModel
}

const getAlignmentTitle = (alignment: number): string => {
  if (alignment >= 800) return '%e[PALADIN]'
  if (alignment >= 400) return '%a[HERO]'
  if (alignment >= 100) return '%2[GOOD]'
  if (alignment <= -800) return '%1[DREAD LORD]'
  if (alignment <= -400) return '%9[VILLAIN]'
  if (alignment <= -100) return '%1[OUTLAW]'
  return '%7[NEUTRAL]'
}

export const toSerializable = (
  vm: SceneViewModel, 
  lastMessage?: string | null, 
  selectedPlanetId?: string | null,
  playerList?: { id: string, name: string }[],
  onlinePlayers?: OnlinePlayer[],
  chatMessages?: ChatMessage[],
  globalEvents?: GlobalEvent[],
  rankings?: any,
  bounties?: any[],
  currentCompany?: any,
  companyMembers?: any[],
  availableCompanies?: any[],
  companyChatMessages?: any[],
  companyAlliances?: any[]
): SerializableSceneViewModel => {
  return {
    title: vm.title,
    description: vm.description,
    ascii: vm.ascii,
    lastMessage,
    selectedPlanetId,
    playerList,
    onlinePlayers,
    chatMessages,
    globalEvents,
    rankings,
    bounties,
    currentCompany,
    companyMembers,
    availableCompanies,
    companyChatMessages,
    companyAlliances,
    options: vm.options.map(o => ({ label: o.label, key: o.key }))
  }
}

const registry: SceneRegistry = {
  title: (state) => ({
    title: '`%eSPACE ADVENTURE QUEST`%7',
    description: '`%bMultiplayer Space Odyssey — v1.0.0`%7\n\nWelcome to the frontier, pilot. The year is 3026. The galaxy is divided. The Alliance, the Empire, and the independent Neutral systems vie for control of the warp gates. Your journey starts here.',
    ascii: [
      "   `%f.    %b*    %f.      .   .   `%7",
      "      `%f.   %e_    %f.    .    .  `%7",
      "   `%f.    %e/ \\      %f.    %b*     `%7",
      "  `%f.    %e|   |  %f.    .    .   `%7",
      "   `%f.    %e\\_/    %f.     .      `%7",
      "      `%b*      %f.    .    %b*    `%7",
      "",
      "   `%9<---[%c==`%f==`%c==`%9]--->`%7",
      "    `%9\\_  `%f[SAQ-1]  `%9_/`%7",
      "      `%9--`%e=---=`%9--`%7"
    ],
    options: [
      { label: 'Login', key: 'L', action: async (s) => ({ ...s, currentScene: 'login' }) },
      { label: 'Create New Character', key: 'C', action: async (s) => ({ ...s, currentScene: 'create_character' }) },
      { label: 'Quit', key: 'Q', action: async (s) => { app.quit(); return s } }
    ]
  }),
  login: (state) => ({
    title: '`%eCHARACTER LOGIN` %7',
    description: '`%7Access the Starfleet databanks. Choose your pilot to resume your journey.',
    options: [
      { label: 'Back to Title', key: 'B', action: async (s) => ({ ...s, currentScene: 'title' }) }
    ]
  }),
  create_character: (state) => ({
    title: '`%aCHARACTER REGISTRATION` %7',
    description: '`%7The Starfleet Academy requires your details to issue a flight license. Once you have entered your name, choose your faction alignment to proceed.',
    options: [
      { label: 'Join The Alliance (Good)', key: 'A', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'alliance' }, currentScene: 'bridge' }) },
      { label: 'Join The Empire (Evil)', key: 'E', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'empire' }, currentScene: 'bridge' }) },
      { label: 'Remain Neutral', key: 'N', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'neutral' }, currentScene: 'bridge' }) }
    ]
  }),
  bridge: (state) => ({
    title: '`%eSHIP BRIDGE` %7',
    description: `Title: ${getAlignmentTitle(state.player?.alignment || 0)} \`%f${state.player?.name}\` %7
Sector: \`%f${state.player?.sectorId}\` %7 | Turns: \`%f${state.player?.turns}\` %7
Status: \`%aONLINE\` %7 | Shields: \`%c${state.player?.shields}%\` %7
${state.currentCompany ? `Company: \`%b${state.currentCompany.name}\` %7` : ''}`,
    ascii: [
      "      `%8_________`%7",
      "     `%8/         \\`%7",
      "    `%8/           \\`%7",
      "   `%8|   `%a[SCAN]   `%8|`%7",
      "   `%8|   `%e[WARN]   `%8|`%7",
      "   `%8\\___________/`%7",
      "    `%8|  |___|  |`%7",
      "   `%8/___________\\`%7"
    ],
    options: [
      { label: 'Navigation', key: 'N', action: async (s) => ({ ...s, currentScene: 'navigation' }) },
      { label: 'Sector View', key: 'V', action: async (s) => ({ ...s, currentScene: 'sector_view' }) },
      { label: 'Port Services', key: 'P', action: async (s) => ({ ...s, currentScene: 'port' }) },
      { label: 'Shipyard', key: 'Y', action: async (s) => ({ ...s, currentScene: 'shipyard' }) },
      { label: 'Inventory', key: 'I', action: async (s) => ({ ...s, currentScene: 'inventory' }) },
      { label: 'Status Scan', key: 'S', action: async (s) => ({ ...s, currentScene: 'scan' }) },
      { label: 'Bounty Board', key: 'D', action: async (s) => ({ ...s, currentScene: 'bounty_board' }) },
      { label: 'Rankings', key: 'K', action: async (s) => ({ ...s, currentScene: 'rankings' }) },
      { label: 'Company', key: 'C', action: async (s) => ({ ...s, currentScene: 'company' }) },
      { label: 'Faction HQ', key: 'H', action: async (s) => ({ ...s, currentScene: 'faction_hq' }) },
      { label: 'Comm Link (Chat)', key: 'M', action: async (s) => ({ ...s, currentScene: 'messages' }) },
      { label: 'ADMIN MODE', key: '!', action: async (s) => ({ ...s, currentScene: 'admin' }) }
    ]
  }),
  company: (state) => {
    if (state.currentCompany) {
      return {
        title: `\`%bCOMPANY: ${state.currentCompany.name}\` %7`,
        description: `CEO: \`%f${state.companyMembers.find(m => m.role === 'ceo')?.playerName}\` %7
Treasury: \`%e${state.currentCompany.treasury}\` %7 cr
Members Online: \`%a${state.companyMembers.length}\` %7

Secure company link active.`,
        options: [
          { label: 'Member List', key: 'M', action: async (s) => ({ ...s, currentScene: 'company_members' }) },
          { label: 'Private Chat', key: 'C', action: async (s) => ({ ...s, currentScene: 'company_chat' }) },
          { label: 'Treasury (Deposit 1k)', key: 'T', action: async (s) => {
             return { ...s, lastMessage: 'Depositing credits...' } // handled by IPC override in App.tsx
          }},
          { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
        ]
      }
    }

    return {
      title: '`%bGALACTIC COMPANIES` %7',
      description: `You are not currently a member of any company.
You can found a new company for \`%e5000\` %7 credits or join an existing one.`,
      options: [
        { label: 'Found New Company', key: 'F', action: async (s) => ({ ...s, currentScene: 'company_create' }) },
        ...state.availableCompanies.map((c, i) => ({
          label: `Join ${c.name} (${c.faction})`,
          key: (i + 1).toString(),
          action: async (s: GameState) => {
             return { ...s, lastMessage: `Requesting to join ${c.name}...` }
          }
        })),
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  company_create: (state) => ({
    title: '`%bFOUND NEW COMPANY` %7',
    description: 'Enter the name of your new galactic enterprise. Registration cost: `%e5000` %7 credits.',
    options: [
      { label: 'Submit Registration', key: 'S', action: async (s) => ({ ...s, lastMessage: 'Processing registration...' }) },
      { label: 'Cancel', key: 'C', action: async (s) => ({ ...s, currentScene: 'company' }) }
    ]
  }),
  company_members: (state) => ({
    title: '`%bCOMPANY MEMBERS` %7',
    description: `Current roster for \`%f${state.currentCompany?.name}\` %7:
${state.companyMembers.map(m => `- \`%f${m.playerName}\` %7 [${m.role.toUpperCase()}] - Level \`%a${m.playerLevel}\` %7`).join('\n')}`,
    options: [
      { label: 'Back to Company', key: 'B', action: async (s) => ({ ...s, currentScene: 'company' }) }
    ]
  }),
  company_chat: (state) => ({
    title: '`%bCOMPANY CHAT` %7',
    description: `Secure channel for \`%f${state.currentCompany?.name}\` %7.`,
    options: [
      { label: 'Back to Company', key: 'B', action: async (s) => ({ ...s, currentScene: 'company' }) }
    ]
  }),
  faction_hq: (state) => {
    const isHome = (state.player?.faction === 'alliance' && state.player?.sectorId === 1) || 
                   (state.player?.faction === 'empire' && state.player?.sectorId === 500)
    
    if (!isHome) {
      return {
        title: '`%1HQ ACCESS DENIED` %7',
        description: 'You must be at your faction home system to access HQ protocols.',
        options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
      }
    }

    return {
      title: `\`%e${state.player?.faction?.toUpperCase()} COMMAND HQ\` %7`,
      description: 'Welcome back, pilot. The war effort continues.',
      options: [
        { label: 'Faction Missions', key: 'M', action: async (s) => ({ ...s, lastMessage: 'Missions not yet available.' }) },
        { label: 'Request Reinforcements', key: 'R', action: async (s) => ({ ...s, lastMessage: 'Reinforcements are already deployed to this system.' }) },
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  bounty_board: (state) => ({
    title: '`%bBOUNTY BOARD` %7',
    description: `Active missions for Captain \`%f${state.player?.name}\` %7:
${state.bounties.length > 0 
  ? state.bounties.map(b => `- \`%e${b.type.toUpperCase()}\` %7: ${b.target} (${b.progress}/${b.required}) - Reward: \`%f${b.reward}\` %7 cr`).join('\n')
  : 'No active bounties. Check back later.'}`,
    options: [
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  rankings: (state) => {
    const r = state.rankings
    return {
      title: '`%eGALACTIC RANKINGS` %7',
      description: `
\`%bTOP PILOTS BY NET WORTH\` %7
${r?.netWorth.map((e, i) => `${i + 1}. \`%f${e.name}\` %7 - \`%e${e.value}\` %7 cr`).join('\n')}

\`%1TOP HUNTERS (KILLS)\` %7
${r?.kills.map((e, i) => `${i + 1}. \`%f${e.name}\` %7 - \`%1${e.value}\` %7 kills`).join('\n')}

\`%aMOST NOTORIOUS (ALIGNMENT)\` %7
${r?.alignment.map((e, i) => `${i + 1}. \`%f${e.name}\` %7 - [${e.value}]`).join('\n')}
`,
      options: [
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  admin: (state) => ({
    title: '`%1SYSTEM ADMINISTRATION` %7',
    description: '`%7Deep access protocols active. Modify local reality at your own risk.',
    options: [
      { label: 'Reset NPC Cooldowns', key: 'R', action: async (s) => {
        dbOps.resetAllNpcCooldowns()
        return { ...s, lastMessage: 'All NPC cooldowns cleared.' }
      }},
      { label: 'Add 5000 Credits', key: 'C', action: async (s) => {
        return { ...s, player: { ...s.player!, credits: s.player!.credits + 5000 }, lastMessage: 'Credits deposited.' }
      }},
      { label: 'Refill Turns', key: 'T', action: async (s) => {
        return { ...s, player: { ...s.player!, turns: s.player!.maxTurns }, lastMessage: 'Energy banks replenished.' }
      }},
      { label: 'Generate Test Bounty', key: 'G', action: async (s) => {
        dbOps.createBounty({
          playerId: s.player!.id,
          type: 'kill',
          target: 'npc_vex',
          required: 1,
          reward: 500,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        return { ...s, lastMessage: 'Test bounty issued.' }
      }},
      { label: 'Alignment: HERO', key: 'H', action: async (s) => ({ ...s, player: { ...s.player!, alignment: 500 }, lastMessage: 'Alignment set to Heroic.' }) },
      { label: 'Alignment: VILLAIN', key: 'V', action: async (s) => ({ ...s, player: { ...s.player!, alignment: -500 }, lastMessage: 'Alignment set to Villainous.' }) },
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  shipyard: (state) => {
    const weaponCost = (state.player?.weaponLevel || 1) * 1000
    const shieldCost = (state.player?.shieldLevel || 1) * 1000
    const engineCost = (state.player?.engineLevel || 1) * 1000

    return {
      title: '`%eGALACTIC SHIPYARD` %7',
      description: `Credits: \`%f${state.player?.credits}\` %7

Weapon Level: \`%f${state.player?.weaponLevel}\` %7 -> [W] Upgrade (\`%e${weaponCost}\` %7 credits)
Shield Level: \`%f${state.player?.shieldLevel}\` %7 -> [S] Upgrade (\`%e${shieldCost}\` %7 credits)
Engine Level: \`%f${state.player?.engineLevel}\` %7 -> [E] Upgrade (\`%e${engineCost}\` %7 credits)`,
      options: [
        { label: 'Upgrade Weapons', key: 'W', action: async (s) => {
          if (s.player!.credits >= weaponCost) {
             return { ...s, player: { ...s.player!, credits: s.player!.credits - weaponCost, weaponLevel: s.player!.weaponLevel + 1 }, lastMessage: 'Weapons upgraded!' }
          }
          return { ...s, lastMessage: 'Not enough credits!' }
        }},
        { label: 'Upgrade Shields', key: 'S', action: async (s) => {
          if (s.player!.credits >= shieldCost) {
             return { ...s, player: { ...s.player!, credits: s.player!.credits - shieldCost, shieldLevel: s.player!.shieldLevel + 1, maxShields: (s.player!.shieldLevel + 1) * 100 }, lastMessage: 'Shields upgraded!' }
          }
          return { ...s, lastMessage: 'Not enough credits!' }
        }},
        { label: 'Upgrade Engines', key: 'E', action: async (s) => {
          if (s.player!.credits >= engineCost) {
             return { ...s, player: { ...s.player!, credits: s.player!.credits - engineCost, engineLevel: s.player!.engineLevel + 1 }, lastMessage: 'Engines upgraded!' }
          }
          return { ...s, lastMessage: 'Not enough credits!' }
        }},
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  sector_view: (state) => {
    const deployments = dbOps.getSectorDeployments(state.currentSector!.id)
    return {
      title: '`%eSECTOR VIEW` %7',
      description: `You are in Sector \`%f${state.currentSector?.id}\`%7.
Planets detected: \`%c${state.currentPlanets.length}\`%7
${state.currentPlanets.map((p, i) => `  ${i + 1}. ${p.name} (%b${p.type}%7)${p.ownerName ? ` - Owned by %e${p.ownerName}%7` : ' - %aUNOWNED%7'}`).join('\n')}

\`%bSECTOR ASSETS:\` %7
${deployments.length > 0 ? deployments.map(d => `- \`%f${d.quantity}\` %7 ${d.type}(s) [Owner: ${d.playerName}]`).join('\n') : 'None detected.'}`,
      options: [
        ...state.currentPlanets.map((p, i) => ({
          label: `Land on ${p.name}`,
          key: (i + 1).toString(),
          action: async (s: GameState) => ({ 
            ...s, 
            selectedPlanetId: p.id,
            currentScene: 'planet_surface', 
            lastMessage: `Landing on ${p.name}...` 
          })
        })),
        { label: 'Deploy Fighter (500cr)', key: 'F', action: async (s) => {
          if (s.player!.credits >= 500) {
            dbOps.deploySectorAsset(s.currentSector!.id, s.player!.id, 'fighter', 1)
            return { ...s, player: { ...s.player!, credits: s.player!.credits - 500 }, lastMessage: 'Fighter deployed to sector.' }
          }
          return { ...s, lastMessage: 'Not enough credits!' }
        }},
        { label: 'Deploy Mine (300cr)', key: 'M', action: async (s) => {
          if (s.player!.credits >= 300) {
            dbOps.deploySectorAsset(s.currentSector!.id, s.player!.id, 'mine', 1)
            return { ...s, player: { ...s.player!, credits: s.player!.credits - 300 }, lastMessage: 'Space mine deployed to sector.' }
          }
          return { ...s, lastMessage: 'Not enough credits!' }
        }},
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  planet_surface: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    return {
      title: `\`%aPLANET: ${planet?.name || 'Unknown'}\` %7`,
      description: `Type: \`%b${planet?.type}\`%7
Population: \`%f${planet?.population}\`%7 / \`%f${planet?.maxPopulation}\`%7
Owner: ${planet?.ownerName ? `\`%e${planet.ownerName}\`%7` : '`%aNONE`%7'}

Welcome to the surface.`,
      options: [
        ...(planet && !planet.ownerId ? [{
          label: 'Claim Planet',
          key: 'C',
          action: async (s: GameState) => {
             return { 
               ...s, 
               player: { ...s.player!, alignment: s.player!.alignment + 5 },
               lastMessage: `Requesting claim for ${planet.id}` 
             }
          }
        }] : []),
        { label: 'Planet Management', key: 'M', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) },
        { label: 'Return to Orbit', key: 'R', action: async (s) => ({ ...s, currentScene: 'bridge', selectedPlanetId: null }) }
      ]
    }
  },
  planet_manage: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    const isOwner = planet?.ownerId === state.player?.id
    
    if (!isOwner) {
      return {
        title: '%1ACCESS DENIED',
        description: 'You do not own this planet. You are not authorized to manage its systems.',
        options: [{ label: 'Back to Surface', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_surface' }) }]
      }
    }

    return {
      title: `\`%eMANAGE: ${planet?.name}\` %7`,
      description: `Tax Rate: \`%f${(planet?.taxRate || 0) * 100}%\` %7 | Access: \`%b${planet?.accessPolicy?.toUpperCase() || 'OPEN'}\` %7
Miners: \`%f${(planet?.oreMiners || 0) + (planet?.fuelMiners || 0) + (planet?.equipmentMiners || 0)}\` %7
Defense: \`%c${planet?.fighters || 0}\` %7 Fighters, \`%c${planet?.shields || 0}%\` %7 Shields`,
      options: [
        { label: 'View Daily Report', key: 'R', action: async (s) => ({ ...s, lastMessage: 'Daily report: Population grew by 150. Tax collected: 15 credits.' }) },
        { label: 'Set Tax Rate', key: 'T', action: async (s) => {
          const rates = [0.05, 0.10, 0.15, 0.20, 0.25]
          const currentIdx = rates.indexOf(planet!.taxRate)
          const nextRate = rates[(currentIdx + 1) % rates.length]
          dbOps.updatePlanetTaxRate(planet!.id, nextRate)
          return { ...s, lastMessage: `Tax rate adjusted to ${nextRate * 100}%.` }
        }},
        { label: 'Rename Planet', key: 'N', action: async (s) => {
          const names = ['New Tortuga', 'Sanctuary', 'Alpha Base', 'Outpost 9', 'The Rim']
          const nextName = names[Math.floor(Math.random() * names.length)]
          dbOps.updatePlanetName(planet!.id, nextName)
          return { ...s, lastMessage: `Planet renamed to ${nextName}.` }
        }},
        { label: 'Toggle Access', key: 'A', action: async (s) => {
          const policies = ['open', 'faction', 'locked']
          const currentIdx = policies.indexOf(planet!.accessPolicy || 'open')
          const nextPolicy = policies[(currentIdx + 1) % policies.length]
          dbOps.updatePlanetAccess(planet!.id, nextPolicy)
          return { ...s, lastMessage: `Access policy set to ${nextPolicy.toUpperCase()}.` }
        }},
        { label: 'Manage Mining', key: 'M', action: async (s) => ({ ...s, currentScene: 'planet_mining' }) },
        { label: 'Deploy Defenses', key: 'D', action: async (s) => ({ ...s, lastMessage: 'Defense deployment not yet implemented' }) },
        { label: 'Back to Surface', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_surface' }) }
      ]
    }
  },
  planet_mining: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    const totalMiners = (planet?.oreMiners || 0) + (planet?.fuelMiners || 0) + (planet?.equipmentMiners || 0)
    const unassigned = (planet?.population || 0) - totalMiners

    return {
      title: `\`%eMINING OPS: ${planet?.name}\` %7`,
      description: `Total Population: \`%f${planet?.population}\` %7
Unassigned: \`%a${unassigned}\` %7

Assignments:
[O] Ore Mining: \`%f${planet?.oreMiners}\` %7
[F] Fuel Mining: \`%f${planet?.fuelMiners}\` %7
[E] Equipment:   \`%f${planet?.equipmentMiners}\` %7
`,
      options: [
        { label: 'Assign Ore (+100)', key: 'O', action: async (s) => {
          if (unassigned >= 100) {
            dbOps.updatePlanetMiners(planet!.id, (planet!.oreMiners || 0) + 100, planet!.fuelMiners || 0, planet!.equipmentMiners || 0)
            return { ...s, lastMessage: 'Assigned 100 population to Ore mining.' }
          }
          return { ...s, lastMessage: 'Not enough unassigned population!' }
        }},
        { label: 'Assign Fuel (+100)', key: 'F', action: async (s) => {
          if (unassigned >= 100) {
            dbOps.updatePlanetMiners(planet!.id, planet!.oreMiners || 0, (planet!.fuelMiners || 0) + 100, planet!.equipmentMiners || 0)
            return { ...s, lastMessage: 'Assigned 100 population to Fuel mining.' }
          }
          return { ...s, lastMessage: 'Not enough unassigned population!' }
        }},
        { label: 'Assign Equip (+100)', key: 'E', action: async (s) => {
          if (unassigned >= 100) {
            dbOps.updatePlanetMiners(planet!.id, planet!.oreMiners || 0, planet!.fuelMiners || 0, (planet!.equipmentMiners || 0) + 100)
            return { ...s, lastMessage: 'Assigned 100 population to Equipment production.' }
          }
          return { ...s, lastMessage: 'Not enough unassigned population!' }
        }},
        { label: 'Reset All Roles', key: 'R', action: async (s) => {
          dbOps.updatePlanetMiners(planet!.id, 0, 0, 0)
          return { ...s, lastMessage: 'All mining roles reset.' }
        }},
        { label: 'Back to Management', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) }
      ]
    }
  },
  port: (state) => {
    const portType = state.currentSector?.portType
    if (!portType) {
      return {
        title: '%cPORT SERVICES',
        description: 'There is no trading port in this sector.',
        options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
      }
    }

    const inventory = getPortInventory(portType)
    const items = Object.entries(inventory).map(([name, price]) => {
      return `${name.toUpperCase()}: Buy: ${price.buy > 0 ? price.buy : 'N/A'} | Sell: ${price.sell > 0 ? price.sell : 'N/A'}`
    })

    return {
      title: '%cPORT SERVICES',
      description: `Welcome to the port. Our current prices:
${items.join('\n')}`,
      options: [
        { label: 'Buy Commodities', key: 'B', action: async (s) => ({ ...s, lastMessage: 'Buying not yet implemented' }) },
        { label: 'Sell Commodities', key: 'S', action: async (s) => ({ ...s, lastMessage: 'Selling not yet implemented' }) },
        { label: 'Leave Port', key: 'L', action: async (s) => ({ ...s, lastMessage: null, currentScene: 'bridge' }) }
      ]
    }
  },
  inventory: (state) => ({
    title: '%yINVENTORY & STATUS',
    description: `Pilot: ${state.player?.name}
Faction: ${state.player?.faction} | Title: ${getAlignmentTitle(state.player?.alignment || 0)}
Credits: ${state.player?.credits}
Turns: ${state.player?.turns}/${state.player?.maxTurns}
Location: Sector ${state.player?.sectorId}
Weapon Level: ${state.player?.weaponLevel}
Shield Level: ${state.player?.shieldLevel}
Engine Level: ${state.player?.engineLevel}
Alignment: ${state.player?.alignment}`,
    options: [
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  navigation: (state) => ({
    title: '%cNAVIGATION COMPUTER',
    description: `Current Sector: ${state.currentSector?.id || 1} (${state.currentSector?.name || 'Normal Space'})
Available Warps: ${(state.currentSector?.warps || []).join(', ')}`,
    options: [
      ...(state.currentSector?.warps || []).map((id) => ({
        label: `Warp to Sector ${id}`,
        key: id.toString(),
        action: async (s: GameState) => {
          if (!s.player || s.player.turns <= 0) return { ...s, lastMessage: 'Not enough turns!' }
          
          const deployments = dbOps.getSectorDeployments(id)
          const hostileFighters = deployments.filter(d => 
            d.type === 'fighter' && 
            d.playerId !== s.player!.id && 
            d.playerFaction !== s.player!.faction
          )

          if (hostileFighters.length > 0) {
            const totalFighters = hostileFighters.reduce((sum, d) => sum + d.quantity, 0)
            const attacker: CombatSide = {
              id: s.player!.id,
              name: s.player!.name,
              shields: s.player!.shields || 100,
              maxShields: (s.player!.shieldLevel || 1) * 100,
              fighters: 0,
              weaponPower: 15 + ((s.player!.weaponLevel || 1) * 5),
              isNpc: false
            }
            const defender: CombatSide = {
              id: `blockade_${id}`,
              name: 'Sector Blockade',
              shields: totalFighters * 50,
              maxShields: totalFighters * 50,
              fighters: totalFighters,
              weaponPower: 10 + (totalFighters > 5 ? 10 : 0),
              isNpc: true
            }
            
            return {
              ...s,
              currentScene: 'combat',
              lastMessage: `INTERCEPTED! You were pulled out of warp by a blockade in Sector ${id}!`,
              combat: initCombat(attacker, defender)
            }
          }

          return {
            ...s,
            player: { ...s.player, sectorId: id, turns: s.player.turns - 1 },
            currentScene: 'bridge'
          }
        }
      })),
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  scan: (state) => {
    const cooldown = dbOps.getNpcCooldown('npc_vex')
    const isAvailable = !cooldown || (new Date().getTime() - new Date(cooldown.value).getTime() > 24 * 60 * 60 * 1000)
    
    return {
      title: '%bLONG RANGE SCAN',
      description: `You scan the sector.
Planets: \`%c${state.currentPlanets.length}\`%7
Other Ships: ${isAvailable ? '1 (Detected: Captain Vex)' : '0'}
Other Pilots: \`%c${state.onlinePlayers?.length || 0}\`%7
Hazards: None`,
      options: [
        ...(isAvailable ? [
          { label: 'Hail Captain Vex', key: 'H', action: async (s) => ({ ...s, currentScene: 'npc_dialogue' }) },
          { 
            label: 'Attack Captain Vex', 
            key: 'A', 
            action: async (s) => {
              const attacker: CombatSide = {
                id: s.player!.id,
                name: s.player!.name,
                shields: s.player!.shields || 100,
                maxShields: (s.player!.shieldLevel || 1) * 100,
                fighters: 0,
                weaponPower: 15 + ((s.player!.weaponLevel || 1) * 5),
                isNpc: false
              }
              const defender: CombatSide = {
                id: 'npc_vex',
                name: 'Captain Vex',
                shields: 80,
                maxShields: 80,
                fighters: 0,
                weaponPower: 10,
                isNpc: true
              }
              return {
                ...s,
                currentScene: 'combat',
                lastMessage: null,
                combat: initCombat(attacker, defender)
              }
            }
          },

        ] : []),
        ...(state.onlinePlayers || []).map((p, i) => ({
          label: `Attack ${p.name}`,
          key: (i + 1).toString(),
          action: async (s: GameState) => {
            const attacker: CombatSide = {
              id: s.player!.id,
              name: s.player!.name,
              shields: s.player!.shields || 100,
              maxShields: (s.player!.shieldLevel || 1) * 100,
              fighters: 0,
              weaponPower: 15 + ((s.player!.weaponLevel || 1) * 5),
              isNpc: false
            }
            const defender: CombatSide = {
              id: p.id,
              name: p.name,
              shields: 100,
              maxShields: 100,
              fighters: 0,
              weaponPower: 15,
              isNpc: false
            }
            return {
              ...s,
              currentScene: 'combat',
              lastMessage: null,
              combat: initCombat(attacker, defender)
            }
          }
        })),
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  combat: (state) => {
    if (!state.combat) {
      return {
        title: 'ERROR',
        description: 'Combat state lost.',
        options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
      }
    }

    const { attacker, defender, log } = state.combat
    const isOver = attacker.shields <= 0 || defender.shields <= 0
    const hasLooted = state.lastMessage?.includes('Victory! You looted')

    return {
      title: '`%1SHIP-TO-SHIP COMBAT` %7',
      description: `
\`%e${attacker.name}\` %7 (YOU)
Shields: \`%c${attacker.shields}\` %7 / \`%c${attacker.maxShields}\` %7

\`%1${defender.name}\` %7 (ENEMY)
Shields: \`%c${defender.shields}\` %7 / \`%c${defender.maxShields}\` %7

----------------------------------------------------
${log.slice(-5).join('\n')}
`,
      options: hasLooted ? [
        { label: 'Return to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge', combat: null, lastMessage: null }) }
      ] : isOver ? [
        ...(defender.shields <= 0 ? [{ 
          label: 'Loot Disabled Ship', 
          key: 'L', 
          action: async (s) => {
            const loot = Math.floor(Math.random() * 500) + 100
            dbOps.updatePlayerCredits(s.player!.id, loot)
            
            let bountyMsg = ''
            if (defender.isNpc) {
              if (defender.id.startsWith('blockade_')) {
                const sectorId = parseInt(defender.id.split('_')[1])
                const deployments = dbOps.getSectorDeployments(sectorId)
                const blockade = deployments.find(d => d.type === 'fighter' && d.playerId !== s.player!.id)
                if (blockade) dbOps.removeSectorDeployment(blockade.id)
              } else {
                dbOps.setNpcCooldown(defender.id, new Date().toISOString())
                const completed = dbOps.updateBountyProgress(s.player!.id, 'kill', defender.id)
                if (completed) bountyMsg = '`%bBOUNTY COMPLETED!` %7'
              }
            } else {
              dbOps.insertGlobalEvent('PLAYER_KILLED', `Captain ${attacker.name} defeated Captain ${defender.name} in Sector ${s.player!.sectorId}.`)
            }
            
            return { 
              ...s, 
              player: { 
                ...s.player!, 
                credits: s.player!.credits + loot,
                alignment: s.player!.alignment + (defender.isNpc ? 10 : -10),
                kills: s.player!.kills + 1
              },
              lastMessage: `Victory! You looted ${loot} credits from ${defender.name}. ${bountyMsg}` 
            }
          } 
        }] : [{ 
          label: 'Emergency Escape', 
          key: 'E', 
          action: async (s) => ({ ...s, currentScene: 'death', combat: null }) 
        }])
      ] : [
        { label: 'Fire Weapons', key: 'F', action: async (s) => ({ ...s, combat: processCombatRound(s.combat!) }) },
        { label: 'Attempt to Flee', key: 'L', action: async (s) => ({ ...s, combat: null, currentScene: 'bridge', lastMessage: 'You successfully fled from combat.' }) }
      ]
    }
  },
  death: (state) => ({
    title: '`%1CRITICAL FAILURE: SHIP DESTROYED` %7',
    description: '`%1Your ship has been disabled and your escape pod has been recovered by Starfleet Command. Most of your credits and equipment were lost in the explosion. Your insurance has provided a basic replacement vessel.`%7',
    ascii: [
      "      `%1  _..._`%7",
      "      `%1 /     \\`%7",
      "      `%1|  `%fRIP  `%1|`%7",
      "      `%1 \\_____/`%7",
      "      `%1   | |`%7",
      "      `%1  _|_|_`%7"
    ],
    options: [
      { 
        label: 'Respawn at Home System', 
        key: 'R', 
        action: async (s) => {
          const startingSectorId = s.player!.faction === 'empire' ? 500 : 1
          const sectorData = dbOps.getSector(startingSectorId)
          
          return {
            ...s,
            player: { 
              ...s.player!, 
              sectorId: startingSectorId, 
              shields: 100, 
              credits: Math.floor(s.player!.credits * 0.5),
              weaponLevel: Math.max(1, s.player!.weaponLevel - 1),
              shieldLevel: Math.max(1, s.player!.shieldLevel - 1),
              alignment: s.player!.alignment - 20
            },
            currentSector: {
              ...sectorData,
              warps: JSON.parse(sectorData.warps)
            },
            currentScene: 'bridge',
            lastMessage: 'Systems rebooted. Welcome back to the fight.'
          }
        }
      }
    ]
  }),
  messages: (state) => ({
    title: '`%bSECTOR COMM LINK` %7',
    description: `Open channel for Sector \`%f${state.currentSector?.id}\`%7. 
\`%a${state.onlinePlayers?.length || 0}\`%7 other pilot(s) detected on scanners.`,
    options: [
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  npc_dialogue: (state) => ({
    title: '%fCAPTAIN VEX',
    description: '"Well, well... if it isn\'t another pilot looking for trouble in the rim. What do you want?"',
    ascii: [
      "   (o.o)   ",
      "    <|>    ",
      "    / \\    "
    ],
    options: [
      { label: '"Who are you?"', key: '1', action: async (s) => ({ ...s, lastMessage: 'Vex laughs.' }) },
      { label: '"Got any rumors?"', key: '2', action: async (s) => ({ ...s, lastMessage: 'No free info, kid.' }) },
      { label: 'Leave', key: 'L', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
}

export const getSceneViewModel = (state: GameState): SceneViewModel => {
  const handler = registry[state.currentScene]
  if (!handler) {
    return {
      title: 'ERROR',
      description: `Scene ${state.currentScene} not found.`,
      options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
    }
  }
  return handler(state)
}
