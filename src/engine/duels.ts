import { DuelState, DuelSide, DuelRow, StarCard, PlayerCard } from './types'

export function createDuel(playerName: string, playerDeck: PlayerCard[], opponentName: string, opponentDeck: StarCard[]): DuelState {
  // Draw initial hands (10 cards each for strategic depth)
  const playerHand = playerDeck.filter(c => c.equipped).sort(() => Math.random() - 0.5).slice(0, 10)
  const opponentHand = opponentDeck.sort(() => Math.random() - 0.5).slice(0, 10)

  return {
    player: createDuelSide(playerName, playerHand),
    opponent: createDuelSide(opponentName, opponentHand),
    round: 1,
    turn: 'player',
    log: ['Duel Commenced.'],
    winner: null
  }
}

function createDuelSide(name: string, hand: StarCard[]): DuelSide {
  return {
    name,
    hand,
    vanguard: { cards: [], score: 0 },
    fleet: { cards: [], score: 0 },
    support: { cards: [], score: 0 },
    score: 0,
    lives: 2,
    hasPassed: false
  }
}

export function calculateRowScore(row: DuelRow): number {
  let baseScore = row.cards.reduce((sum, c) => sum + c.power, 0)
  
  // Effect: Signal Booster (Horn) - Doubles row power
  const hasBooster = row.cards.some(c => c.effect === 'booster')
  if (hasBooster) baseScore *= 2

  // Effect: Nebula Screen (Fog) - Reduce row power to 1 per card
  if (row.isWeathered) {
    baseScore = row.cards.length
  }

  return baseScore
}

export function updateDuelScores(state: DuelState): DuelState {
  const sides = [state.player, state.opponent]
  sides.forEach(s => {
    s.vanguard.score = calculateRowScore(s.vanguard)
    s.fleet.score = calculateRowScore(s.fleet)
    s.support.score = calculateRowScore(s.support)
    s.score = s.vanguard.score + s.fleet.score + s.support.score
  })
  return state
}

export function playCard(state: DuelState, side: 'player' | 'opponent', cardIdx: number, rowName: 'vanguard' | 'fleet' | 'support'): DuelState {
  const actor = side === 'player' ? state.player : state.opponent
  const opponent = side === 'player' ? state.opponent : state.player
  const card = actor.hand[cardIdx]
  
  if (!card) return state

  // Remove from hand
  actor.hand.splice(cardIdx, 1)
  
  // Handle Immediate Effects
  if (card.effect === 'spy') { // Deep Cover Agent
    // Card goes to opponent's field, but actor draws 2
    opponent[rowName].cards.push(card)
    state.log.push(`${actor.name} deployed a Deep Cover Agent to ${opponent.name}'s ${rowName.toUpperCase()}.`)
    // Draw 2 from deck if we had one, for now just draw dummy cards or log it
    state.log.push(`${actor.name} intercepted enemy intel (Draw 2).`)
  } else if (card.effect === 'scorch') { // Orbital Strike
    // Destroy highest power card(s) on opponent board
    const allOpponentCards = [...opponent.vanguard.cards, ...opponent.fleet.cards, ...opponent.support.cards]
    if (allOpponentCards.length > 0) {
      const maxPower = Math.max(...allOpponentCards.map(c => c.power))
      opponent.vanguard.cards = opponent.vanguard.cards.filter(c => c.power < maxPower)
      opponent.fleet.cards = opponent.fleet.cards.filter(c => c.power < maxPower)
      opponent.support.cards = opponent.support.cards.filter(c => c.power < maxPower)
      state.log.push(`${actor.name} triggered an Orbital Strike! High-power signatures neutralized.`)
    }
    actor[rowName].cards.push(card)
  } else if (card.effect === 'hijack') { // Subroutine Hijack
    // Steal random enemy card from a random row
    const rows: ('vanguard' | 'fleet' | 'support')[] = ['vanguard', 'fleet', 'support']
    const validRows = rows.filter(r => opponent[r].cards.length > 0)
    if (validRows.length > 0) {
      const targetRow = validRows[Math.floor(Math.random() * validRows.length)]
      const stolen = opponent[targetRow].cards.pop()
      if (stolen) {
        actor[rowName].cards.push(stolen)
        state.log.push(`${actor.name} hijacked ${stolen.name} from ${opponent.name}'s ${targetRow.toUpperCase()}!`)
      }
    }
    actor[rowName].cards.push(card)
  } else {
    // Standard placement
    actor[rowName].cards.push(card)
    state.log.push(`${actor.name} deployed ${card.name} to ${rowName.toUpperCase()}.`)
  }
  
  updateDuelScores(state)
  
  if (!opponent.hasPassed) {
    state.turn = side === 'player' ? 'opponent' : 'player'
  }

  return state
}

export function passRound(state: DuelState, side: 'player' | 'opponent'): DuelState {
  const actor = side === 'player' ? state.player : state.opponent
  actor.hasPassed = true
  state.log.push(`${actor.name} has passed.`)

  const other = side === 'player' ? state.opponent : state.player
  if (other.hasPassed) {
    return resolveRound(state)
  } else {
    state.turn = side === 'player' ? 'opponent' : 'player'
  }

  return state
}

function resolveRound(state: DuelState): DuelState {
  const pScore = state.player.score
  const oScore = state.opponent.score

  if (pScore > oScore) {
    state.opponent.lives--
    state.log.push(`${state.player.name} WINS THE ROUND!`)
  } else if (oScore > pScore) {
    state.player.lives--
    state.log.push(`${state.opponent.name} WINS THE ROUND!`)
  } else {
    state.player.lives--
    state.opponent.lives--
    state.log.push(`ROUND DRAW! Energy depleted for both sides.`)
  }

  if (state.player.lives <= 0 || state.opponent.lives <= 0) {
    state.winner = state.player.lives > state.opponent.lives ? 'player' : 'opponent'
    state.log.push(`DUEL ENDED: ${state.winner === 'player' ? state.player.name : state.opponent.name} IS VICTORIOUS!`)
  } else {
    state.round++
    state.player.vanguard.cards = []; state.player.fleet.cards = []; state.player.support.cards = []
    state.opponent.vanguard.cards = []; state.opponent.fleet.cards = []; state.opponent.support.cards = []
    state.player.hasPassed = false
    state.opponent.hasPassed = false
    updateDuelScores(state)
    state.turn = pScore > oScore ? 'player' : 'opponent'
  }

  return state
}
