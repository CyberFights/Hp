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

// Added limiter helper
function limitDamage(n) {
  return Math.min(n, 18);
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
  // Applied limiter
  const damage = limitDamage(roll * effectiveAttack);
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
  // Applied limiter
  const damageToTarget = limitDamage(rollTarget * effectiveAttack);
  const damageToSelf = limitDamage(rollSelf * effectiveAttack);

  const healthBeforeTarget = health;
  const healthAfterTarget = clampZero(healthBeforeTarget - damageToTarget);

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
    // Applied limiter
    damageToOpponent = limitDamage(attackRoll * effectiveAttack);
    opponentHealthAfter = clampZero(opponentHealthBefore - damageToOpponent);
    staminaLoss = Math.floor(attackRoll / 2);
    staminaAfter = clampZero(staminaBefore - staminaLoss);
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
  // Logic remains unchanged as no damage is dealt in this endpoint
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
  // Applied limiter to attraction increase
  const attractionIncrease = limitDamage(roll * effectiveAttack);

  const attractionBefore = opponentAttraction;
  let attractionAfter = attractionBefore + attractionIncrease;
  if (maxAttraction !== null) attractionAfter = Math.min(attractionAfter, maxAttraction);
  attractionAfter = attractionAfter < 0 ? 0 : attractionAfter;

  const staminaLoss = Math.floor(roll / 2);
  const staminaBefore = stamina;
  const staminaAfter = clampZero(staminaBefore - staminaLoss);

  return res.json({
    roll, sides: diceSides, atk, def, effectiveAttack,
    attractionIncrease, attractionBefore, attractionAfter,
    opponentMaxAttraction: maxAttraction, staminaBefore, staminaLoss, staminaAfter
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Dice match API listening on ${PORT}`));
