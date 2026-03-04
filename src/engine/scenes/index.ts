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
  resourceNodes?: any[],
  currentNpcs?: any[]
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
    playerDeck,
    allStarCards,
    planetBuildings,
    spaceStations,
    resourceNodes,
    currentNpcs,
    options: vm.options.map(o => ({ label: o.label, key: o.key }))
  }
}

const registry: SceneRegistry = {
  title: (state) => ({
    title: '`%eSPACE ADVENTURE QUEST` %7',
    description: '`%bMultiplayer Space Odyssey — v1.0.0` %7\n\nWelcome to the frontier, pilot. The year is 3026. The galaxy is divided. The Alliance, the Empire, and the independent Neutral systems vie for control of the warp gates. Your journey starts here.',
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
    ascii: [
      "      `%b.-------.`%7",
      "      `%b| LOGIN |`%7",
      "      `%b'-------'`%7"
    ],
    options: [
      { label: 'Back to Title', key: 'B', action: async (s) => ({ ...s, currentScene: 'title' }) }
    ]
  }),
  create_character: (state) => ({
    title: '`%aCHARACTER REGISTRATION` %7',
    description: '`%7The Starfleet Academy requires your details to issue a flight license. Once you have entered your name, choose your faction alignment to proceed.',
    ascii: [
      "      `%a.-------.`%7",
      "      `%a| LICNS |`%7",
      "      `%a'-------'`%7"
    ],
    options: [
      { label: 'Join The Alliance (Good)', key: 'A', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'alliance' }, currentScene: 'bridge' }) },
      { label: 'Join The Empire (Evil)', key: 'E', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'empire' }, currentScene: 'bridge' }) },
      { label: 'Remain Neutral', key: 'N', action: async (s) => ({ ...s, player: { ...s.player!, faction: 'neutral' }, currentScene: 'bridge' }) }
    ]
  }),
  bridge: (state) => ({
    title: '`%eSHIP BRIDGE` %7',
    description: `Order received, Captain. Status scan complete.`,
    ascii: [
      "      `%8_________`%7",
      "     `%8/         \\\\`%7",
      "    `%8/           \\\\`%7",
      "   `%8|   `%a[SCAN]   `%8|`%7",
      "   `%8|   `%e[WARN]   `%8|`%7",
      "   `%8\\\\___________/`%7",
      "    `%8|  |___|  |`%7",
      "   `%8/___________\\\\`%7"
    ],
    options: [
      { label: 'Navigation', key: 'N', action: async (s) => ({ ...s, currentScene: 'navigation' }) },
      { label: 'Sector View', key: 'V', action: async (s) => ({ ...s, currentScene: 'sector_view' }) },
      { label: 'Port Services', key: 'P', action: async (s) => ({ ...s, currentScene: 'port' }) },
      { label: 'Shipyard', key: 'Y', action: async (s) => ({ ...s, currentScene: 'shipyard' }) },
      { label: 'Engineering', key: 'E', action: async (s) => ({ ...s, currentScene: 'station_services' }) },
      { label: 'Inventory', key: 'I', action: async (s) => ({ ...s, currentScene: 'inventory' }) },
      { label: 'Scan', key: 'S', action: async (s) => ({ ...s, currentScene: 'scan' }) },
      { label: 'Bounties', key: 'D', action: async (s) => ({ ...s, currentScene: 'bounty_board' }) },
      { label: 'Star Cards', key: 'G', action: async (s) => ({ ...s, currentScene: 'card_collection' }) },
      { label: 'Card Shop', key: 'K', action: async (s) => ({ ...s, currentScene: 'card_shop' }) },
      { label: 'Rankings', key: 'X', action: async (s) => ({ ...s, currentScene: 'rankings' }) },
      { label: 'Stock Market', key: 'M', action: async (s) => ({ ...s, currentScene: 'stock_market' }) },
      { label: 'Company', key: 'C', action: async (s) => ({ ...s, currentScene: 'company' }) },
      { label: 'Faction HQ', key: 'H', action: async (s) => ({ ...s, currentScene: 'faction_hq' }) },
      { label: 'Comm Link', key: 'L', action: async (s) => ({ ...s, currentScene: 'messages' }) },
      { label: 'How to Play', key: '?', action: async (s) => ({ ...s, currentScene: 'help' }) },
      { label: 'ADMIN MODE', key: '!', action: async (s) => ({ ...s, currentScene: 'admin' }) }
    ]
  }),
  help: (state) => ({
    title: '`%eCOMMUNICATIONS: MANUAL` %7',
    description: `
\`%bQUICK START GUIDE\` %7
1. \`%fNAVIGATION\` %7: Use Turns to warp between sectors.
2. \`%fTRADING\` %7: Buy low, sell high at Ports. Check Stock Market.
3. \`%fCOMBAT\` %7: Equip Star Cards and upgrade shields in Engineering.
4. \`%fPLANETS\` %7: Claim empty worlds to earn daily tax revenue.
5. \`%fCOMPANIES\` %7: Join a team to share a treasury and coordinate.
`,
    options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  shipyard: (state) => {
    const stock = state.shipyardStock || []
    return {
      title: '`%eGALACTIC SHIP SHOWROOM` %7',
      description: `Welcome to the showroom. Our inventory shifts frequently.`,
      ascii: [
        "      `%8.---.`%7",
        "  `%8___/_____\\\\___`%7",
        " `%8/             \\\\`%7",
        "`%8|  `%f[NEW HULLS]  `%8|`%7",
        " `%8\\\\_____________/`%7"
      ],
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
      ascii: [
        "      `%c.-------.`%7",
        "      `%c| ENGIN |`%7",
        "      `%c'-------'`%7"
      ],
      options: [
        { label: `Upgrade Weapons [${weaponCost} cr]`, key: 'W', action: async (s) => (s.player!.credits >= weaponCost ? { ...s, player: { ...s.player!, credits: s.player!.credits - weaponCost, weaponLevel: s.player!.weaponLevel + 1 }, lastMessage: 'Upgraded!' } : { ...s, lastMessage: 'No credits!' }) },
        { label: `Upgrade Shields [${shieldCost} cr]`, key: 'S', action: async (s) => (s.player!.credits >= shieldCost ? { ...s, player: { ...s.player!, credits: s.player!.credits - shieldCost, shieldLevel: s.player!.shieldLevel + 1, maxShields: (s.player!.shieldLevel + 1) * 100 }, lastMessage: 'Upgraded!' } : { ...s, lastMessage: 'No credits!' }) },
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
        ascii: [
          "      `%b.-------.`%7",
          "      `%b| COMPY |`%7",
          "      `%b'-------'`%7"
        ],
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
      ascii: [
        "      `%e.-------.`%7",
        "      `%e| CMDHQ |`%7",
        "      `%e'-------'`%7"
      ],
      options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
    }
  },
  bounty_board: (state) => ({
    title: '`%bBOUNTY BOARD` %7',
    description: 'Mission protocols active.',
    ascii: [
      "      `%b.-------.`%7",
      "      `%b| MISNS |`%7",
      "      `%b'-------'`%7"
    ],
    options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  rankings: (state) => ({
    title: '`%eRANKINGS` %7',
    description: 'Net Worth Leaders:',
    ascii: [
      "      `%e.-------.`%7",
      "      `%e| LEADS |`%7",
      "      `%e'-------'`%7"
    ],
    options: [{ label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
  }),
  admin: (state) => ({
    title: '`%1SYSTEM ADMINISTRATION` %7',
    description: '`%7Deep access protocols active. Select a subsystem to manage.',
    ascii: [
      "      `%1.-------.`%7",
      "      `%1| ADMIN |`%7",
      "      `%1'-------'`%7"
    ],
    options: [
      { label: 'Player Management', key: 'P', action: async (s) => ({ ...s, currentScene: 'admin_players' }) },
      { label: 'World Configuration', key: 'W', action: async (s) => ({ ...s, currentScene: 'admin_world' }) },
      { label: 'Ship Library', key: 'S', action: async (s) => ({ ...s, currentScene: 'admin_ships', adminBuilder: { step: 'menu' } }) },
      { label: 'NPC Database', key: 'N', action: async (s) => ({ ...s, currentScene: 'admin_npcs' }) },
      { label: 'Economy Dashboard', key: 'E', action: async (s) => ({ ...s, currentScene: 'admin_economy' }) },
      { label: 'Star Card Editor', key: 'C', action: async (s) => ({ ...s, currentScene: 'admin_cards' }) },
      { label: 'Event Triggers', key: 'V', action: async (s) => ({ ...s, currentScene: 'admin_events' }) },
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  admin_players: (state) => {
    const players = dbOps.getAllPlayers()
    return {
      title: '`%1ADMIN: PLAYER MANAGEMENT` %7',
      description: `Registered Pilots: \`%f${players.length}\` %7`,
      options: [
        ...players.slice(0, 10).map((p, i) => ({
          label: `Edit ${p.name}`,
          key: (i + 1).toString(),
          action: async (st: GameState) => ({ ...st, currentScene: 'admin_player_edit', selectedPlanetId: p.id }) 
        })),
        { label: 'Back to Admin', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin' }) }
      ]
    }
  },
  admin_player_edit: (state) => {
    const playerId = state.selectedPlanetId
    const p = dbOps.getPlayer(playerId!) as any
    if (!p) return { title: 'ERROR', description: 'Player not found', options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin_players' }) }] }
    return {
      title: `\`%1ADMIN: EDITING ${p.name.toUpperCase()}\` %7`,
      description: `Credits: \`%e${p.credits}\` %7 | Alignment: ${p.alignment} | Banned: ${p.isBanned ? '%1YES' : '%aNO'}`,
      options: [
        { label: 'Grant 10k', key: 'C', action: async (s) => { dbOps.updatePlayerCredits(p.id, 10000); return { ...s, lastMessage: 'Granted.' } }},
        { label: 'Shift +100', key: 'A', action: async (s) => { dbOps.setPlayerAlignment(p.id, p.alignment + 100); return { ...s, lastMessage: 'Shifted.' } }},
        { label: p.isBanned ? 'UNBAN' : 'BAN', key: 'X', action: async (s) => { dbOps.setPlayerBanned(p.id, !p.isBanned); return { ...s, lastMessage: 'Toggled.' } }},
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin_players' }) }
      ]
    }
  },
  admin_world: (state) => {
    const settings = dbOps.getWorldSettings() as any[]
    return {
      title: '`%1ADMIN: WORLD CONFIG` %7',
      description: 'Global parameters:',
      options: [
        ...settings.map((s, i) => ({
          label: `${s.key}: ${s.value}`,
          key: (i + 1).toString(),
          action: async (st: GameState) => ({ ...st, currentScene: 'admin_setting_edit', selectedPlanetId: s.key }) 
        })),
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin' }) }
      ]
    }
  },
  admin_setting_edit: (state) => {
    const key = state.selectedPlanetId
    const val = dbOps.getSetting(key!)
    return {
      title: `\`%1ADMIN: EDIT SETTING [${key?.toUpperCase()}]\` %7`,
      description: `Current: \`%f${val?.value || 'NULL'}\` %7`,
      options: [
        { label: 'Set Value', key: 'S', action: async (s) => s },
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin_world' }) }
      ]
    }
  },
  admin_ships: (state) => {
    const builder = state.adminBuilder || { step: 'menu' }
    const templates = dbOps.getShipTemplates() as any[]
    const modifiers = dbOps.getShipModifiers() as any[]
    if (builder.step === 'menu') return {
      title: '`%1ADMIN: SHIP EDITOR` %7',
      description: `Manage fleet definitions. Templates: ${templates.length} | Modifiers: ${modifiers.length}`,
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
        ...templates.map((t, i) => ({
          label: `Base: ${t.name}`,
          key: (i + 1).toString(),
          action: async (s: GameState) => ({ ...s, adminBuilder: { ...builder, templateId: t.id, step: 'build_prefix' } })
        })),
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
  admin_npcs: (state) => {
    const npcs = dbOps.getNpcsInSector(state.player!.sectorId) as any[]
    return {
      title: '`%1ADMIN: NPC EDITOR` %7',
      description: `NPCs in Sector \`%f${state.player!.sectorId}\` %7:`,
      options: [
        ...npcs.map((n, i) => ({
          label: `Cycle Greed for ${n.name}`,
          key: (i + 1).toString(),
          action: async (s: GameState) => {
            const p = JSON.parse(n.personality)
            p.greed = (p.greed + 20) % 100
            dbOps.updateNpcStats(n.id, JSON.stringify(p))
            return { ...s, lastMessage: `${n.name} greed set to ${p.greed}.` }
          }
        })),
        { label: 'Back to Admin', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin' }) }
      ]
    }
  },
  admin_economy: (state) => {
    const stats = dbOps.getEconomyStats()
    return {
      title: '`%1ADMIN: ECONOMY DASHBOARD` %7',
      description: `Total Credits: \`%e${stats.totalCredits}\` %7 | Total Cargo: \`%f${stats.totalCargo}\` %7`,
      options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin' }) }]
    }
  },
  admin_events: (state) => {
    return {
      title: '`%1ADMIN: EVENT TRIGGERS` %7',
      description: 'Trigger a manual event:',
      options: [
        { label: 'Solar Flare', key: '1', action: async (s) => { dbOps.triggerManualEvent('SOLAR_FLARE', 'Solar flare detected!'); return { ...s, lastMessage: 'Triggered.' } }},
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin' }) }
      ]
    }
  },
  admin_cards: (state) => {
    const cards = dbOps.getAllStarCards() as any[]
    return {
      title: '`%1ADMIN: CARD EDITOR` %7',
      description: `Definitions: ${cards.length}`,
      options: [
        { label: 'Delete Last Card', key: 'D', action: async (s) => { const last = cards[cards.length - 1]; if (last) dbOps.deleteStarCardDefinition(last.id); return { ...s, lastMessage: 'Removed.' } }},
        { label: 'Back to Admin', key: 'B', action: async (s) => ({ ...s, currentScene: 'admin' }) }
      ]
    }
  },
  stock_market: (state) => ({
    title: '`%eSTOCK EXCHANGE` %7',
    description: `Market Listings:\n${state.stocks?.map((s, i) => `${i + 1}. \`%b${s.symbol}\` %7: \`%e${s.price.toFixed(2)}\` %7`).join('\n')}`,
    ascii: [
      "      `%e.-------.`%7",
      "      `%e| STOCK |`%7",
      "      `%e'-------'`%7"
    ],
    options: [
      ...state.stocks?.map((s, i) => ({ label: `Trade ${s.symbol}`, key: (i + 1).toString(), action: async (st: any) => ({ ...st, currentScene: 'stock_details', selectedPlanetId: s.symbol }) })) || [],
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
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
        { label: 'Back to Exchange', key: 'B', action: async (s) => ({ ...s, currentScene: 'stock_market' }) }
      ]
    }
  },
  sector_view: (state) => {
    const nodes = state.resourceNodes || []
    const npcs = state.currentNpcs || []
    const players = state.onlinePlayers || []
    
    let contents = 'Objects in Sector:\n'
    if (state.currentPlanets.length > 0) contents += `- \`%aPLANETS:\` %7 ${state.currentPlanets.map(p => p.name).join(', ')}\n`
    if (npcs.length > 0) contents += `- \`%fNPCs:\` %7 ${npcs.map(n => n.name).join(', ')}\n`
    if (players.length > 0) contents += `- \`%bPLAYERS:\` %7 ${players.map(p => p.name).join(', ')}\n`
    if (nodes.length > 0) contents += `- \`%eRESOURCES:\` %7 ${nodes.map(n => n.type).join(', ')}\n`
    if (contents === 'Objects in Sector:\n') contents = 'Empty space.'

    return {
      title: '`%eSECTOR VIEW` %7',
      description: `Sector: \`%f${state.currentSector?.id}\` %7\n\n${contents}`,
      ascii: [
        "      `%8.-------.`%7",
        "      `%8| VIEW  |`%7",
        "      `%8'-------'`%7"
      ],
      options: [
        ...state.currentPlanets.map((p, i) => ({ label: `Land on ${p.name}`, key: (i + 1).toString(), action: async (s: any) => ({ ...s, selectedPlanetId: p.id, currentScene: 'planet_surface' }) })),
        ...npcs.map((n, i) => ({ label: `Hail ${n.name}`, key: (state.currentPlanets.length + i + 1).toString(), action: async (s: any) => ({ ...s, currentScene: 'npc_dialogue' }) })),
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  scan: (state) => {
    const npcs = state.currentNpcs || []
    const players = state.onlinePlayers || []
    
    let summary = 'Deep Space Sensors Scan Result:\n'
    npcs.forEach(n => summary += `\`%f[NPC]\` %7 \`%f${n.name}\` %7 - Status: Active\n`)
    players.forEach(p => summary += `\`%b[PILOT]\` %7 \`%b${p.name}\` %7 - Status: Active\n`)
    if (npcs.length === 0 && players.length === 0) summary += 'No external signatures detected.'

    return {
      title: '`%bLONG-RANGE SCANNER` %7',
      description: summary,
      options: [
        { label: 'Refresh Scan', key: 'S', action: async (s) => s },
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  planet_surface: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    const customAscii = planet?.customAscii ? JSON.parse(planet.customAscii) : undefined
    return {
      title: `\`%aPLANET: ${planet?.name}\` %7`,
      description: planet?.customDescription || `Population: \`%f${planet?.population}\` %7`,
      ascii: customAscii || [
        "      `%a.-------.`%7",
        "      `%a| WORLD |`%7",
        "      `%a'-------'`%7"
      ],
      options: [
        ...(planet && !planet.ownerId ? [{ label: 'Claim Planet', key: 'C', action: async (s: any) => ({ ...s, lastMessage: `Requesting claim for ${planet.id}` }) }] : []),
        { label: 'Management', key: 'M', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) },
        ...(planet?.hasPort ? [{ label: 'Trading Port', key: 'P', action: async (s: GameState) => ({ ...s, currentScene: 'planet_trade' }) }] : []),
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
        { label: 'Report', key: 'R', action: async (s) => { const report = dbOps.getPlanetReport(planet!.id); return { ...s, lastMessage: report ? report.report : 'No report.' } }},
        { label: 'Construction', key: 'C', action: async (s) => ({ ...s, currentScene: 'planet_construction' }) },
        { label: 'Personalize', key: 'P', action: async (s) => ({ ...s, currentScene: 'planet_personalize' }) },
        { label: 'Mining', key: 'M', action: async (s) => ({ ...s, currentScene: 'planet_mining' }) },
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_surface' }) }
      ]
    }
  },
  planet_construction: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    const buildings = state.planetBuildings || []
    return {
      title: `\`%eCONSTRUCTION: ${planet?.name}\` %7`,
      description: `Operational: ${buildings.length}`,
      options: [
        { label: 'Build Shipyard (15k)', key: '1', action: async (s) => ({ ...s, lastMessage: `Requesting building:shipyard:15000:${planet?.id}` }) },
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) }
      ]
    }
  },
  planet_personalize: (state) => ({
    title: '`%ePERSONALIZE` %7',
    description: 'Set custom planet data.',
    options: [
      { label: 'Set Desc', key: 'D', action: async (s) => s },
      { label: 'Set ASCII', key: 'A', action: async (s) => s },
      { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) }
    ]
  }),
  planet_trade: (state) => {
    const planet = state.currentPlanets.find(p => p.id === state.selectedPlanetId)
    const prices = planet?.portPrices ? JSON.parse(planet.portPrices) : { ore: 10, fuel: 20, equipment: 100 }
    return {
      title: `\`%cPORT: ${planet?.name}\` %7`,
      description: `ORE:${prices.ore} [DATA:ore:${prices.ore}:${prices.ore+2}]`,
      options: [
        { label: 'Buy Ore', key: 'O', action: async (s) => s },
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
        { label: 'Reset', key: 'R', action: async (s) => { dbOps.updatePlanetMiners(planet!.id, 0, 0, 0); return { ...s, lastMessage: 'Reset.' } }},
        { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'planet_manage' }) }
      ]
    }
  },
  port: (state) => {
    const sector = state.currentSector
    if (!sector?.portInventory) return { title: 'PORT', description: 'No port.', options: [{ label: 'Leave', key: 'L', action: async (s) => ({ ...s, currentScene: 'bridge' }) }] }
    const inv = JSON.parse(sector.portInventory)
    const items = Object.entries(inv).map(([name, data]) => {
      const item = data as any; const buyPrice = calculateDynamicPrice(name as Commodity, item.stock, true); const sellPrice = calculateDynamicPrice(name as Commodity, item.stock, false)
      return `${name.toUpperCase().padEnd(10)}: Stock: ${item.stock.toString().padEnd(5)} | Buy: ${buyPrice} | Sell: ${sellPrice} [DATA:${name}:${buyPrice}:${sellPrice}]`
    })
    return {
      title: '%cPORT SERVICES',
      ascii: [
        "      `%c.-------.`%7",
        "      `%c| TRADS |`%7",
        "      `%c'-------'`%7"
      ],
      description: `Supply & Demand Economy:\n${items.join('\n')}`,
      options: [
        ...Object.entries(inv).filter(([_, data]) => (data as any).sell !== -1).map(([name, data]) => ({ label: `Buy ${name}`, key: name[0].toLowerCase(), action: async (s: GameState) => s })),
        ...Object.entries(inv).filter(([_, data]) => (data as any).buy !== -1).map(([name, data]) => ({ label: `Sell ${name}`, key: name === 'ore' ? 'r' : name === 'fuel' ? 'u' : 'q', action: async (s: GameState) => s })),
        { label: 'Leave', key: 'L', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  card_shop: (state) => ({
    title: '`%bCARD SHOP` %7',
    description: 'Find rare abilities.',
    ascii: [
      "      `%b.-------.`%7",
      "      `%b| PACKS |`%7",
      "      `%b'-------'`%7"
    ],
    options: [
      { label: 'Buy 1 Pack (500 cr)', key: '1', action: async (s) => (s.player!.credits >= 500 ? { ...s, lastMessage: 'Requesting Star Pack purchase...' } : { ...s, lastMessage: 'No credits!' }) },
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
  card_collection: (state) => {
    const deck = state.playerDeck || []
    const equipped = deck.filter(c => c.equipped)
    return {
      title: '`%bCOLLECTION` %7',
      description: `Active: ${equipped.length}/5`,
      options: [
        ...deck.slice(0, 9).map((c, i) => ({ label: `${c.equipped ? 'Unequip' : 'Equip'} ${c.name}`, key: (i + 1).toString(), action: async (s: any) => { if (!c.equipped && equipped.length >= 5) return { ...s, lastMessage: 'Deck full!' }; return { ...s, lastMessage: `Requesting ${c.equipped ? 'unequip' : 'equip'} for instance ${c.instanceId}` } } })),
        { label: 'Combine Duplicates', key: 'C', action: async (s) => { const duplicates = deck.filter((c, index) => deck.findIndex(cc => cc.id === c.id) !== index); if (duplicates.length > 0) return { ...s, lastMessage: `Requesting card combination for ${duplicates[0].id}` }; return { ...s, lastMessage: 'No duplicates.' } }},
        { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  },
  galactic_news: (state) => {
    const news = dbOps.getRecentNews()
    return {
      title: '`%eGALACTIC NEWS` %7',
      description: news.length > 0 ? news.map(n => `\`%b[${n.category}]\` %7 \`%f${n.headline}\` %7\n${n.body}`).join('\n\n') : 'No news today.',
      ascii: [
        "      `%e.-------.`%7",
        "      `%e| NEWS  |`%7",
        "      `%e'-------'`%7"
      ],
      options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }]
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
      ...(state.currentSector?.warps || []).map((id) => ({ label: `Warp ${id}`, key: id.toString(), action: async (s: any) => { if (s.player!.turns <= 0) return { ...s, lastMessage: 'No turns!' }; const targetSector = dbOps.getSector(id); let lastMsg = `Warped to Sector ${id}.`; let finalSectorId = id; let finalPlayer = { ...s.player, turns: s.player.turns - 1 }; if (targetSector.type === 'black_hole') { const randomSector = Math.floor(Math.random() * 500) + 1; finalSectorId = randomSector; finalPlayer.shields = Math.max(0, finalPlayer.shields - 50); lastMsg = `CRITICAL: Pulled into a Black Hole! Spat out in Sector ${randomSector}.` }; return { ...s, player: { ...finalPlayer, sectorId: finalSectorId }, currentScene: 'bridge', lastMessage: lastMsg } } })),
      { label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
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
  card_duel: (state) => {
    if (!state.currentDuel) return { title: 'ERROR', description: 'No duel', options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }] }
    const { player, opponent, round, turn, log, winner } = state.currentDuel
    const renderRow = (side: any, rowName: string) => `[${rowName.toUpperCase().padEnd(8)}] ${side[rowName].cards.map((c: any) => `[${c.power}]`).join(' ')} (${side[rowName].score})`
    const board = `R${round} | T:${turn.toUpperCase()}\n${opponent.name} (L:${opponent.lives})\n${renderRow(opponent, 'support')}\n${renderRow(opponent, 'fleet')}\n${renderRow(opponent, 'vanguard')}\nSCORE: %1${opponent.score}%7\n\nSCORE: %a${player.score}%7\n${renderRow(player, 'vanguard')}\n${renderRow(player, 'fleet')}\n${renderRow(player, 'support')}\n${player.name} (L:${player.lives})`
    if (winner) return { title: '`%bDUEL OVER` %7', description: board + `\n\n%f${winner === 'player' ? 'VICTORY!' : 'DEFEAT!'}%7`, options: [{ label: 'Return', key: 'B', action: async (s) => { let msg = 'Duel finished.'; if (winner === 'player') { const all = dbOps.getAllStarCards(); const prize = all[Math.floor(Math.random() * all.length)]; dbOps.addPlayerCard(s.player!.id, prize.id); msg = `VICTORY! Prize: ${prize.name}.` }; return { ...s, currentScene: 'bridge', currentDuel: null, lastMessage: msg } } }] }
    return {
      title: '`%bDUEL` %7',
      description: board,
      options: [
        ...player.hand.map((c, i) => ({ label: `${c.name} (${c.power})`, key: (i + 1).toString(), action: async (s: GameState) => { if (turn !== 'player' || player.hasPassed) return s; const row = c.preferredRow === 'any' ? 'fleet' : c.preferredRow as any; const newDuel = playCard({ ...s.currentDuel! }, 'player', i, row); return { ...s, currentDuel: newDuel } } })),
        { label: 'Pass', key: 'P', action: async (s) => { if (turn !== 'player' || player.hasPassed) return s; const newDuel = passRound({ ...s.currentDuel! }, 'player'); return { ...s, currentDuel: newDuel } } },
        { label: 'Forfeit', key: 'Q', action: async (s) => ({ ...s, currentScene: 'bridge', currentDuel: null, lastMessage: 'Forfeited.' }) }
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
    const npc = state.currentNpcs?.[0] || { id: 'npc_vex', name: 'Captain Vex' }
    return {
      title: `%f${npc.name.toUpperCase()} - SMUGGLER`,
      description: '"Challenge me, pilot?"',
      options: [
        { label: 'Duel', key: 'D', action: async (s) => { if (s.playerDeck.filter(c => c.equipped).length < 1) return { ...s, lastMessage: 'Equip cards first!' }; const duel = createDuel(s.player!.name, s.playerDeck, npc.name, dbOps.getAllStarCards().slice(0, 10)); return { ...s, currentDuel: duel, currentScene: 'card_duel' } } },
        { label: 'Leave', key: 'L', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
      ]
    }
  }
}

export const getSceneViewModel = (state: GameState): SceneViewModel => {
  const handler = registry[state.currentScene]
  if (!handler) return { title: 'ERROR', description: `Scene ${state.currentScene} not found.`, options: [{ label: 'Back', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }] }
  return handler(state)
}
