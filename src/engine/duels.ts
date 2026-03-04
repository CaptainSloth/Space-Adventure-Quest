import { DuelState, DuelSide, DuelRow, StarCard, PlayerCard } from './types'

export function createDuel(playerName: string, playerDeck: PlayerCard[], opponentName: string, opponentDeck: StarCard[]): DuelState {
  // Draw initial hands (7 cards each)
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
  
  // Apply "Horn" effect (doubles row)
  const hasHorn = row.cards.some(c => c.effect === 'horn')
  if (hasHorn) baseScore *= 2

  // Apply "Weather" (reduces non-gold to 1) - placeholder for now
  if (row.isWeathered) {
    baseScore = row.cards.length // Simplify for now: each card = 1
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

export function playCard(state: DuelState, side: 'player' | 'opponent', cardIdx: number, row: 'vanguard' | 'fleet' | 'support'): DuelState {
  const actor = side === 'player' ? state.player : state.opponent
  const card = actor.hand[cardIdx]
  
  if (!card) return state

  // Remove from hand
  actor.hand.splice(cardIdx, 1)
  
  // Add to board
  actor[row].cards.push(card)
  
  state.log.push(`${actor.name} played ${card.name} to ${row.toUpperCase()}.`)
  
  // Recalculate scores
  updateDuelScores(state)
  
  // Switch turns if other hasn't passed
  const other = side === 'player' ? state.opponent : state.player
  if (!other.hasPassed) {
    state.turn = side === 'player' ? 'opponent' : 'player'
  }

  return state
}

export function passRound(state: DuelState, side: 'player' | 'opponent'): DuelState {
  const actor = side === 'player' ? state.player : state.opponent
  actor.hasPassed = true
  state.log.push(`${actor.name} has passed the round.`)

  const other = side === 'player' ? state.opponent : state.player
  if (other.hasPassed) {
    // Both passed, resolve round
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
    state.log.push(`ROUND OVER: ${state.player.name} WINS! ${state.opponent.name} loses 1 life.`)
  } else if (oScore > pScore) {
    state.player.lives--
    state.log.push(`ROUND OVER: ${state.opponent.name} WINS! ${state.player.name} loses 1 life.`)
  } else {
    state.player.lives--
    state.opponent.lives--
    state.log.push(`ROUND OVER: DRAW! Both lose 1 life.`)
  }

  // Check Game Over
  if (state.player.lives <= 0 || state.opponent.lives <= 0) {
    state.winner = state.player.lives > state.opponent.lives ? 'player' : 'opponent'
    state.log.push(`GAME OVER: ${state.winner === 'player' ? state.player.name : state.opponent.name} IS THE CHAMPION!`)
  } else {
    // Reset for next round
    state.round++
    resetBoard(state.player)
    resetBoard(state.opponent)
    state.player.hasPassed = false
    state.opponent.hasPassed = false
    state.turn = pScore > oScore ? 'player' : 'opponent'
  }

  return state
}

function resetBoard(side: DuelSide) {
  side.vanguard.cards = []
  side.fleet.cards = []
  side.support.cards = []
  side.vanguard.score = 0
  side.fleet.score = 0
  side.support.score = 0
  side.score = 0
}
