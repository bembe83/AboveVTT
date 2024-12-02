import { GoDiceExt, rolledDice, disconnectedDice, connectedDice, reloadedDice } from "./GoDiceExt.js";
import { RollResult } from "./RollResult.js";

export { renderTemplate, getTemplate, readFile, validateHTMLString } 
export var rollTimer;
export const MODULE_NAME = "GoDiceLibrary";

export const  facesToImages = {
            4: ".images/d4.webp",
            6: ".images/d6.webp",
            8: ".images/d8.webp",
            10: ".images/d10.webp",
            12: ".images/d12.webp",
            20: ".images/d20.webp",
            100: ".images/d10.webp",
}

export const  facesToIcon= {
            4: ".images/d4_icon.webp",
            6: ".images/d6_icon.webp",
            8: ".images/d8_icon.webp",
            10: ".images/d10_icon.webp",
            12: ".images/d12_icon.webp",
            20: ".images/d20_icon.webp",
            100: ".images/d10_icon.webp",
}

async function renderTemplate(path, data) {
  const template = await getTemplate(path);
  return template(data || {}, {
    allowProtoMethodsByDefault: true,
    allowProtoPropertiesByDefault: true
  });
}

/**
 * Get a template from the server by fetch request and caching the retrieved result
 * @param {string} path           The web-accessible HTML template URL
 * @param {string} [id]           An ID to register the partial with.
 * @returns {Promise<Function>}   A Promise which resolves to the compiled Handlebars template
 */
async function getTemplate(path, id) {
  if ( path in Handlebars.partials ) return Handlebars.partials[path];
  const htmlString = await readFile(path);
  const compiled = Handlebars.compile(htmlString);
  Handlebars.registerPartial(id ?? path, compiled);
  console.debug(`Retrieved and compiled template ${path}`);
  return compiled;
}

/**
 * Get a template from the server by fetch request and caching the retrieved result
 * @param {string} path           The web-accessible HTML template URL
 */
function readFile(path) {
    return new Promise((resolve, reject) => {
		fetch(`${path}`).then(function(response) {
			response.text().then(function(text) {
				resolve(text);
			})
		});
	});
}

function validateHTMLString(string) {
    let regexForHTML = /<([A-Za-z][A-Za-z0-9]*)\b[^>]*>(.*?)<\/\1>/;
   // check if the regular expression matches the string
   let isValid = regexForHTML.test(string);
   if (isValid) {
      console.debug(string +"\n is a html String");
   }else{
      console.debug(string +"\n is not a html String");
   }
   return isValid;
}

export class Utils {

	static openConnectionDialog() {
		const newDice = new GoDiceExt();
		newDice.requestDevice();
	}

	static saveDices() {
		let diceToStore = [];
		connectedDice.forEach(function(dieInstance, diceId) {
			diceToStore.push(diceId + "|" + dieInstance.getDieType(true) + "|" + dieInstance.getDieColor(true));
		});
		Utils.setCookie('connectedDice', JSON.stringify(diceToStore), (1/4));
	}
	
	static LoadStoredInfos() {
		let storedConnectedDice = Utils.getCookie('connectedDice');
		if (storedConnectedDice) {
			console.log("Wait... Reloading Stored dices...");
			let storedDice = JSON.parse(storedConnectedDice);
			storedDice.forEach(function(dieInfo) {
				console.debug("Retrieved info ", dieInfo);
				let dieId = dieInfo.split("|")[0];
				let dieType = dieInfo.split("|")[1];
				let dieColor = dieInfo.split("|")[2];
				try {
					console.debug("Setting device ", dieId, " of type ", dieType," ",dieColor,"  to be reconnected");
					let newDieInstance = new GoDiceExt();
					newDieInstance.diceId = dieId;
					newDieInstance.setDieType(dieType);
					reloadedDice.set(dieId, newDieInstance)
				} catch (err) {
					console.log("Exception Loading Stored Dice.", dieId, err);
				}
			})
			console.debug(reloadedDice);
		}
	}

	static disconnectAll() {
		if (connectedDice) {
			connectedDice.forEach(function(diceInstance, diceId) {
				Utils.disconnectDice(diceId);
			});
		}
		else {
			console.log("No dice connected");
		}
	}

	static disconnectDice(diceId) {
		console.log("Disconnect:", diceId);
		connectedDice.get(diceId).reconnect = false;
		connectedDice.get(diceId).onDisconnectButtonClick();
	}
	
	static reconnectDice(){
		if(disconnectedDice) {
			disconnectedDice.forEach(function(dieInstance, dieId) {
				try {
					console.debug("Reconnecting device ", dieId);
					dieInstance.reconnectDevice();
					dieInstance.setBatteryLevel();
				} catch (err) {
					console.log("Exception Reconnecting Die.", dieId, err);
					disconnectedDice.delete(dieId);
				}
			});
		}
	}
	
