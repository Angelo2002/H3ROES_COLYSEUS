# H3ROES C4RDS - Colyseus Server Implementation Guide

This guide provides complete specifications for implementing a Colyseus server that matches the existing Defold game logic for H3ROES C4RDS.

## Overview

**Game**: Turn-based card game with 68 character cards (0-67) where players try to get closest to 34 points
**Max Players**: 2 players per room
**Architecture**: Server-authoritative with real-time synchronization
**Goal**: Reach 1000 credits (REAL WINNER) or avoid 0 credits (BUSTED)

## Room Configuration

```typescript
// Room should accept exactly 2 players
@Room("heroes_cards")
export class HeroesCardsRoom extends Room {
    maxClients = 2;
    // Room is locked when full, destroyed when empty
}
```

## Game State Schema

The server must maintain the following authoritative state:

### Core Game State
```typescript
interface GameState {
    // Phase management
    phase: GamePhase;           // Current game phase
    current_player: number;     // 1 or 2 - whose turn it is (chooses for BOTH players)
    round_number: number;       // Starting at 1
    turn_number: number;        // 1-10 turns per round

    // Player data (server authoritative)
    players: {
        [1]: PlayerState;
        [2]: PlayerState;
    };

    // Battle state
    battle_result: BattleResult | null;

    // Turn state - current selections
    current_turn: {
        own_card_selected: boolean;
        rival_card_selected: boolean;
        own_slot: number | null;
        rival_slot: number | null;
        own_card_id: number | null;
        rival_card_id: number | null;
    };

    // Server deck (shared between players)
    deck: number[];             // Shuffled deck of card IDs 0-67

    // Game over state
    waiting_for_continue: boolean; // After game ends, wait for continue message
}

enum GamePhase {
    INIT = "init",
    BETTING = "betting",
    INITIAL_CARD_SELECTION = "initial_card_selection",  // First turn of round
    CARD_SELECTION_OWN = "card_selection_own",         // Player selects own card
    CARD_SELECTION_RIVAL = "card_selection_rival",     // Player selects rival card
    BATTLE = "battle",
    POWER_CHOICE = "power_choice",
    ROUND_END = "round_end",
    GAME_OVER = "game_over"
}

interface PlayerState {
    credits: number;            // Starting 100, win at 1000, lose at 0
    points: number;             // No clamping, can go negative or above 68
    current_bet: number;        // Bet amount for current round
    hand: { [slot: number]: number }; // Cards 0-9 slots, card IDs 0-67
    joker_values: { [slot: number]: number }; // Pre-rolled joker powers

    // Cards currently revealed to this player (only unveiled ones visible)
    revealed_cards: { [slot: number]: number }; // Only cards that have been played/revealed
}

interface BattleResult {
    winner: number;            // 0=tie, 1=player1, 2=player2
    power_difference: number;  // Absolute difference in powers
    p1_power: number;         // Player 1's card power
    p2_power: number;         // Player 2's card power
    p1_card: number;          // Player 1's card ID
    p2_card: number;          // Player 2's card ID
}
```

### Special Cards
```typescript
const SPECIAL_CARDS = {
    JOKER: 0,        // Random power 1-68 (pre-rolled server-side)
    DR_MANHATTAN: 67 // Power=67, reveals opponent cards if owned by current player
};
```

## Server Logic Requirements

### 1. Game Initialization

When room reaches 2 players:
1. **Initialize Game State**:
   - Reset all player data (credits=100, points=0, etc.)
   - Create and shuffle deck (Fisher-Yates algorithm)
   - Deal 10 cards to each player (remove from shared deck)
   - Pre-roll joker values for any Joker cards dealt
   - Start betting phase

2. **Deck Creation & Shuffling**:
```typescript
function createAndShuffleDeck(): number[] {
    const deck = [];
    for (let i = 0; i <= 67; i++) {
        deck.push(i);
    }

    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
}
```

3. **Card Dealing**:
```typescript
function dealCards(gameState: GameState) {
    // Reset deck for new round
    gameState.deck = createAndShuffleDeck();

    for (let playerId = 1; playerId <= 2; playerId++) {
        gameState.players[playerId].hand = {};
        gameState.players[playerId].revealed_cards = {}; // Reset revealed cards

        for (let slot = 0; slot <= 9; slot++) {
            const cardId = gameState.deck.pop(); // Remove from shared deck
            gameState.players[playerId].hand[slot] = cardId;

            // Pre-roll joker values to prevent client manipulation
            if (cardId === SPECIAL_CARDS.JOKER) {
                gameState.players[playerId].joker_values[slot] =
                    Math.floor(Math.random() * 68) + 1; // 1-68
            }
        }
    }
}
```

### 2. Turn Structure (CRITICAL)

**Turn Distribution**: 10 turns total per round
- **Turn 1**: Initial card selection (both players pick 1 card each)
- **Turns 2-10**: Winner of turn 1 gets 5 turns (2,4,6,8,10), loser gets 4 turns (3,5,7,9)

