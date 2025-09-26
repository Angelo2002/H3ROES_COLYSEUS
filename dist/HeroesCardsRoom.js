"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeroesCardsRoom = void 0;
const colyseus_1 = require("colyseus");
const types_1 = require("./types");
class HeroesCardsRoom extends colyseus_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 2;
        this.playerIds = {};
    }
    onCreate(options) {
        console.log("HeroesCardsRoom created!");
        this.setState({
            phase: types_1.GamePhase.INIT,
            current_player: 1,
            round_number: 1,
            turn_number: 1,
            players: {
                1: this.createInitialPlayerState(),
                2: this.createInitialPlayerState()
            },
            battle_result: null,
            current_turn: {
                own_card_selected: false,
                rival_card_selected: false,
                own_slot: null,
                rival_slot: null,
                own_card_id: null,
                rival_card_id: null
            },
            deck: [],
            waiting_for_continue: false,
            joker_power: 0
        });
        this.onMessage("place_bet", (client, message) => {
            this.handlePlaceBet(client, message);
        });
        this.onMessage("play_card", (client, message) => {
            this.handlePlayCard(client, message);
        });
        this.onMessage("power_choice", (client, message) => {
            this.handlePowerChoice(client, message);
        });
        this.onMessage("continue_game", (client, message) => {
            this.handleContinueGame(client, message);
        });
    }
    onJoin(client, options) {
        console.log(`Player ${client.sessionId} joined`);
        const playerCount = Object.keys(this.playerIds).length;
        const playerId = playerCount + 1;
        this.playerIds[client.sessionId] = playerId;
        console.log(`Assigned player ID ${playerId} to ${client.sessionId}`);
        if (Object.keys(this.playerIds).length === 2) {
            this.initializeGame();
        }
    }
    onLeave(client, consented) {
        console.log(`Player ${client.sessionId} left`);
        delete this.playerIds[client.sessionId];
        if (Object.keys(this.playerIds).length === 0) {
            this.disconnect();
        }
    }
    createInitialPlayerState() {
        return {
            credits: 100,
            points: 0,
            current_bet: 0,
            hand: {},
            revealed_cards: {}
        };
    }
    initializeGame() {
        console.log("Initializing game with 2 players");
        this.state.players[1] = this.createInitialPlayerState();
        this.state.players[2] = this.createInitialPlayerState();
        this.state.round_number = 1;
        this.state.turn_number = 1;
        this.state.phase = types_1.GamePhase.BETTING;
        this.dealCards();
        this.broadcastPhaseChange("Place your bets!");
        this.syncGameState();
    }
    createAndShuffleDeck() {
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
    dealCards() {
        this.state.deck = this.createAndShuffleDeck();
        this.state.joker_power = Math.floor(Math.random() * 68) + 1; // Roll joker power 1-68
        for (let playerId = 1; playerId <= 2; playerId++) {
            this.state.players[playerId].hand = {};
            this.state.players[playerId].revealed_cards = {};
            for (let slot = 0; slot <= 9; slot++) {
                const cardId = this.state.deck.pop();
                this.state.players[playerId].hand[slot] = cardId;
            }
        }
    }
    calculateCardPower(cardId) {
        if (cardId === types_1.SPECIAL_CARDS.JOKER) {
            return this.state.joker_power;
        }
        else {
            return cardId;
        }
    }
    validateAction(playerId, action) {
        if (playerId !== 1 && playerId !== 2)
            return false;
        switch (action) {
            case "place_bet":
                return this.state.phase === types_1.GamePhase.BETTING;
            case "play_card":
                const validPhases = [types_1.GamePhase.INITIAL_CARD_SELECTION, types_1.GamePhase.CARD_SELECTION_OWN, types_1.GamePhase.CARD_SELECTION_RIVAL];
                return validPhases.includes(this.state.phase) &&
                    (this.state.phase === types_1.GamePhase.INITIAL_CARD_SELECTION ||
                        playerId === this.state.current_player);
            case "power_choice":
                return this.state.phase === types_1.GamePhase.POWER_CHOICE &&
                    playerId === this.state.current_player;
            case "continue_game":
                return this.state.waiting_for_continue;
        }
        return false;
    }
    handlePlaceBet(client, message) {
        const playerId = this.playerIds[client.sessionId];
        if (!this.validateAction(playerId, "place_bet"))
            return;
        const amount = message.data.amount;
        if (amount < 0 || amount > this.state.players[playerId].credits)
            return;
        this.state.players[playerId].current_bet = amount;
        // Check if both players have bet
        if (this.state.players[1].current_bet > 0 && this.state.players[2].current_bet > 0) {
            this.state.phase = types_1.GamePhase.INITIAL_CARD_SELECTION;
            this.broadcastPhaseChange("Select your initial card");
        }
        this.syncGameState();
    }
    handlePlayCard(client, message) {
        const playerId = this.playerIds[client.sessionId];
        if (!this.validateAction(playerId, "play_card"))
            return;
        const slotIndex = message.data.slot_index;
        if (this.state.phase === types_1.GamePhase.INITIAL_CARD_SELECTION) {
            this.handleInitialCardSelection(playerId, slotIndex);
        }
        else if (this.state.phase === types_1.GamePhase.CARD_SELECTION_OWN) {
            this.handleOwnCardSelection(playerId, slotIndex);
        }
        else if (this.state.phase === types_1.GamePhase.CARD_SELECTION_RIVAL) {
            this.handleRivalCardSelection(playerId, slotIndex);
        }
    }
    handleInitialCardSelection(playerId, slotIndex) {
        if (!this.state.players[playerId].hand[slotIndex])
            return;
        const cardId = this.state.players[playerId].hand[slotIndex];
        const cardPower = this.calculateCardPower(cardId);
        // Move card from hand to revealed
        delete this.state.players[playerId].hand[slotIndex];
        this.state.players[playerId].revealed_cards[slotIndex] = cardId;
        // Store the selection
        if (playerId === 1) {
            this.state.current_turn.own_card_id = cardId;
            this.state.current_turn.own_slot = slotIndex;
        }
        else {
            this.state.current_turn.rival_card_id = cardId;
            this.state.current_turn.rival_slot = slotIndex;
        }
        this.broadcast("card_selected", {
            selecting_player: playerId,
            target_player: playerId,
            slot_index: slotIndex,
            card_id: cardId,
            card_power: cardPower,
            is_own_selection: true
        });
        // Check if both players have selected
        if (this.state.current_turn.own_card_id !== null && this.state.current_turn.rival_card_id !== null) {
            this.processInitialBattle();
        }
    }
    processInitialBattle() {
        const p1Card = this.state.current_turn.own_card_id;
        const p2Card = this.state.current_turn.rival_card_id;
        const p1Power = this.calculateCardPower(p1Card);
        const p2Power = this.calculateCardPower(p2Card);
        let startingPlayer;
        if (p1Power > p2Power) {
            startingPlayer = 1;
        }
        else if (p2Power > p1Power) {
            startingPlayer = 2;
        }
        else {
            // Tie - random
            startingPlayer = Math.random() < 0.5 ? 1 : 2;
        }
        this.state.current_player = startingPlayer;
        this.state.turn_number = 2;
        this.broadcast("initial_turn_determined", {
            p1_card: p1Card,
            p1_power: p1Power,
            p2_card: p2Card,
            p2_power: p2Power,
            starting_player: startingPlayer
        });
        this.resetCurrentTurn();
        this.state.phase = types_1.GamePhase.CARD_SELECTION_OWN;
        this.broadcastPhaseChange(`Player ${startingPlayer} select your card`);
        this.syncGameState();
    }
    handleOwnCardSelection(playerId, slotIndex) {
        if (!this.state.players[playerId].hand[slotIndex])
            return;
        const cardId = this.state.players[playerId].hand[slotIndex];
        const cardPower = this.calculateCardPower(cardId);
        delete this.state.players[playerId].hand[slotIndex];
        this.state.players[playerId].revealed_cards[slotIndex] = cardId;
        this.state.current_turn.own_card_id = cardId;
        this.state.current_turn.own_slot = slotIndex;
        this.state.current_turn.own_card_selected = true;
        this.broadcast("card_selected", {
            selecting_player: playerId,
            target_player: playerId,
            slot_index: slotIndex,
            card_id: cardId,
            card_power: cardPower,
            is_own_selection: true
        });
        this.state.phase = types_1.GamePhase.CARD_SELECTION_RIVAL;
        this.broadcastPhaseChange(`Player ${playerId} select rival's card`);
        this.syncGameState();
    }
    handleRivalCardSelection(playerId, slotIndex) {
        const rivalId = playerId === 1 ? 2 : 1;
        if (!this.state.players[rivalId].hand[slotIndex])
            return;
        const cardId = this.state.players[rivalId].hand[slotIndex];
        const cardPower = this.calculateCardPower(cardId);
        delete this.state.players[rivalId].hand[slotIndex];
        this.state.players[rivalId].revealed_cards[slotIndex] = cardId;
        this.state.current_turn.rival_card_id = cardId;
        this.state.current_turn.rival_slot = slotIndex;
        this.state.current_turn.rival_card_selected = true;
        this.broadcast("card_selected", {
            selecting_player: playerId,
            target_player: rivalId,
            slot_index: slotIndex,
            card_id: cardId,
            card_power: cardPower,
            is_own_selection: false
        });
        this.state.phase = types_1.GamePhase.BATTLE;
        this.processBattle();
    }
    processBattle() {
        const currentPlayer = this.state.current_player;
        const rivalPlayer = currentPlayer === 1 ? 2 : 1;
        const ownCard = this.state.current_turn.own_card_id;
        const rivalCard = this.state.current_turn.rival_card_id;
        const ownPower = this.calculateCardPower(ownCard);
        const rivalPower = this.calculateCardPower(rivalCard);
        // Handle Dr. Manhattan reveal
        if (ownCard === types_1.SPECIAL_CARDS.DR_MANHATTAN) {
            const rivalHand = { ...this.state.players[rivalPlayer].hand };
            this.sendToPlayer(currentPlayer, "dr_manhattan_reveal", {
                rival_hand: rivalHand,
                duration: 5000
            });
        }
        // Determine battle winner
        let winner = 0;
        if (ownPower > rivalPower) {
            winner = currentPlayer;
        }
        else if (rivalPower > ownPower) {
            winner = rivalPlayer;
        }
        const powerDifference = Math.abs(ownPower - rivalPower);
        this.state.battle_result = {
            winner,
            power_difference: powerDifference,
            p1_power: currentPlayer === 1 ? ownPower : rivalPower,
            p2_power: currentPlayer === 1 ? rivalPower : ownPower,
            p1_card: currentPlayer === 1 ? ownCard : rivalCard,
            p2_card: currentPlayer === 1 ? rivalCard : ownCard
        };
        this.broadcast("battle_result", {
            winner,
            power_difference: powerDifference,
            p1_card: this.state.battle_result.p1_card,
            p1_power: this.state.battle_result.p1_power,
            p2_card: this.state.battle_result.p2_card,
            p2_power: this.state.battle_result.p2_power,
            turn_number: this.state.turn_number
        });
        if (winner === currentPlayer) {
            this.state.phase = types_1.GamePhase.POWER_CHOICE;
            this.broadcastPhaseChange(`Player ${currentPlayer} choose power effect`, powerDifference);
        }
        else {
            this.nextTurn();
        }
        this.syncGameState();
    }
    handlePowerChoice(client, message) {
        const playerId = this.playerIds[client.sessionId];
        if (!this.validateAction(playerId, "power_choice"))
            return;
        const choice = message.data.choice;
        const powerDifference = this.state.battle_result.power_difference;
        if (choice === "add") {
            this.state.players[playerId].points += powerDifference;
        }
        else {
            this.state.players[playerId].points -= powerDifference;
        }
        this.nextTurn();
    }
    nextTurn() {
        this.resetCurrentTurn();
        if (this.state.turn_number >= 10) {
            this.endRound();
            return;
        }
        // Determine next player based on turn distribution
        const nextTurnNumber = this.state.turn_number + 1;
        let nextPlayer;
        // Turn 1 winner gets turns: 2, 4, 6, 8, 10
        // Turn 1 loser gets turns: 3, 5, 7, 9
        const turn1Winner = this.state.current_player; // Set after initial battle
        if ([2, 4, 6, 8, 10].includes(nextTurnNumber)) {
            nextPlayer = turn1Winner;
        }
        else {
            nextPlayer = turn1Winner === 1 ? 2 : 1;
        }
        this.state.current_player = nextPlayer;
        this.state.turn_number = nextTurnNumber;
        this.state.phase = types_1.GamePhase.CARD_SELECTION_OWN;
        this.broadcastPhaseChange(`Turn ${nextTurnNumber}: Player ${nextPlayer} select your card`);
        this.syncGameState();
    }
    endRound() {
        const p1Points = this.state.players[1].points;
        const p2Points = this.state.players[2].points;
        const p1Distance = Math.abs(p1Points - 34);
        const p2Distance = Math.abs(p2Points - 34);
        let roundWinner = 0;
        if (p1Distance < p2Distance) {
            roundWinner = 1;
        }
        else if (p2Distance < p1Distance) {
            roundWinner = 2;
        }
        // Calculate credit changes
        let p1Change = 0, p2Change = 0;
        if (roundWinner === 1) {
            p1Change = this.state.players[1].current_bet;
            p2Change = -this.state.players[2].current_bet;
        }
        else if (roundWinner === 2) {
            p1Change = -this.state.players[1].current_bet;
            p2Change = this.state.players[2].current_bet;
        }
        else {
            // Tie: both lose to house
            p1Change = -this.state.players[1].current_bet;
            p2Change = -this.state.players[2].current_bet;
        }
        this.state.players[1].credits += p1Change;
        this.state.players[2].credits += p2Change;
        this.broadcast("round_end", {
            round_winner: roundWinner,
            p1_final_points: p1Points,
            p2_final_points: p2Points,
            p1_distance_from_34: p1Distance,
            p2_distance_from_34: p2Distance,
            credit_changes: { p1_change: p1Change, p2_change: p2Change },
            new_credits: {
                p1_credits: this.state.players[1].credits,
                p2_credits: this.state.players[2].credits
            }
        });
        // Check game over conditions
        for (let playerId = 1; playerId <= 2; playerId++) {
            if (this.state.players[playerId].credits >= 1000) {
                this.gameOver(playerId, "real_winner");
                return;
            }
            if (this.state.players[playerId].credits <= 0) {
                const winner = playerId === 1 ? 2 : 1;
                this.gameOver(winner, "busted");
                return;
            }
        }
        this.startNextRound();
    }
    gameOver(winner, result) {
        this.state.phase = types_1.GamePhase.GAME_OVER;
        this.state.waiting_for_continue = true;
        this.broadcast("game_over", {
            result,
            winner,
            final_credits: [this.state.players[1].credits, this.state.players[2].credits],
            waiting_for_continue: true
        });
        this.syncGameState();
    }
    handleContinueGame(client, message) {
        if (!this.state.waiting_for_continue)
            return;
        this.initializeGame();
    }
    startNextRound() {
        this.state.round_number++;
        this.state.turn_number = 1;
        this.state.phase = types_1.GamePhase.BETTING;
        // Reset player states for new round
        this.state.players[1].points = 0;
        this.state.players[1].current_bet = 0;
        this.state.players[2].points = 0;
        this.state.players[2].current_bet = 0;
        this.dealCards();
        this.resetCurrentTurn();
        this.broadcastPhaseChange("New round! Place your bets!");
        this.syncGameState();
    }
    resetCurrentTurn() {
        this.state.current_turn = {
            own_card_selected: false,
            rival_card_selected: false,
            own_slot: null,
            rival_slot: null,
            own_card_id: null,
            rival_card_id: null
        };
    }
    broadcastPhaseChange(message, powerDifference) {
        this.broadcast("phase_change", {
            phase: this.state.phase,
            current_player: this.state.current_player,
            message,
            turn_number: this.state.turn_number,
            round_number: this.state.round_number,
            power_difference: powerDifference
        });
    }
    syncGameState() {
        this.clients.forEach((client) => {
            const playerId = this.playerIds[client.sessionId];
            const opponentId = playerId === 1 ? 2 : 1;
            const syncData = {
                player_id: playerId,
                phase: this.state.phase,
                current_player: this.state.current_player,
                round_number: this.state.round_number,
                turn_number: this.state.turn_number,
                own_revealed_cards: this.state.players[playerId].revealed_cards,
                opponent_revealed_cards: this.state.players[opponentId].revealed_cards,
                joker_power: this.state.joker_power,
                credits: this.state.players[playerId].credits,
                points: this.state.players[playerId].points,
                current_bet: this.state.players[playerId].current_bet,
                opponent_credits: this.state.players[opponentId].credits,
                opponent_points: this.state.players[opponentId].points,
                opponent_bet: this.state.players[opponentId].current_bet,
                current_turn: {
                    own_card_selected: this.state.current_turn.own_card_selected,
                    rival_card_selected: this.state.current_turn.rival_card_selected
                }
            };
            client.send("sync_game_state", syncData);
        });
    }
    sendToPlayer(playerId, action, data) {
        this.clients.forEach((client) => {
            if (this.playerIds[client.sessionId] === playerId) {
                client.send(action, data);
            }
        });
    }
}
exports.HeroesCardsRoom = HeroesCardsRoom;
