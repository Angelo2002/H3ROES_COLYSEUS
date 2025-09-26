import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export enum GamePhase {
    INIT = "init",
    BETTING = "betting",
    INITIAL_CARD_SELECTION = "initial_card_selection",
    CARD_SELECTION_OWN = "card_selection_own",
    CARD_SELECTION_RIVAL = "card_selection_rival",
    BATTLE = "battle",
    POWER_CHOICE = "power_choice",
    ROUND_END = "round_end",
    GAME_OVER = "game_over"
}

export class PlayerSchema extends Schema {
    @type("number") credits: number = 100;
    @type("number") points: number = 0;
    @type("number") current_bet: number = 0;
    @type({ map: "number" }) hand = new MapSchema<number>();
    @type({ map: "number" }) revealed_cards = new MapSchema<number>();
}

export class BattleResultSchema extends Schema {
    @type("number") winner: number = 0;
    @type("number") power_difference: number = 0;
    @type("number") p1_power: number = 0;
    @type("number") p2_power: number = 0;
    @type("number") p1_card: number = 0;
    @type("number") p2_card: number = 0;
}

export class CurrentTurnSchema extends Schema {
    @type("boolean") own_card_selected: boolean = false;
    @type("boolean") rival_card_selected: boolean = false;
    @type("number") own_slot: number = -1;
    @type("number") rival_slot: number = -1;
    @type("number") own_card_id: number = -1;
    @type("number") rival_card_id: number = -1;
}

export class GameStateSchema extends Schema {
    @type("string") phase: string = GamePhase.INIT;
    @type("number") current_player: number = 1;
    @type("number") round_number: number = 1;
    @type("number") turn_number: number = 1;
    @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
    @type(BattleResultSchema) battle_result: BattleResultSchema = new BattleResultSchema();
    @type(CurrentTurnSchema) current_turn: CurrentTurnSchema = new CurrentTurnSchema();
    @type(["number"]) deck = new ArraySchema<number>();
    @type("boolean") waiting_for_continue: boolean = false;
    @type("number") joker_power: number = 0;
}

export const SPECIAL_CARDS = {
    JOKER: 0,
    DR_MANHATTAN: 67
};

// Message interfaces (these don't need to be Schema classes)
export interface PlaceBetMessage {
    action: "place_bet";
    data: {
        amount: number;
    };
}

export interface PlayCardMessage {
    action: "play_card";
    data: {
        slot_index: number;
    };
}

export interface PowerChoiceMessage {
    action: "power_choice";
    data: {
        choice: "add" | "subtract";
    };
}

export interface ContinueGameMessage {
    action: "continue_game";
}

// Server broadcast message interfaces (these don't need to be Schema classes)
export interface SyncGameStateMessage {
    player_id: number;
    phase: GamePhase;
    current_player: number;
    round_number: number;
    turn_number: number;
    own_revealed_cards: { [slot: number]: number };
    opponent_revealed_cards: { [slot: number]: number };
    joker_power: number;
    credits: number;
    points: number;
    current_bet: number;
    opponent_credits: number;
    opponent_points: number;
    opponent_bet: number;
    current_turn: {
        own_card_selected: boolean;
        rival_card_selected: boolean;
    };
}

export interface CardSelectedMessage {
    action: "card_selected";
    data: {
        selecting_player: number;
        target_player: number;
        slot_index: number;
        card_id: number;
        card_power: number;
        is_own_selection: boolean;
    };
}

export interface DrManhattanRevealMessage {
    action: "dr_manhattan_reveal";
    data: {
        rival_hand: { [slot: number]: number };
        duration: number;
    };
}

export interface BattleResultMessage {
    action: "battle_result";
    data: {
        winner: number;
        power_difference: number;
        p1_card: number;
        p1_power: number;
        p2_card: number;
        p2_power: number;
        turn_number: number;
    };
}

export interface InitialTurnDeterminedMessage {
    action: "initial_turn_determined";
    data: {
        p1_card: number;
        p1_power: number;
        p2_card: number;
        p2_power: number;
        starting_player: number;
    };
}

export interface PhaseChangeMessage {
    action: "phase_change";
    data: {
        phase: GamePhase;
        current_player: number;
        message: string;
        turn_number?: number;
        round_number?: number;
        power_difference?: number;
    };
}

export interface RoundEndMessage {
    action: "round_end";
    data: {
        round_winner: number;
        p1_final_points: number;
        p2_final_points: number;
        p1_distance_from_34: number;
        p2_distance_from_34: number;
        credit_changes: {
            p1_change: number;
            p2_change: number;
        };
        new_credits: {
            p1_credits: number;
            p2_credits: number;
        };
    };
}

export interface GameOverMessage {
    action: "game_over";
    data: {
        result: "real_winner" | "busted";
        winner: number;
        final_credits: [number, number];
        waiting_for_continue: true;
    };
}