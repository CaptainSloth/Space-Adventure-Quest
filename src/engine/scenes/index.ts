import { app } from 'electron'
import { GameState, SceneViewModel, SceneId, SerializableSceneViewModel, CombatSide, OnlinePlayer, ChatMessage, GlobalEvent, PlayerCard, StarCard } from '../types'
import { getPortInventory, calculateDynamicPrice, Commodity } from '../trading'
import { initCombat, processCombatRound } from '../combat'
import { dbOps } from '../../main/db'
import { createDuel, playCard, passRound } from '../duels'

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

const getShipName = (id: string | null): string => {
  const names: Record<string, string> = {
    'scout_wasp': 'Wasp Scout',
    'trader_hauler': 'Hauler',
    'frigate_falcon': 'Falcon Frigate'
  }
  return names[id || ''] || id || 'Escape Pod'
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
  companyAlliances?: any[],
  playerCargo?: any[],
  hudStats?: any | null,
  stocks?: any[],
  playerPortfolio?: any[],
  shipyardStock?: any[],
  stockHistory?: number[],
  playerDeck?: PlayerCard[],
  allStarCards?: StarCard[],
  planetBuildings?: any[],
  spaceStations?: any[],
  resourceNodes?: any[]
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
    playerCargo,
    hudStats,
    stocks,
    playerPortfolio,
    shipyardStock,
    stockHistory,
    playerDeck,
    allStarCards,
    planetBuildings,
    spaceStations,
    resourceNodes,
    options: vm.options.map(o => ({ label: o.label, key: o.key }))
  }
}

