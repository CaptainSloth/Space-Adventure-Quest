import { app } from 'electron'
import { GameState, SceneViewModel, SceneId, SerializableSceneViewModel } from '../types'
import { getPortInventory } from '../trading'

export type SceneRegistry = {
  [K in SceneId]?: (state: GameState) => SceneViewModel
}

export const toSerializable = (vm: SceneViewModel, lastMessage?: string | null): SerializableSceneViewModel => {
  return {
    title: vm.title,
    description: vm.description,
    ascii: vm.ascii,
    lastMessage,
    options: vm.options.map(o => ({ label: o.label, key: o.key }))
  }
}

const registry: SceneRegistry = {
  // ... (previous scenes)
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
Faction: ${state.player?.faction}
Credits: ${state.player?.credits}
Turns: ${state.player?.turns}/${state.player?.maxTurns}
Location: Sector ${state.player?.sectorId}`,
    options: [
      { label: 'Back to Bridge', key: 'B', action: async (s) => ({ ...s, currentScene: 'bridge' }) }
    ]
  }),
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
    description: `Current Sector: \`%f${state.player?.sectorId}\`%7
System Status: \`%aONLINE\`%7
Fuel: \`%e100%\`%7
Shields: \`%c${state.player?.shields}%\`%7

What are your orders, Captain?`,
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
      { label: 'Port Services', key: 'P', action: async (s) => ({ ...s, currentScene: 'port' }) },
      { label: 'Inventory', key: 'I', action: async (s) => ({ ...s, currentScene: 'inventory' }) },
      { label: 'Status Scan', key: 'S', action: async (s) => ({ ...s, currentScene: 'scan' }) }
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
  scan: (state) => ({
    title: '%bLONG RANGE SCAN',
    description: `You scan the sector.
Planets: 0
Other Ships: 1 (Detected: Captain Vex)
Hazards: None`,
    options: [
      { label: 'Hail Captain Vex', key: 'H', action: async (s) => ({ ...s, currentScene: 'npc_dialogue' }) },
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
