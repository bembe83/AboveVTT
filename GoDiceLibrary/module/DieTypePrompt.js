import { Utils, renderTemplate } from './Utils.js';
import { GoDice } from './GoDice.js';
import { Dialog } from "./Dialog.js";

/**
 * @class
 * The Prompt to choose the connected die type.
 */
 
var templatePath = "templates/template.hbs";

export class DieTypePrompt {
	
	async showTypePrompt(diceInstance) {
		let diceType = null;
		if (diceInstance) {
			//Show popup to select the dice Type
			let modulePath = Utils.getModulePath();
			let data = [];
			for (const typeKey of Object.keys(GoDice.diceTypes)) {
				data.push({
					id: GoDice.diceTypes[typeKey],
					type: typeKey
				});
			}
			let args = {};
			args["template"] = "dietype"
			args["label"] = "DiceType";
			args["diceTypes"] = data;
			args["path"] = modulePath + "images/";
			args["img"] = Utils.getDiceImage("D6");
			args["dieColor"] = diceInstance.getDieColor(true);
			let template;
			template = await renderTemplate(modulePath + templatePath, args);
			let dialog = new Dialog({
				id: "dieType",
				content: template,
				allowClose: false,
				hideTitle: true
			});
			let formdata = await dialog.show();
			diceType = DieTypePrompt.getSelectedDie(formdata)
			if (diceType) {
				console.log("Selected Dice Type:", diceType);
			}
			else
				console.log("Error retrieving Die Type");
		} 
		return diceType;
	}

	static getSelectedDie(formdata = null) {
		let selectedValue = null;
		let selectElement = formdata?formdata.querySelectorAll("#diceTypes")[0]:document.getElementById('diceTypes');
		if (selectElement) {
			let selectedIndex = selectElement.selectedIndex;
			selectedValue = selectElement[selectedIndex].value;
		}
		else {
			console.log("No diceTypes element found");
		}
		return selectedValue;
	}

	static changeImageDie() {
		let selectedDice = DieTypePrompt.getSelectedDie();
		if (selectedDice) {
			let imgEl = document.getElementById('diceTypeIcon');
			//imgEl.src = Utils.getModulePath() + "images/" + selectedDice + ".webp";
			img.src = Utils.getDiceImage(dieType) ;
		}
	}
}