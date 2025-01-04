import { GoDice } from './GoDice.js';
import { connectedDice, disconnectedDice } from './GoDiceExt.js';
import { Utils, renderTemplate, rollTimer } from './Utils.js';
import { DieTypePrompt } from "./DieTypePrompt.js";
import { RollResult } from "./RollResult.js";
import { DiceBar } from './DiceBar.js';

export { renderTemplate };

console.debug("GODiceLibary Startup inititiated");

window.godice.rollResult = new RollResult();
window.godice.utils = Utils;
Utils.registerHBhelper();
Utils.LoadStoredInfos();
Utils.reconnectLoadedDice();
DiceBar.init();

GoDice.prototype.onDiceConnected = async (diceId, diceInstance) => {

	if (connectedDice.get(diceId)) {
		console.log('Dice already connected');
	}else{
		let dieType = GoDice.diceTypes.D20;
		if(disconnectedDice?.get(diceId))  {
			console.log("Reconnecting Dice: ", diceId);
			connectedDice.set(diceId, disconnectedDice.get(diceId));
			disconnectedDice.delete(diceId);
		}else{
			if (diceInstance.newConnection && dieType) {
				console.log("Connecting New Dice: ", diceId);
				connectedDice.set(diceId, diceInstance);
				diceInstance.diceId = diceId;
				diceInstance.setDieColor();
				diceInstance.setBatteryLevel();
				let diePrompt = new DieTypePrompt();
				dieType = await diePrompt.showTypePrompt(diceInstance);
				diceInstance.setDieType(dieType);
			} else if(!diceInstance.newConnection){
				console.log("Connecting Stored Dice: ", diceId);
				diceInstance.setBatteryLevel();
				connectedDice.set(diceId, diceInstance);
			}else{
				console.log("Error connecting dice");
				Utils.disconnectDice(diceId);
			}
		}
		Utils.saveDices();
		window.godice.dicebar.render(true);
		console.log("Dice connected: ", diceId, diceInstance.getDieType(true), diceInstance.getDieColor(true));
	}
};

GoDice.prototype.onDisconnected = (event) => {
	console.debug(event);
	let diceId = event.target.id;
	if(connectedDice.get(diceId)?.reconnect)
		disconnectedDice.set(diceId, connectedDice.get(diceId));
	connectedDice.delete(diceId);
	Utils.saveDices();
	window.godice.dicebar.render(true);
};

GoDice.prototype.onRollStart = (diceId) => {
	if(rollTimer){
		clearTimeout(rollTimer);
		let bar = document.querySelectorAll("#round-time-bar");
		bar[0]?.classList.remove("round-time-bar");
	}
	let diceType = connectedDice.get(diceId).getDieType(true);
	let diceColor = connectedDice.get(diceId).getDieColor(true);
	console.log("Roll Start: ", diceType, diceColor);
};

GoDice.prototype.onStable = (diceId, value, xyzArray) => {
	console.log("Stable Roll:", diceId, value, xyzArray);
	Utils.showRoll(diceId, value, "Stable");
};

GoDice.prototype.onTiltStable = (diceId, value, xyzArray) => {
	console.log("TiltStable Roll:", diceId, value, xyzArray);
	Utils.showRoll(diceId, value, "TiltStable");
};

GoDice.prototype.onFakeStable = (diceId, value, xyzArray) => {
	console.log("FakeStable Roll:", diceId, value, xyzArray);
	Utils.showRoll(diceId, value, "FakeStable");
};

GoDice.prototype.onMoveStable = (diceId, value, xyzArray) => {
	console.log("MoveStable Roll:", diceId, value, xyzArray);
};

console.debug("GODiceLibary Startup completed");