/** DiceRoller.js - DDB dice rolling functions */

const allDiceRegex = /\d+d(?:100|20|12|10|8|6|4)(?:kh\d+|kl\d+|ro(<|<=|>|>=|=)\d+)*/g; // ([numbers]d[diceTypes]kh[numbers] or [numbers]d[diceTypes]kl[numbers]) or [numbers]d[diceTypes]
const rpgDiceRegex = /\d+d(?:\d+)(?:kh\d+|kl\d+|ro(<|<=|>|>=|=)\d+)*/g; 
const godiceConstRegex =  /[+-]{0,1}\d+/g; 
const validExpressionRegex = /^[dkhlro<=>\s\d+\-\(\)]*$/g; // any of these [d, kh, kl, spaces, numbers, +, -] // Should we support [*, /] ?
const validModifierSubstitutions = /(?<!\w)(str|dex|con|int|wis|cha|pb)(?!\w)/gi // case-insensitive shorthand for stat modifiers as long as there are no letters before or after the match. For example `int` and `STR` would match, but `mint` or `strong` would not match.
const diceRollCommandRegex = /^\/(r|roll|save|hit|dmg|skill|heal)\s/; // matches only the slash command. EG: `/r 1d20` would only match `/r`
const multiDiceRollCommandRegex = /\/(ir|r|roll|save|hit|dmg|skill|heal) [^\/]*/g; // globally matches the full command. EG: `note: /r 1d20 /r2d4` would find ['/r 1d20', '/r2d4']
const allowedExpressionCharactersRegex = /^(d\d|\d+d\d+|kh\d+|kl\d+|ro(<|<=|>|>=|=)\d+|\+|-|\d+|\s+|STR|str|DEX|dex|CON|con|INT|int|WIS|wis|CHA|cha|PB|pb)*/; // this is explicitly different from validExpressionRegex. This matches an expression at the beginning of a string while validExpressionRegex requires the entire string to match. It is also explicitly declaring the modifiers as case-sensitive because we can't search the entire thing as case-insensitive because the `d` in 1d20 needs to be lowercase.

class DiceRoll {
    // `${action}: ${rollType}` is how the gamelog message is displayed

