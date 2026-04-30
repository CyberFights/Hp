const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

function rollDice(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

// Helper to clamp values between min and max
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

app.post('/api/roll', (req, res) => {
  const { atk, def, health, stamina, sides } = req.body;

  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof health !== 'number' || typeof stamina !== 'number') {
    return res.status(400).json({ error: 'atk, def, health, and stamina must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const roll = rollDice(diceSides);

  const effectiveAttack = Math.max(atk - def, 0);
  // Using clamp to limit damage to 18
  const damage = clamp(roll * effectiveAttack, 0, 18);
  const newHealth = Math.max(health - damage, 0);

  const staminaLoss = Math.floor(roll - 1);
  const newStamina = Math.max(stamina - staminaLoss);

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

app.post('/api/submit', (req, res) => {
  const { atk, def, health, attackerHealth, stamina, sides } = req.body;

  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof health !== 'number' || typeof stamina !== 'number') {
    return res.status(400).json({ error: 'atk, def, health, and stamina must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const rollTarget = rollDice(diceSides);
  const rollSelf = rollDice(diceSides);

  const effectiveAttack = Math.max(atk - def, 0);
  // Using clamp for target and self damage
  const damageToTarget = clamp(rollTarget * effectiveAttack, 0, 18);
  const damageToSelf = clamp(rollSelf * effectiveAttack, 0, 18);

  const healthBeforeTarget = health;
  const healthAfterTarget = Math.max(healthBeforeTarget - damageToTarget);

  const healthBeforeAttacker = (typeof attackerHealth === 'number') ? attackerHealth : health;
  const healthAfterAttacker = Math.max(healthBeforeAttacker - damageToSelf);

  const staminaLoss = Math.floor(rollTarget - 1);
  const staminaBefore = stamina;
  const staminaAfter = Math.max(staminaBefore - staminaLoss);

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

app.post('/api/escape', (req, res) => {
  const { atk, def, health, stamina, opponentHealth, opponentMaxHealth, sides, baseEscapeChance } = req.body;

  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof health !== 'number' || typeof stamina !== 'number' ||
      typeof opponentHealth !== 'number') {
    return res.status(400).json({ error: 'atk, def, health, stamina, and opponentHealth must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const maxOppHealth = (typeof opponentMaxHealth === 'number' && opponentMaxHealth > 0) ? opponentMaxHealth : 100;
  const baseChance = (typeof baseEscapeChance === 'number' && baseEscapeChance >= 0 && baseEscapeChance <= 1) ? baseEscapeChance : 0.8;

  const healthFraction = Math.max(0, Math.min(1, health / maxOppHealth));
  const escapeChance = baseChance * healthFraction;
  const escapeRoll = Math.random();
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
    attackRoll = rollDice(diceSides);
    // Using clamp to limit damage to 18
    damageToOpponent = clamp(attackRoll * effectiveAttack, 0, 18);
    opponentHealthAfter = Math.max(opponentHealthBefore - damageToOpponent);
    staminaLoss = Math.floor(attackRoll - 1);
    staminaAfter = Math.max(staminaBefore - staminaLoss);
  }

  return res.json({
    atk, def, effectiveAttack, health, opponentMaxHealth: maxOppHealth,
    opponentHealthBefore, opponentHealthAfter, sides: diceSides,
    baseEscapeChance: baseChance, healthFraction, escapeChance,
    escapeRoll, escapeSuccess, attackRoll, damageToOpponent,
    staminaBefore, staminaLoss, staminaAfter
  });
});

app.post('/api/pin-escape', (req, res) => {
  const { health, stamina, opponentHealth, opponentMaxHealth, sides, baseEscapeChance } = req.body;
  if (typeof health !== 'number' || typeof stamina !== 'number' || typeof opponentHealth !== 'number') {
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
  return res.json({ health, opponentMaxHealth: maxOppHealth, opponentHealthBefore: opponentHealth, opponentHealthAfter: opponentHealth, sides: diceSides, baseEscapeChance: baseChance, healthFraction, escapeChancePerRoll, rolls, escapeSuccess: anySuccess });
});

app.post('/api/tease', (req, res) => {
  const { atk, def, stamina, opponentAttraction, opponentMaxAttraction, sides } = req.body;

  if (typeof atk !== 'number' || typeof def !== 'number' ||
      typeof stamina !== 'number' || typeof opponentAttraction !== 'number') {
    return res.status(400).json({ error: 'atk, def, stamina, and opponentAttraction must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;
  const maxAttraction = (typeof opponentMaxAttraction === 'number' && opponentMaxAttraction > 0) ? opponentMaxAttraction : null;

  const roll = rollDice(diceSides);
  const effectiveAttack = Math.max(atk - def, 0);
  // Using clamp to limit attraction increase to 18
  const attractionIncrease = clamp(roll * effectiveAttack, 0, 18);

  const attractionBefore = opponentAttraction;
  let attractionAfter = attractionBefore + attractionIncrease;
  if (maxAttraction !== null) attractionAfter = Math.min(attractionAfter, maxAttraction);
  attractionAfter = Math.max(attractionAfter);

  const staminaLoss = Math.floor(roll - 1);
  const staminaBefore = stamina;
  const staminaAfter = Math.max(staminaBefore - staminaLoss);

  return res.json({
    roll, sides: diceSides, atk, def, effectiveAttack,
    attractionIncrease, attractionBefore, attractionAfter,
    opponentMaxAttraction: maxAttraction, staminaBefore, staminaLoss, staminaAfter
  });
});

   app.post('/api/recover', (req, res) => {
  const { health, stamina, maxHealth, maxStamina, sides } = req.body;

  if (typeof health !== 'number' || typeof stamina !== 'number') {
    return res.status(400).json({ error: 'health and stamina must be numbers' });
  }

  const diceSides = (typeof sides === 'number' && sides >= 2) ? Math.floor(sides) : 6;

  const rolls = [
    rollDice(diceSides),
    rollDice(diceSides),
    rollDice(diceSides),
    rollDice(diceSides)
  ];

  const recoveryTotal = rolls.reduce((sum, r) => sum + r, 0);

  const healthBefore = health;
  const staminaBefore = stamina;

  const healthCap = (typeof maxHealth === 'number' && maxHealth > 0) ? maxHealth : null;
  const staminaCap = (typeof maxStamina === 'number' && maxStamina > 0) ? maxStamina : null;

  const healthAfterRaw = healthBefore + recoveryTotal;
  const staminaAfterRaw = staminaBefore + recoveryTotal;

  const healthAfter = healthCap !== null
    ? clamp(healthAfterRaw, 0, healthCap)
    : Math.max(healthAfterRaw, 0);

  const staminaAfter = staminaCap !== null
    ? clamp(staminaAfterRaw, 0, staminaCap)
    : Math.max(staminaAfterRaw, 0);

  return res.json({
    rolls,
    sides: diceSides,
    recoveryTotal,
    healthBefore,
    healthAfter,
    staminaBefore,
    staminaAfter,
    maxHealth: healthCap,
    maxStamina: staminaCap
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Dice match API listening on ${PORT}`));
