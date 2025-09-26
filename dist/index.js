"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const colyseus_1 = require("colyseus");
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const HeroesCardsRoom_1 = require("./HeroesCardsRoom");
const port = Number(process.env.PORT) || 2567;
const app = (0, express_1.default)();
app.use(express_1.default.json());
const server = (0, http_1.createServer)(app);
const gameServer = new colyseus_1.Server({
    server: server
});
// Register room handlers
gameServer.define("heroes_cards", HeroesCardsRoom_1.HeroesCardsRoom);
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Basic info endpoint
app.get("/", (req, res) => {
    res.json({
        name: "H3ROES C4RDS Server",
        version: "1.0.0",
        rooms: ["heroes_cards"],
        maxPlayersPerRoom: 2
    });
});
gameServer.listen(port);
console.log(`🃏 H3ROES C4RDS Server is running on port ${port}`);
console.log(`📡 WebSocket endpoint: ws://localhost:${port}`);
console.log(`🌐 HTTP endpoint: http://localhost:${port}`);