**Turn Flow for Regular Turns (2-10)**:
1. Current player selects their own card → `CARD_SELECTION_RIVAL` phase
2. Current player selects rival's card → `BATTLE` phase
3. If current player wins → `POWER_CHOICE` phase
4. Next turn (switch current_player)

### 3. Phase Management

#### Betting Phase
- **Entry**: Start of each round
- **Actions**: Accept "place_bet" with amount validation
- **Validation**: Bet amount ≤ player credits, ≥ 0
- **Transition**: When both players have bet > 0, go to initial card selection

#### Initial Card Selection (Turn 1 Only)
- **Entry**: After betting phase
- **Actions**: Each player selects one card for themselves only
- **Logic**:
  - Both players send "play_card" with their slot
  - Server reveals both selected cards
  - Calculate powers, determine starting player (higher wins, tie=random)
  - Remove selected cards from hands, add to revealed_cards
- **Transition**: Regular card selection with determined starting player

#### Card Selection Own
- **Entry**: Start of regular turn (turns 2-10)
- **Actions**: Accept "play_card" from current_player only
- **Logic**:
  - Validate slot has card in current_player's hand
  - Store selection in current_turn.own_slot/own_card_id
  - Remove from hand, add to revealed_cards
- **Transition**: Card Selection Rival phase

