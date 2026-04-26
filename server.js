const express = require("express");

const app = express();
app.use(express.json());

// In-memory games
const games = new Map();

function logError(context, err, extra = {}) {
  console.error(`[${new Date().toISOString()}] ${context}`, {
    message: err?.message || err,
    stack: err?.stack,
    ...extra
  });
}

process.on("unhandledRejection", (reason, promise) => {
  logError("Unhandled Rejection", reason, { promise });
});

process.on("uncaughtException", (err) => {
  logError("Uncaught Exception", err);
  process.exit(1);
});

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

  const lost = state.health <= 0;
  const ko = state.health <= 0;
  const tie =
    (state.health <= 0 && state.stamina <= 0) ||
    (won && lost);

  return { won, lost, ko, tie };
}

function createPlayerState() {
  return {
    health: 100,
    stamina: 100,
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

function resolveMove(game, playerId, payload) {
  try {
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
      atkMultiplier: atkMul,
      defMultiplier: defMul
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
  const staminaCost = Math.floor(roll / 2);
  const damage = Math.max(0, Math.floor(roll * (atkMulti - defMulti)));

  result.damageDealt = damage;

  self.stamina = clamp(self.stamina - staminaCost, 0, 100);
  opp.health = clamp(opp.health - damage, 0, 100);
}


    if (moveType === "submission") {
  const submissionRoll = rollDice();
  const selfDamageRoll = rollDice();

  result.submissionRoll = submissionRoll;
  result.selfDamageRoll = selfDamageRoll;

  const staminaCost = Math.floor(submissionRoll / 2);
  const damage = Math.max(0, Math.floor(submissionRoll * (atkMulti - defMulti)));

  const selfDamage = Math.max(0, Math.floor(selfDamageRoll * defMul));

  result.damageDealt = damage;
  result.selfDamage = selfDamage;

  self.stamina = clamp(self.stamina - staminaCost, 0, 100);
  opp.health = clamp(opp.health - damage, 0, 100);
  opp.attraction = clamp(opp.attraction + damage, 0, 100);
  self.health = clamp(self.health - selfDamage, 0, 100);
}


    if (moveType === "escape") {
  const escapeRoll = rollDice();
  result.escapeRoll = escapeRoll;
  result.escaped = escapeRoll % 2 === 0;

  const staminaCost = Math.floor(escapeRoll / 2);
  self.stamina = clamp(self.stamina - staminaCost, 0, 100);

  if (result.escaped) {
    const attackRoll = rollDice();
    result.attackRoll = attackRoll;

    const damage = Math.max(0, Math.floor(attackRoll * atkMul - defMul));
    result.damageDealt = damage;
    opp.health = clamp(opp.health - damage, 0, 100);
  }
}


    if (moveType === "teasing") {
  const teasingRoll = rollDice();
  result.teasingRoll = teasingRoll;

  const staminaCost = Math.floor(teasingRoll / 2);
  const attractionGain = Math.max(0, Math.floor(teasingRoll * atkMul));
  result.staminaGained = 0;

  self.stamina = clamp(self.stamina - staminaCost, 0, 100);
  opp.attraction = clamp(opp.attraction + attractionGain, 0, 100);
}


    if (moveType === "pin") {
      const pinRoll = rollDice();
      result.pinRoll = pinRoll;
      result.pinEscaped = getPinAllowedRolls(self.health, 20).includes(pinRoll);
    }

    self.health = clamp(self.health, 0, 100);
    self.stamina = clamp(self.stamina, 0, 100);
    self.attraction = clamp(self.attraction, 0, 100);

    result.updatedHealth = self.health;
    result.updatedStamina = self.stamina;
    result.updatedAttraction = self.attraction;

    const battleState = getBattleState({
      health: self.health,
      stamina: self.stamina,
      attraction: self.attraction,
      maxStamina: 100,
      maxAttraction: 100
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
  } catch (err) {
    logError("Error in resolveMove", err, { roomId: game?.id, playerId, payload });
    return { success: false, error: "Internal server error." };
  }
}

app.post("/api/create-game", (req, res) => {
  try {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: "Missing roomId." });
    }

    if (games.has(roomId)) {
      return res.status(400).json({ error: "Room already exists." });
    }

    const game = createGame(roomId);
    return res.json({ gameId: game.id });
  } catch (err) {
    logError("Error in /api/create-game", err, { body: req.body });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/join-game", (req, res) => {
  try {
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
  } catch (err) {
    logError("Error in /api/join-game", err, { body: req.body });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/dice-match", (req, res) => {
  try {
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
      logError("Move rejected in /api/dice-match", outcome.error, { body: req.body });
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
  } catch (err) {
    logError("Error in /api/dice-match", err, { body: req.body });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/game-state", (req, res) => {
  try {
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
  } catch (err) {
    logError("Error in /api/game-state", err, { body: req.body });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/end-game", (req, res) => {
  try {
    const { roomId, winner, outcome } = req.body;

    const game = games.get(roomId);

    if (!game) {
      return res.status(404).json({ error: "Game not found." });
    }

    if (game.state.finished) {
      return res.status(400).json({ error: "The game is already finished." });
    }

    game.state.finished = true;
    game.state.winner = winner || null;
    game.state.outcome = outcome || "manually ended";

    return res.json({
      success: true,
      message: "The game has been manually ended.",
      state: game.state
    });
  } catch (err) {
    logError("Error in /api/end-game", err, { body: req.body });
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/end-all-games", (req, res) => {
  try {
    const { outcome } = req.body;

    let endedGamesCount = 0;

    games.forEach((game) => {
      if (!game.state.finished) {
        game.state.finished = true;
        game.state.winner = null;
        game.state.outcome = outcome || "manually ended";
        endedGamesCount++;
      }
    });

    return res.json({
      success: true,
      message: `All active games have been manually ended.`,
      endedGamesCount
    });
  } catch (err) {
    logError("Error in /api/end-all-games", err, { body: req.body });
    return res.status(500).json({ error: "Internal server error." });
  }
});

// 404 handler
app.use((req, res) => {
  console.error(`[${new Date().toISOString()}] 404 Not Found`, {
    method: req.method,
    path: req.originalUrl
  });
  return res.status(404).json({ error: "Not found." });
});

// Starting the server with error handling
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
}).on("error", (err) => {
  logError("Server listen error", err);
  process.exit(1);
});
