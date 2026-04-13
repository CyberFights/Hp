// server.js
const express = require("express");

const app = express();
app.use(express.json());

// In‑memory games
const games = new Map();

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPinAllowedRolls(currentHealth, maxHealth) {
  const hpPct = maxHealth > 0 ? (currentHealth / maxHealth) * 100 : 0;

  if (hpPct > 75) return [1, 2, 3, 4, 5, 6];
  if (hpPct > 50) return [1, 2, 3, 4, 5];
  if (hpPct > 25) return [1, 2, 3, 4];
  return [1, 6];
}

function getBattleState(state) {
  const won =
    state.stamina >= state.maxStamina ||
    state.attraction >= state.maxAttraction;

  const lost = state.health <= 0 || state.stamina <= 0;
  const ko = state.health <= 0;
  const tie =
    (state.health <= 0 && state.stamina <= 0) ||
    (won && lost);

  return { won, lost, ko, tie };
}

function createPlayerState() {
  return {
    health: 100,
    stamina: 0,
    attraction: 0,
    atkMultiplier: 1,
    defMultiplier: 1
  };
}

function createGame(roomId) {
  const game = {
    id: roomId,
    players: new Set(),
    state: {
      turnIndex: 0,
      finished: false,
      winner: null,
      outcome: null,
      p1: createPlayerState(),
      p2: createPlayerState()
    }
  };

  games.set(roomId, game);
  return game;
}

function getActivePlayer(game) {
  const playerIds = Array.from(game.players);
  return playerIds[game.state.turnIndex % playerIds.length];
}

function resolveMove(game, playerId, payload) {
  if (game.state.finished) {
    return { success: false, error: "Match is already finished." };
  }

  if (!game.players.has(playerId)) {
    return { success: false, error: "Player is not in this game." };
  }

  const playerIds = Array.from(game.players);
  if (playerIds.indexOf(playerId) !== game.state.turnIndex % playerIds.length) {
    return { success: false, error: "Not your turn." };
  }

  const playerIndex = playerIds.indexOf(playerId);
  const selfKey = playerIndex === 0 ? "p1" : "p2";
  const oppKey = playerIndex === 0 ? "p2" : "p1";
  const self = game.state[selfKey];
  const opp = game.state[oppKey];

  const {
    moveType,
    atkMultiplier: atkMul,      // now from POST body
    defMultiplier: defMul       // now from POST body
  } = payload;

  const result = {
    playerId,
    playerIndex,
    moveType,
    atkMultiplier: atkMul,
    defMultiplier: defMul,
    attackRoll: null,
    submissionRoll: null,
    selfDamageRoll: null,
    escapeRoll: null,
    teasingRoll: null,
    pinRoll: null,
    escaped: false,
    pinEscaped: false,
    damageDealt: 0,
    selfDamage: 0,
    staminaGained: 0,
    updatedHealth: self.health,
    updatedStamina: self.stamina,
    updatedAttraction: self.attraction,
    won: false,
    lost: false,
    tie: false,
    ko: false
  };

  if (moveType === "attack") {
    const roll = rollDice();
    result.attackRoll = roll;
    const damage = Math.max(0, Math.floor(roll * atkMul - defMul));
    result.damageDealt = damage;
    opp.health = clamp(opp.health - damage, 0, 20);
  }

  if (moveType === "submission") {
    const submissionRoll = rollDice();
    const selfDamageRoll = rollDice();

    result.submissionRoll = submissionRoll;
    result.selfDamageRoll = selfDamageRoll;

    const damage = Math.max(0, Math.floor(submissionRoll * atkMul - defMul));
    const selfDamage = Math.max(0, Math.floor(selfDamageRoll * defMul));

    result.damageDealt = damage;
    result.selfDamage = selfDamage;

    opp.attraction = clamp(opp.attraction + damage, 0, 10);
    self.health = clamp(self.health - selfDamage, 0, 20);
  }

  if (moveType === "escape") {
    const escapeRoll = rollDice();
    result.escapeRoll = escapeRoll;
    result.escaped = escapeRoll % 2 === 0;
    self.stamina = clamp(self.stamina - 1, 0, 10);
  }

  if (moveType === "teasing") {
    const teasingRoll = rollDice();
    result.teasingRoll = teasingRoll;

    const staminaGain = Math.max(0, Math.floor(teasingRoll * atkMul));
    result.staminaGained = staminaGain;
    self.stamina = clamp(self.stamina + staminaGain, 0, 10);
  }

  if (moveType === "pin") {
    const pinRoll = rollDice();
    result.pinRoll = pinRoll;
    result.pinEscaped = getPinAllowedRolls(self.health, 20).includes(pinRoll);
  }

  self.health = clamp(self.health, 0, 20);
  self.stamina = clamp(self.stamina, 0, 10);
  self.attraction = clamp(self.attraction, 0, 10);

  result.updatedHealth = self.health;
  result.updatedStamina = self.stamina;
  result.updatedAttraction = self.attraction;

  const battleState = getBattleState({
    health: self.health,
    stamina: self.stamina,
    attraction: self.attraction,
    maxStamina: 10,
    maxAttraction: 10
  });

  result.won = battleState.won;
  result.lost = battleState.lost;
  result.tie = battleState.tie;
  result.ko = battleState.ko;

  if (result.tie) {
    game.state.finished = true;
    game.state.outcome = "tie";
  } else if (result.ko) {
    game.state.finished = true;
    game.state.outcome = "ko";
    game.state.winner = playerId;
  } else if (result.won) {
    game.state.finished = true;
    game.state.outcome = "win";
    game.state.winner = playerId;
  } else if (result.lost) {
    game.state.finished = true;
    game.state.winner = playerIds.find(id => id !== playerId) || null;
    game.state.outcome = "loss";
  }

  game.state.turnIndex = (game.state.turnIndex + 1) % playerIds.length;

  return {
    success: true,
    result,
    game
  };
}

app.post("/api/create-game", (req, res) => {
  const { roomId } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Missing roomId." });
  }

  if (games.has(roomId)) {
    return res.status(400).json({ error: "Room already exists." });
  }

  const game = createGame(roomId);
  return res.json({ gameId: game.id });
});

app.post("/api/join-game", (req, res) => {
  const { roomId, playerId } = req.body;

  const game = games.get(roomId);
  if (!game) {
    return res.status(404).json({ error: "Room not found." });
  }

  if (game.players.size >= 2) {
    return res.status(400).json({ error: "Room is full." });
  }

  game.players.add(playerId);
  return res.json({ success: true, gameId: roomId, players: Array.from(game.players) });
});

app.post("/api/dice-match", (req, res) => {
  const { roomId, playerId, moveType, atkMultiplier, defMultiplier } = req.body;

  const game = games.get(roomId);
  if (!game) {
    return res.status(404).json({ error: "Game not found." });
  }

  const outcome = resolveMove(game, playerId, {
    moveType,
    atkMultiplier,
    defMultiplier
  });

  if (!outcome.success) {
    return res.status(400).json(outcome);
  }

  return res.json({
    result: outcome.result,
    game: {
      id: game.id,
      players: Array.from(game.players),
      state: game.state,
      outcome: game.state.outcome
    }
  });
});

app.post("/api/game-state", (req, res) => {
  const { roomId } = req.body;
  const game = games.get(roomId);

  if (!game) {
    return res.status(404).json({ error: "Game not found." });
  }

  return res.json({
    id: game.id,
    players: Array.from(game.players),
    state: game.state,
    outcome: game.state.outcome
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
