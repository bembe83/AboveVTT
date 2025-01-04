import { Utils, renderTemplate } from './Utils.js';
import { Dialog } from "./Dialog.js";
import { GoDiceExt } from './GoDiceExt.js';

 /* @class
 * The Prompt to manually roll dice.
 */

var templatePath = "templates/template.hbs";
var id = "godicemodule-resolver";
var goDiceExt =  new GoDiceExt();
var maxDiceGrid = 6;

export class DiceRollPrompt {
	
	showDicePrompt = async (formula, diceList) => {
		var newRolls = [];
		console.debug(formula, " - ", diceList);
		if (formula && diceList) {
			let modulePath = Utils.getModulePath();
			let args = this.prepareRollPromptData(formula);
			diceList.forEach((die)=>{
				let diePrompt = this.createDiePrompt(die.name, die.dieFaces, die.diePlaceholder, die.index);
				args.terms.push(diePrompt);
			});
			let r = document.querySelector(':root');
			r.style.setProperty('--dice-grid', diceList.length<=maxDiceGrid?diceList.length:maxDiceGrid);
			let template;
			template = await  renderTemplate(modulePath + templatePath, args);
			let dialog = new Dialog({
				id: id,
				content: template,
				allowClose: false,
				hideTitle: true
			});
			let rollData = await dialog.show();
			
			rollData.querySelectorAll(".dice-term-input").forEach((input)=> {
				newRolls.push(this.unwrap(input));
			});
			console.debug(newRolls);
			
			if (newRolls.lenght >0) {
				console.log("Manually rolled: [", newRolls. join(", "),"]");
			}
			else
				console.log("Error retrieving Rolled Values");
		}else{
			console.log("No formula or dice list provided");
		}
		
		return newRolls;
	}
		
	createDiePrompt(name, dieFaces, diePlaceholder, index){
		let rtn = {
				id: name+"-"+index,
				image: goDiceExt.diceIcons["D"+dieFaces],
				icon: "fa-dice-d"+dieFaces,
				faces: dieFaces,
				placeholder: diePlaceholder
			};
		return rtn;
	}

	prepareRollPromptData (formula){
		return {
			template: "diceroll",
			roll: {
				options: {
					flavor: "GoDiceRoll"
				},
				_formula: formula
			},
			terms : []	
		};
	}
	
	unwrap({ name, valueAsNumber, placeholder }) { return { name, valueAsNumber, placeholder }; };
}