	static reconnectLoadedDice(){
		if(reloadedDice) {
			reloadedDice.forEach(function(dieInstance, dieId) {
				try {
					console.debug("Reconnecting device ", dieId);
					dieInstance.reconnectDevice();
					dieInstance.setBatteryLevel();
				} catch (err) {
					console.log("Exception Reconnecting Die.", dieId, err);
					reloadedDice.delete(dieId);
				}
			});
		}
	}

	static getModulePath() {
		let script = Array.from(document.getElementsByTagName("script")).filter((script) => { return script.src.includes(MODULE_NAME)});
		let fullPath = (script && script.length>0)?script[0].src:null;
		let path = fullPath?fullPath.substring(0,fullPath.lastIndexOf(MODULE_NAME)+MODULE_NAME.length+1):"/";
		console.debug("Module path: ", path);
		return path;
	}
	
	static unfulfilledRollsEnabled(){
		return game.modules.get("unfulfilled-rolls")?.active ? true : false;
	}

	static htmlToElement(html) {
		var template = document.createElement('template');
		html = html.trim();
		template.innerHTML = html;
		return template.content.firstChild;
	}

	static findSpeaker(name) {
		var mySpeaker;
		var speakerTypeMessage;
		if (name) {
			var myToken = canvas.tokens.ownedTokens.find(t => t.name == name);
			var myScene = game.scenes.get(game.user.viewedScene);
			var myActor = game.actors.getName(name);
			if (myToken) {
				mySpeaker = ChatMessage.getSpeaker({ token: myToken });
				speakerTypeMessage = "[GoDiceRoll] Owned token with name " + name + " found, using for chat message."
			} else if (myScene && myActor) {
				mySpeaker = ChatMessage.getSpeaker({ scene: myScene, actor: myActor });
				speakerTypeMessage = "[GoDiceRoll] Actor with name " + name + " found, using for chat message."
			} else {
				mySpeaker = ChatMessage.getSpeaker({ user: game.user });
				mySpeaker.alias = event.name;
				speakerTypeMessage = "[GoDiceRoll] No token or actor with name " + name + " found, using player with alias for chat message."
			}
		}else{
			mySpeaker = ChatMessage.getSpeaker({ actor: canvas.tokens.controlled[0].name });
			mySpeaker.alias = canvas.tokens.controlled[0].name;
			name = mySpeaker.alias 
			speakerTypeMessage = "[GoDiceRoll] Selected token with name " + name + " found, using for chat message."
		}
		console.log("[GoDiceRoll] Received dice roll with alias " + name + ".");
		console.log(speakerTypeMessage);
		return mySpeaker;
	}

	static showRoll(diceId, value, rollEvent) {
		Utils.handleRoll(diceId, value, rollEvent);
	}

	static handleRoll(diceId, value, rollEvent) {
		let dieType  = connectedDice.get(diceId).getDieType(true);
		let dieColor = connectedDice.get(diceId).getDieColor(true);
		let dieFaces = connectedDice.get(diceId).getDieFaces();
		console.log(rollEvent + " event: ", dieType, dieColor, value);
		
		if(value === 1)
			connectedDice.get(diceId).pulseLed(5, 30, 20, [255, 0, 0]);
		if(value === dieFaces)
			connectedDice.get(diceId).pulseLed(5, 30, 20, [0, 255, 0]);
		
		let diceRollsPrompt = document.querySelectorAll('form[id^="roll-resolver"');
		
		if (RollResult.isEnabled() && diceRollsPrompt && diceRollsPrompt.length > 0){
			Utils.populateRollPrompt(diceRollsPrompt, dieType, value);
		}else{
			//Utils.startTimeout(dieType, dieFaces, value);
			console.log("No Dice Prompt available");
		}
	}
	
	static populateRollPrompt(diceRollsPrompt, dieType, value) {
				
		let diceRolls = diceRollsPrompt[0].querySelectorAll('input[data-die="'+dieType.toLowerCase()+'"]')
		if(!diceRolls || diceRolls.length == 0)	{
			console.log("No roll required for the type "+dieType.toLowerCase());
			return;
		}
		let flagAssigned = false;
		for(let r=0;r<diceRolls.length && !flagAssigned; r++) {
			if(!diceRolls[r]?.value)
			{
				diceRolls[r].value = parseInt(value);
				Utils.rollFieldUpdate(diceRollsPrompt, diceRolls[r]);	
				flagAssigned = true;
			}
		}
	}
	
	static rollFieldUpdate(diceRollsPrompt, dieField){
		console.debug(dieField);
		let remainRolls = parseInt(diceRollsPrompt[0].getAttribute("data-counter"));
		
		dieField.setAttribute('readonly', true);
		dieField.parentElement.classList.add("fulfilled")
		
		remainRolls--;
		diceRollsPrompt[0].setAttribute("data-counter", remainRolls);
		
		Utils.sendRolls(diceRollsPrompt);
	}
	
