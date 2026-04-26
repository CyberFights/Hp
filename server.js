// server.js
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

function rollDice(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

function clampZero(n) {
  return n < 0 ? 0 : n;
}

app.post('/api/roll', (req, res) => {
  const { atk, def, health, stamina, sides } = req.body;

  // Basic validation
  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof health !== 'number' || typeof stamina !== 'number') {
    return res.status(400).json({ error: 'atk, def, health, and stamina must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const roll = rollDice(diceSides);

  const effectiveAttack = Math.max(atk - def, 0);
  const damage = roll * effectiveAttack;
  const newHealth = clampZero(health - damage);

  const staminaLoss = Math.floor(roll / 2);
  const newStamina = clampZero(stamina - staminaLoss);

  return res.json({
    roll,
    sides: diceSides,
    atk,
    def,
    effectiveAttack,
    damage,
    healthBefore: health,
    healthAfter: newHealth,
    staminaBefore: stamina,
    staminaLoss,
    staminaAfter: newStamina
  });
});

// server.js (append or merge with previous code)
app.post('/api/submit', (req, res) => {
  const { atk, def, health, attackerHealth, stamina, sides } = req.body;

  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof health !== 'number' || typeof stamina !== 'number') {
    return res.status(400).json({ error: 'atk, def, health, and stamina must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;

  // First roll: damage to target
  const rollTarget = rollDice(diceSides);

  // Second roll: self damage
  const rollSelf = rollDice(diceSides);

  const effectiveAttack = Math.max(atk - def, 0);
  const damageToTarget = rollTarget * effectiveAttack;
  const damageToSelf = rollSelf * effectiveAttack;

  const healthBeforeTarget = health;
  const healthAfterTarget = clampZero(healthBeforeTarget - damageToTarget);

  // attackerHealth optional; default to same health value if not provided
  const healthBeforeAttacker = (typeof attackerHealth === 'number') ? attackerHealth : health;
  const healthAfterAttacker = clampZero(healthBeforeAttacker - damageToSelf);

  const staminaLoss = Math.floor(rollTarget / 2);
  const staminaBefore = stamina;
  const staminaAfter = clampZero(staminaBefore - staminaLoss);

  return res.json({
    rollTarget,
    rollSelf,
    sides: diceSides,
    atk,
    def,
    effectiveAttack,
    damageToTarget,
    healthBeforeTarget,
    healthAfterTarget,
    damageToSelf,
    healthBeforeAttacker,
    healthAfterAttacker,
    staminaBefore,
    staminaLoss,
    staminaAfter
  });
});

// Escape endpoint
app.post('/api/escape', (req, res) => {
  const {
    atk, def, health, stamina,
    opponentHealth, opponentMaxHealth,
    sides, baseEscapeChance
  } = req.body;

  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof health !== 'number' || typeof stamina !== 'number' ||
      typeof opponentHealth !== 'number') {
    return res.status(400).json({ error: 'atk, def, health, stamina, and opponentHealth must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const maxOppHealth = (typeof opponentMaxHealth === 'number' && opponentMaxHealth > 0) ? opponentMaxHealth : 100;
  const baseChance = (typeof baseEscapeChance === 'number' && baseEscapeChance >= 0 && baseEscapeChance <= 1) ? baseEscapeChance : 0.8;

  // Escape chance scales with target health fraction (lower target health -> lower chance)
  const healthFraction = Math.max(0, Math.min(1, health / maxOppHealth));
  const escapeChance = baseChance * healthFraction;

  const escapeRoll = Math.random(); // 0..1
  const escapeSuccess = escapeRoll < escapeChance;

  const effectiveAttack = Math.max(atk - def, 0);

  let attackRoll = null;
  let damageToOpponent = 0;
  let opponentHealthBefore = opponentHealth;
  let opponentHealthAfter = opponentHealth;
  let staminaLoss = 0;
  let staminaBefore = stamina;
  let staminaAfter = stamina;

  if (escapeSuccess) {
    // perform attack roll against opponent
    attackRoll = rollDice(diceSides);
    damageToOpponent = attackRoll * effectiveAttack;
    opponentHealthAfter = clampZero(opponentHealthBefore - damageToOpponent);

    // stamina loss uses the attack roll (same rule as attack endpoint)
    staminaLoss = Math.floor(attackRoll / 2);
    staminaAfter = clampZero(staminaBefore - staminaLoss);
  }

  return res.json({
    atk,
    def,
    effectiveAttack,
    health,
    opponentMaxHealth: maxOppHealth,
    opponentHealthBefore,
    opponentHealthAfter,
    sides: diceSides,
    baseEscapeChance: baseChance,
    healthFraction,
    escapeChance,
    escapeRoll,
    escapeSuccess,
    attackRoll,
    damageToOpponent,
    staminaBefore,
    staminaLoss,
    staminaAfter
  });
});

// POST /api/pin-escape  (Node/Express)
app.post('/api/pin-escape', (req, res) => {
  const {
    health, stamina,
    opponentHealth, opponentMaxHealth,
    sides, baseEscapeChance
  } = req.body;

  if (typeof health !== 'number' || typeof stamina !== 'number' ||
      typeof opponentHealth !== 'number') {
    return res.status(400).json({ error: 'health, stamina, and opponentHealth must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const maxOppHealth = (typeof opponentMaxHealth === 'number' && opponentMaxHealth > 0) ? opponentMaxHealth : 100;
  const baseChance = (typeof baseEscapeChance === 'number' && baseEscapeChance >= 0 && baseEscapeChance <= 1) ? baseEscapeChance : 0.8;

  const healthFraction = Math.max(0, Math.min(1, health / maxOppHealth));
  const escapeChancePerRoll = baseChance * healthFraction;

  const rolls = [];
  let anySuccess = false;
  for (let i = 0; i < 3; i++) {
    const rollValue = Math.random();
    const success = rollValue < escapeChancePerRoll;
    rolls.push({ rollValue, success });
    if (success) anySuccess = true;
  }

  // No attack roll, no damage, no stamina change on success or failure
  return res.json({
    health,
    opponentMaxHealth: maxOppHealth,
    opponentHealthBefore: opponentHealth,
    opponentHealthAfter: opponentHealth,
    sides: diceSides,
    baseEscapeChance: baseChance,
    healthFraction,
    escapeChancePerRoll,
    rolls,                     // array of { rollValue, success } for each attempt
    escapeSuccess: anySuccess
  });
});

// POST /api/tease
app.post('/api/tease', (req, res) => {
  const { atk, def, stamina, opponentAttraction, opponentMaxAttraction, sides } = req.body;

  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof stamina !== 'number' || typeof opponentAttraction !== 'number') {
    return res.status(400).json({ error: 'atk, def, stamina, and opponentAttraction must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const maxAttraction = (typeof opponentMaxAttraction === 'number' && opponentMaxAttraction > 0)
    ? opponentMaxAttraction
    : null;

  const roll = rollDice(diceSides);
  const effectiveAttack = Math.max(atk - def, 0);
  const attractionIncrease = roll * effectiveAttack;

  const attractionBefore = opponentAttraction;
  let attractionAfter = attractionBefore + attractionIncrease;
  if (maxAttraction !== null) attractionAfter = Math.min(attractionAfter, maxAttraction);
  attractionAfter = attractionAfter < 0 ? 0 : attractionAfter;

  const staminaLoss = Math.floor(roll / 2);
  const staminaBefore = stamina;
  const staminaAfter = clampZero(staminaBefore - staminaLoss);

  return res.json({
    roll,
    sides: diceSides,
    atk,
    def,
    effectiveAttack,
    attractionIncrease,
    attractionBefore,
    attractionAfter,
    opponentMaxAttraction: maxAttraction,
    staminaBefore,
    staminaLoss,
    staminaAfter
  });
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Dice match API listening on ${PORT}`));
