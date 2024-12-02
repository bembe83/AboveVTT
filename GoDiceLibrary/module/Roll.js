// Import helper functions from the d20 module
import { rollDice, rollMultipleDice, sortDiceRolls, calculateDiceRollTotal } from './DiceRoller.js';

// Public API function

/**
 * Roll the dice!
 * @date 2024-04-16 23:26:23
 * @author Xander
 *
 * @param {string} diceString A string that represents a dice command, following the specified regex pattern.
 * @returns {object} An object containing the total of the dice roll and a string representing the detailed result.
 */
export const diceRegex = /(\d+)?d(\d+)(kh\d?|kl\d?)?([\+\-]\d+)?/;
export const dieRegex = /(\d+)?[dD](\d+)(kh\d?|kl\d?)?/
export const modifierRegex = /([\+\-]?\d+)+/;
export const formulaRegex = /(?<operator>[ ]?[+\-\/*][ ]?)?(?:(?<dice>(?<numberOfDice>[\d]+)?[dD](?<faces>[\d]+)(?<explode>![\d]*)?(?<implode>¡[\d]*)?(?<modifier>(kh\d?|kl\d?))?)|(?<constant>[\d]+))/gm;
export const operatorRegEx = /[+\-\/*]/;
 
export function roll(diceString, diceRolls = null) {
	
	var result = { 
		term: diceString, 
		rolls: null,  
		total: 0, 
		modifier: "" ,
		min: 0, 
		max: 0, 
		avg: 0, 
		toString: () => "Invalid dice command" 
	};
    // Regex to parse the dice command
    //const diceRegex = /(\d+)?d(\d+)(kh\d?|kl\d?)?([\+\-]\d+)?/;
	//const modifierRegex = /([\+\-]\d+)+/;
  
    /*
    * Breakdown of the regex components:
    * - (\d+)?d(\d+): Captures dice roll commands
    *   - (\d+)? - Optional number capturing the number of dice to be rolled (default is 1 if not specified)
    *   - d - Literal character indicating the start of the dice type specification (e.g., d20 means a twenty-sided die)
    *   - (\d+) - Mandatory number capturing the type of dice (i.e., the number of sides on the dice)
    *
    * - (kh\d+|kl\d+)? - Optional group for "keep highest" or "keep lowest" modifiers
    *   - kh\d+ - "Keep highest" command followed by a number specifying how many of the highest rolls to keep
    *   - kl\d+ - "Keep lowest" command followed by a number specifying how many of the lowest rolls to keep
    *
    * - ([\+\-]\d+)? - Optional group capturing arithmetic modifiers to apply to the total roll
    *   - [\+\-] - A plus or minus sign indicating addition or subtraction
    *   - \d+ - A number specifying how much to add or subtract from the dice roll total
    */

    const matches = diceString.match(diceRegex);
  
    if (!matches) {
		if(diceString.match(modifierRegex)){
			result["total"] = Number(diceString);
			result["min"] = Number(diceString);
			result["max"] = Number(diceString);
			result["avg"] = Number(diceString);
			result["toString"] = () => diceString;
		}else{
			console.error("Invalid dice command:", diceString);
		}
    }else{
  
		const numberOfDice = parseInt(matches[1]) || 1;
		const numberOfSides = parseInt(matches[2]);
		const keepPreference = matches[3] ? matches[3].substring(0, 2) : null;
		const numberOfKeeps = parseInt(matches[3] ? (matches[3].slice(2) ? matches[3].slice(2) : 1) : 0) || 0;
		const adjustment = parseInt(matches[4]) || 0;
	  
		// Roll the dice based on the parsed command
		if(!diceRolls) diceRolls = rollMultipleDice(numberOfDice, numberOfSides);
	  
		// Sort and possibly reduce the number of dice based on keep preferences
		let relevantRolls = sortDiceRolls(diceRolls, keepPreference, numberOfKeeps);
	  
		// Calculate the total of the relevant dice rolls including any modifiers
		let finalResult = calculateDiceRollTotal(relevantRolls, adjustment);
	  
		// Construct the detailed result string
		let resultString = `[${relevantRolls.join(", ")}]`;
		/*if (adjustment !== 0) {
			resultString += ` ${adjustment >= 0 ? '+' : ''}${adjustment}`;
		}*/
		//resultString += ` = \`${finalResult}\``;
	  
		// Log the detailed results for debugging and verification
		console.debug(`Result:  ${diceString} = ${resultString} = ${finalResult}`);
		
		var rolls=[];
		var toUse = numberOfKeeps;
		diceRolls.forEach(function(roll){
			let useInTotal = false;
			if(relevantRolls.includes(roll) && (toUse > 0 || numberOfKeeps==0)){
				useInTotal = true;
				toUse--;
			}
			rolls.push({calculationValue: roll, initialValue:roll, modifierFlags: "", modifiers: keepPreference?[keepPreference]:[], type: "result", useInTotal: useInTotal, value: roll});
		}); 
		
		result = { 
			term: diceString, 
			dieFaces: numberOfSides, 
			rolls: rolls, 
			total: finalResult, 
			modifier: keepPreference, 
			min: relevantRolls.length, 
			max: relevantRolls.length*numberOfSides, 
			avg: relevantRolls.length*((numberOfSides/2)+0.5), 
			toString: () => resultString
		};
	}
	
    return result;
  }