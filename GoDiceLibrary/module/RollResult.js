import { DiceRollPrompt } from "./DiceRollPrompt.js";
import { RollBonusPrompt } from "./RollBonusPrompt.js";
import { roll, formulaRegex, dieRegex } from "./Roll.js";
import { rollDice as getDiePlaceholder } from './DiceRoller.js';

class RollResult {
	
	static isEnabled(){
		return true;
	}
	
	static isAutoSendEnabled() {
		return false;
	}
	
	async rollDice(formula) {	
		
		var total = [];
		var minTotal = [];
		var maxTotal = [];
		var avgTotal = [];
		var totalexpl = [];
		var results = [];
		var constants = [];
		var diePrompt = [] ;
		var rollReturn = new RollResult();
		
		var d20 = formula.includes("d20");
		
		var rollBonus = await new RollBonusPrompt().showRollBonusPrompt(formula, d20);
		
		if(rollBonus["bonus"].startsWith("+") || rollBonus["bonus"].startsWith("-") )
			formula = formula + rollBonus["bonus"];
		else
			formula= formula + "+" + rollBonus["bonus"];
		
		var advdis = Number(rollBonus["advdis"]);
		var elvish = rollBonus["elven"];
		var d20dice = (elvish&&advdis==1)?3:2;
		
		var matches = formula.matchAll(formulaRegex);
		
		for (const match of matches) {
			console.debug(match);
			match.groups.modifier = match.groups.modifier?match.groups.modifier:"";

			if(match.groups.constant){
				 if(match.groups.operator) 
					constants.push(match.groups.operator);
				else
					constants.push("+");
				constants.push(Number(match.groups.constant));
			}
			
			if(match.groups.dice){
				if(match.groups.operator) results.push(match.groups.operator);
				//if contains d20 apply advantage or disadvantege logic
				if(match.groups.faces == 20){
					if(advdis == 1) {
						match.groups.numberOfDice = d20dice;
						match.groups.modifier="kh";
					} else if(advdis == -1){
						match.groups.numberOfDice = d20dice;
						match.groups.modifier="kl";
					}
				}
				
				let term = match.groups.numberOfDice+"d"+match.groups.faces+match.groups.modifier;
				results.push(term);
				for (let i = 0; i < Number(match.groups.numberOfDice); i++) {
					let dieroll = getDiePlaceholder(match.groups.faces);
					diePrompt.push({name: term, dieFaces:Number(match.groups.faces), diePlaceholder:dieroll, index: i});
				}
			}
		}	
		results = results.concat(constants);
		
		if(results.length > 0)
			formula = results.join('');
		
		rollReturn["notation"] = formula;
		
		var newRolls = await new DiceRollPrompt().showDicePrompt(formula, diePrompt);
		
		results.forEach(function(result, i){
			if(dieRegex.test(result)) {
				const newroll = [];
				for (const [key, value] of Object.entries(newRolls)) {
					if (value.name.includes(result) && key != null) {
						newroll.push(isNaN(value.valueAsNumber)?Number(value.placeholder):value.valueAsNumber);
					}
				}
				let dieroll = roll(result, newroll);
				total.push(dieroll.total);
				minTotal.push(dieroll.min);
				maxTotal.push(dieroll.max);
				avgTotal.push(dieroll.avg);	
				totalexpl.push(dieroll.toString());
				this[i] = {rolls: dieroll.rolls, type: "roll-results", value: dieroll.total};
			} else {
				total.push(result);
				minTotal.push(result);
				maxTotal.push(result);
				avgTotal.push(result);
				totalexpl.push(result);
			}
		}, results);
		
		console.debug(results);
		
		rollReturn["rolls"] = results;
		rollReturn["total"] = eval(total.join(''));
		rollReturn["output"] = formula + ": " + totalexpl.join('') + " = " + rollReturn["total"];
		rollReturn["averageTotal"] = eval(avgTotal.join(''));
		rollReturn["maxTotal"] = eval(maxTotal.join(''));
		rollReturn["minTotal"] = eval(minTotal.join(''));

		console.debug(rollReturn);
		
		return rollReturn;
	}
}

export { RollResult };