const registry: SceneRegistry = {
  title: (state) => ({
    title: '`%eSPACE ADVENTURE QUEST` %7',
    description: '`%bMultiplayer Space Odyssey — v1.0.0` %7\n\nWelcome to the frontier, pilot. The year is 3026.',
    ascii: [
      "   `%f.    %b*    %f.      .   .   `%7",
      "      `%f.   %e_    %f.    .    .  `%7",
      "   `%f.    %e/ \\      %f.    %b*     `%7",
      "  `%f.    %e|   |  %f.    .    .   `%7",
      "   `%f.    %e\\_/    %f.     .      `%7",
      "      `%b*      %f.    .    %b*    `%7"
    ],
    options: [
      { label: 'Login', key: 'L', action: async (s) => ({ ...s, currentScene: 'login' }) },
      { label: 'Create New Character', key: 'C', action: async (s) => ({ ...s, currentScene: 'create_character' }) },
      { label: 'Quit', key: 'Q', action: async (s) => { app.quit(); return s } }
    ]
  }),
  login: (state) => ({
    title: '`%eCHARACTER LOGIN` %7',
    description: 'Access the Starfleet databanks. Choose your pilot to resume your journey.',
    options: [{ label: 'Back to Title', key: 'B', action: async (s) => ({ ...s, currentScene: 'title' }) }]
  }),
  create_character: (state) => ({
    title: '`%aCHARACTER REGISTRATION` %7',
    description: 'Enter your name and choose your faction to begin.',
    options: [
      { label: 'Join The Alliance', key: 'A', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'alliance' }, currentScene: 'bridge' }) },
      { label: 'Join The Empire', key: 'E', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'empire' }, currentScene: 'bridge' }) },
      { label: 'Remain Neutral', key: 'N', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'neutral' }, currentScene: 'bridge' }) }
    ]
  }),
  bridge: (state) => ({
    title: '`%eSHIP BRIDGE` %7',
    description: `Order received, Captain. Status scan complete.`,
    options: [
      { label: 'Navigation', key: 'N', action: async (s) => ({ ...s, currentScene: 'navigation' }) },
      { label: 'Sector View', key: 'V', action: async (s) => ({ ...s, currentScene: 'sector_view' }) },
      { label: 'Port Services', key: 'P', action: async (s) => ({ ...s, currentScene: 'port' }) },
      { label: 'Shipyard', key: 'Y', action: async (s) => ({ ...s, currentScene: 'shipyard' }) },
      { label: 'Engineering Bay', key: 'E', action: async (s) => ({ ...s, currentScene: 'station_services' }) },
      { label: 'Inventory', key: 'I', action: async (s) => ({ ...s, currentScene: 'inventory' }) },
      { label: 'Status Scan', key: 'S', action: async (s) => ({ ...s, currentScene: 'scan' }) },
      { label: 'Bounty Board', key: 'D', action: async (s) => ({ ...s, currentScene: 'bounty_board' }) },
      { label: 'Star Cards', key: 'G', action: async (s) => ({ ...s, currentScene: 'card_collection' }) },
      { label: 'Card Shop', key: 'K', action: async (s) => ({ ...s, currentScene: 'card_shop' }) },
      { label: 'Rankings', key: 'X', action: async (s) => ({ ...s, currentScene: 'rankings' }) },
      { label: 'Stock Market', key: 'M', action: async (s) => ({ ...s, currentScene: 'stock_market' }) },
      { label: 'Company', key: 'C', action: async (s) => ({ ...s, currentScene: 'company' }) },
      { label: 'Faction HQ', key: 'H', action: async (s) => ({ ...s, currentScene: 'faction_hq' }) },
      { label: 'Comm Link', key: 'L', action: async (s) => ({ ...s, currentScene: 'messages' }) },
      { label: 'ADMIN MODE', key: '!', action: async (s) => ({ ...s, currentScene: 'admin' }) }
    ]
  }),
  shipyard: (state) => {
    const stock = state.shipyardStock || []
    return {
      title: '`%eGALACTIC SHIP SHOWROOM` %7',
      description: `Welcome to the showroom. Our inventory shifts frequently.`,
      options: [
        ...stock.map((ship, i) => ({
          label: `${ship.isLegendary ? '`%b[LEGENDARY] ' : ''}${ship.instanceName} (${ship.cost} cr)`,
          key: (i + 1).toString(),
          action: async (s: GameState) => {
            if (s.player!.credits >= ship.cost) {
              return { 
                ...s, 
                player: { ...s.player!, credits: s.player!.credits - ship.cost, shipId: ship.instanceName, maxTurns: 75 + (ship.tier * 5) }, 
                pendingShipPurchase: ship,
                lastMessage: `New ship commissioned: ${ship.instanceName}.` 
              }
            }
            return { ...s, lastMessage: 'Insufficient credits!' }
          }
        })),
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  station_services: (state) => {
    const weaponCost = (state.player?.weaponLevel || 1) * 1000
    const shieldCost = (state.player?.shieldLevel || 1) * 1000
    const engineCost = (state.player?.engineLevel || 1) * 1000
    return {
      title: '`%eENGINEERING BAY` %7',
      description: `Current Ship: \`%b${getShipName(state.player?.shipId || null)}\` %7`,
      options: [
        { label: `Upgrade Weapons [${weaponCost} cr]`, key: 'W', action: async (s) => (s.player!.credits >= weaponCost ? { ...s, player: { ...s.player!, credits: s.player!.credits - weaponCost, weaponLevel: s.player!.weaponLevel + 1 }, lastMessage: 'Upgraded!' } : { ...s, lastMessage: 'No credits!' }) },
        { label: `Upgrade Shields [${shieldCost} cr]`, key: 'S', action: async (s) => (s.player!.credits >= shieldCost ? { ...s, player: { ...s.player!, credits: s.player!.credits - shieldCost, shieldLevel: s.player!.shieldLevel + 1 }, lastMessage: 'Upgraded!' } : { ...s, lastMessage: 'No credits!' }) },
        { label: `Upgrade Engines [${engineCost} cr]`, key: 'E', action: async (s) => (s.player!.credits >= engineCost ? { ...s, player: { ...s.player!, credits: s.player!.credits - engineCost, engineLevel: s.player!.engineLevel + 1 }, lastMessage: 'Upgraded!' } : { ...s, lastMessage: 'No credits!' }) },
        { label: 'Rename Ship', key: 'R', action: async (s) => s },
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  company: (state) => {
    if (state.currentCompany) {
      return {
        title: `\`%bCOMPANY: ${state.currentCompany.name}\` %7`,
        description: `CEO: \`%f${state.companyMembers.find(m => m.role === 'ceo')?.playerName}\` %7
Treasury: \`%e${state.currentCompany.treasury}\` %7 cr`,
        options: [
          { label: 'Member List', key: 'M', action: async (s) => ({ ...s, currentScene: 'company_members' }) },
          { label: 'Private Chat', key: 'C', action: async (s) => ({ ...s, currentScene: 'company_chat' }) },
          { label: 'Treasury (Deposit 1k)', key: 'T', action: async (s) => ({ ...s, lastMessage: 'Depositing credits...' }) },
          { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
        ]
      }
    }
    return {
      title: '`%bGALACTIC COMPANIES` %7',
      description: 'You are not currently a member of any company.',
      options: [
        { label: 'Found New Company (5000 cr)', key: 'F', action: async (s) => ({ ...s, currentScene: 'company_create' }) },
        ...state.availableCompanies.map((c, i) => ({ label: `Join ${c.name}`, key: (i + 1).toString(), action: async (s: GameState) => ({ ...s, lastMessage: `Joining ${c.name}...` }) })),
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  company_create: (state) => ({
    title: '`%bFOUND NEW COMPANY` %7',
    description: 'Enter name. Cost: 5000 cr.',
    options: [
      { label: 'Submit', key: 'S', action: async (s) => ({ ...s, lastMessage: 'Registering...' }) },
      { label: 'Cancel', key: 'C', action: async (s) => ({ ...s, currentScene: 'company' }) }
    ]
  }),
  company_members: (state) => ({
    title: '`%bCOMPANY MEMBERS` %7',
    description: `Roster for \`%f${state.currentCompany?.name}\` %7:
${state.companyMembers.map(m => `- \`%f${m.playerName}\` %7 [${m.role.toUpperCase()}]`).join('\n')}`,
    options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'company' }) }]
  }),
  company_chat: (state) => ({
    title: '`%bCOMPANY CHAT` %7',
    description: `Secure channel.`,
    options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'company' }) }]
  }),
  faction_hq: (state) => {
    const isHome = (state.player?.faction === 'alliance' && state.player?.sectorId === 1) || 
                   (state.player?.faction === 'empire' && state.player?.sectorId === 500)
    if (!isHome) return { title: 'HQ DENIED', description: 'Not at home system.', options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }] }
    return {
      title: `\`%e${state.player?.faction?.toUpperCase()} HQ\` %7`,
      description: 'Welcome back.',
      options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
    }
  },
  bounty_board: (state) => ({
    title: '`%bBOUNTY BOARD` %7',
    description: 'Mission protocols active.',
    options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  rankings: (state) => ({
    title: '`%eRANKINGS` %7',
    description: 'Net Worth Leaders:',
    options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  admin: (state) => ({
    title: '`%1ADMIN` %7',
    description: 'System override.',
    options: [
      { label: 'Credits +5k', key: 'C', action: async (s) => ({ ...s, player: { ...s.player!, credits: s.player!.credits + 5000 }, lastMessage: 'Granted.' }) },
      { label: 'Galactic Tick', key: 'K', action: async (s) => ({ ...s, lastMessage: 'Requesting manual galactic economic tick...' }) },
      { label: 'Refill Turns', key: 'T', action: async (s) => ({ ...s, player: { ...s.player!, turns: s.player!.maxTurns }, lastMessage: 'Refilled.' }) },
      { label: 'Ship Editor', key: 'Y', action: async (s) => ({ ...s, currentScene: 'admin_ships', adminBuilder: { step: 'menu' } }) },
      { label: 'Card Editor', key: 'G', action: async (s) => ({ ...s, currentScene: 'admin_cards' }) },
      { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  admin_cards: (state) => {
    const cards = dbOps.getAllStarCards() as any[]
    return {
      title: '`%1ADMIN: CARD EDITOR` %7',
      description: `Manage card definitions. Total: ${cards.length}`,
      options: [
        ...cards.slice(0, 10).map((c, i) => ({ label: `Edit ${c.name}`, key: (i + 1).toString(), action: async (s: any) => s })),
        { label: 'Delete Last Card', key: 'D', action: async (s) => {
          const last = cards[cards.length - 1]
          if (last) dbOps.deleteStarCardDefinition(last.id)
          return { ...s, lastMessage: 'Removed card.' }
        }},
        { label: 'Back to Admin', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin' }) }
      ]
    }
  },
  admin_ships: (state) => {
    const builder = state.adminBuilder || { step: 'menu' }
    const templates = dbOps.getShipTemplates() as any[]
    const modifiers = dbOps.getShipModifiers() as any[]
    if (builder.step === 'menu') return {
      title: '`%1ADMIN: SHIP EDITOR` %7',
      description: 'Fleet Management.',
      options: [
        { label: 'Templates', key: 'T', action: async (s) => ({ ...s, adminBuilder: { ...builder, step: 'template_list' } }) },
        { label: 'Modifiers', key: 'M', action: async (s) => ({ ...s, adminBuilder: { ...builder, step: 'modifier_list' } }) },
        { label: 'Build Ship', key: 'B', action: async (s) => ({ ...s, adminBuilder: { ...builder, step: 'build_template' } }) },
        { label: 'Back', key: 'A', action: async (s) => ({ ...s, currentScene: 'admin', adminBuilder: undefined }) }
      ]
    }
    if (builder.step === 'template_list') return {
      title: '`%1TEMPLATES` %7',
      description: 'Hulls:',
      options: [
        ...templates.map((t, i) => ({ label: t.name, key: (i+1).toString(), action: async (s: any) => s })),
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, adminBuilder: { ...builder, step: 'menu' } }) }
      ]
    }
    if (builder.step === 'modifier_list') return {
      title: '`%1MODIFIERS` %7',
      description: 'Add-ons:',
      options: [
        ...modifiers.map((m, i) => ({ label: m.name, key: (i+1).toString(), action: async (s: any) => s })),
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, adminBuilder: { ...builder, step: 'menu' } }) }
      ]
    }
    if (builder.step === 'build_template') return {
      title: '`%1BUILD: BASE` %7',
      description: 'Pick hull:',
      options: [
        ...templates.map((t, i) => ({ label: t.name, key: (i+1).toString(), action: async (s: any) => ({ ...s, adminBuilder: { ...builder, templateId: t.id, step: 'build_prefix' } }) })),
        { label: 'Cancel', key: 'B', action: async (s) => ({ ...s, adminBuilder: { step: 'menu' } }) }
      ]
    }
    if (builder.step === 'build_prefix') {
      const prefixes = modifiers.filter(m => m.type === 'prefix')
      return {
        title: '`%1BUILD: PREFIX` %7',
        description: 'Pick prefix:',
        options: [
          { label: 'None', key: '0', action: async (s) => ({ ...s, adminBuilder: { ...builder, prefixId: undefined, step: 'build_suffix' } }) },
          ...prefixes.map((m, i) => ({ label: m.name, key: (i+1).toString(), action: async (s: any) => ({ ...s, adminBuilder: { ...builder, prefixId: m.id, step: 'build_suffix' } }) })),
          { label: 'Cancel', key: 'B', action: async (s) => ({ ...s, adminBuilder: { step: 'menu' } }) }
        ]
      }
    }
    if (builder.step === 'build_suffix') {
      const suffixes = modifiers.filter(m => m.type === 'suffix')
      return {
        title: '`%1BUILD: SUFFIX` %7',
        description: 'Pick suffix:',
        options: [
          { label: 'None', key: '0', action: async (s) => ({ ...s, adminBuilder: { ...builder, suffixId: undefined, step: 'review' } }) },
          ...suffixes.map((m, i) => ({ label: m.name, key: (i+1).toString(), action: async (s: any) => ({ ...s, adminBuilder: { ...builder, suffixId: m.id, step: 'review' } }) })),
          { label: 'Cancel', key: 'B', action: async (s) => ({ ...s, adminBuilder: { step: 'menu' } }) }
        ]
      }
    }
    if (builder.step === 'review') {
      const template = templates.find(t => t.id === builder.templateId)
      const prefix = modifiers.find(m => m.id === builder.prefixId)
      const suffix = modifiers.find(m => m.id === builder.suffixId)
      const holds = Math.floor(template.baseHolds * (prefix?.holdsMod || 1) * (suffix?.holdsMod || 1))
      const shields = Math.floor(template.baseShields * (prefix?.shieldsMod || 1) * (suffix?.shieldsMod || 1))
      const fighters = Math.floor(template.baseFighters * (prefix?.fightersMod || 1) * (suffix?.fightersMod || 1))
      const name = `${prefix ? prefix.name + ' ' : ''}${template.name}${suffix ? ' ' + suffix.name : ''}`
      return {
        title: '`%1BUILD: REVIEW` %7',
        description: `Name: ${name} | H:${holds} S:${shields} F:${fighters}`,
        options: [
          { label: 'COMMISSION', key: 'C', action: async (s) => ({
            ...s,
            player: { ...s.player!, shipId: name, maxTurns: 75 + (template.tier * 5) },
            pendingShipPurchase: { templateId: template.id, instanceName: name, holds, shields, fighters, cost: 0, tier: template.tier },
            adminBuilder: undefined,
            lastMessage: `Admin Commission Complete: ${name}.`
          })},
          { label: 'Cancel', key: 'B', action: async (s) => ({ ...s, adminBuilder: undefined, currentScene: 'admin' }) }
        ]
      }
    }
    return { title: 'ERROR', description: 'Invalid state', options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, adminBuilder: { step: 'menu' } }) }] }
  },
  stock_market: (state) => ({
    title: '`%eSTOCK EXCHANGE` %7',
    description: `Market Listings:\n${state.stocks?.map((s, i) => `${i + 1}. \`%b${s.symbol}\` %7: \`%e${s.price.toFixed(2)}\` %7`).join('\n')}`,
    options: [
      ...state.stocks?.map((s, i) => ({ label: `Trade ${s.symbol}`, key: (i + 1).toString(), action: async (st: any) => ({ ...st, currentScene: 'stock_details', selectedPlanetId: s.symbol }) })) || [],
      { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  stock_details: (state) => {
    const symbol = state.selectedPlanetId
    const stock = state.stocks.find(s => s.symbol === symbol)
    const portfolio = state.playerPortfolio.find(p => p.symbol === symbol)
    if (!stock) return { title: 'ERROR', description: 'Stock not found', options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'stock_market' }) }] }
    return {
      title: `\`%eSTOCK: ${stock.name}\` %7`,
      description: `Symbol: \`%b${stock.symbol}\` %7 | Price: \`%e${stock.price.toFixed(2)}\` %7\n[ASCII_CHART_PENDING]`,
      options: [
        { label: 'Buy 10 Shares', key: '1', action: async (s) => ({ ...s, lastMessage: `Requesting purchase of 10 ${symbol}...` }) },
        { label: 'Sell All Shares', key: 'S', action: async (s) => ({ ...s, lastMessage: `Requesting sale of ${portfolio?.quantity || 0} ${symbol}...` }) },
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'stock_market' }) }
      ]
    }
  },
  sector_view: (state) => {
    const deployments = dbOps.getSectorDeployments(state.currentSector!.id)
    const stations = state.spaceStations || []
    const nodes = state.resourceNodes || []

    return {
      title: '`%eSECTOR VIEW` %7',
      description: `Sector: \`%f${state.currentSector?.id}\` %7.

  \`%bSTATIONS & BASES:\` %7
  ${stations.length > 0 ? stations.map(s => `- \`%f${s.name}\` %7 (${s.type.toUpperCase()}) [Owner: ${s.ownerName}]`).join('\n') : 'None detected.'}

  \`%bRESOURCE NODES:\` %7
  ${nodes.length > 0 ? nodes.map(n => `- \`%f${n.type.toUpperCase()}\` %7 (${n.commodity.toUpperCase()}) Abundance: ${n.abundance}`).join('\n') : 'None detected.'}

  \`%bSECTOR ASSETS:\` %7
  ${deployments.length > 0 ? deployments.map(d => `- \`%f${d.quantity}\` %7 ${d.type}(s)`).join('\n') : 'None detected.'}`,
      options: [
        ...state.currentPlanets.map((p, i) => ({ label: `Land on ${p.name}`, key: (i + 1).toString(), action: async (s: any) => ({ ...s, selectedPlanetId: p.id, currentScene: 'planet_surface' }) })),
        { label: 'Deploy Fighter (500cr)', key: 'F', action: async (s) => (s.player!.credits >= 500 ? { ...s, player: { ...s.player!, credits: s.player!.credits - 500 }, lastMessage: 'Fighter deployed.' } : { ...s, lastMessage: 'No credits!' }) },
        ...(state.currentPlanets.length === 0 && !stations.find(ss => ss.playerId === state.player?.id) ? [{ 
          label: 'Establish Outpost (50,000 cr)', 
          key: 'O', 
          action: async (s: GameState) => {
            if (s.player!.credits >= 50000) return { ...s, lastMessage: `Requesting station:outpost:50000:${state.currentSector?.id}` }
            return { ...s, lastMessage: 'Insufficient credits for a space station!' }
          }
        }] : []),
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },

  planet_surface: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    return {
      title: `\`%aPLANET: ${planet?.name}\` %7`,
      description: `Population: \`%f${planet?.population}\` %7`,
      options: [
        ...(planet && !planet.ownerId ? [{ label: 'Claim Planet', key: 'C', action: async (s: any) => ({ ...s, lastMessage: `Requesting claim for ${planet.id}` }) }] : []),
        { label: 'Management', key: 'M', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) },
        ...(planet?.hasPort ? [{ label: 'Trading Port', key: 'P', action: async (s: any) => ({ ...s, currentScene: 'planet_trade' }) }] : []),
        { label: 'Orbit', key: 'R', action: async (s) => ({ ...s, currentScene: 'bridge', selectedPlanetId: null }) }
      ]
    }
  },
  planet_manage: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    return {
      title: `\`%eMANAGE: ${planet?.name}\` %7`,
      description: `Status: ${planet?.hasPort ? '`%aOPERATIONAL` %7' : '`%1OFFLINE` %7'}`,
      options: [
        { label: 'Report', key: 'R', action: async (s) => {
          const report = dbOps.getPlanetReport(planet!.id)
          return { ...s, lastMessage: report ? report.report : 'No report.' }
        }},
        ...(!planet?.hasPort ? [{ label: 'Build Port (10k)', key: 'P', action: async (s: GameState) => (s.player!.credits >= 10000 ? { ...s, lastMessage: `Requesting port construction for ${planet?.id}` } : { ...s, lastMessage: 'No credits!' }) }] : []),
        { label: 'Construction Bay', key: 'C', action: async (s) => ({ ...s, currentScene: 'planet_construction' }) },
        { label: 'Personalize World', key: 'P', action: async (s) => ({ ...s, currentScene: 'planet_personalize' }) },
        { label: 'Mining', key: 'M', action: async (s) => ({ ...s, currentScene: 'planet_mining' }) },
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_surface' }) }
        ]
        }
        },
        planet_personalize: (state) => {
        const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
        return {
        title: `\`%ePERSONALIZE: ${planet?.name}\` %7`,
        description: 'Enter a custom description or ASCII art signature for your world.',
        options: [
        { label: 'Set Custom Description', key: 'D', action: async (s) => s },
        { label: 'Set Custom ASCII Art', key: 'A', action: async (s) => s },
        { label: 'Reset to Defaults', key: 'R', action: async (s) => {
          dbOps.updatePlanetCustoms(planet!.id, '', '')
          return { ...s, lastMessage: 'Planet appearance reset.' }
        }},
        { label: 'Back to Management', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) }
        ]
        }
        },

        planet_construction: (state) => {
        const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
        const buildings = state.planetBuildings || []
        const buildingDefs = [
        { type: 'shipyard', name: 'Shipyard', cost: 15000, desc: 'Enables repairs and hull swaps.' },
        { type: 'defense_grid', name: 'Defense Grid', cost: 20000, desc: 'Automated planetary defense.' },
        { type: 'sensor_array', name: 'Sensor Array', cost: 8000, desc: 'Increased sector scan range.' },
        { type: 'cantina', name: 'Cantina', cost: 5000, desc: 'Local venue for duels and rumors.' },
        { type: 'refinery', name: 'Refinery', cost: 12000, desc: 'Increases resource output.' }
        ]
        const existingTypes = buildings.map(b => b.type)
        const available = buildingDefs.filter(d => !existingTypes.includes(d.type))
        return {
        title: `\`%eCONSTRUCTION: ${planet?.name}\` %7`,
        description: `Operational: ${buildings.length}\nAvailable Projects:\n${available.map(d => `- ${d.name} (${d.cost} cr)`).join('\n')}`,
        options: [
        ...available.map((d, i) => ({ label: `Construct ${d.name}`, key: (i + 1).toString(), action: async (s: GameState) => (s.player!.credits >= d.cost ? { ...s, lastMessage: `Requesting building:${d.type}:${d.cost}:${planet?.id}` } : { ...s, lastMessage: 'No credits!' }) })),
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) }
        ]
        }
        },

  planet_trade: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    const prices = planet?.portPrices ? JSON.parse(planet.portPrices) : { ore: 10, fuel: 20, equipment: 100 }
    return {
      title: `\`%cPORT: ${planet?.name}\` %7`,
      description: `Prices: ORE:${prices.ore} [DATA:ore:${prices.ore}:${prices.ore+2}] | FUEL:${prices.fuel} [DATA:fuel:${prices.fuel}:${prices.fuel+4}]`,
      options: [
        { label: 'Buy Ore', key: 'O', action: async (s) => s },
        { label: 'Sell Ore', key: 'R', action: async (s) => s },
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_surface' }) }
      ]
    }
  },
  planet_mining: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    const unassigned = (planet?.population || 0) - ((planet?.oreMiners || 0) + (planet?.fuelMiners || 0) + (planet?.equipmentMiners || 0))
    return {
      title: `\`%eMINING: ${planet?.name}\` %7`,
      description: `Unassigned: \`%a${unassigned}\` %7`,
      options: [
        { label: 'Assign Ore (+100)', key: 'O', action: async (s) => (unassigned >= 100 ? { ...s, lastMessage: 'Assigned.' } : { ...s, lastMessage: 'No pop!' }) },
        { label: 'Reset', key: 'R', action: async (s) => {
          dbOps.updatePlanetMiners(planet!.id, 0, 0, 0)
          return { ...s, lastMessage: 'Reset.' }
        }},
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) }
      ]
    }
  },
  port: (state) => {
    const sector = state.currentSector
    if (!sector || !sector.portInventory) {
      return {
        title: '%cPORT SERVICES',
        description: 'There is no trading port in this sector.',
        options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
      }
    }

    const inv = JSON.parse(sector.portInventory)
    const items = Object.entries(inv).map(([name, data]) => {
      const item = data as any
      const buyPrice = calculateDynamicPrice(name as Commodity, item.stock, true)
      const sellPrice = calculateDynamicPrice(name as Commodity, item.stock, false)
      return `${name.toUpperCase().padEnd(10)}: Stock: ${item.stock.toString().padEnd(5)} | Buy: ${buyPrice > 0 ? buyPrice : 'N/A'} | Sell: ${sellPrice > 0 ? sellPrice : 'N/A'} [DATA:${name}:${buyPrice}:${sellPrice}]`
    })

    return {
      title: '%cPORT SERVICES',
      description: `Welcome. Credits: \`%f${state.player?.credits}\` %7
Current Market (Supply & Demand):
${items.join('\n')}`,
      options: [
        ...Object.entries(inv).filter(([_, data]) => (data as any).sell !== -1).map(([name, data]) => ({
          label: `Buy 1 ${name}`,
          key: name[0].toLowerCase(),
          action: async (s: GameState) => s
        })),
        ...Object.entries(inv).filter(([_, data]) => (data as any).buy !== -1).map(([name, data]) => ({
          label: `Sell 1 ${name}`,
          key: name === 'ore' ? 'r' : name === 'fuel' ? 'u' : 'q',
          action: async (s: GameState) => s
        })),
        { label: 'Leave', key: 'L', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  card_shop: (state) => ({
    title: '`%bCARD SHOP` %7',
    description: 'Buy packs to find Star Cards.',
    options: [
      { label: 'Buy 1 Pack (500 cr)', key: '1', action: async (s) => (s.player!.credits >= 500 ? { ...s, lastMessage: 'Requesting Star Pack purchase...' } : { ...s, lastMessage: 'No credits!' }) },
      { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  card_collection: (state) => {
    const deck = state.playerDeck || []
    const equipped = deck.filter(c => c.equipped)
    
    const rarityColors: Record<string, string> = {
      'common': '%7',
      'uncommon': '%a',
      'rare': '%b',
      'epic': '%d',
      'legendary': '%1'
    }

    const equippedList = equipped.length > 0 
      ? equipped.map(c => `- ${rarityColors[c.rarity] || '%7'}${c.name}%7 (Pwr: ${c.power})`).join('\n')
      : 'No cards equipped.'

    const inventoryList = deck.map((c, i) => {
      const color = rarityColors[c.rarity] || '%7'
      const count = deck.filter(cc => cc.id === c.id).length
      return `${i + 1}. ${c.equipped ? '`%a[E]` %7' : '   '} ${color}${c.name.padEnd(18)}%7 (${c.type.toUpperCase()}) Lvl:${c.level} ${count > 1 ? `\`%b[x${count}]\` %7` : ''}`
    }).join('\n')

    return {
      title: '`%bSTAR CARD COLLECTION` %7',
      description: `
\`%bACTIVE DECK\` %7 (${equipped.length}/5)
----------------------------------------
${equippedList}

\`%bYOUR INVENTORY\` %7
----------------------------------------
${inventoryList}

Use keys 1-9 to toggle equipment.`,
      options: [
        ...deck.slice(0, 9).map((c, i) => ({ 
          label: `${c.equipped ? 'Unequip' : 'Equip'} ${c.name}`, 
          key: (i + 1).toString(), 
          action: async (s: GameState) => {
            if (!c.equipped && equipped.length >= 5) return { ...s, lastMessage: 'Deck full! Max 5 cards.' }
            return { ...s, lastMessage: `Requesting ${c.equipped ? 'unequip' : 'equip'} for instance ${c.instanceId}` }
          } 
        })),
        { label: 'Combine Duplicates', key: 'C', action: async (s) => {
          // Find first card with count > 1
          const duplicates = deck.filter((c, index) => deck.findIndex(cc => cc.id === c.id) !== index)
          if (duplicates.length > 0) {
            return { ...s, lastMessage: `Requesting card combination for ${duplicates[0].id}` }
          }
          return { ...s, lastMessage: 'No duplicates found to combine.' }
        }},
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },

  card_duel: (state) => {
    if (!state.currentDuel) {
      return {
        title: 'ERROR',
        description: 'Duel state lost.',
        options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
      }
    }

    const { player, opponent, round, turn, log, winner } = state.currentDuel

    const renderRow = (side: any, rowName: string) => {
      const row = side[rowName]
      return `[${rowName.toUpperCase().padEnd(8)}] ${row.cards.map((c: any) => `[${c.power}]`).join(' ')} (${row.score})`
    }

    const board = `
ROUND ${round} | TURN: ${turn.toUpperCase()}
----------------------------------------------------
${opponent.name} (Lives: ${opponent.lives}) [PASS: ${opponent.hasPassed}]
${renderRow(opponent, 'support')}
${renderRow(opponent, 'fleet')}
${renderRow(opponent, 'vanguard')}
SCORE: \`%1${opponent.score}\` %7

VS

SCORE: \`%a${player.score}\` %7
${renderRow(player, 'vanguard')}
${renderRow(player, 'fleet')}
${renderRow(player, 'support')}
${player.name} (Lives: ${player.lives}) [PASS: ${player.hasPassed}]
----------------------------------------------------
LOG: ${log.slice(-1)[0]}
`

    if (winner) {
      return {
        title: '`%bDUEL CONCLUDED` %7',
        description: board + `\n\n\`%f${winner === 'player' ? 'VICTORY!' : 'DEFEAT!'}\` %7`,
        options: [{ 
          label: 'Return to Bridge', 
          key: 'B', 
          action: async (s) => {
            let msg = 'Duel finished.'
            if (winner === 'player') {
              const all = dbOps.getAllStarCards()
              const prize = all[Math.floor(Math.random() * all.length)]
              dbOps.addPlayerCard(s.player!.id, prize.id)
              msg = `VICTORY! You earned a reward card: ${prize.name}.`
            }
            return { ...s, currentScene: 'bridge', currentDuel: null, lastMessage: msg }
          } 
        }]
      }
    }

    return {
      title: '`%bSTAR CARD DUEL` %7',
      description: board + `\nYOUR HAND:`,
      options: [
        ...player.hand.map((c, i) => ({
          label: `${c.name} (Pwr: ${c.power})`,
          key: (i + 1).toString(),
          action: async (s: GameState) => {
            if (turn !== 'player' || player.hasPassed) return s
            const row = c.preferredRow === 'any' ? 'fleet' : c.preferredRow as any
            const newDuel = playCard({ ...s.currentDuel! }, 'player', i, row)
            return { ...s, currentDuel: newDuel }
          }
        })),
        { label: 'Pass Round', key: 'P', action: async (s) => {
          if (turn !== 'player' || player.hasPassed) return s
          const newDuel = passRound({ ...s.currentDuel! }, 'player')
          return { ...s, currentDuel: newDuel }
        }},
        { label: 'Forfeit', key: 'Q', action: async (s) => ({ ...s, currentScene: 'bridge', currentDuel: null, lastMessage: 'You forfeited the duel.' }) }
      ]
    }
  },
  inventory: (state) => ({
    title: '%yINVENTORY',
    description: 'Status.',
    options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  navigation: (state) => ({
    title: '%cNAVIGATION',
    description: `Sector: ${state.currentSector?.id || 1}`,
    options: [
      ...(state.currentSector?.warps || []).map((id) => ({ 
        label: `Warp ${id}`, 
        key: id.toString(), 
        action: async (s: GameState) => {
          if (!s.player || s.player.turns <= 0) return { ...s, lastMessage: 'No turns!' }
          
          const targetSector = dbOps.getSector(id)
          let lastMsg = `Warped to Sector ${id}.`
          let finalSectorId = id
          let finalPlayer = { ...s.player, turns: s.player.turns - 1 }

          // Smuggling Check: Detection in Faction Space
          const cargo = dbOps.getPlayerCargo(s.player!.id) as any[]
          const hasContraband = cargo.some(c => c.commodity === 'contraband')
          const isFactionSpace = id === 1 || id === 500 // HQs
          
          if (hasContraband && isFactionSpace && Math.random() < 0.5) {
            const fine = Math.floor(s.player!.credits * 0.2)
            dbOps.updatePlayerCredits(s.player!.id, -fine)
            // Remove contraband
            const db = dbOps.getDb()
            db.prepare('DELETE FROM player_cargo WHERE playerId = ? AND commodity = "contraband"').run(s.player!.id)
            finalPlayer.credits -= fine
            finalPlayer.alignment -= 50
            return { 
              ...s, 
              player: { ...finalPlayer, sectorId: id }, 
              currentScene: 'bridge', 
              lastMessage: `POLICE INTERCEPTION! Contraband detected and confiscated. You have been fined ${fine} cr.` 
            }
          }

          // Hazard: Black Hole
          if (targetSector.type === 'black_hole') {
            const randomSector = Math.floor(Math.random() * 500) + 1
            finalSectorId = randomSector
            finalPlayer.shields = Math.max(0, finalPlayer.shields - 50)
            lastMsg = `CRITICAL: Pulled into a Black Hole! You have been spat out in Sector ${randomSector}. Hull integrity compromised.`
          }

          // Hazard: Asteroid Field
          if (targetSector.type === 'asteroid_field' && Math.random() < 0.3) {
            finalPlayer.shields = Math.max(0, finalPlayer.shields - 20)
            lastMsg = `Hull damage! Navigation through asteroid field resulted in minor collisions.`
          }

          return { ...s, player: { ...finalPlayer, sectorId: finalSectorId }, currentScene: 'bridge', lastMessage: lastMsg }
        } 
      })),
      { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  scan: (state) => ({
    title: '%bSCAN',
    description: `Sector: ${state.currentSector?.id}.`,
    options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  combat: (state) => {
    if (!state.combat) return { title: 'ERROR', description: 'No combat', options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }] }
    const { attacker, defender, log } = state.combat
    const isOver = attacker.shields <= 0 || defender.shields <= 0
    return {
      title: '`%1COMBAT` %7',
      description: `${attacker.name} vs ${defender.name}\n${log.slice(-3).join('\n')}`,
      options: isOver ? [{ label: 'Leave', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge', combat: null }) }] : [
        { label: 'Fire', key: 'F', action: async (s) => ({ ...s, combat: processCombatRound(s.combat!) }) },
        { label: 'Flee', key: 'L', action: async (s) => ({ ...s, combat: null, currentScene: 'bridge' }) }
      ]
    }
  },
  death: (state) => ({
    title: '`%1DESTROYED` %7',
    description: 'Respawn at home.',
    options: [{ label: 'Respawn', key: 'R', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  messages: (state) => ({
    title: '`%bCOMM LINK` %7',
    description: 'Open channel.',
    options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  npc_dialogue: (state) => {
    const npc = { id: 'npc_vex', name: 'Captain Vex' }
    return {
      title: `%f${npc.name.toUpperCase()} - THE SMUGGLER`,
      description: '"Looking for a game, pilot? Or just here to talk?"',
      options: [
        { label: 'Challenge to Card Duel', key: 'D', action: async (s) => {
          if (s.playerDeck.filter(c => c.equipped).length < 1) {
            return { ...s, lastMessage: 'Vex: "You need to equip some cards in your collection first!"' }
          }
          const duel = createDuel(s.player!.name, s.playerDeck, npc.name, dbOps.getAllStarCards().slice(0, 10))
          return { ...s, currentDuel: duel, currentScene: 'card_duel' }
        }},
        { label: 'Trade Ore', key: 'T', action: async (s) => s },
        { label: 'Leave', key: 'L', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
}

export const getSceneViewModel = (state: GameState): SceneViewModel => {
  const handler = registry[state.currentScene]
  if (!handler) return { title: 'ERROR', description: `Scene ${state.currentScene} not found.`, options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }] }
  return handler(state)
}
