import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import { HeroesCardsRoom } from "./HeroesCardsRoom";

const port = Number(process.env.PORT) || 2567;
const app = express();

app.use(express.json());

const server = createServer(app);
const gameServer = new Server({
    server: server
});

// Register room handlers
gameServer.define("heroes_cards", HeroesCardsRoom);

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