    // don't allow changing these. They can only be set from within the constructor.
    #fullExpression = "";
    get expression() { return this.#fullExpression; }

    #individualDiceExpressions = [];
    get diceExpressions() { return this.#individualDiceExpressions; }

    #calculatedExpressionConstant = 0;
    get calculatedConstant() { return this.#calculatedExpressionConstant; }

    #separatedDiceToRoll = {};
    get diceToRoll() { return this.#separatedDiceToRoll; }

    // these can be changed after the object is constructed.

    #diceAction;        // "Rapier", "Fire Bolt", etc. defaults to "custom"
    get action() { return this.#diceAction }
    set action(newAction) {
        if (typeof newAction !== "string" || (/^\s*$/).test(newAction)) { // any empty strings or strings with only whitespace should be set to undefined
            this.#diceAction = undefined;
        } else {
            this.#diceAction = newAction.trim();
        }
    }
    #diceRollType; // "To Hit", "Damage", etc. defaults to "roll"
    get rollType() { return this.#diceRollType }
    set rollType(newRollType) {
        if (typeof newRollType !== "string") {
            this.#diceRollType = undefined;
            return;
        }
        try {
            let alteredRollType = newRollType.trim().toLowerCase().replace("-", " ");
            const validRollTypes = ["to hit", "damage", "save", "check", "heal", "reroll", "initiative", "attack", "roll", "recharge"];
            if (validRollTypes.includes(alteredRollType)) {
                this.#diceRollType = alteredRollType;
            } else {
                console.warn(`not setting rollType. Expected one of ${JSON.stringify(validRollTypes)}, but received "${newRollType}"`);
            }
        } catch (error) {
            console.warn("DiceRoll set rollType failed", error);
            this.#diceRollType = undefined;
        }
    }

    name;       // monster name, player name, etc.
    avatarUrl;  // the url of the image to render in the gamelog message

    entityType; // "character", "monster", etc
    entityId;   // the id of the character, monster, etc

    #sendTo;     // "Self", "Everyone", undefined.
    get sendToOverride() { return this.#sendTo }
    set sendToOverride(newValue) {
        if (["Self", "Everyone", "DungeonMaster"].includes(newValue)) {
            this.#sendTo = newValue;
        } else {
            this.#sendTo = undefined;
        }
    }


    // DDB parses the object after we give it back to them.
    // expressions that are more complex tend to have incorrect expressions displayed because DDB handles that.
    // We need to adjust the outgoing message according to how we expect DDB to parse it
    isComplex() {
        if (this.diceExpressions.length !== 1) {
            return true; // more than 1 expression messes with the parsing that DDB does
        }

        if (this.expression.includes("ro")) {
            return true; // reroll requires us to roll double the amount of dice, but then strip half the results based on the specified reroll rule
        }

        if (this.expression.indexOf(this.diceExpressions[0]) !== 0) {
            return true; // 1-1d4 messes with the parsing that DDB does, but 1d4-1 is just fine
        }

        let advantageMatch = this.diceExpressions[0].match(/kh\d+/g);
        if (this.diceExpressions[0].split('d')[0] > 2 && advantageMatch?.length == 1 || advantageMatch?.length > 1 || (advantageMatch?.length === 1 && !this.diceExpressions[0].endsWith("kh1"))) {
            // anything other than kh1 is complex. Such as kh10 or kh2
            return true;
        }
        let disAdvantageMatch = this.diceExpressions[0].match(/kl\d+/g);
        if (this.diceExpressions[0].split('d')[0] > 2 && disAdvantageMatch?.length == 1 || disAdvantageMatch?.length > 1 || (disAdvantageMatch?.length === 1 && !this.diceExpressions[0].endsWith("kl1"))) {
            // anything other than kl1 is complex. Such as kl10 or kl2
            return true;
        }



        // not sure what else to look for yet, but this appears to be something like "1d20", "1d20-1", "2d20kh1+3". all of which are correctly parsed by DDB
        return false;
    }

    isAdvantage() {
        return !this.isComplex() && this.expression.startsWith("2d") && this.diceExpressions[0].endsWith("kh1");
    }

    isDisadvantage() {
        return !this.isComplex() && this.expression.startsWith("2d") && this.diceExpressions[0].endsWith("kl1");
    }

    /**
     *
     * @param expression {string} dice expression to parse and roll. EG: "1d20+4". This is the only required value
     * @param action {string|undefined} the action this roll represents. EG: "Rapier", "Fire Bolt", "dex", etc. defaults to "custom"
     * @param rollType {string|undefined} the type of roll this is. EG: "to hit", "damage", "save" etc. defaults to "roll"
     * @param name {string|undefined} the name of the creature/player associated with this roll. This is displayed above the roll box in the gamelog. The character sheet defaults to the PC.name, the encounters page defaults to ""
     * @param avatarUrl {string|undefined} the url for the image to be displayed in the gamelog. This is displayed to the left of the roll box in the gamelog. The character sheet defaults to the PC.avatar, the encounters page defaults to ""
     * @param entityType {string|undefined} the type of entity associated with this roll. EG: "character", "monster", "user" etc. Generic rolls from the character sheet defaults to "character", generic rolls from the encounters page defaults to "user"
     * @param entityId {string|undefined} the id of the entity associated with this roll. If {entityType} is "character" this should be the id for that character. If {entityType} is "monster" this should be the id for that monster. If {entityType} is "user" this should be the id for that user.
     * @param sendToOverride {string|undefined} if undefined, the roll will go to whatever the gamelog is set to.
     */
    constructor(expression, action = undefined, rollType = undefined, name = undefined, avatarUrl = undefined, entityType = undefined, entityId = undefined, sendToOverride = undefined, damageType = undefined) {

        let parsedExpression = expression.replaceAll(/\s+/g, "").replaceAll(/^(d\d+)|([+-])(d\d+)/g, '$21$1$3');; // remove all spaces and 1's to d6 -> 1d6, d8 -> 1d8 etc.

        if (!parsedExpression.match(validExpressionRegex)) {
            console.warn("Not parsing expression because it contains an invalid character", expression);          
            $('#chat-text:focus').addClass("chat-error-shake");
            $('.chat-text-wrapper').attr('data-content',`Invalid roll. Hover the input to see valid formats`);
            $('.chat-text-wrapper').addClass('invalidExpression');
           
            setTimeout(function () {
                 $('#chat-text:focus').removeClass("chat-error-shake");
            }, 150);

            setTimeout(function () {
                  $('.chat-text-wrapper').removeClass('invalidExpression');
            }, 3000);

            throw new Error("Invalid Expression");
        }

        // find all dice expressions in the expression. converts "1d20+1d4" to ["1d20", "1d4"]
        let separateDiceExpressions = parsedExpression.match(allDiceRegex);
		if(window.EXPERIMENTAL_SETTINGS['rpgRoller'] == true || window.EXPERIMENTAL_SETTINGS['godiceRoller'] == true){
            separateDiceExpressions = parsedExpression.match(rpgDiceRegex);
        }
		if (!separateDiceExpressions && window.EXPERIMENTAL_SETTINGS['godiceRoller'] == true) {
			separateDiceExpressions = parsedExpression.match(godiceConstRegex);
		}
        if (!separateDiceExpressions) {
            console.warn("Not parsing expression because there are no valid dice expressions within it", expression);
            $('#chat-text:focus').addClass("chat-error-shake");
            $('.chat-text-wrapper').attr('data-content',`Invalid roll. Hover the input to see valid formats`);
            $('.chat-text-wrapper').addClass('invalidExpression');
           
            setTimeout(function () {
                 $('#chat-text:focus').removeClass("chat-error-shake");
            }, 150);
            setTimeout(function () {
                  $('.chat-text-wrapper').removeClass('invalidExpression');
            }, 3000);
            throw new Error("Invalid Expression");
        }
         $('.chat-text-wrapper').removeClass('invalidExpression');

        this.#fullExpression = parsedExpression;
        this.#individualDiceExpressions = separateDiceExpressions;

        this.action = action;
        this.rollType = rollType;
        this.sendToOverride = sendToOverride;
        this.damageType = damageType;
        if (name) this.name = name;
        if (avatarUrl) this.avatarUrl = avatarUrl;
        if (entityType) this.entityType = entityType;
        if (entityId) this.entityId = entityId;

        // figure out what constants we need to add or subtract. For example 1d20+4 has a constant of +4. 1d20+1+1d4-3 has a constant of -2/
        let strippedExpression = this.expression.toString() // make sure we use a copy of it
        this.#individualDiceExpressions.forEach(diceExpression => {
            strippedExpression = strippedExpression.replace(diceExpression, "");
        });
        let constantEquation = strippedExpression
            .match(/[+\-]\d+/g) // find any numbers preceded by [+, -] // Should we support [*, /] ?
            ?.reduce((total, current) => total + current); // combine anything we find into a single string; ex: "-2+3"
        if (constantEquation) {
            let calculatedConstant = parseInt(eval(constantEquation.toString())); // execute the equation to get a single number
            if (!isNaN(calculatedConstant)) {
                this.#calculatedExpressionConstant = calculatedConstant;
            }
        }

        // figure out how many of each DiceType we need to roll
        this.#individualDiceExpressions.forEach(diceExpression => {
            let diceType = diceExpression.match(/d\d+/g);
            let numberOfDice = parseInt(diceExpression.split("d")[0]);
            if (diceExpression.includes("ro")) {
                console.debug("diceExpression: ", diceExpression, ", includes reroll so we're doubling the number of dice for", diceType, ", numberOfDice before doubling: ", numberOfDice);
                numberOfDice = numberOfDice * 2;
            }
            console.debug("diceExpression: ", diceExpression, ", diceType: ", diceType, ", numberOfDice: ", numberOfDice);
            if (this.#separatedDiceToRoll[diceType] === undefined) {
                this.#separatedDiceToRoll[diceType] = numberOfDice;
            } else {
                this.#separatedDiceToRoll[diceType] += numberOfDice;
            }
        });
    }

    /**
     * @param slashCommandText {string} the slash command to parse and roll. EG: "/hit 2d20kh1+4 Shortsword". This is the only required value
     * @param name {string|undefined} the name of the creature/player associated with this roll. This is displayed above the roll box in the gamelog. The character sheet defaults to the PC.name, the encounters page defaults to ""
     * @param avatarUrl {string|undefined} the url for the image to be displayed in the gamelog. This is displayed to the left of the roll box in the gamelog. The character sheet defaults to the PC.avatar, the encounters page defaults to ""
     * @param entityType {string|undefined} the type of entity associated with this roll. EG: "character", "monster", "user" etc. Generic rolls from the character sheet defaults to "character", generic rolls from the encounters page defaults to "user"
     * @param entityId {string|undefined} the id of the entity associated with this roll. If {entityType} is "character" this should be the id for that character. If {entityType} is "monster" this should be the id for that monster. If {entityType} is "user" this should be the id for that user.
     * @param sendToOverride {string|undefined} if undefined, the roll will go to whatever the gamelog is set to.
     */
    static fromSlashCommand(slashCommandText, name = undefined, avatarUrl = undefined, entityType = undefined, entityId = undefined, sendToOverride = undefined) {
        let modifiedSlashCommand = replaceModifiersInSlashCommand(slashCommandText, entityType, entityId);
        let slashCommand = modifiedSlashCommand.match(diceRollCommandRegex)?.[0];
        let expression = modifiedSlashCommand.replace(diceRollCommandRegex, "").match(allowedExpressionCharactersRegex)?.[0];
        let action = modifiedSlashCommand.replace(diceRollCommandRegex, "").replace(allowedExpressionCharactersRegex, "");
        console.debug("DiceRoll.fromSlashCommand text: ", slashCommandText, ", slashCommand:", slashCommand, ", expression: ", expression, ", action: ", action);
        let rollType = undefined;
        let damageType = undefined;
        if (slashCommand.startsWith("/r")) {
            // /r and /roll allow users to set both the action and the rollType by separating them with `:` so try to parse that out
            [action, rollType] = action.split(":") || [undefined, undefined];
            const damageRegex = /([\s]+)?damage/gi;
            if(rollType?.match(damageRegex)){
                [damageType, rollType] = [rollType.replaceAll(damageRegex, ''), 'damage'];
            }
        } else if (slashCommand.startsWith("/hit")) {
            rollType = "to hit";
        } else if (slashCommand.startsWith("/dmg")) {
            [action, damageType] = action.split(":") || [action, undefined];
            rollType = "damage";
        } else if (slashCommand.startsWith("/skill")) {
            rollType = "check";
        } else if (slashCommand.startsWith("/save")) {
            rollType = "save";
        } else if (slashCommand.startsWith("/heal")) {
            rollType = "heal";
        }
        return new DiceRoll(expression, action, rollType, name, avatarUrl, entityType, entityId, sendToOverride, damageType);
    }
}
function getRollData(rollButton){
    let expression = '';
    let rollType = 'custom';
    let rollTitle = 'AboveVTT';
    let damageType = undefined;
    if($(rollButton).find('.ddbc-damage__value, .ct-spell-caster__modifier-amount').length>0){
      expression = $(rollButton).find('.ddbc-damage__value, .ct-spell-caster__modifier-amount').text().replace(/\s/g, '');
      if($(rollButton).find('.ct-spell-caster__modifier-amount').length>0){
        rollType ='damage';
        rollTitle = $(rollButton).closest('[class*="styles_content"]')?.find('[class*="styles_spellName"]')?.text() || rollTitle;
        damageType = $(rollButton).next()?.find('[class*="damage-type"][aria-label]')?.attr('aria-label')?.replace(' damage', '') || damageType;
      }
    }
    else if($(rollButton).find('.ddbc-signed-number').length>0){
      expression = `1d20${$(rollButton).find('.ddbc-signed-number').attr('aria-label').replace(/\s/g, '')}`;
    }
    else if($(rollButton).find('.ddbc-healing-icon').length > 0){
      expression = $(rollButton).text().replace(/\s/g, '');
    }
    else if($(rollButton).find('[class*="styles_numberDisplay"]').length > 0){
      expression = `1d20${$(rollButton).text().replace(/\s/g, '')}`;
    }
    else if($(rollButton).hasClass('avtt-roll-button')){
      expression = `${$(rollButton).attr('data-exp')}${$(rollButton).attr('data-mod')}`
      rollTitle = $(rollButton).attr('data-actiontype');
      rollType = $(rollButton).attr('data-rolltype');;
    }
    if($(rollButton).hasClass('avtt-roll-formula-button')){
      let slashCommand = DiceRoll.fromSlashCommand($(rollButton).attr('data-slash-command'))
      expression = slashCommand.expression;
      damageType = slashCommand.damageType;
      let title = $(rollButton).attr('title').split(':');
      if(title != undefined && title[0] != undefined){
        rollTitle = title[0];
      }
      if(title != undefined && title[1] != undefined){
        rollType = title[1];
      }  
    }
    if(expression == ''){
      return {
        expression: undefined,
      }
    }


    if($(rollButton).parents(`[class*='saving-throws-summary']`).length > 0){
      rollType = 'save'
      rollTitle = $(rollButton).closest(`.ddbc-saving-throws-summary__ability`).find('.ddbc-saving-throws-summary__ability-name abbr').text();
    } else if($(rollButton).parents(`[class*='ability-summary']`).length > 0){
      rollType = 'check'
      rollTitle = $(rollButton).closest(`.ddbc-ability-summary`).find('.ddbc-ability-summary__abbr').text();
    } else if($(rollButton).parents(`[class*='skills__col']`).length > 0){
      rollType = 'check';
      rollTitle = $(rollButton).closest(`.ct-skills__item`).find('.ct-skills__col--skill').text();
    } else if($(rollButton).parents(`[class*='initiative-box']`).length > 0 || $(rollButton).parents(`.ct-combat__summary-group--initiative`).length > 0){
      rollTitle = 'Initiative';
      rollType = 'roll'
    } else if($(rollButton).parents(`[class*='__damage']`).length > 0){
      rollType = 'damage'
      if($(rollButton).parents(`[class*='damage-effect__healing']`).length > 0){
        rollType = 'heal'
      }
    } else if($(rollButton).parents(`[class*='__tohit']`).length > 0){
      rollType = 'to hit'
    } 
    if(rollType == 'damage' || rollType == 'attack' || rollType == 'to hit' || rollType == 'heal'){
      if($(rollButton).parents(`.ddbc-combat-attack--spell`).length > 0){
        rollTitle = $(rollButton).closest(`.ddbc-combat-attack--spell`).find('[class*="styles_spellName"]').text();
      }
      else if($(rollButton).parents(`.ct-spells-spell`).length > 0){
        rollTitle = $(rollButton).closest(`.ct-spells-spell`).find('[class*="styles_spellName"]').text();
      }
      else if($(rollButton).parents(`.ddbc-combat-action-attack-weapon`).length > 0){
        rollTitle = $(rollButton).closest(`.ddbc-combat-action-attack-weapon`).find('.ddbc-action-name, [class*="styles_actionName"]').text();
      }
      else if($(rollButton).parents(`.ddbc-combat-attack--item`).length > 0){
        rollTitle = $(rollButton).closest(`.ddbc-combat-attack--item`).find('.ddbc-item-name, [class*="styles_itemName"]').text();
      }
      else if($(rollButton).parents(`.ddbc-combat-action-attack-general`).length > 0){
        rollTitle = $(rollButton).closest(`.ddbc-combat-action-attack-general`).find('.ddbc-action-name, [class*="styles_actionName"]').text();
      }
    }
    
    let roll = new rpgDiceRoller.DiceRoll(expression); 
    let regExpression = new RegExp(`${expression.replace(/[+-]/g, '\\$&')}:\\s`);
    let modifier = (roll.rolls.length > 1 && expression.match(/[+-]\d*$/g)) ? `${roll.rolls[roll.rolls.length-2]}${roll.rolls[roll.rolls.length-1]}` : '';

    if(rollType == 'damage'){
        if((window.CHARACTER_AVTT_SETTINGS?.damageRoll?.match(allDiceRegex) || !isNaN(parseInt(window.CHARACTER_AVTT_SETTINGS?.damageRoll.replace('PB', getPB())))))
            expression = `${expression}${window.CHARACTER_AVTT_SETTINGS.damageRoll.match(/[+-]/g) ? '': '+'}${window.CHARACTER_AVTT_SETTINGS.damageRoll.replace('PB', getPB())}`;
        if(typeof window.rollBuffs != 'undefined'){
            for(let i in window.rollBuffs){
                if(Array.isArray(window.rollBuffs[i]) && buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].dmg != '0'){

                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].dmg.replace('PB', getPB())}`
                }
                else if(buffsDebuffs[window.rollBuffs[i]].dmg != '0'){
                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i]].dmg.replace('PB', getPB())}`
                }
            }
        }
        roll = new rpgDiceRoller.DiceRoll(expression); 
        modifier = (roll.rolls.length > 1 && expression.match(/[+-]\d*$/g)) ? `${roll.rolls[roll.rolls.length-2]}${roll.rolls[roll.rolls.length-1]}` : '';
    }
    else if(rollType == 'to hit' || rollType == 'attack'){
        if(window.CHARACTER_AVTT_SETTINGS?.hitRoll?.match(allDiceRegex) || !isNaN(parseInt(window.CHARACTER_AVTT_SETTINGS?.hitRoll.replace('PB', getPB()))))
            expression = `${expression}${window.CHARACTER_AVTT_SETTINGS.hitRoll.match(/[+-]/g) ? '': '+'}${window.CHARACTER_AVTT_SETTINGS.hitRoll.replace('PB', getPB())}`;
        if(typeof window.rollBuffs != 'undefined'){
            for(let i in window.rollBuffs){
                if(Array.isArray(window.rollBuffs[i]) && buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].tohit != '0'){
                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].tohit.replace('PB', getPB())}`
                }
                else if(buffsDebuffs[window.rollBuffs[i]].tohit != '0'){
                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i]].tohit.replace('PB', getPB())}`
                }
            }
        }
        roll = new rpgDiceRoller.DiceRoll(expression); 
        modifier = (roll.rolls.length > 1 && expression.match(/[+-]\d*$/g)) ? `${roll.rolls[roll.rolls.length-2]}${roll.rolls[roll.rolls.length-1]}` : '';
    }
    else if(rollType == 'check'){
        if(window.CHARACTER_AVTT_SETTINGS?.checkRoll?.match(allDiceRegex) || !isNaN(parseInt(window.CHARACTER_AVTT_SETTINGS?.checkRoll.replace('PB', getPB()))))
            expression = `${expression}${window.CHARACTER_AVTT_SETTINGS.checkRoll.match(/[+-]/g) ? '': '+'}${window.CHARACTER_AVTT_SETTINGS.checkRoll.replace('PB', getPB())}`;
        if(typeof window.rollBuffs != 'undefined'){
            for(let i in window.rollBuffs){
                if(Array.isArray(window.rollBuffs[i]) && buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].check != '0'){
                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].check.replace('PB', getPB())}`
                }
                else if(buffsDebuffs[window.rollBuffs[i]].check != '0'){
                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i]].check.replace('PB', getPB())}`
                }
            }
        }
        roll = new rpgDiceRoller.DiceRoll(expression); 
        modifier = (roll.rolls.length > 1 && expression.match(/[+-]\d*$/g)) ? `${roll.rolls[roll.rolls.length-2]}${roll.rolls[roll.rolls.length-1]}` : '';
    }
     else if(rollType == 'save'){
        if(window.CHARACTER_AVTT_SETTINGS?.saveRoll?.match(allDiceRegex) || !isNaN(parseInt(window.CHARACTER_AVTT_SETTINGS?.saveRoll.replace('PB', getPB()))))
            expression = `${expression}${window.CHARACTER_AVTT_SETTINGS.saveRoll.match(/[+-]/g) ? '': '+'}${window.CHARACTER_AVTT_SETTINGS.saveRoll.replace('PB', getPB())}`;
        if(typeof window.rollBuffs != 'undefined'){
            for(let i in window.rollBuffs){
                if(Array.isArray(window.rollBuffs[i]) && buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].save != '0'){
                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i][0]].multiOptions[window.rollBuffs[i][1]].save.replace('PB', getPB())}`
                }
                else if(buffsDebuffs[window.rollBuffs[i]].save != '0'){
                    expression = `${expression}${buffsDebuffs[window.rollBuffs[i]].save.replace('PB', getPB())}`
                }
            }
        }
        roll = new rpgDiceRoller.DiceRoll(expression); 
        modifier = (roll.rolls.length > 1 && expression.match(/[+-]\d*$/g)) ? `${roll.rolls[roll.rolls.length-2]}${roll.rolls[roll.rolls.length-1]}` : '';
    }
    
    const followingText = $(rollButton)[0].nextSibling?.textContent?.trim()?.split(' ')[0]
    damageType = followingText && window.ddbConfigJson.damageTypes.some(d => d.name.toLowerCase() == followingText.toLowerCase()) ? followingText : damageType;     

    return {
      roll: roll,
      expression: expression,
      rollType: rollType,
      rollTitle: rollTitle,
      modifier: modifier,
      regExpression: regExpression,
      damageType: damageType
    }
}
class DiceRoller {

    timeoutDuration = 10000; // 10 second timeout seems reasonable. If the message gets dropped we don't want to be stuck waiting forever.

    /// PRIVATE VARIABLES
    #pendingDiceRoll = undefined;
    #pendingMessage = undefined;
    #timeoutId = undefined;
    #multirollTimeout = undefined;
    #multiRollArray = [];
    #critAttackAction = undefined;
    #pendingCritRange = undefined;
    #pendingCritType = undefined;
    #pendingSpellSave = undefined;
    #pendingDamageType = undefined;
    #pendingCrit = undefined;

    /** @returns {boolean} true if a roll has been or will be initiated, and we're actively waiting for DDB messages to come in so we can parse them */
    get #waitingForRoll() {
        // we're about to roll dice so we need to know if we should capture DDB messages.
        // This also blocks other attempts to roll until we've finished processing
        return this.#timeoutId !== undefined;
    }

    constructor() {
        const key = Symbol.for('@dndbeyond/message-broker-lib');
        if (key) {
            this.ddbMB = window[key];
        } else {
            console.warn("DiceRoller failed to get Symbol.for('@dndbeyond/message-broker-lib')");
        }
        if (this.ddbMB) {
            // wrap the original dispatch function so we can block messages when we need to
            this.ddbDispatch = this.ddbMB.dispatch.bind(this.ddbMB);
            this.ddbMB.dispatch = this.#wrappedDispatch.bind(this);
        } else {
            console.warn("DiceRoller failed to get ddbMB");
        }
    }
    setPendingSpellSave(spellSaveText){
        this.#pendingSpellSave = spellSaveText;
    }
    setPendingDamageType(damageTypeText){
        this.#pendingDamageType = damageTypeText;
    }

    /// PUBLIC FUNCTIONS
    getDamageType(button){
      let damageTypeIcon = $(button).find(`.ddbc-damage__icon [class*='damage-type'][aria-label]`)  
      let damageTypeText;
      if(damageTypeIcon.length > 0){
        let typeLowerCase = damageTypeIcon.attr('aria-label').replace(' damage', '');
        damageTypeText = typeLowerCase.charAt(0).toUpperCase() + typeLowerCase.slice(1);;
      }else{
        let damageTypeTitle = $(button).find('.ddbc-tooltip[data-original-title]');
        if(damageTypeTitle.length > 0){
          damageTypeText = damageTypeTitle.attr('data-original-title')
        }

      }
      if(damageTypeText != undefined)
        window.diceRoller.setPendingDamageType(damageTypeText);
      return damageTypeText;
    }

    /**
     * Attempts to parse the expression, and roll DDB dice.
     * If dice are rolled, the results will be processed to make sure the expression is properly calculated.
     * @param diceRoll {DiceRoll} the dice expression to parse and roll. EG: 1d20+4
     * @returns {boolean} whether or not dice were rolled
     */
    async roll(diceRoll, multiroll = false, critRange = 20, critType = 2, spellSave = undefined, damageType=undefined, forceCritType = undefined) {
        try {
            if (diceRoll === undefined || diceRoll.expression === undefined || diceRoll.expression.length === 0) {
                console.warn("DiceRoller.parseAndRoll received an invalid diceRoll object", diceRoll);
                return false;
            }

            if (this.#waitingForRoll && !multiroll) {
                console.warn("parseAndRoll called while we were waiting for another roll to finish up");
                return false;
            }
            else if(this.#waitingForRoll && multiroll){
                diceRoll.damageType = damageType;
                this.#multiRollArray.push(diceRoll);
                return;
            }
            let self = this;
            this.#timeoutId = setTimeout(function () {
                console.warn("DiceRoller timed out after 10 seconds!");
                self.#resetVariables();
            }, this.timeoutDuration);
            let msgdata = {}
			let roll = {};
			let logo = "";
			console.debug (diceRoll.expression);
			if (window.EXPERIMENTAL_SETTINGS['rpgRoller'] )
				roll=new rpgDiceRoller.DiceRoll(diceRoll.expression); 
			//Show GoDice Popup if enabled
			if(window.EXPERIMENTAL_SETTINGS['godiceRoller'] == true) {
				forceCritType = Number(window.CHARACTER_AVTT_SETTINGS.crit || 0);
				critRange = Number(window.CHARACTER_AVTT_SETTINGS.critRange || 20);
				logo = 	`<svg width="60" viewBox="0 0 140 150" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M125.262 100.827C125.303 101.139 125.507 101.625 125.813 102.184C125.476 100.377 126.502 98.9224 125.465 97.7429C125.152 98.7393 125.082 99.7975 125.262 100.827ZM124.182 83.9363C125.262 84.6616 127.529 84.2267 129.823 84.0031C129.049 83.8667 125.518 83.4222 122.6 82.4173C123.327 83.2804 123.745 83.6663 124.184 83.9363H124.182ZM123.057 100.136C123.388 101.409 124.06 102.565 125 103.475C124.03 101.805 123.736 100.827 123.516 99.9627C123.343 99.0614 123.516 97.7429 123.822 96.9139C124.406 95.635 125.252 94.6656 126.79 93.1753C124.841 94.352 124.002 95.2873 123.213 97.053C122.986 97.5684 122.736 98.8242 123.057 100.136ZM127.778 86.3565C127.522 86.7041 123.432 85.8479 122.728 85.6652C121.951 85.4211 121.11 84.0058 120.812 83.6554C121.118 84.6616 121.91 85.837 122.283 86.0442C122.688 86.2078 126.129 86.8937 127.385 87.1173C126.969 88.0349 126.667 89.5416 126.832 90.0979C126.966 90.5192 127.385 91.0741 128.379 91.9631C128.156 91.7313 127.368 90.117 127.386 89.7815C127.358 89.1639 127.695 87.3273 128.379 86.7028C129.817 85.4756 131.416 84.7271 134.543 84.0017C131.982 84.1422 129.226 85.1798 127.787 86.3565H127.778ZM112.764 81.5843C112.764 82.8673 114.618 83.6936 116.018 84.1476C114.031 85.5302 113.258 86.7764 113.003 87.919C115.126 84.4585 118.141 84.0085 118.586 81.8965C117.661 81.5843 114.852 80.8889 113.756 80.893C113.409 80.8602 112.731 80.7839 112.772 81.5788L112.764 81.5843ZM118.782 53.3737L109.754 62.4995C109.745 62.8459 109.735 63.1926 109.724 63.5399L119.282 53.8782C119.282 53.8782 123.288 55.6575 123.434 55.5144C123.474 55.4288 123.479 55.3306 123.448 55.2412C123.417 55.1517 123.352 55.0784 123.268 55.0372L119.471 53.1842L117.649 49.3296C117.628 49.2873 117.6 49.2495 117.565 49.2183C117.531 49.1871 117.49 49.1632 117.446 49.1478C117.403 49.1325 117.356 49.1261 117.31 49.129C117.263 49.1318 117.218 49.144 117.176 49.1646C117.028 49.3187 118.79 53.3683 118.79 53.3683L118.782 53.3737ZM102.825 124.47C102.825 124.47 103.252 130.805 103.448 130.794C103.536 130.79 103.621 130.753 103.684 130.69C103.719 130.655 103.746 130.612 103.764 130.565C103.782 130.518 103.789 130.468 103.786 130.418L103.542 124.691L109.207 124.938C109.257 124.941 109.307 124.933 109.354 124.915C109.4 124.897 109.442 124.869 109.477 124.833C109.541 124.771 109.578 124.686 109.581 124.597C109.59 124.398 103.326 123.966 103.326 123.966L94.6142 115.159C94.4226 115.303 94.2297 115.445 94.0368 115.588L102.825 124.47ZM79.3451 7.74324C81.1148 9.68621 82.0779 9.48987 83.7006 9.59486C81.9875 8.66905 80.6063 8.66905 79.3451 7.74324ZM47.3314 97.2235C48.6074 107.604 63.8292 117.962 76.1362 122.744C88.4431 117.962 103.665 107.609 104.941 97.2235C106.395 75.8644 106.815 66.6595 106.815 50.8472C100.331 49.725 94.0827 53.1992 89.6396 54.8817C87.2116 55.8034 84.3534 56.4579 81.9686 55.3535C78.9256 53.9355 78.0124 51.3012 76.1362 49.725C74.2586 51.3012 73.3454 53.9355 70.3051 55.3535C67.9189 56.4579 65.0567 55.8034 62.6341 54.8817C58.1923 53.1992 51.9431 49.725 45.4591 50.8472C45.4591 66.6595 45.8773 75.8644 47.3314 97.2235ZM42.8005 124.834C42.8356 124.87 42.8778 124.898 42.9243 124.915C42.9708 124.933 43.0206 124.941 43.0703 124.938L48.7355 124.691L48.4927 130.418C48.4897 130.468 48.4973 130.518 48.5149 130.565C48.5326 130.612 48.56 130.655 48.5952 130.69C48.6576 130.754 48.7416 130.79 48.8299 130.793C49.0255 130.803 49.4545 124.47 49.4545 124.47L58.2369 115.595C58.0435 115.453 57.8515 115.311 57.6609 115.167L48.9486 123.967C48.9486 123.967 42.6926 124.398 42.6926 124.594C42.6968 124.685 42.7354 124.771 42.8005 124.834ZM33.6823 81.8842C34.1234 84.0031 37.1354 84.453 39.2612 87.9163C39.0049 86.7737 38.2333 85.5275 36.2478 84.1449C37.6466 83.6908 39.5039 82.8646 39.5012 81.5815C39.5417 80.7866 38.8632 80.863 38.5098 80.8902C37.4132 80.8834 34.6049 81.5788 33.6782 81.891L33.6823 81.8842ZM28.8318 55.5048C28.9775 55.6521 32.9836 53.8687 32.9836 53.8687L42.5402 63.529C42.5308 63.1813 42.52 62.8349 42.5105 62.4873L33.484 53.3655C33.484 53.3655 35.2443 49.3187 35.1026 49.1714C35.0609 49.1508 35.0156 49.1387 34.9693 49.1358C34.9229 49.1329 34.8765 49.1393 34.8326 49.1546C34.7887 49.17 34.7483 49.1939 34.7136 49.2251C34.6789 49.2563 34.6507 49.2941 34.6305 49.3364L32.7961 53.1746L29.0004 55.0276C28.9586 55.048 28.9212 55.0765 28.8903 55.1116C28.8594 55.1466 28.8356 55.1874 28.8203 55.2318C28.805 55.2761 28.7985 55.323 28.8012 55.3699C28.8039 55.4167 28.8156 55.4626 28.8358 55.5048H28.8318ZM25.4799 93.1753C27.0108 94.6656 27.8566 95.6295 28.4474 96.9139C28.7536 97.7429 28.9262 99.0614 28.7536 99.9627C28.5404 100.827 28.2464 101.805 27.2698 103.475C28.2103 102.565 28.8827 101.409 29.2122 100.136C29.5372 98.8187 29.2877 97.5684 29.0584 97.053C28.268 95.2873 27.4236 94.352 25.4799 93.1753ZM23.8855 86.7041C24.5694 87.3259 24.9066 89.1584 24.8797 89.7829C24.8958 90.117 24.1081 91.7313 23.8855 91.9645C24.881 91.0755 25.3005 90.5206 25.434 90.0992C25.5972 89.5429 25.2991 88.0363 24.881 87.1187C26.1368 86.895 29.5723 86.2092 29.981 86.0456C30.3547 85.8356 31.1464 84.663 31.454 83.6568C31.1613 84.0072 30.3128 85.4293 29.5359 85.6665C28.8345 85.8492 24.7421 86.7055 24.4858 86.3578C23.0466 85.1811 20.2908 84.1435 17.7226 84.0044C20.8479 84.7285 22.4477 85.4729 23.8855 86.7041ZM13.8177 86.2174C13.7131 86.3211 13.5972 86.4126 13.4724 86.4901C13.5425 85.6243 12.2409 84.3426 13.038 83.7631C13.2335 83.6488 13.4486 83.5729 13.672 83.5395C14.0767 83.4631 15.3931 83.4454 15.6332 83.7195C16.796 82.6082 19.4384 82.581 20.0845 82.6082C20.9513 82.7755 21.8072 82.9963 22.6473 83.2695C22.0295 82.8605 20.8034 82.4828 20.2841 82.2674C22.4423 82.4119 23.2152 81.0211 24.5627 80.7784C24.5523 81.2342 24.6105 81.6889 24.7353 82.1269C24.9053 81.0539 25.2438 80.4907 25.5905 80.2603C26.5158 79.8772 31.0695 79.7435 31.6873 79.9658C31.945 80.0626 32.2943 80.5466 32.44 80.7839C36.3773 79.0591 36.7887 78.6023 39.7683 78.256C40.2377 78.2355 41.1819 78.9173 41.6082 79.8635C42.1477 81.1957 42.5739 82.6532 38.5058 84.9712C39.5377 84.7639 40.9337 83.969 41.6082 83.3104C42.5119 82.446 43.4062 80.229 41.1806 78.256C40.7179 77.8156 39.0224 76.7684 32.7543 80.0912C32.5384 79.7285 32.297 79.4559 32.069 79.3645C31.495 79.3063 30.9181 79.2808 30.3412 79.2881C30.4949 78.1824 31.11 77.0793 31.11 77.0793C32.5492 75.2618 36.2478 74.9495 37.0962 74.7941C37.7558 74.7941 39.0049 74.9945 40.3564 75.1854C39.2612 74.7941 37.5683 74.5296 36.9667 74.5378C34.8194 74.7177 32.5331 75.0627 31.11 76.0921C30.2226 76.9323 29.6638 78.0672 29.5359 79.2895C28.5647 79.2977 27.5045 79.3318 26.6817 79.389V79.3645C26.9852 78.1824 27.1309 77.0793 28.0899 75.4963C29.0193 74.3441 35.9038 72.2239 39.1249 72.7175C39.7697 72.7175 41.1968 73.2915 42.9516 73.8819C42.9516 73.871 42.9516 73.8587 42.9516 73.8492C41.4935 73.0188 39.5916 72.3221 39.0076 72.3275C35.6354 71.7317 29.0409 73.7619 27.6205 75.135C26.6089 76.4426 26.3647 77.7256 25.8603 79.464C25.7631 79.4763 25.6755 79.4886 25.5999 79.5022C22.3465 79.1218 20.0507 77.7201 21.1136 74.7941C21.1106 75.3684 21.2883 75.9289 21.6209 76.3946C21.9535 76.8602 22.424 77.207 22.9643 77.3847C21.8677 76.313 20.5997 73.5779 23.2246 71.2927C22.1752 73.4742 22.9643 74.6168 23.3743 75.03C23.172 71.5681 25.9452 70.0996 28.245 68.7661C31.2236 67.178 34.3991 66.0004 37.687 65.2647L28.4325 55.9084L27.951 55.423L19.5598 64.4766L19.2617 64.1943C20.2571 63.1036 24.158 58.8099 28.0063 54.7631C29.0854 53.6369 30.1537 52.5256 31.1559 51.5112C31.2827 51.3844 31.4081 51.2562 31.5376 51.128C32.4346 50.2268 33.399 49.2778 34.3702 48.3261C38.2886 44.5179 42.4485 40.6592 43.6301 39.5534C43.7124 39.4743 43.7825 39.4171 43.8338 39.3598L44.113 39.6611L43.908 39.8547L35.023 48.2729L35.5019 48.7569L42.3743 55.7025C42.3338 52.6824 42.3163 49.5396 42.3163 46.1131C49.4652 44.8751 56.3539 48.7038 61.2502 50.5622C63.9223 51.5766 67.0773 52.2979 69.7075 51.0817L69.8114 51.0299C69.9401 50.771 70.0162 50.4886 70.0353 50.1995C69.6819 49.2069 69.3447 48.1216 69.0331 46.9271C68.6527 45.9141 68.1901 45.7409 67.37 45.9727C66.8304 46.1241 66.2909 46.5917 65.9267 47.0103C65.147 47.9007 65.0971 49.5737 65.1093 50.8104C62.7865 46.4799 65.9901 44.1729 65.5139 42.1468C63.3558 33.4872 53.4201 39.9529 52.3801 41.176C52.1225 40.6197 53.153 30.9757 56.7828 26.1176C51.5802 29.844 51.6571 39.5589 51.1001 41.6614C50.7777 36.4801 40.7678 24.0151 27.3926 31.6234C27.9227 30.7889 34.4403 22.9584 42.609 18.5884C33.4004 21.7463 27.8013 29.2141 26.2717 31.3002C31.3177 20.1292 22.5097 15.2861 19.5436 15.2861C21.3146 14.3793 24.0946 12.3668 31.8384 11.7083C27.3872 10.8997 20.9059 12.6804 18.7451 14.6425C16.4979 7.18422 6.08469 6.13297 0 6.53792C18.4793 1.47257 31.5214 8.40999 43.3994 15.1279H43.4075C45.5792 15.7605 49.8132 14.8647 49.8132 7.18012C51.6544 13.0527 48.0597 16.6495 50.2179 18.9252C55.2626 21.614 60.2426 23.8133 65.5085 24.5046C69.8073 24.9491 70.854 22.3462 70.6342 21.6072C70.4196 21.021 70.1584 20.4533 69.8532 19.9096C69.284 20.2751 68.5516 21.9126 68.4032 23.0661C67.8717 20.9418 68.0849 18.6634 68.592 16.4491C67.1798 17.4485 65.6488 19.4556 64.8678 20.8205C64.8678 19.4842 66.3313 15.8969 68.1941 12.6845C67.0611 13.0527 64.5374 14.2334 62.916 16.0837C63.9951 13.2967 67.1218 10.4689 69.462 9.01265C67.8717 9.34534 64.8678 10.3161 63.1575 11.621C64.416 9.49805 67.9904 7.34238 71.7443 6.54201C69.462 6.54201 66.3098 6.73426 64.2082 7.34238C66.0697 6.03479 68.9805 5.03399 74.9303 4.81993C73.9065 4.24454 69.3137 3.48507 65.9213 3.81913C68.592 2.72834 73.4573 2.63426 78.3523 4.15455C77.9032 3.40054 75.4429 1.06216 73.2847 0C75.8219 0.365415 79.712 2.48973 81.363 6.28295C81.4008 5.28488 81.2146 4.28408 80.613 3.01058C81.6031 3.97593 82.4151 5.40214 82.9857 7.55917C83.1961 7.07241 83.0787 6.28159 82.9857 5.67483C83.6445 6.66261 83.9993 7.82543 84.0054 9.01674C84.3224 9.14491 84.8956 9.15309 84.8147 9.68212C85.3151 9.39579 85.7845 10.0394 86.0287 10.3448C86.1636 10.5152 86.3443 10.6925 86.5601 10.5957C86.9054 10.4361 86.3618 9.01674 86.1123 8.34591C86.6802 8.80267 87.3425 9.34943 87.762 11.4138C88.114 11.6565 88.8734 13.0499 88.0628 15.421C87.762 16.0128 87.3425 16.2228 86.7719 16.6032C86.8178 16.4109 87.6109 15.1783 87.3114 14.3875C87.2545 14.123 87.1234 13.8806 86.9338 13.6894C86.8474 13.6199 86.3389 14.0385 85.4257 14.0003C85.7158 13.7821 86.1676 13.5381 86.2782 13.2395C86.1516 13.1893 86.0297 13.1277 85.914 13.0554C85.7454 13.1917 85.3893 13.6199 84.5652 13.579C84.8178 13.4137 85.0215 13.1823 85.1546 12.9095C85.0197 12.9095 84.8255 12.8768 84.7243 12.9368C84.6232 12.9968 84.3493 13.4167 83.4645 13.3785C83.7262 13.2504 84.0378 13.0458 84.0594 12.7268C84.0755 12.5018 83.9245 12.6218 83.7397 12.5904C83.6051 12.554 83.4756 12.5009 83.3539 12.4323C82.6916 12.12 82.2748 11.7505 81.4129 11.7601C80.6774 11.7765 79.9624 12.0081 79.3545 12.4268C80.9732 12.5632 81.8216 13.2449 82.1183 13.6008C82.3881 13.9239 82.523 14.3166 82.6795 14.6916C82.867 15.1224 83.1462 15.237 83.6142 15.2138C83.5279 15.4947 83.273 15.7087 82.7806 15.8955C83.1324 15.9623 83.4958 15.9234 83.826 15.7837C83.7248 16.1519 83.4672 16.4191 82.9911 16.6645C82.9708 16.9468 83.3957 17.244 83.6196 17.3286C84.0418 17.4922 85.1951 17.2386 86.1137 16.4941C84.8282 19.4556 81.7973 19.4556 80.466 18.9238C81.9767 17.9571 81.4466 16.0428 80.3878 15.1879C79.5218 14.4911 76.6218 14.5348 77.4203 17.1322C76.0121 15.721 76.1739 13.7235 76.611 12.7868C75.8891 13.4711 75.3725 14.3472 75.1205 15.3147C74.8305 14.2021 75.1205 11.8746 76.4113 10.6011C75.1906 11.2079 74.4703 12.1309 74.0684 12.6845C74.0684 11.3074 74.67 9.01265 77.5956 7.55508C73.8795 8.53679 73.0891 11.936 73.367 14.2634C73.7082 13.6853 74.2127 13.1549 74.6889 12.6845C74.4535 13.444 74.3705 14.2432 74.4446 15.0355C74.5187 15.8278 74.7485 16.5972 75.1205 17.2986C75.2344 16.3814 75.486 15.4871 75.8664 14.6466C75.8664 18.0689 78.962 17.8426 80.9921 22.2317C81.8445 24.1596 84.1578 24.7664 86.7719 24.5046C92.0392 23.8133 97.0232 21.614 102.063 18.9252C104.23 16.6509 100.626 13.0527 102.467 7.17876C102.467 14.8675 106.711 15.7619 108.878 15.1252C120.748 8.40863 133.802 1.46711 152.278 6.53519C146.193 6.12615 135.783 7.18149 133.539 14.6493C131.381 12.6872 124.889 10.9065 120.443 11.7151C128.19 12.3736 130.964 14.3862 132.738 15.2929C129.771 15.2929 120.967 20.136 126.011 31.307C124.483 29.2209 118.883 21.7531 109.674 18.5952C117.841 22.9584 124.36 30.7957 124.889 31.6302C111.517 24.0219 101.504 36.4883 101.184 41.6682C100.623 39.5657 100.704 29.8508 95.499 26.1244C99.1288 30.9825 100.161 40.6265 99.9017 41.1828C98.8617 39.9556 88.9314 33.4941 86.7692 42.1536C86.289 44.1797 89.4912 46.4867 87.1739 50.8172C87.186 49.5805 87.1361 47.9075 86.3565 47.0171C85.995 46.5985 85.4487 46.1309 84.9159 45.9795C84.0971 45.745 83.4996 45.88 83.2514 46.934C83.0731 47.751 83.0298 48.5923 83.1232 49.4237C83.7451 50.6004 84.7689 51.1594 85.821 51.7225C87.5826 51.6966 89.3954 51.1867 91.0262 50.5676C95.9266 48.7106 102.814 44.8806 109.961 46.1186C109.961 49.545 109.943 52.6879 109.902 55.708L116.775 48.7624L117.253 48.277L108.197 39.7034L108.476 39.4007C109.363 40.2379 113.765 44.3092 117.902 48.3315C119.019 49.4223 120.118 50.5036 121.121 51.5166L121.501 51.9025C122.391 52.8079 123.329 53.7841 124.27 54.7658C128.039 58.7295 131.856 62.9331 132.95 64.1262L133.227 64.4248L132.928 64.707L132.659 64.4071L124.332 55.4258L123.852 55.9112L114.596 65.2674C117.884 66.0032 121.06 67.1808 124.038 68.7688C126.331 70.1023 129.111 71.5708 128.907 75.0327C129.312 74.6237 130.107 73.477 129.057 71.2954C131.682 73.5806 130.415 76.3157 129.319 77.3874C129.859 77.2093 130.329 76.8624 130.661 76.3968C130.994 75.9312 131.171 75.371 131.168 74.7968C132.231 77.7229 129.935 79.1245 126.682 79.5049C126.606 79.4913 126.52 79.479 126.422 79.4668C125.917 77.7297 125.673 76.4453 124.661 75.1377C123.241 73.7647 116.646 71.729 113.273 72.3303C112.69 72.3303 110.788 73.0216 109.33 73.8519C109.33 73.8615 109.33 73.8737 109.33 73.8847C111.084 73.2943 112.512 72.7202 113.157 72.7202C116.378 72.2239 123.265 74.3469 124.192 75.499C125.151 77.082 125.297 78.1851 125.6 79.3672V79.3918C124.777 79.3345 123.712 79.3004 122.746 79.2922C122.62 78.0681 122.06 76.9315 121.169 76.0921C119.747 75.0627 117.461 74.7177 115.312 74.5378C114.711 74.5296 113.019 74.7941 111.923 75.1854C113.272 74.9945 114.523 74.7941 115.183 74.7941C116.033 74.9495 119.73 75.2618 121.169 77.0793C121.169 77.0793 121.784 78.1824 121.938 79.2881C121.361 79.2809 120.784 79.3064 120.21 79.3645C119.985 79.4559 119.741 79.7285 119.525 80.0912C113.255 76.7684 111.567 77.8156 111.101 78.256C108.874 80.229 109.767 82.446 110.671 83.3104C111.345 83.969 112.737 84.7639 113.773 84.9712C109.709 82.6532 110.139 81.1957 110.671 79.8635C111.101 78.9091 112.04 78.241 112.504 78.256C115.485 78.6037 115.896 79.0591 119.834 80.7839C119.979 80.5521 120.327 80.0681 120.585 79.9658C121.203 79.7435 125.758 79.8772 126.682 80.2603C127.03 80.488 127.367 81.0539 127.537 82.1269C127.662 81.6889 127.72 81.2342 127.71 80.7784C129.059 81.0211 129.831 82.4146 131.988 82.2674C131.469 82.4828 130.244 82.8564 129.626 83.2695C130.466 82.9961 131.322 82.7753 132.189 82.6082C132.837 82.581 135.478 82.6082 136.64 83.7195C136.879 83.4468 138.198 83.4631 138.6 83.5395C138.824 83.5731 139.04 83.649 139.236 83.7631C140.033 84.3426 138.73 85.6243 138.8 86.4901C138.675 86.4126 138.559 86.3211 138.455 86.2174C135.955 86.2174 136.879 85.7333 135.305 84.7285C136.195 85.7197 136.025 86.501 138.182 86.7041C138.8 86.8405 139.313 87.1527 139.071 89.9574C138.983 90.3129 138.809 90.6407 138.565 90.9109C138.32 91.1811 138.012 91.3854 137.67 91.505C137.626 91.8036 137.427 93.3498 136.744 93.6252C136.898 93.0081 136.898 92.362 136.744 91.745C136.64 94.5974 135.36 96.9412 134.415 98.3347C134.718 96.8785 135.178 94.0479 134.741 91.9018C132.973 91.9631 130.975 92.004 129.312 93.0048C127.894 93.9497 126.902 94.9914 126.245 96.0508C129.212 98.4915 126.245 102.211 128.068 104.704C129.292 103.847 131.215 102.148 131.743 101.415C131.473 103.475 129.585 105.722 129.21 106.124C130.304 107.403 128.694 108.255 127.907 108.675C127.652 108.812 127.277 109.202 127.327 109.515C127.596 110.624 126.625 111.177 125.708 111.435C126.061 111.109 126.297 110.381 126.248 109.967C125.978 110.785 125.36 111.435 124.263 111.852C124.405 111.674 124.862 110.847 124.862 110.381C124.563 110.909 123.861 111.435 122.858 111.54C123.252 111.177 123.647 110.477 123.647 110.07C123.407 110.268 122.944 110.59 122.071 110.59C122.223 110.467 122.981 109.708 122.981 109.29C122.792 109.563 122.121 109.941 121.268 110.07C121.85 109.603 122.278 109.065 122.432 108.512C122.121 108.858 121.746 109.065 121.061 109.065C123.117 107.351 120.822 100.827 119.006 97.1744C118.133 95.5123 115.308 96.0508 113.014 92.5658C113.56 94.6192 115.686 95.6064 117.671 96.6726C118.834 97.1744 121.381 104.045 120.58 106.731C117.778 116.139 124.034 115.594 125.68 123.964C121.733 119.796 110.748 118.209 100.936 114.902L110.243 124.31L111.759 132.995L103.169 131.462L90.113 118.263C85.689 121.08 81.0082 123.461 76.1348 125.375C71.2619 123.461 66.5816 121.08 62.158 118.263L49.1011 131.462L40.5075 133L42.0277 124.321L51.3348 114.913C41.5232 118.22 30.5394 119.807 26.5927 123.975C28.2423 115.595 34.4983 116.14 31.6954 106.732C30.8942 104.046 33.4408 97.1757 34.6049 96.674C36.5891 95.6077 38.7135 94.6206 39.2612 92.5671C36.9681 96.0522 34.1422 95.5136 33.2695 97.1757C31.454 100.829 29.1596 107.353 31.2139 109.067C30.5287 109.067 30.1537 108.859 29.8434 108.513C29.9986 109.067 30.4248 109.604 31.0075 110.072C30.1537 109.935 29.4846 109.568 29.2945 109.292C29.2945 109.709 30.0525 110.468 30.2036 110.591C29.3309 110.591 28.8696 110.269 28.6281 110.072C28.6281 110.481 29.0233 111.179 29.4172 111.541C28.4137 111.436 27.7122 110.91 27.4128 110.382C27.4128 110.849 27.8701 111.675 28.0117 111.854C26.9151 111.436 26.2946 110.781 26.0275 109.968C25.979 110.377 26.2137 111.111 26.5671 111.436C25.6471 111.179 24.6719 110.618 24.9484 109.517C24.9997 109.203 24.6234 108.813 24.3698 108.677C23.5807 108.257 21.9715 107.405 23.0654 106.126C22.6959 105.723 20.8061 103.476 20.5336 101.416C21.0597 102.15 22.9845 103.849 24.2066 104.705C26.0302 102.212 23.0654 98.4929 26.0302 96.0522C25.3733 94.9928 24.3806 93.9511 22.9643 93.0062C21.3011 92.0054 19.3021 91.9645 17.5351 91.9031C17.0967 94.0493 17.5567 96.8799 17.8602 98.3361C16.916 96.9426 15.6359 94.5987 15.5321 91.7463C15.3767 92.3632 15.3767 93.0097 15.5321 93.6266C14.8482 93.3539 14.6499 91.805 14.6068 91.5064C14.2637 91.3876 13.9554 91.1841 13.7099 90.9143C13.4645 90.6446 13.2896 90.317 13.2013 89.9615C12.9598 87.1568 13.471 86.846 14.0901 86.7082C16.2483 86.4996 16.0784 85.7238 16.9673 84.7326C15.3931 85.7347 16.3171 86.2174 13.8177 86.2174ZM28.0886 83.9363C28.527 83.6636 28.9518 83.275 29.6735 82.4173C26.7492 83.4168 23.2219 83.8599 22.4477 84.0031C24.7421 84.2267 27.0108 84.6616 28.0886 83.9363ZM27.0095 100.827C27.1889 99.7975 27.119 98.7393 26.8058 97.7429C25.7685 98.9224 26.795 100.377 26.4578 102.184C26.7653 101.625 26.9704 101.142 27.0108 100.827H27.0095Z" fill="#006AAB"/>
								<path d="M108.399 39.3297L108.473 39.4006L108.194 39.7033L108.12 39.6324L107.385 38.9357L112.697 34.4226L113.198 35.1329L120.322 45.1696L121.375 46.274C121.397 46.179 121.432 46.0873 121.478 46.0013C121.747 45.4913 122.388 45.2473 123.191 45.2609L123.326 45.1246C123.266 44.9532 123.241 44.7715 123.253 44.5903C123.264 44.4091 123.311 44.2319 123.39 44.0692C123.66 43.5593 124.301 43.3139 125.102 43.3302L125.237 43.1939C125.178 43.0223 125.153 42.8406 125.164 42.6593C125.174 42.4779 125.22 42.3005 125.299 42.1372C125.569 41.6286 126.211 41.3832 127.012 41.3982L127.147 41.2618C127.088 41.0901 127.064 40.9083 127.075 40.7269C127.086 40.5456 127.132 40.3682 127.212 40.2051C127.481 39.6952 128.123 39.4497 128.925 39.4647L129.06 39.3284C129.001 39.1568 128.977 38.9753 128.988 38.7942C128.999 38.6131 129.045 38.436 129.124 38.273C129.394 37.7631 130.036 37.5163 130.837 37.5327L130.972 37.3963C130.914 37.2248 130.889 37.0432 130.9 36.8621C130.911 36.681 130.958 36.5039 131.037 36.341C131.307 35.831 131.947 35.5856 132.75 35.6006L132.885 35.4643C132.826 35.2926 132.801 35.1109 132.812 34.9295C132.823 34.7481 132.869 34.5707 132.948 34.4076C133.218 33.899 133.859 33.6535 134.661 33.6685L134.796 33.5322C134.737 33.3606 134.712 33.1787 134.723 32.9972C134.734 32.8158 134.781 32.6384 134.861 32.4755C135.131 31.9656 135.771 31.7215 136.573 31.7365L136.708 31.6001C136.59 31.2531 136.613 30.8731 136.772 30.5434C137.042 30.0335 137.684 29.7881 138.485 29.8044L138.62 29.6681C138.562 29.4966 138.537 29.3151 138.548 29.134C138.559 28.953 138.605 28.7758 138.684 28.6127C138.953 28.1028 139.595 27.856 140.397 27.871L141.292 26.967C140.917 25.7617 141.051 24.6095 141.767 23.8869C143 22.6393 145.501 23.1411 147.347 25.0104C149.194 26.8797 149.694 29.4049 148.46 30.6539C147.744 31.3752 146.604 31.5101 145.412 31.1325L145.367 31.1775C145.426 31.3491 145.451 31.5309 145.44 31.7122C145.429 31.8936 145.383 32.0709 145.304 32.2342C145.034 32.7441 144.393 32.9909 143.591 32.9759L143.456 33.1122C143.515 33.2838 143.54 33.4657 143.529 33.6472C143.518 33.8287 143.471 34.0061 143.391 34.1689C143.121 34.6803 142.481 34.9243 141.678 34.9093L141.543 35.0457C141.602 35.2171 141.627 35.3987 141.616 35.5799C141.605 35.7612 141.558 35.9383 141.478 36.101C141.209 36.6123 140.568 36.8577 139.765 36.8414L139.631 36.9777C139.689 37.1493 139.714 37.3308 139.702 37.5119C139.691 37.6931 139.645 37.8702 139.566 38.0331C139.296 38.5444 138.655 38.7898 137.853 38.7748L137.718 38.9112C137.777 39.0829 137.801 39.2647 137.79 39.4461C137.779 39.6275 137.733 39.8048 137.653 39.9679C137.383 40.4764 136.741 40.7232 135.941 40.7082L135.807 40.8446C135.866 41.0163 135.89 41.1981 135.879 41.3795C135.868 41.5609 135.821 41.7383 135.742 41.9013C135.472 42.4126 134.83 42.658 134.029 42.643L133.894 42.7794C133.953 42.9508 133.978 43.1324 133.967 43.3136C133.956 43.4949 133.909 43.672 133.829 43.8347C133.559 44.346 132.919 44.5914 132.116 44.5751L131.981 44.7114C132.041 44.8827 132.066 45.0643 132.055 45.2456C132.044 45.4268 131.997 45.604 131.918 45.7668C131.648 46.2781 131.007 46.5235 130.205 46.5071L130.07 46.6435C130.129 46.8153 130.153 46.9971 130.142 47.1785C130.13 47.3599 130.083 47.5372 130.004 47.7002C129.734 48.2115 129.093 48.4556 128.291 48.4406L128.156 48.5769C128.215 48.7486 128.239 48.9304 128.228 49.1118C128.217 49.2932 128.171 49.4706 128.091 49.6336C127.821 50.1436 127.179 50.389 126.378 50.374L125.887 50.8567L127.394 52.3197L137.321 59.5203L138.025 60.0302L133.559 65.3969L132.921 64.7152L133.219 64.4329C133.226 64.4377 133.232 64.4432 133.237 64.4493L137.034 59.932C135.674 60.9028 134.525 62.0945 133.109 63.6489C132.989 63.5126 128.927 59.0485 124.216 54.1618C123.406 53.3259 122.585 52.4806 121.758 51.642L121.376 51.2548C120.421 50.2895 119.454 49.3255 118.503 48.3915C113.666 43.6193 109.245 39.5193 109.117 39.3925C110.656 37.9608 111.833 36.8018 112.794 35.4274L108.324 39.2643L108.399 39.3297Z" fill="#006AAB"/>
								<path d="M19.396 64.6549L18.7081 65.3966L14.2407 60.0299L14.9461 59.52L24.8723 52.3194L25.9676 51.2559C25.8734 51.234 25.7827 51.1991 25.6978 51.1523C25.1934 50.8796 24.9506 50.2319 24.9654 49.422L24.8305 49.2857C24.661 49.3458 24.4814 49.3711 24.3021 49.3601C24.1228 49.3491 23.9475 49.302 23.7865 49.2216C23.282 48.9489 23.0392 48.2999 23.0527 47.49L22.9178 47.3536C22.5746 47.4727 22.1986 47.4492 21.8725 47.2882C21.368 47.0155 21.1266 46.3664 21.1414 45.5565L21.0065 45.4202C20.8366 45.4794 20.6568 45.5042 20.4774 45.4929C20.298 45.4817 20.1225 45.4347 19.9611 45.3547C19.4567 45.082 19.2139 44.433 19.2301 43.6231L19.0952 43.4867C18.9254 43.5468 18.7455 43.572 18.566 43.5608C18.3864 43.5495 18.2109 43.5021 18.0498 43.4213C17.5453 43.1486 17.3026 42.5023 17.3187 41.691L17.1839 41.5547C17.0141 41.6148 16.8342 41.64 16.6546 41.6287C16.4751 41.6175 16.2996 41.5701 16.1385 41.4892C15.6354 41.2165 15.3912 40.5689 15.4061 39.759L15.2712 39.6226C15.1014 39.6821 14.9216 39.7071 14.7422 39.6961C14.5628 39.6851 14.3873 39.6383 14.2258 39.5585C13.7213 39.2858 13.4799 38.6368 13.4934 37.8269L13.3585 37.6906C13.1888 37.7497 13.0093 37.7745 12.8302 37.7635C12.6511 37.7525 12.4758 37.7059 12.3145 37.6265C11.81 37.3538 11.5672 36.7048 11.5821 35.8949L11.4472 35.7585C11.2776 35.8184 11.0979 35.8435 10.9186 35.8322C10.7394 35.821 10.5641 35.7737 10.4032 35.6931C9.89868 35.4204 9.65589 34.7713 9.67208 33.9628L9.53719 33.8264C9.36743 33.8865 9.18749 33.9117 9.00797 33.9005C8.82844 33.8892 8.65295 33.8418 8.49183 33.761C7.9887 33.4883 7.74591 32.8406 7.76075 32.0294L6.86645 31.1254C5.67406 31.5031 4.53428 31.3681 3.81804 30.6468C2.58519 29.3978 3.08156 26.8727 4.9295 25.0033C6.77743 23.134 9.27821 22.6322 10.5124 23.8798C11.2273 24.6025 11.3608 25.7546 10.9872 26.9599L11.0317 27.0049C11.2014 26.9456 11.381 26.9209 11.5602 26.9321C11.7394 26.9433 11.9146 26.9903 12.0757 27.0704C12.5816 27.3431 12.8244 27.9921 12.8095 28.802L12.9444 28.9383C13.1142 28.8789 13.294 28.8539 13.4734 28.8649C13.6528 28.8759 13.8283 28.9226 13.9898 29.0024C14.4942 29.2751 14.737 29.9241 14.7222 30.7341L14.8571 30.8704C15.0268 30.8103 15.2068 30.7851 15.3863 30.7964C15.5658 30.8076 15.7413 30.855 15.9024 30.9359C16.4083 31.2086 16.6497 31.8548 16.6349 32.6661L16.7698 32.8025C16.9393 32.7426 17.119 32.7175 17.2983 32.7287C17.4776 32.74 17.6528 32.7873 17.8138 32.8679C18.3182 33.1406 18.5624 33.7883 18.5462 34.5995L18.6811 34.7359C18.8511 34.6768 19.031 34.6523 19.2104 34.6638C19.3898 34.6753 19.5652 34.7225 19.7264 34.8027C20.2309 35.0754 20.4751 35.7231 20.4602 36.5343L20.5951 36.6707C20.9382 36.5513 21.3142 36.5743 21.6405 36.7348C22.1463 37.0075 22.3877 37.6565 22.3729 38.4664L22.5078 38.6027C22.6776 38.5431 22.8575 38.5182 23.037 38.5294C23.2164 38.5406 23.3919 38.5878 23.5532 38.6682C24.059 38.9409 24.3004 39.5899 24.2856 40.3998L24.4205 40.5362C24.59 40.4763 24.7697 40.4512 24.949 40.4624C25.1283 40.4737 25.3035 40.521 25.4645 40.6016C25.9703 40.8743 26.2131 41.522 26.1969 42.3332L26.3318 42.4696C26.5017 42.41 26.6815 42.3851 26.861 42.3964C27.0404 42.4076 27.2159 42.4547 27.3772 42.535C27.8803 42.8077 28.1244 43.4554 28.1096 44.2667L28.2445 44.403C28.4142 44.3432 28.5941 44.318 28.7735 44.329C28.953 44.34 29.1285 44.3869 29.2898 44.4671C29.7957 44.7398 30.0385 45.3875 30.0236 46.1987L30.5146 46.6964L31.9633 45.1747L39.0866 35.1381L39.5897 34.4277L44.9002 38.9409L44.1286 39.6717L43.8494 39.3704L43.9573 39.2668L39.4724 35.4217C40.4327 36.7961 41.6103 37.9551 43.1507 39.3867C43.0158 39.5081 38.5996 43.6136 33.7653 48.3776C32.9385 49.1957 32.1009 50.026 31.27 50.8632L30.8896 51.2464C29.9346 52.2117 28.9796 53.1907 28.057 54.1533C23.336 59.04 19.2894 63.5096 19.1626 63.6418C17.7463 62.0861 16.5998 60.8944 15.2388 59.9236L19.0345 64.4408C19.0493 64.4286 19.0723 64.4013 19.1033 64.3686C19.1343 64.3358 19.1977 64.269 19.2638 64.1968L19.5619 64.479L19.396 64.6549Z" fill="#006AAB"/>
								<path d="M76.9244 78.1546C77.2079 77.1455 77.3518 76.1016 77.352 75.0527C77.352 75.0145 77.352 74.9777 77.352 74.9395H71.0016V78.1614H73.6049C72.9426 79.7968 71.7761 81.1726 70.2786 82.0844C68.7811 82.9962 67.0325 83.3952 65.2927 83.2223C63.5529 83.0494 61.9148 82.3138 60.6216 81.1246C59.3284 79.9355 58.4493 78.3564 58.1148 76.6219C57.7803 74.8874 58.0083 73.0901 58.7649 71.4971C59.5215 69.904 60.7664 68.6002 62.3145 67.7794C63.8626 66.9586 65.6314 66.6645 67.3581 66.941C69.0847 67.2174 70.6771 68.0495 71.8986 69.3137L74.1201 67.0681C72.3835 65.2823 70.113 64.1249 67.66 63.7749C65.207 63.4249 62.7083 63.9019 60.5506 65.132C58.3928 66.3622 56.6962 68.2769 55.7234 70.5799C54.7506 72.8829 54.5558 75.4458 55.1691 77.872C55.7824 80.2982 57.1697 82.4525 59.1162 84.0014C61.0627 85.5503 63.46 86.4076 65.9371 86.4405C68.4142 86.4735 70.8329 85.6803 72.8191 84.1837C74.8053 82.687 76.2482 80.5704 76.9244 78.1614V78.1546Z" fill="#006AAB"/>
								<path d="M82.0124 98.1061C81.5382 98.7747 80.8611 99.2687 80.084 99.5131C79.3069 99.7575 78.4722 99.7391 77.7064 99.4606C76.9406 99.1821 76.2856 98.6587 75.8407 97.9698C75.3958 97.281 75.1853 96.4642 75.2411 95.6435C75.297 94.8227 75.6161 94.0428 76.1501 93.422C76.6841 92.8012 77.4039 92.3734 78.2002 92.2035C78.9965 92.0336 79.8259 92.1308 80.5625 92.4805C81.2992 92.8302 81.9029 93.4132 82.2822 94.1411L83.4961 93.323C82.9533 92.359 82.1224 91.5935 81.1226 91.1365C80.1227 90.6794 79.0053 90.5543 77.9307 90.779C76.8562 91.0038 75.8796 91.5668 75.1412 92.3874C74.4029 93.2079 73.9406 94.2438 73.8208 95.3464H73.837C73.757 96.0673 73.8261 96.7971 74.0399 97.4895C74.2538 98.182 74.6077 98.8219 75.0793 99.3687C75.1238 99.4191 75.1697 99.4682 75.2142 99.5187L75.233 99.5391L75.2776 99.5855C76.1208 100.459 77.2397 101.008 78.4406 101.136V101.122C78.616 101.14 78.794 101.151 78.9802 101.151C80.2405 101.152 81.458 100.688 82.4036 99.8459L82.4197 99.8582C82.6927 99.6157 82.94 99.3452 83.1576 99.051L82.0124 98.1061Z" fill="#006AAB"/>
								<path d="M93.7789 96.5754C93.8059 96.3564 93.8198 96.1361 93.8208 95.9155C93.8196 94.5722 93.3095 93.2804 92.3953 92.3056C91.481 91.3308 90.2322 90.747 88.9053 90.6742C87.5784 90.6014 86.2744 91.0452 85.2611 91.9142C84.2479 92.7833 83.6025 94.0117 83.4575 95.3469H83.4737C83.3964 96.068 83.4673 96.7976 83.682 97.4897C83.8967 98.1819 84.2506 98.8217 84.7214 99.3692C84.7659 99.4196 84.8117 99.4701 84.8563 99.5191L84.8751 99.5396L84.9197 99.586C85.7629 100.46 86.8818 101.008 88.0827 101.136V101.123C88.2597 101.142 88.4375 101.151 88.6155 101.151C89.876 101.153 91.0937 100.689 92.0389 99.8464L92.0565 99.86C92.22 99.7138 92.3745 99.5576 92.5191 99.3923L91.4778 98.3411C90.9315 98.9941 90.1821 99.4404 89.3523 99.607C88.5225 99.7737 87.6613 99.6508 86.9095 99.2586C86.1577 98.8663 85.5599 98.2278 85.2136 97.4475C84.8674 96.6672 84.7933 95.7912 85.0034 94.9628C85.2135 94.1344 85.6955 93.4026 86.3704 92.887C87.0454 92.3713 87.8735 92.1024 88.7192 92.1242C89.565 92.146 90.3784 92.4572 91.0265 93.007C91.6746 93.5567 92.119 94.3124 92.2871 95.1505H88.7464L89.6906 96.5754H92.3033H93.7789Z" fill="#006AAB"/>
								<path d="M65.5444 90.6566C66.2441 90.6557 66.9367 90.7982 67.5803 91.0757C68.224 91.3532 68.8052 91.7598 69.2888 92.271V88.1887L70.6984 89.1432V95.2979C70.6984 95.3143 70.6984 95.3307 70.6984 95.347V95.4588C70.7119 95.6088 70.7186 95.7615 70.7186 95.9156C70.7218 97.1857 70.2672 98.4134 69.4399 99.3693C69.3954 99.4198 69.3495 99.4688 69.305 99.5193L69.2861 99.5398L69.2416 99.5861C68.3982 100.46 67.2794 101.008 66.0785 101.136V101.123C65.9032 101.14 65.7251 101.151 65.539 101.151C64.2786 101.153 63.061 100.689 62.1156 99.8465L62.0994 99.8602C61.3088 99.1533 60.7496 98.2201 60.4961 97.1844C60.2425 96.1487 60.3066 95.0596 60.6798 94.0616C61.053 93.0636 61.7177 92.2039 62.5856 91.5967C63.4535 90.9896 64.4835 90.6636 65.539 90.6621M65.539 99.6884C66.2787 99.6881 67.0016 99.4662 67.6165 99.0506C68.2314 98.635 68.7106 98.0445 68.9936 97.3537C69.2765 96.6629 69.3505 95.9028 69.2061 95.1695C69.0617 94.4362 68.7055 93.7626 68.1825 93.2339C67.6595 92.7052 66.9931 92.3451 66.2677 92.1992C65.5422 92.0533 64.7903 92.128 64.1069 92.414C63.4235 92.7 62.8393 93.1844 62.4282 93.806C62.0171 94.4276 61.7975 95.1584 61.7973 95.9061C61.796 96.4031 61.892 96.8955 62.0796 97.355C62.2672 97.8144 62.5427 98.2319 62.8904 98.5834C63.2381 98.9348 63.6511 99.2134 64.1056 99.403C64.5602 99.5927 65.0473 99.6896 65.539 99.6884Z" fill="#006AAB"/>
								<path d="M73.0995 101.09L71.582 100.067V89.364L73.0995 90.388V101.09Z" fill="#006AAB"/>
								<path d="M96.6772 67.5729L91.2224 64.3278C90.4751 63.8824 89.6235 63.6475 88.756 63.6475C87.8885 63.6475 87.0369 63.8824 86.2896 64.3278L80.8362 67.5729C80.1097 68.0079 79.5074 68.6261 79.0882 69.367C78.669 70.1079 78.4473 70.9461 78.4447 71.7997V74.2539C78.3934 74.8596 78.3934 75.4686 78.4447 76.0742V78.4126C78.4476 79.2662 78.6696 80.1045 79.089 80.8454C79.5084 81.5863 80.1109 82.2044 80.8376 82.6394L86.2896 85.8872C87.0372 86.3318 87.8887 86.5662 88.756 86.5662C89.6233 86.5662 90.4749 86.3318 91.2224 85.8872L96.6745 82.6394C97.4009 82.2044 98.0033 81.5862 98.4225 80.8452C98.8417 80.1043 99.0634 79.2661 99.066 78.4126V71.8038C99.0637 70.9502 98.842 70.1118 98.4228 69.3709C98.0036 68.6299 97.4011 68.0118 96.6745 67.5769M98.0233 78.4221C98.0217 79.0932 97.8477 79.7524 97.5183 80.3352C97.189 80.9179 96.7155 81.4041 96.1444 81.7463L90.6963 84.99C90.109 85.34 89.4398 85.5245 88.758 85.5245C88.0763 85.5245 87.407 85.34 86.8197 84.99L81.3677 81.7422C80.7961 81.4004 80.3222 80.9143 79.9926 80.3315C79.6629 79.7487 79.4888 79.0893 79.4874 78.418V76.0333C79.4361 75.4586 79.4361 74.8804 79.4874 74.3058V71.8038C79.4889 71.1323 79.663 70.4727 79.9926 69.8897C80.3222 69.3067 80.7961 68.8203 81.3677 68.4782L86.8197 65.2304C87.4072 64.8809 88.0764 64.6966 88.758 64.6966C89.4397 64.6966 90.1089 64.8809 90.6963 65.2304L96.1498 68.4782C96.721 68.8206 97.1945 69.3071 97.5239 69.89C97.8533 70.473 98.0272 71.1324 98.0287 71.8038L98.0233 78.4221Z" fill="#006AAB"/>
								<path d="M96.8916 78.8215C96.6957 79.3361 96.4562 79.8326 96.1758 80.3055C96.5581 79.896 96.8078 79.3783 96.8916 78.8215Z" fill="#006AAB"/>
								<path d="M96.7412 70.8111C96.5771 70.7563 96.403 70.7391 96.2315 70.7608C96.06 70.7825 95.8955 70.8425 95.7498 70.9365L95.677 70.9843L90.5864 74.3248C90.1342 74.6126 89.7616 75.0115 89.5033 75.4844C89.245 75.9572 89.1095 76.4885 89.1094 77.0286L89.1701 83.0879C89.1759 83.3277 89.2623 83.5584 89.415 83.7421C89.5677 83.9257 89.7777 84.0513 90.0104 84.0983C90.0522 84.0751 90.0967 84.0574 90.1453 84.0315L95.5974 80.785C95.8152 80.6538 96.0136 80.4922 96.1868 80.305C96.4669 79.8328 96.7061 79.3369 96.9017 78.8229C96.923 78.6876 96.9338 78.5509 96.9341 78.4139V71.8037C96.9329 71.464 96.8693 71.1274 96.7466 70.8111M94.5965 73.6376C94.9351 73.6376 95.2102 74.1244 95.2102 74.7284C95.2102 75.3324 94.9405 75.8192 94.5965 75.8192C94.2526 75.8192 93.9814 75.3324 93.9814 74.7284C93.9814 74.1244 94.2512 73.6376 94.5965 73.6376ZM94.5965 77.4895C94.9351 77.4895 95.2102 77.9762 95.2102 78.5802C95.2102 79.1843 94.9405 79.671 94.5965 79.671C94.2526 79.671 93.9814 79.1856 93.9814 78.5802C93.9814 77.9749 94.2512 77.4895 94.5965 77.4895ZM91.8745 75.4728C92.2144 75.4728 92.4883 75.9583 92.4883 76.5636C92.4883 77.169 92.2185 77.6544 91.8745 77.6544C91.5306 77.6544 91.2608 77.1677 91.2608 76.5636C91.2608 75.9596 91.5306 75.4728 91.8745 75.4728ZM91.8745 79.3233C92.2144 79.3233 92.4883 79.8101 92.4883 80.4141C92.4883 81.0181 92.2185 81.5049 91.8745 81.5049C91.5306 81.5049 91.2608 81.0181 91.2608 80.4141C91.2608 79.8101 91.5306 79.3233 91.8745 79.3233Z" fill="#006AAB"/>
								<path d="M95.6751 69.5003C95.6454 69.4799 95.6171 69.4567 95.586 69.4376L90.1447 66.1898C89.7269 65.9407 89.2506 65.8093 88.7655 65.8093C88.2804 65.8093 87.8042 65.9407 87.3863 66.1898L81.9343 69.4376C81.7833 69.5283 81.6418 69.6343 81.5121 69.7539C81.4905 69.9498 81.5253 70.1479 81.6121 70.3244C81.6989 70.5009 81.8342 70.6484 82.0017 70.7493L82.0179 70.7615L86.8657 73.6808C87.4323 74.0178 88.079 74.1927 88.7365 74.1867C89.3939 74.1807 90.0374 73.994 90.598 73.6467L95.2488 70.7247C95.3015 70.6889 95.3515 70.6493 95.3985 70.6061C95.5513 70.4727 95.6603 70.2955 95.7112 70.098C95.762 69.9005 95.7522 69.6921 95.6831 69.5003M89.0077 70.5993C88.2321 70.5993 87.6048 70.2366 87.6048 69.7894C87.6048 69.3422 88.2321 68.9795 89.0077 68.9795C89.7833 68.9795 90.4105 69.3422 90.4105 69.7894C90.4105 70.2366 89.7819 70.5993 89.0077 70.5993Z" fill="#006AAB"/>
								</svg>`;
					roll = await window.godice.rollResult.rollDice(diceRoll.expression,forceCritType); 
			}			
            let regExpression = new RegExp(`${diceRoll.expression.replace(/[+-]/g, '\\$&')}:\\s`);
            let rollType = (diceRoll.rollType) ? diceRoll.rollType : 'Custom';
            let rollTitle = (diceRoll.action) ? diceRoll.action : 'AboveVTT';
            let modifier = (roll.rolls.length > 1 && diceRoll.expression.match(/[+-]\d*$/g, '')) ? `${roll.rolls[roll.rolls.length-2]}${roll.rolls[roll.rolls.length-1]}` : '';

            let critSuccess = false;
            let critFail = false;

            let results = roll.output.split(/[\:=]/g)[1].split(/[+-]/g);
            let diceNotations = roll.notation.split(/[+-]/g);

            if(!diceNotations[diceNotations.length-1].includes('d')){
               diceNotations.splice(diceNotations.length-1, 1)
            }



            for(let i=0; i<diceNotations.length; i++){

                results[i] = results[i].replace(/[0-9]+d/g, '').replace(/[\]\[]/g, '')
                let resultsArray = results[i].split(',');
                for(let j=0; j<resultsArray.length; j++){
                    let reduceCrit = 0;
                    if(parseInt(diceNotations[i].split('d')[1]) == 20)
                        reduceCrit = 20 - critRange;
                    if(parseInt(resultsArray[j]) >= parseInt(diceNotations[i].split('d')[1]) - reduceCrit){
                        critSuccess = true;
                    }
                    if(parseInt(resultsArray[j]) == 1){
                        critFail = true;
                    }
                }
            }
            let critClass = `${critSuccess && critFail ? 'crit-mixed' : critSuccess ? 'crit-success' : critFail ? 'crit-fail' : ''}`


            if(window.EXPERIMENTAL_SETTINGS['rpgRoller'] == true || window.EXPERIMENTAL_SETTINGS['godiceRoller'] == true){
                if(spellSave == undefined && this.#pendingSpellSave != undefined){
                    spellSave = this.#pendingSpellSave;
                }
                if(damageType == undefined && this.#pendingDamageType != undefined){
                    damageType = this.#pendingDamageType;
                }
                else if(damageType == undefined && diceRoll.damageType != undefined){
                    damageType = diceRoll.damageType;
                }
                let doubleCrit = false;
                let output = roll.output.replace(regExpression, '');
                let total = roll.total;
                let expression = diceRoll.expression;
                if((this.#critAttackAction != undefined && critType == 3) || forceCritType == 3){
                    doubleCrit = true;
                    total = total * 2;
                    const outputSplit = output.split(' = ')
                    output = `2*[${outputSplit[0]}] = ${parseInt(outputSplit[1])*2}`
                    expression = `2*[${expression}]`
                }
                msgdata = {
                player: diceRoll.name ? diceRoll.name : window.PLAYER_NAME,
                  img: diceRoll.avatarUrl ?  diceRoll.avatarUrl : window.PLAYER_IMG,
                  text: `<div class="tss-24rg5g-DiceResultContainer-Flex abovevtt-roll-container ${critClass}" title='${expression}<br>${output}'>
                            <div class="tss-kucurx-Result">
                                <div class="tss-3-Other-ref tss-1o65fpw-Line-Title-Other">
                                    <span class='aboveDiceOutput'>${rollTitle}</span>
                                    :
                                    <span class='abovevtt-roll-${rollType.replace(' ', '-')}'>${damageType != undefined ? `${damageType} ` : ''}${rollType}</span>
                                </div>
                            </div>
							${logo}
                            <svg width="1" height="32" class="tss-10y9gcy-Divider"><path fill="currentColor" d="M0 0h1v32H0z"></path></svg>
                            <div class="tss-1jo3bnd-TotalContainer-Flex">
                                <div class="tss-3-Other-ref tss-3-Collapsed-ref tss-3-Pending-ref tss-jpjmd5-Total-Other-Collapsed-Pending-Flex">
                                    <span class='aboveDiceTotal'>${total}</span>
                                </div>
                                ${spellSave != undefined ? `<div class='custom-spell-save-text'><span>${spellSave}</span></div>` : ''}
                            </div>

                        </div>
                        `,
                  whisper: (diceRoll.sendToOverride == "DungeonMaster") ? dm_id : ((gamelog_send_to_text() != "Everyone" && diceRoll.sendToOverride != "Everyone") || diceRoll.sendToOverride == "Self") ? window.PLAYER_NAME :  ``,
                  rollType: rollType,
                  rollTitle: rollTitle,
                  result: doubleCrit == true  ? 2*roll.total : roll.total,
                  playerId: window.PLAYER_ID,
                  sendTo: window.sendToTab,
                  entityType: diceRoll.entityType,
                  entityId: diceRoll.entityId
                };
                if(rollType == 'attack' || rollType == 'to hit' || rollType == 'tohit'){     
                    if(critSuccess == true){
                        this.#critAttackAction = rollTitle;     
                    }
                    else{
                        this.#critAttackAction = undefined;  
                    }
                   
                }
               
            }                         
            else{
                if(spellSave == undefined && this.#pendingSpellSave != undefined){
                    spellSave = this.#pendingSpellSave;
                    this.#pendingSpellSave = undefined;
                }
                if(damageType == undefined && this.#pendingDamageType != undefined){
                    damageType = this.#pendingDamageType;
                    this.#pendingDamageType = undefined;
                }
                else if(damageType == undefined && diceRoll.damageType != undefined){
                    damageType = diceRoll.damageType;
                }
                let rollData = {
                    roll: roll,
                    expression: diceRoll.expression,
                    rollType: rollType,
                    rollTitle: rollTitle,
                    modifier: modifier,
                    regExpression: regExpression,
                    spellSave: spellSave,
                    damageType: damageType
                }
                      
                msgdata = {
                  player: diceRoll.name ? diceRoll.name : window.PLAYER_NAME,
                  img: diceRoll.avatarUrl ?  diceRoll.avatarUrl : window.PLAYER_IMG,
                  whisper: (diceRoll.sendToOverride == "DungeonMaster") ? "DungeonMaster" : ((gamelog_send_to_text() != "Everyone" && diceRoll.sendToOverride != "Everyone") || diceRoll.sendToOverride == "Self") ? window.PLAYER_NAME :  ``,
                  playerId: window.PLAYER_ID,
                  rollData: rollData,
                  sendTo: window.sendToTab,
                  entityType: diceRoll.entityType,
                  entityId: diceRoll.entityId
                };
            }


            if(is_abovevtt_page() && (window.EXPERIMENTAL_SETTINGS['rpgRoller'] == true || window.EXPERIMENTAL_SETTINGS['godiceRoller'] == true)){
                setTimeout(function(){
                    window.MB.inject_chat(msgdata);
                    self.#resetVariables();
                    self.nextRoll(undefined, critRange, critType)      
                }, 200)
                return true;
            }
            else if((!is_abovevtt_page() || is_gamelog_popout()) && window.sendToTab != undefined ){
                setTimeout(function(){
                    tabCommunicationChannel.postMessage({
                          msgType: 'roll',
                          msg: msgdata,
                          multiroll: multiroll,
                          critRange: critRange,
                          critType: critType
                        });
                    self.#resetVariables();
                    self.nextRoll(undefined, critRange, critType)
                }, 200)
                return true;
            }               

            console.group("DiceRoller.parseAndRoll");
            console.log("attempting to parse diceRoll", diceRoll);

            this.#resetVariables();

            // we're about to roll dice so we need to know if we should capture DDB messages.
            // This also blocks other attempts to roll until we've finished processing
       
            this.#timeoutId = setTimeout(function () {
                console.warn("DiceRoller timed out after 10 seconds!");
                self.#resetVariables();
            }, this.timeoutDuration);

            // don't hold a reference to the object we were given in case it gets altered while we're waiting.
            this.#pendingDiceRoll = new DiceRoll(diceRoll.expression, diceRoll.action, diceRoll.rollType, diceRoll.name, diceRoll.avatarUrl, diceRoll.entityType, diceRoll.entityId);
            this.#pendingCritRange = critRange;
            this.#pendingCritType = critType;
            this.#pendingSpellSave = spellSave;
            this.#pendingDamageType = damageType;
            this.#pendingCrit = forceCritType;
            this.clickDiceButtons(diceRoll);
            console.groupEnd();
            return true;
        } catch (error) {
            console.warn("failed to parse and send expression as DDB roll; expression: ", diceRoll.expression, error);
            this.#resetVariables();
            console.groupEnd();
            return false;
        }
    }
    nextRoll(msg = undefined, critRange = 20, critType = 2){
        if(this.#multiRollArray.length == 0){
            this.#critAttackAction = undefined;
            return;
        }
        if(msg != undefined){
            if(msg.data.rolls[0].rollType == 'attack' || msg.data.rolls[0].rollType == 'to hit' || msg.data.rolls[0].rollType == 'tohit' ){
                let critSuccess = {};
                let critFail = {};


                for(let i=0; i<msg.data.rolls.length; i++){
                    let roll = msg.data.rolls[i];
                    critSuccess[i] = false;
                    critFail[i] = false;

                    for (let j=0; j<roll.diceNotation.set.length; j++){
                        for(let k=0; k<roll.diceNotation.set[j].dice.length; k++){
                            let reduceCrit = 0;
                            if(parseInt(roll.diceNotation.set[j].dice[k].options.dieType.replace('d', '')) == 20)
                                reduceCrit = 20 - critRange
                            if(roll.diceNotation.set[j].dice[k].faceValue >= parseInt(roll.diceNotation.set[j].dice[k].options.dieType.replace('d', ''))-reduceCrit && roll.result.values.includes(roll.diceNotation.set[j].dice[k].faceValue)){
                                if(roll.rollKind == 'advantage'){
                                    if(k>0 && roll.diceNotation.set[j].dice[k-1].faceValue <= roll.diceNotation.set[j].dice[k].faceValue){
                                        critSuccess[i] = true;
                                    }
                                    else if(k==0 && roll.diceNotation.set[j].dice[k+1].faceValue <= roll.diceNotation.set[j].dice[k].faceValue){
                                        critSuccess[i] = true;
                                    }
                                }
                                else if(roll.rollKind == 'disadvantage' && roll.diceNotation.set[j].dice[1].faceValue == roll.diceNotation.set[j].dice[0].faceValue){
                                    critSuccess[i] = true;
                                }
                                else if(roll.rollKind != 'disadvantage'){
                                    critSuccess[i] = true;
                                }       
                            }
                        }
                    }
                }

               
                if(critSuccess[0] == true){
                    this.#critAttackAction = msg.data.action;
                }
                else{
                    this.#critAttackAction = undefined;
                }
            }
        }
        
        
        let diceRoll = this.#multiRollArray.shift();
        let damageType = diceRoll.damageType;
        if(this.#critAttackAction != undefined && diceRoll.rollType == 'damage'){
            let diceType = diceRoll.expression.match(/d[0-9]+/i)[0];
            let critDice = diceRoll.diceToRoll[diceType] * 2;    
            let maxRoll = diceRoll.diceToRoll[diceType] * parseInt(diceType.replace('d', ''));
            if(critType == 0){
                let newExpression = diceRoll.expression.replace(/^[0-9]+d/i, `${critDice}d`);
                this.roll(new DiceRoll(newExpression, diceRoll.action, diceRoll.rollType, diceRoll.name, diceRoll.avatarUrl, diceRoll.entityType, diceRoll.entityId), true, critRange, critType, undefined, damageType);
            }
            else if(critType == 1){
                let newExpression = `${diceRoll.expression}+${maxRoll}`;
                this.roll(new DiceRoll(newExpression, diceRoll.action, diceRoll.rollType, diceRoll.name, diceRoll.avatarUrl, diceRoll.entityType, diceRoll.entityId), true, critRange, critType, undefined, damageType);
            }
            else if(critType == 2 || critType == 3){
                this.roll(new DiceRoll(diceRoll.expression, diceRoll.action, diceRoll.rollType, diceRoll.name, diceRoll.avatarUrl, diceRoll.entityType, diceRoll.entityId), true, critRange, critType, undefined, damageType);
            }
        }
        else{
            this.roll(diceRoll, true, critRange, critType, undefined, damageType);
        }

    }
    /**
     * clicks the DDB dice and then clicks the roll button
     * @param diceRoll {DiceRoll} the DiceRoll object to roll
     */
    clickDiceButtons(diceRoll) {

        if (diceRoll === undefined) {
            console.warn("clickDiceButtons was called without a diceRoll object")
            return;
        }

        if ($(".dice-toolbar").hasClass("rollable")) {
            // clear any that are already selected so we don't roll too many dice
            $(".dice-toolbar__dropdown-die").click();
        }

        if ($(".dice-toolbar__dropdown").length > 0) {
            if (!$(".dice-toolbar__dropdown").hasClass("dice-toolbar__dropdown-selected")) {
                // make sure it's open
                $(".dice-toolbar__dropdown-die").click();
            }
            for(let diceType in diceRoll.diceToRoll) {
                let numberOfDice = diceRoll.diceToRoll[diceType];
                for (let i = 0; i < numberOfDice; i++) {
                    $(`.dice-die-button[data-dice='${diceType}']`).click();
                }
            }
        }

        if ($(".dice-toolbar").hasClass("rollable")) {
            console.log("diceRoll.sendToOverride", diceRoll.sendToOverride)
            if (diceRoll.sendToOverride === "Everyone") {
                // expand the options and click the "Everyone" button
                $(".dice-toolbar__target-menu-button").click();
                $("#options-menu ul > li > ul > div").eq(0).click();
            } else if (diceRoll.sendToOverride === "Self") {
                // expand the options and click the "Self" button
                $(".dice-toolbar__target-menu-button").click();
                $("#options-menu ul > li > ul > div").eq(1).click();
            } else if (diceRoll.sendToOverride === "DungeonMaster") {
                // expand the options and click the "Self" button
                $(".dice-toolbar__target-menu-button").click();
                $("#options-menu ul > li > ul > div").eq(2).click();
            } else {
                // click the roll button which will use whatever the gamelog is set to roll to
                $(".dice-toolbar__target").children().first().click();
            }
        }
    }

    /// PRIVATE FUNCTIONS

    /** reset all variables back to their default values */
    #resetVariables() {
        console.log("resetting local variables");
        clearTimeout(this.#timeoutId);
        this.#timeoutId = undefined;
        this.#pendingMessage = undefined;
        this.#pendingDiceRoll = undefined;
        this.#pendingSpellSave = undefined;
        this.#pendingDamageType = undefined;
        this.#pendingCrit = undefined;
                
    }

    /** wraps all messages that are sent by DDB, and processes any that we need to process, else passes it along as-is */
    #wrappedDispatch(message) {
        console.group("DiceRoller.#wrappedDispatch");
        if(this.#waitingForRoll && message.source == 'Beyond20'){
            return;
        }
        if (!this.#waitingForRoll) {
            if(message.source == 'Beyond20'){
                this.ddbDispatch(message);
                return;
            }
            console.debug("swap image only, not capturing: ", message);
            let ddbMessage = { ...message };
            if(window.CAMPAIGN_INFO?.dmId == ddbMessage.entityId ){
                ddbMessage.data.context.avatarUrl = dmAvatarUrl
            }
            else if(window.pcs?.filter(d => d.characterId == ddbMessage.entityId)?.length>0 && ddbMessage?.data?.context != undefined){
                ddbMessage.data.context.avatarUrl = window.pcs?.filter(d => d.characterId == ddbMessage.entityId)[0].image
            } 
            if((this.#pendingSpellSave != undefined || this.#pendingDamageType != undefined) && message.eventType === "dice/roll/fulfilled"){
                if(this.#pendingSpellSave != undefined )
                    ddbMessage.avttSpellSave = this.#pendingSpellSave;
                if(this.#pendingDamageType != undefined && ddbMessage.data.rolls.some(d=> d.rollType.includes('damage')))
                    ddbMessage.avttDamageType = this.#pendingDamageType;
                this.ddbDispatch(ddbMessage);
                this.#resetVariables();
            }       
            else{
                this.ddbDispatch(ddbMessage);
            }
        } else if (message.eventType === "dice/roll/pending") {
            if(message.source == 'Beyond20'){
                this.ddbDispatch(message);
                return;
            }
            console.log("capturing pending message: ", message);
            let ddbMessage = { ...message };
            this.#swapDiceRollMetadata(ddbMessage);
            this.#pendingMessage = ddbMessage;
            this.ddbDispatch(ddbMessage);
        } else if (message.eventType === "dice/roll/fulfilled" && this.#pendingMessage?.data?.rollId === message.data.rollId) {
            if(message.source == 'Beyond20'){
                this.ddbDispatch(message);
                return;
            }
            console.log("capturing fulfilled message: ", message)
            let alteredMessage = this.#swapRollData(message);
            console.log("altered fulfilled message: ", alteredMessage);
            this.ddbDispatch(alteredMessage);
            this.#resetVariables();
            this.nextRoll(message, this.#pendingCritRange, this.#pendingCritType, this.#pendingDamageType);
        }
        console.groupEnd();
    }

    /** iterates over the rolls of a DDB message, calculates #pendingDiceRoll.expression, and swaps any data necessary to make the message match the expression result */
    #swapRollData(ddbMessage) {
        console.group("DiceRoller.#swapRollData");
        try {
            let alteredMessage = { ...ddbMessage };
            alteredMessage.data.rolls.forEach(r => {

                // so we need to parse r.diceNotationStr to figure out the order of the results
                // then iterate over r.result.values to align the dice and their values
                // then work through this.#pendingDiceRoll.expression, and replace each expression with the correct number of values
                // then figure out any constants (such as +4), and update r.diceNotation.constant, and r.result.constant
                // then update r.result.text, and r.result.total

                // 1. match dice types with their results so we can properly replace each dice expression with the correct result
                // all DDB dice types will be grouped together. For example: "1d4+2d6-3d8+4d10-5d20+1d100-2d20kh1+2d20kl1-1d3" turns into "9d20+5d10+3d8+2d6+1d4"
                // all the values are in the same order as the DDB expression so iterate over the expression, and pull out the values that correspond
                let matchedValues = {}; // { d20: [1, 18], ... }
                let rolledExpressions = this.#pendingDiceRoll.expression.match(allDiceRegex);
                console.debug("rolledExpressions: ", rolledExpressions);
                let valuesToMatch = r.result.values;
                rolledExpressions.forEach(diceExpression => {
                    console.debug("diceExpression: ", diceExpression);
                    let diceType = diceExpression.match(/d\d+/g);
                    let numberOfDice = parseInt(diceExpression.split("d")[0]);
                    if (matchedValues[diceType] === undefined) {
                        matchedValues[diceType] = [];
                    }
                    if (diceExpression.includes("ro")) {
                        // we've doubled the dice in case we needed to reroll, so grab twice as many dice as expected
                        numberOfDice = numberOfDice * 2;
                    }
                    matchedValues[diceType] = matchedValues[diceType].concat(valuesToMatch.slice(0, numberOfDice));
                    valuesToMatch = valuesToMatch.slice(numberOfDice);
                });
                console.debug("matchedValues: ", JSON.stringify(matchedValues));

                // 2. replace each dice expression in #pendingDiceRoll.expression with the corresponding dice roll results
                // For example: "2d20kh1+1d4-3" with rolled results of [9, 18, 2] will turn into "18+2-3"
                // we also need to collect the results that we use which will end up being [18, 2] in this example
                let replacedExpression = this.#pendingDiceRoll.expression.toString(); // make sure we have a new string that we alter so we don't accidentally mess up the original
                let replacedValues = []; // will go into the roll object and DDB also parses these.
                this.#pendingDiceRoll.diceExpressions.forEach(diceExpression => {
                    let diceType = diceExpression.match(/d\d+/g);
                    let numberOfDice = parseInt(diceExpression.split("d")[0]);
                    const includesReroll = diceExpression.includes("ro");
                    if (includesReroll) {
                        // we've doubled the dice in case we needed to reroll so grab twice as many dice as expected
                        numberOfDice = numberOfDice * 2;
                    }
                    let calculationValues = matchedValues[diceType].slice(0, numberOfDice);
                    matchedValues[diceType] = matchedValues[diceType].slice(numberOfDice);
                    console.debug(diceExpression, "calculationValues: ", calculationValues);

                    if (includesReroll) {
                        // we have twice as many dice values as we need, so we need to figure out which dice values to drop.
                        // the values are in-order, so we will only keep the front half of the array.
                        // evaluate each of the calculationValues against the reroll rule.
                        // any value that evaluates to false, gets dropped. This allows the reroll dice to "shift" into the front half of the array.
                        // cut the matchedValues down to the expected size. This will drop any reroll dice that we didn't use
                        const half = Math.ceil(calculationValues.length / 2);
                        let rolledValues = calculationValues.slice(0, half)
                        let rerolledValues = calculationValues.slice(half)
                        const rerollModifier = diceExpression.match(/ro(<|<=|>|>=|=)\d+/);
                        calculationValues = rolledValues.map(value => {
                            const rerollExpression = rerollModifier[0].replace('ro', value).replace(/(?<!(<|>))=(?!(<|>))/, "==");
                            console.debug("rerollExpression", rerollExpression)
                            if (eval(rerollExpression)) {
                                return rerolledValues.shift();
                            } else {
                                return value;
                            }
                        });
                    }

                    if (diceExpression.includes("kh")) {
                        // "keep highest" was used so figure out how many to keep
                        let numberToKeep = parseInt(diceExpression.split("kh")[1]);
                        // then sort and only take the highest values
                        calculationValues = calculationValues.sort((a, b) => b - a).slice(0, numberToKeep);
                        console.debug(diceExpression, "kh calculationValues: ", calculationValues);
                    } else if (diceExpression.includes("kl")) {
                        // "keep lowest" was used so figure out how many to keep
                        let numberToKeep = parseInt(diceExpression.split("kl")[1]);
                        // then sort and only take the lowest values
                        calculationValues = calculationValues.sort((a, b) => a - b).slice(0, numberToKeep);
                        console.debug(diceExpression, "kl calculationValues: ", calculationValues);
                    }

                    // finally, replace the diceExpression with the results that we have. For example 2d20 with results [2, 9] will result in "(2+9)", 1d20 with results of [3] will result in "3"
                    let replacementString = calculationValues.length > 1 ? "(" + calculationValues.join("+") + ")" : calculationValues.join("+"); // if there are more than one make sure they get totalled together
                    replacedExpression = replacedExpression.replace(diceExpression, replacementString);
                    replacedValues = replacedValues.concat(calculationValues);
                });

                // now that we've replaced all the dice expressions with their results, we need to execute the expression to get the final result
                let calculatedTotal = eval(replacedExpression);
                if((this.#critAttackAction != undefined && this.#pendingCritType == 3) || this.#pendingCrit == 3){
                    calculatedTotal = calculatedTotal * 2; 
                }
                console.log("pendingExpression: ", this.#pendingDiceRoll.expression, ", replacedExpression: ", replacedExpression, ", calculatedTotal:", calculatedTotal, ", replacedValues: ", replacedValues);

                // we successfully processed the expression, now let's update the message object
                r.diceNotationStr = this.#pendingDiceRoll.expression; 
                r.diceNotation.constant = this.#pendingDiceRoll.calculatedConstant;
                r.result.constant = this.#pendingDiceRoll.calculatedConstant;
                r.result.text = replacedExpression;
                r.result.total = calculatedTotal;
                if (this.#pendingDiceRoll.isComplex()) {
                    r.result.values = replacedValues;
                }
                if (this.#pendingDiceRoll.rollType) {
                    r.rollType = this.#pendingDiceRoll.rollType;
                }
                // need to update the replacedValues above based on kh and kl if we do this
                if (this.#pendingDiceRoll.isAdvantage()) {
                    r.rollKind = "advantage";
                } else if (this.#pendingDiceRoll.isDisadvantage()) {
                    r.rollKind = "disadvantage";
                }
                this.#pendingDiceRoll.resultTotal = calculatedTotal;
                this.#pendingDiceRoll.resultValues = replacedValues;
                this.#pendingDiceRoll.expressionResult = replacedExpression;
            });
            if(this.#pendingCritRange != undefined){
                alteredMessage.data.critRange = this.#pendingCritRange;
            }
            this.#swapDiceRollMetadata(alteredMessage);

            console.groupEnd();
            return alteredMessage;
        } catch (error) {
            console.warn("Failed to swap roll data", error);
            console.groupEnd();
            return ddbMessage // we failed to parse the message so return the original message
        }
    }

    #swapDiceRollMetadata(ddbMessage) {

        if (this.#pendingDiceRoll?.isComplex()) {
            // We manipulated this enough that DDB won't properly display the formula.
            // We'll look for this later to know that we should swap some HTML after this render
            ddbMessage.avttExpression = this.#pendingDiceRoll.expression;
            ddbMessage.avttExpressionResult = this.#pendingDiceRoll.expressionResult;
            console.log("DiceRoll ddbMessage.avttExpression: ", ddbMessage.avttExpression);
        }
        if((this.#critAttackAction != undefined && this.#pendingCritType == 3) || this.#pendingCrit == 3){
            ddbMessage.avttExpression = `2(${this.#pendingDiceRoll.expression})`;
            ddbMessage.avttExpressionResult = `2(${this.#pendingDiceRoll.expressionResult})`;
        }
        ddbMessage.avttSpellSave = this.#pendingSpellSave;
        if(ddbMessage.data.rolls.some(d=> d.rollType.includes('damage')))
            ddbMessage.avttDamageType = this.#pendingDamageType;

        if (["character", "monster"].includes(this.#pendingDiceRoll?.entityType)) {
            ddbMessage.entityType = this.#pendingDiceRoll.entityType;
            ddbMessage.data.context.entityType = this.#pendingDiceRoll.entityType;
        }
        if (this.#pendingDiceRoll?.entityId !== undefined) {
            ddbMessage.entityId = this.#pendingDiceRoll.entityId;
            ddbMessage.data.context.entityId = this.#pendingDiceRoll.entityId;
        }
        const isValid = (str) => { return typeof str === "string" && true && str.length > 0 };
        if (isValid(this.#pendingDiceRoll?.action)) {
            ddbMessage.data.action = this.#pendingDiceRoll.action;
        }
        if (isValid(this.#pendingDiceRoll?.avatarUrl)) {
            ddbMessage.data.context.avatarUrl = this.#pendingDiceRoll.avatarUrl;
        } 
        else if(window.CAMPAIGN_INFO?.dmId == ddbMessage.entityId || ddbMessage.entityId == 'false'){
            ddbMessage.data.context.avatarUrl = dmAvatarUrl
        } else if(window.pcs?.filter(d => d.characterId == ddbMessage.entityId)?.length>0){
            ddbMessage.data.context.avatarUrl = window.pcs?.filter(d => d.characterId == ddbMessage.entityId)[0].image
        }      
        if (isValid(this.#pendingDiceRoll?.name)) {
            ddbMessage.data.context.name = this.#pendingDiceRoll.name;
        }
    }
}

function replace_gamelog_message_expressions(listItem) {

    let expressionSpan = listItem.find("[class*='-Line-Notation'] span");
    if (expressionSpan.length > 0) {
        let avttExpression = listItem.attr("data-avtt-expression");
        if (avttExpression !== undefined && avttExpression.length > 0) {
            expressionSpan.text(avttExpression);
            expressionSpan.attr("title", avttExpression);
            console.log("injected avttExpression", avttExpression);
        }
    }

    let expressionResultSpan = listItem.find("[class*='-Line-Breakdown'] span");
    if (expressionResultSpan.length > 0) {
        let avttExpressionResult = listItem.attr("data-avtt-expression-result");
        if (avttExpressionResult !== undefined && avttExpressionResult.length > 0) {
            expressionResultSpan.text(avttExpressionResult);
            console.log("injected avttExpressionResult", avttExpressionResult);
        }
    }
}

function getCharacterStatModifiers(entityType, entityId) {
    console.debug("getCharacterStatModifiers", entityType, entityId);
    if (entityType === "character" && typeof window.pcs === "object") {
        try {
            const pc = window.pcs.find(pc => pc.sheet.includes(entityId));
            if (typeof pc === "object" && typeof pc.abilities === "object" && typeof pc.proficiencyBonus === "number") {
                const statMods = {
                    "str": pc.abilities.find(a => a.name === "str").modifier,
                    "dex": pc.abilities.find(a => a.name === "dex").modifier,
                    "con": pc.abilities.find(a => a.name === "con").modifier,
                    "int": pc.abilities.find(a => a.name === "int").modifier,
                    "wis": pc.abilities.find(a => a.name === "wis").modifier,
                    "cha": pc.abilities.find(a => a.name === "cha").modifier,
                    "pb": pc.proficiencyBonus
                };
                console.debug("getCharacterStatModifiers built statMods from window.pcs", statMods);
                return statMods;
            }
        } catch (error) {
            console.warn("getCharacterStatModifiers failed to collect abilities from window.pcs", error);
        }
    }
    if (is_characters_page()) {
        try {
            let stats = $(".ddbc-ability-summary__secondary");
            const statMods = {
                "str": Math.floor((parseInt(stats[0].textContent) - 10) / 2),
                "dex": Math.floor((parseInt(stats[1].textContent) - 10) / 2),
                "con": Math.floor((parseInt(stats[2].textContent) - 10) / 2),
                "int": Math.floor((parseInt(stats[3].textContent) - 10) / 2),
                "wis": Math.floor((parseInt(stats[4].textContent) - 10) / 2),
                "cha": Math.floor((parseInt(stats[5].textContent) - 10) / 2),
                "pb": parseInt($(".ct-proficiency-bonus-box__value").text())
            };
            console.debug("getCharacterStatModifiers built statMods from character sheet html", statMods);
            return statMods
        } catch (error) {
            console.warn("getCharacterStatModifiers failed to collect abilities from character sheet", error);
        }
    }
    console.log("getCharacterStatModifiers found nothing");
    return undefined;
}

/**
 * Takes the raw strong from the chat input, and returns a new string with all the modifier keys replaced with numbers.
 * This only works on the character page. If this is called from a different page, it will immediately return the given slashCommand.
 * @example passing "1d20+dex+pb" would return "1d20+3+2" for a player that has a +2 dex mod and a proficiency bonus of 2
 * @param slashCommandText {String} the string from the chat input
 * @returns {String} a new string with numbers instead of modifier if on the characters page, else returns the given slashCommand.
 */
function replaceModifiersInSlashCommand(slashCommandText, entityType, entityId) {
    if (typeof slashCommandText !== "string") {
        console.warn("replaceModifiersInSlashCommand expected a string, but received", slashCommandText);
        return "";
    }

    const expression = slashCommandText.replace(diceRollCommandRegex, "").match(allowedExpressionCharactersRegex)?.[0];

    if (expression === undefined || expression === "") {
        return slashCommandText; // no valid expression to parse
    }

    const modifiers = getCharacterStatModifiers(entityType, entityId);
    if (modifiers === undefined) {
        // This will happen if the DM opens a character sheet before the character stats have loaded
        console.warn("getCharacterStatModifiers returned undefined. This command may not parse properly", slashCommandText);
        return slashCommandText; // missing required info
    }

    let modifiedExpression = `${expression}`; // make sure we use a copy of the string instead of altering the variable that was passed in
    const modifiersToReplace = expression.matchAll(validModifierSubstitutions);
    const validModifierPrefix = /(\s*[+|-]\s*)$/; // we only want to substitute valid parts of the expression. For example: We only want to replace the first `dex` in this string "/r 1d20 + dex dex-based attack"
    for (const match of modifiersToReplace) {
        const mod = match[0];
        const expressionUpToThisPoint = match.input.substring(0, match.index);
        if (validModifierPrefix.test(expressionUpToThisPoint)) {
            // everything up to and including this match is valid. let's replace this modifier with the appropriate value.
            modifiedExpression = modifiedExpression.replace(mod, modifiers[mod.toLowerCase()]); // explicitly only replacing the first match. We do not want to replaceAll here.
        } else {
            break; // we got to a point in the expression that is no longer valid. Stop substituting
        }
    }

    const modifiedCommand = slashCommandText.replaceAll(expression, modifiedExpression);

    console.log("replaceModifiersInSlashCommand changed", slashCommandText, "to", modifiedCommand);
    return modifiedCommand;
}