import { Utils, renderTemplate } from './Utils.js';
import { Dialog } from "./Dialog.js";

 /* @class
 * The Prompt to manually roll dice.
 */

var templatePath = "templates/template.hbs";
var id = "godicemodule-resolver";

export class RollBonusPrompt {
	
	async showRollBonusPrompt(formula, d20) {
			let modulePath = Utils.getModulePath();
			let template;
			let args = { template: "rollbonus", formula: formula, d20: d20};
			template = await renderTemplate(modulePath + templatePath, args);
			let dialog = new Dialog({
				id: id,
				content: template,
				allowClose: false,
				hideTitle: true
			});
			let promptData = await dialog.show();
			
			let result ={};
			
			result["bonus"]  = promptData.querySelector("#bonus").value;
			result["advdis"] = Number(promptData.querySelector("#advdis").value);
			result["elven"]  = promptData.querySelector("#elven").checked;
			console.debug(result);
		
		return result;
	}
	
	unwrap({ name, valueAsNumber, placeholder }) { return { name, valueAsNumber, placeholder }; };
}
