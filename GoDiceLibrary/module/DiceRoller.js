/**
 * Generates a random dice roll for the given number of sides
 * @date 2024-04-16 22:52:34
 * @author Xander
 *
 * @param {*} numberOfSides The number of sides on the dice
 * @returns {*} Returns a random integer between 1 and the specified number of sides, inclusive.
 */
export function rollDice(numberOfSides) {
  // Returns a random integer between 1 and numberOfSides, inclusive
  return Math.floor(Math.random() * numberOfSides) + 1;
}

/**
 * Rolls the specified number of dice with the given number of sides
 * @date 2024-04-16 23:04:39
 * @author Xander
 *
 * @param {*} numberOfDice The number of dice to roll
 * @param {*} numberOfSides The number of sides on each die
 * @returns {{}} Rolls the specified number of dice with the given number of sides and returns an array of the rolled values
 */
export function rollMultipleDice(numberOfDice, numberOfSides) {
  let rolls = [];
  for (let i = 0; i < numberOfDice; i++) {
      rolls.push(rollDice(numberOfSides));
  }
  return rolls;
}

/**
 * Sorts an array of dice rolls based on the preference provided
 * @date 2024-04-16 23:10:58
 * @author Xander
 *
 * @param {*} diceRolls An array of dice rolls
 * @param {*} preference A string indicating the sorting preference ('kh' to keep highest or other values to keep lowest)
 * @returns {*} Sorts an array of dice rolls based on the preference provided (either keeping the highest value or the lowest value).
 */
function sortDiceByHighestOrLowest(diceRolls, preference) {
  if (preference === 'kh') {
      // Sort to keep highest: descending order
      return diceRolls.sort((first, second) => second - first);
  } else {
      // Sort to keep lowest: ascending order
      return diceRolls.sort((first, second) => first - second);
  }
}

/**
 * Sorts the dice rolls based on the given preference (kh, or kl) and keeps a specified number of rolls
 * @date 2024-04-16 23:12:18
 * @author Xander
 *
 * @param {*} diceRolls The array of dice rolls to sort
 * @param {*} sortPreference The preference for sorting the dice rolls (either 'highest' or 'lowest')
 * @param {*} numberOfDiceToKeep The number of sorted dice rolls to keep
 * @returns {*} Sorts the dice rolls based on the given preference and keeps a specified number of rolls. Returns the sorted and limited dice rolls array.
 */
export function sortDiceRolls(diceRolls, sortPreference, numberOfDiceToKeep) {
  // Validate input
  if (!sortPreference || numberOfDiceToKeep <= 0) {
      // If no sort preference or an invalid number of rolls to keep, return original rolls
      return diceRolls;
  }

  // Determine the sorting method based on preference
  let sortedRolls = sortDiceByHighestOrLowest(diceRolls, sortPreference);

  // Keep only the specified number of dice
  return sortedRolls.slice(0, numberOfDiceToKeep);
}

/**
 * Calculates the total of all dice roll values given in an array
 * @date 2024-04-16 23:17:27
 * @author Xander
 *
 * @param {*} diceRolls An array of dice roll results to sum
 * @returns {*} Accumulate the total sum of the dice rolls
 */
function sumAllRolls(diceRolls) {
  // Accumulate the total sum of the dice rolls
  return diceRolls.reduce((total, currentRoll) => total + currentRoll, 0);
  /** 
   * Example
   * If diceRolls contains [4, 5, 6], the execution would look like this:
   * Start with total = 0 (the initial value).
   * First iteration: currentRoll = 4, so total = 0 + 4 = 4.
   * Second iteration: currentRoll = 5, so total = 4 + 5 = 9.
   * Third iteration: currentRoll = 6, so total = 9 + 6 = 15.
   * reduce() returns 15.
  */
}

/**
 * Calculates the final result of all dice rolled, with any modifiers
 * @date 2024-04-16 23:16:49
 * @author Xander
 *
 * @param {*} diceRolls The array of dice rolls
 * @param {*} modifier The adjustment (modifier) to be applied to the total sum of dice rolls
 * @returns {*} Calculates the total sum of the given dice rolls and applies an adjustment to the total sum.
 */
export function calculateDiceRollTotal(diceRolls, modifier) {
  // Calculate the sum of all dice rolls
  let totalRollsSum = sumAllRolls(diceRolls);

  // Apply the adjustment (modifier) to the total sum of the rolls
  let finalTotal = totalRollsSum + modifier;

  return finalTotal;
}