	static sendRolls(diceRollsPrompt){
		let remainRolls = parseInt(diceRollsPrompt[0].getAttribute("data-counter"));	
		if(remainRolls<=0 && RollResult.isAutoSendEnabled()) {
			diceRollsPrompt[0].querySelectorAll("#roll_submit")[0].click();
		}	
	}
	
	static startTimeout(dieType, dieFaces, value) {		
		let die = rolledDice.get(dieType);
		if(die){
			die.number = die.number + 1;
		}else{
			if(advdis_modifier.length>0)
				die = new Die({number:1, faces:dieFaces, modifiers:[advdis_modifier]});	
			else
				die = new Die({number:1, faces:dieFaces});
		}
		if(parseInt(value) < 0)
			value = 1;
		die.results.push({result:parseInt(value), active:true});
		rolledDice.set(dieType,die);
		
		let bar = document.querySelectorAll("#round-time-bar");
		bar[0].classList.remove("round-time-bar");
		bar[0].offsetWidth;
		bar[0].classList.add("round-time-bar");
		rollTimer = setTimeout(Utils.rollDice, ROLLED_TIMEOUT);
	}
	
	static rollDice() {	
		let plus = new OperatorTerm({operator: "+"});
		let terms=[];
		
		plus._evaluated = true;
		rolledDice.forEach((die, diceId) => {
			console.debug("Evaluate terms for ", diceId, " dice");
			die._evaluateModifiers();
			die._evaluated = true;
			if(terms.length>0)
				terms.push(plus);
			terms.push(die);
		});
		if(terms.length > 0) {
			let termMod = new NumericTerm({number:godiceroll_modifier});
			termMod._evaluated = true;
			if(godiceroll_modifier>0)
			{
				terms.push(plus);
				terms.push(termMod);
			}else if(godiceroll_modifier<0){
				terms.push(termMod);
			}
			
			let r = Roll.fromTerms(terms);
			r.toMessage({flavor:"<b style =\"font-size:1.5em\">GoDiceRoll</b>"});
		}
		rolledDice.clear();
	}

	static setDiceBarMaxSlots() {
		let r = document.querySelector(':root');
		r.style.setProperty('--dicebar-slots', parseInt(connectedDice.size) + 1);
	}
	
	static setCookie(cname, cvalue, exdays) {
		 const d = new Date();
		 d.setTime(d.getTime() + (exdays*24*60*60*1000));
		 let expires = "expires="+ d.toUTCString();
		 document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
	}
	
	static getCookie(name) {
	    var cname = name + "=";
	    var decodedCookie = decodeURIComponent(document.cookie);
	    var ca = decodedCookie.split(';');
	    for(var i = 0; i < ca.length; i++){
	        var c = ca[i];
	        while(c.charAt(0) == ' '){
	            c = c.substring(1);
	        }
	        if(c.indexOf(cname) == 0){
	            return c.substring(cname.length, c.length);
	        }
	    }
	    return "";
	}
	
	static  injectScript(scripts) {
		if (scripts.length === 0) {
			return;
		}
		let nextScript = scripts.shift();
		let s = document.createElement('script');
		s.src = Utils.getModulePath()+nextScript.src;
		s.defer = true;
		if (nextScript.type !== undefined) {
			s.setAttribute('type', nextScript.type);
		}
		s.onload= function(){
			console.log("finished injecting ", nextScript.src);
			Utils.injectScript(scripts);
		};
		console.debug("attempting to append ", nextScript.src);
		let scriptsSec = document.head.querySelectorAll("script");
		if(scriptsSec.length > 0){
			scriptsSec[scriptsSec.length-1].after(s);
		}else{
			document.head.appendChild(s)
		}			
		//(document.head || document.documentElement).appendChild(s);
	}
	
	static  injectStylesheet(stylesheet) {
		if (stylesheet.length === 0) {
			return;
		}
		stylesheet.forEach((nextStylesheet)=>{
			let l = document.createElement('link');
			l.rel = "stylesheet";
			l.type = "text/css";
			l.href = Utils.getModulePath()+nextStylesheet;
			l.media = "all";
			console.debug("attempting to append ", nextStylesheet);
			let links = document.head.querySelectorAll("link");
			if(links.length > 0){
				links[links.length-1].after(l);
			}else{
				document.head.prepend(l)
			}
			//(document.head || document.documentElement).appendChild(l);
		});
	}
	
	static registerHBhelper(){
		Handlebars.registerHelper('eq', (a, b) => a == b);
		Handlebars.registerHelper('noteq', (a, b) => a != b);
	}
	
	static getDiceIcons(dieType){
			return new GoDiceExt().diceIcons[dieType];
	}
	
	static getDiceImage(dieType){
			return new GoDiceExt().diceImages[dieType];
		}	
}