#### Card Selection Rival
- **Entry**: After current player selected own card
- **Actions**: Accept "play_card" from current_player only (selecting rival's card)
- **Logic**:
  - Validate slot has card in rival's hand
  - Store selection in current_turn.rival_slot/rival_card_id
  - Remove from rival's hand, add to rival's revealed_cards
- **Transition**: Battle phase

#### Battle Phase
- **Entry**: Both cards selected for turn
- **Dr. Manhattan Handling**:
  - Check if current_player's card is Dr. Manhattan
  - If yes: Send rival's entire hand to current_player (client handles timer)
  - Dr. Manhattan always has power = 67
- **Power Calculation**: Use `calculateCardPower()`
- **Winner Logic**: Higher power wins, ties have no winner
- **Transition**: Power choice (if current_player wins) or next turn

#### Power Choice Phase
- **Entry**: Battle winner was current_player
- **Actions**: Accept "power_choice" from current_player only
- **Options**: "add" or "subtract" the power difference
- **Logic**: Apply to current_player's points (NO CLAMPING - can be negative/above 68)
- **Transition**: Next turn

### 4. Message Handling

Server must handle these client messages:

#### place_bet
```typescript
interface PlaceBetMessage {
    action: "place_bet";
    data: {
        amount: number;
    };
}
```

#### play_card
```typescript
interface PlayCardMessage {
    action: "play_card";
    data: {
        slot_index: number;    // 0-9 slot being selected
    };
}
```
**Note**: Server determines card_id from slot_index, client only sends slot number.

#### power_choice
```typescript
interface PowerChoiceMessage {
    action: "power_choice";
    data: {
        choice: "add" | "subtract";
    };
}
```

#### continue_game
```typescript
interface ContinueGameMessage {
    action: "continue_game";
}
```
**Note**: After game over, either player can send this to restart the match.

### 5. Server Broadcasts

#### sync_game_state
**To**: Individual players (different data per player)
**When**: After any state change
**Data**: Player sees ONLY their revealed cards, not cards in hand
```typescript
interface SyncGameStateMessage {
    player_id: number;
    phase: GamePhase;
    current_player: number;
    round_number: number;
    turn_number: number;

    // Only revealed cards visible (NOT hand cards)
    own_revealed_cards: { [slot: number]: number };
    opponent_revealed_cards: { [slot: number]: number };
    own_joker_values: { [slot: number]: number };

    // Player stats
    credits: number;
    points: number;
    current_bet: number;

    // Opponent stats
    opponent_credits: number;
    opponent_points: number;
    opponent_bet: number;

    // Turn state
    current_turn: {
        own_card_selected: boolean;
        rival_card_selected: boolean;
    };
}
```

#### card_selected
**To**: Both players
**When**: A card is selected (own or rival)
```typescript
interface CardSelectedMessage {
    action: "card_selected";
    data: {
        selecting_player: number; // Who made the selection
        target_player: number;    // Whose card was selected (1 or 2)
        slot_index: number;
        card_id: number;          // Server provides the actual card value
        card_power: number;       // Calculated power (for jokers)
        is_own_selection: boolean; // true if selecting own card
    };
}
```

#### dr_manhattan_reveal
**To**: Individual player who played Dr. Manhattan
**When**: Dr. Manhattan is played by current_player
```typescript
interface DrManhattanRevealMessage {
    action: "dr_manhattan_reveal";
    data: {
        rival_hand: { [slot: number]: number }; // All rival's remaining cards
        duration: number; // 5 seconds (client handles timer)
    };
}
```

#### battle_result
**To**: Both players
**When**: Battle completes
```typescript
interface BattleResultMessage {
    action: "battle_result";
    data: {
        winner: number;         // 0=tie, 1=player1, 2=player2
        power_difference: number;
        p1_card: number;
        p1_power: number;
        p2_card: number;
        p2_power: number;
        turn_number: number;
    };
}
```

#### initial_turn_determined
**To**: Both players
**When**: Initial card reveal completes
```typescript
interface InitialTurnDeterminedMessage {
    action: "initial_turn_determined";
    data: {
        p1_card: number;
        p1_power: number;
        p2_card: number;
        p2_power: number;
        starting_player: number;
    };
}
```

#### phase_change
**To**: Both players
**When**: Phase transitions
```typescript
interface PhaseChangeMessage {
    action: "phase_change";
    data: {
        phase: GamePhase;
        current_player: number;
        message: string; // UI instructions
        turn_number?: number;
        round_number?: number;
        power_difference?: number; // For power choice
    };
}
```

#### round_end
**To**: Both players
**When**: Round completes (10 turns finished)
```typescript
interface RoundEndMessage {
    action: "round_end";
    data: {
        round_winner: number;   // Closest to 34 points
        p1_final_points: number;
        p2_final_points: number;
        p1_distance_from_34: number;
        p2_distance_from_34: number;
        credit_changes: {
            p1_change: number; // Positive or negative
            p2_change: number;
        };
        new_credits: {
            p1_credits: number;
            p2_credits: number;
        };
    };
}
```

#### game_over
**To**: Both players
**When**: Someone reaches 1000 credits or goes to 0
```typescript
interface GameOverMessage {
    action: "game_over";
    data: {
        result: "real_winner" | "busted";
        winner: number;
        final_credits: [number, number];
        waiting_for_continue: true; // Server waits for continue message
    };
}
```

### 6. Card Power Calculation

```typescript
function calculateCardPower(gameState: GameState, playerId: number, cardId: number, slot: number): number {
    if (cardId === SPECIAL_CARDS.JOKER) {
        // Use pre-rolled value
        return gameState.players[playerId].joker_values[slot] ||
               Math.floor(Math.random() * 68) + 1;
    } else {
        // All other cards use their card ID as power
        return cardId;
    }
}
```

### 7. Round End Logic

```typescript
function endRound(gameState: GameState) {
    const p1Points = gameState.players[1].points;
    const p2Points = gameState.players[2].points;

    const p1Distance = Math.abs(p1Points - 34);
    const p2Distance = Math.abs(p2Points - 34);

    const roundWinner = p1Distance < p2Distance ? 1 :
                        p2Distance < p1Distance ? 2 : 0; // Tie

    // House-based betting system
    if (roundWinner > 0) {
        // Winner gains their bet from house
        gameState.players[roundWinner].credits +=
            gameState.players[roundWinner].current_bet;

        // Loser pays their bet to house
        const loser = roundWinner === 1 ? 2 : 1;
        gameState.players[loser].credits -=
            gameState.players[loser].current_bet;
    } else {
        // Tie: both pay house
        gameState.players[1].credits -= gameState.players[1].current_bet;
        gameState.players[2].credits -= gameState.players[2].current_bet;
    }

    // Check game over conditions
    for (let playerId = 1; playerId <= 2; playerId++) {
        if (gameState.players[playerId].credits >= 1000) {
            gameOver(gameState, playerId, "real_winner");
            return;
        }
        if (gameState.players[playerId].credits <= 0) {
            const winner = playerId === 1 ? 2 : 1;
            gameOver(gameState, winner, "busted");
            return;
        }
    }

    // Continue to next round
    startNextRound(gameState);
}
```

### 8. Key Implementation Notes

1. **No Server Timers**: All timers (Dr. Manhattan 5s, etc.) handled client-side
2. **Slot-Based Communication**: Client sends slot numbers, server responds with card values
3. **Shared Deck**: Single deck, cards removed when dealt, reset each round
4. **No Point Clamping**: Points can be negative or exceed 68
5. **Turn Control**: One player per turn chooses both their card AND opponent's card
6. **Reveal Logic**: Players only see cards that have been played/revealed, never hand cards
7. **Continue After Game Over**: Room waits for continue message from either player
8. **Initial Turn Advantage**: Winner of first turn gets 5 total turns vs 4 for loser

### 9. Validation Logic

```typescript
function validateAction(gameState: GameState, playerId: number, action: string): boolean {
    // Basic validation
    if (playerId !== 1 && playerId !== 2) return false;

    // Phase and turn validation
    switch (action) {
        case "place_bet":
            return gameState.phase === "betting";

        case "play_card":
            const validPhases = ["initial_card_selection", "card_selection_own", "card_selection_rival"];
            return validPhases.includes(gameState.phase) &&
                   (gameState.phase === "initial_card_selection" ||
                    playerId === gameState.current_player);

        case "power_choice":
            return gameState.phase === "power_choice" &&
                   playerId === gameState.current_player;

        case "continue_game":
            return gameState.waiting_for_continue;
    }

    return false;
}
```

This guide provides the corrected game logic for implementing a Colyseus server that matches the unique turn-based mechanics where one player chooses cards for both players each turn.