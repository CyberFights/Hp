// Updated resolveMove function to ensure the game does not end prematurely
function resolveMove(move) {
    const isKO = checkKO();
    const isTie = checkTie();
    const isPin = checkPin();

    // Continue game unless KO, tie, or pin conditions are met
    if (isKO) {
        return "KO! Game Over.";
    } else if (isTie) {
        return "It's a tie! Game Over.";
    } else if (isPin) {
        return "Pinned! Game Over.";
    }

    // Continue with normal game flow
    // Update game state based on the move
    // ... (existing logic for move resolution)
}