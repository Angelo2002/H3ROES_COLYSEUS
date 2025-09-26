"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPECIAL_CARDS = exports.GamePhase = void 0;
var GamePhase;
(function (GamePhase) {
    GamePhase["INIT"] = "init";
    GamePhase["BETTING"] = "betting";
    GamePhase["INITIAL_CARD_SELECTION"] = "initial_card_selection";
    GamePhase["CARD_SELECTION_OWN"] = "card_selection_own";
    GamePhase["CARD_SELECTION_RIVAL"] = "card_selection_rival";
    GamePhase["BATTLE"] = "battle";
    GamePhase["POWER_CHOICE"] = "power_choice";
    GamePhase["ROUND_END"] = "round_end";
    GamePhase["GAME_OVER"] = "game_over";
})(GamePhase || (exports.GamePhase = GamePhase = {}));
exports.SPECIAL_CARDS = {
    JOKER: 0,
    DR_MANHATTAN: 67
};
