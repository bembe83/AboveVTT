import { Utils, renderTemplate } from './Utils.js'; 
import { GoDice } from './GoDice.js';
import { GoDiceExt } from './GoDiceExt.js';
import { connectedDice } from './GoDiceExt.js';
import { DieTypePrompt } from './DieTypePrompt.js';

export class DiceBar {
	
	static init(element){
		console.log("DiceBar | Initializing...");
		let settings = window.godice.settings;
		let elementId = 0;
		
		let hbEl =document.body;
		
		if(settings.parent?.id)
			element = "#"+settings.parent.id;
		else if(settings.parent?.class)
			element = "."+settings.parent.id;
		
		if(settings.parent?.classElement)
				elementId = Number(settings.parent.classElement);
		
		if (element && element !== null) {
			hbEl = document.querySelectorAll(element)[elementId].firstElementChild;
		}
		if(!document.querySelector("template[id=dicebar]")){
			let dbEl = document.createElement('template');
			dbEl.setAttribute('id', 'dicebar');
			hbEl.appendChild(dbEl);
		}
		window.godice.dicebar = new DiceBar();
		
		let diceDisplay = "flex";
		let barPosition = "fixed";
		let r = document.querySelector(':root');
		let px = 0;
		let classList = "";
		let direction = "row";

		switch(settings.dicebar.direction){
		       case "right":
		           direction = "row";
				   classList +=" horizontal";
		       break;
			   case "left":
			        direction = "row-reverse";
					classList +=" horizontal";
		      break;
			  case "up":
		             direction = "column-reverse";
					 classList +=" vertical";
			   break;
			   case "down":
			          direction = "column";
					  classList +=" vertical";
			    break;
		       default: 
		           direction = "row";
				   classList +=" horizontal";
		       break;
		   }

		if(settings.dicebar.position_type)
			barPosition = settings.dicebar.position_type;
		
		if(settings.dicebar.position?.top){
			px = settings.dicebar.position.top;
			classList += " top";
		} else if(settings.dicebar.position?.bottom){
			px = settings.dicebar.position.bottom;
			classList += " bottom";
		}
		r.style.setProperty('--dicebar-y-pos', px);
		
		if(settings.dicebar.position?.left){
			px = settings.dicebar.position.left;
			classList +=  " left";
		} else if(settings.dicebar.position?.right){
			px = settings.dicebar.position.right;
			classList +=  " right";
		}
		r.style.setProperty('--dicebar-x-pos', px);
		
		if(settings.dicebar.margin?.top) r.style.setProperty('--dicebar-margin-top', settings.dicebar.margin.top);
		if(settings.dicebar.margin?.right) r.style.setProperty('--dicebar-margin-right', settings.dicebar.margin.right);
		if(settings.dicebar.margin?.bottom) r.style.setProperty('--dicebar-margin-bottom', settings.dicebar.margin.bottom);
		if(settings.dicebar.margin?.left) r.style.setProperty('--dicebar-margin-left', settings.dicebar.margin.left);
		
		r.style.setProperty('--dicebar-position', barPosition);
		r.style.setProperty('--dicebar-x-pos', px);
		r.style.setProperty('--dicebar-display', diceDisplay);
		r.style.setProperty('--dicebar-direction', direction);
		Utils.setDiceBarMaxSlots();
		
		let obj = {
			enabled: true,
			classList: classList,
			id: "dicebar",
			renderContext: "dicebar"
		};

		window.godice.dicebar.render(obj);
	}
	
	/**
	 * @param {*} options 
	 */
	constructor(options) {
		this.options = options || {};
		//super(options);
		//if (!game.macros.apps.find((app) => app.constructor.name == "DiceBar")) game.macros.apps.push(this);
		/**
		 * The currently viewed macro page
		 * @type {number}
		 */
		this.page = 1;
		/**
		 * The currently displayed set of macros
		 * @type {Array}
		 */
		this.dice = [];
		/**
		 * Track collapsed state
		 * @type {boolean}
		 */
		this._collapsed = false;
		/**
		 * Track which hotbar slot is the current hover target, if any
		 * @type {number|null}
		 */
		this._hover = null;

		this._enable = false;
		
	}
	
	enable(){
		console.log("Enabling DiceBar");
		this._enable = true
	}
	
	disable(){
		console.log("Disabling DiceBar");
		this._enable = false;
	}
	
	isEnable(){
		return this._enable;
	}
	
	enable(status){
		this._enable = status;;
	}
	
	toggleStatus(){
		this._enable = !this._enable;
	}

	async defaultOptions() {
		let templatePath = Utils.getModulePath() + "templates/template.hbs";
		let template = await renderTemplate(templatePath, this.getData());
		return  {
			id: "dicebar",
			template: template
		};
	}
	
	getBorderedPlusIcon () {
		return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHhtbG5zOnhsaW5rPSdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJyB3aWR0aD0nNDgnIGhlaWdodD0nNDgnIHhtbDpzcGFjZT0ncHJlc2VydmUnIHZlcnNpb249JzEuMScgdmlld0JveD0nMCAwIDQ4IDQ4Jz4KICA8aW1hZ2Ugd2lkdGg9JzQ4JyBoZWlnaHQ9JzQ4JyB4bGluazpocmVmPSdkYXRhOmltYWdlL3dlYnA7YmFzZTY0LFVrbEdSdFFYQUFCWFJVSlFWbEE0V0FvQUFBQThBQUFBTHdBQUx3QUFTVU5EVUtBQ0FBQUFBQUtnYkdOdGN3UXdBQUJ0Ym5SeVVrZENJRmhaV2lBSDVnQUtBQTBBRWdBSkFBSmhZM053UVZCUVRBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQTl0WUFBUUFBQUFEVExXeGpiWE1BQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUExa1pYTmpBQUFCSUFBQUFFQmpjSEowQUFBQllBQUFBRFozZEhCMEFBQUJtQUFBQUJSamFHRmtBQUFCckFBQUFDeHlXRmxhQUFBQjJBQUFBQlJpV0ZsYUFBQUI3QUFBQUJSbldGbGFBQUFDQUFBQUFCUnlWRkpEQUFBQ0ZBQUFBQ0JuVkZKREFBQUNGQUFBQUNCaVZGSkRBQUFDRkFBQUFDQmphSEp0QUFBQ05BQUFBQ1JrYlc1a0FBQUNXQUFBQUNSa2JXUmtBQUFDZkFBQUFDUnRiSFZqQUFBQUFBQUFBQUVBQUFBTVpXNVZVd0FBQUNRQUFBQWNBRWNBU1FCTkFGQUFJQUJpQUhVQWFRQnNBSFFBTFFCcEFHNEFJQUJ6QUZJQVJ3QkNiV3gxWXdBQUFBQUFBQUFCQUFBQURHVnVWVk1BQUFBYUFBQUFIQUJRQUhVQVlnQnNBR2tBWXdBZ0FFUUFid0J0QUdFQWFRQnVBQUJZV1ZvZ0FBQUFBQUFBOXRZQUFRQUFBQURUTFhObU16SUFBQUFBQUFFTVFnQUFCZDcvLy9NbEFBQUhrd0FBL1pELy8vdWgvLy85b2dBQUE5d0FBTUJ1V0ZsYUlBQUFBQUFBQUcrZ0FBQTQ5UUFBQTVCWVdWb2dBQUFBQUFBQUpKOEFBQStFQUFDMnhGaFpXaUFBQUFBQUFBQmlsd0FBdDRjQUFCalpjR0Z5WVFBQUFBQUFBd0FBQUFKbVpnQUE4cWNBQUExWkFBQVQwQUFBQ2x0amFISnRBQUFBQUFBREFBQUFBS1BYQUFCVWZBQUFUTTBBQUptYUFBQW1ad0FBRDF4dGJIVmpBQUFBQUFBQUFBRUFBQUFNWlc1VlV3QUFBQWdBQUFBY0FFY0FTUUJOQUZCdGJIVmpBQUFBQUFBQUFBRUFBQUFNWlc1VlV3QUFBQWdBQUFBY0FITUFVZ0JIQUVKV1VEaE1xQUFBQUM4dndBc1FkY0J0Sk1tUjVML1ZLUjJySTc5aURjbjVDRGF4YlRVaXVYZzlJSUllVWRrQ0gwRWdoVTNsU21Bd21MUk53ajVvdDkzUUFvakY1a1FjaDc3YTR2ZzVRUmV1SURxNkFLUjhlRlFqcnJOMXNCVGZtRWRaYkYwNWxnNjFRZFdyQU9ZY2RCYWlFckpRbFhMRndSS3BOektWOFg4akVmTTh4eWM5bjhPZWxCdVhybkhqM1BsY1hYR0lPajk3ajdYdFZTQi9aL04zUFA4bjVQK1EvSi9UQWxydWo0SkFDMFZZU1VhOEJ3QUFTVWtxQUFnQUFBQUtBQUFCQkFBQkFBQUFNQUFBQUFFQkJBQUJBQUFBTUFBQUFBSUJBd0FEQUFBQWhnQUFBQklCQXdBQkFBQUFBUUFBQUJvQkJRQUJBQUFBakFBQUFCc0JCUUFCQUFBQWxBQUFBQ2dCQXdBQkFBQUFBZ0FBQURFQkFnQU5BQUFBbkFBQUFESUJBZ0FVQUFBQXFnQUFBR21IQkFBQkFBQUF2Z0FBQU5BQUFBQUlBQWdBQ0FCSUFBQUFBUUFBQUVnQUFBQUJBQUFBUjBsTlVDQXlMakV3TGpJNEFBQXlNREl5T2pFd09qRXpJREl3T2pFd09qQTBBQUVBQWFBREFBRUFBQUFCQUFBQUFBQUFBQWtBL2dBRUFBRUFBQUFCQUFBQUFBRUVBQUVBQUFBQUFRQUFBUUVFQUFFQUFBQUFBUUFBQWdFREFBTUFBQUJDQVFBQUF3RURBQUVBQUFBR0FBQUFCZ0VEQUFFQUFBQUdBQUFBRlFFREFBRUFBQUFEQUFBQUFRSUVBQUVBQUFCSUFRQUFBZ0lFQUFFQUFBQnpCZ0FBQUFBQUFBZ0FDQUFJQVAvWS8rQUFFRXBHU1VZQUFRRUFBQUVBQVFBQS85c0FRd0FJQmdZSEJnVUlCd2NIQ1FrSUNnd1VEUXdMQ3d3WkVoTVBGQjBhSHg0ZEdod2NJQ1F1SnlBaUxDTWNIQ2czS1N3d01UUTBOQjhuT1QwNE1qd3VNelF5LzlzQVF3RUpDUWtNQ3d3WURRMFlNaUVjSVRJeU1qSXlNakl5TWpJeU1qSXlNakl5TWpJeU1qSXlNakl5TWpJeU1qSXlNakl5TWpJeU1qSXlNakl5TWpJeU1qSXkvOEFBRVFnQkFBRUFBd0VpQUFJUkFRTVJBZi9FQUI4QUFBRUZBUUVCQVFFQkFBQUFBQUFBQUFBQkFnTUVCUVlIQ0FrS0MvL0VBTFVRQUFJQkF3TUNCQU1GQlFRRUFBQUJmUUVDQXdBRUVRVVNJVEZCQmhOUllRY2ljUlF5Z1pHaENDTkNzY0VWVXRId0pETmljb0lKQ2hZWEdCa2FKU1luS0NrcU5EVTJOemc1T2tORVJVWkhTRWxLVTFSVlZsZFlXVnBqWkdWbVoyaHBhbk4wZFhaM2VIbDZnNFNGaG9lSWlZcVNrNVNWbHBlWW1acWlvNlNscHFlb3FhcXlzN1MxdHJlNHVickN3OFRGeHNmSXljclMwOVRWMXRmWTJkcmg0dVBrNWVibjZPbnE4Zkx6OVBYMjkvajUrdi9FQUI4QkFBTUJBUUVCQVFFQkFRRUFBQUFBQUFBQkFnTUVCUVlIQ0FrS0MvL0VBTFVSQUFJQkFnUUVBd1FIQlFRRUFBRUNkd0FCQWdNUkJBVWhNUVlTUVZFSFlYRVRJaktCQ0JSQ2thR3h3UWtqTTFMd0ZXSnkwUW9XSkRUaEpmRVhHQmthSmljb0tTbzFOamM0T1RwRFJFVkdSMGhKU2xOVVZWWlhXRmxhWTJSbFptZG9hV3B6ZEhWMmQzaDVlb0tEaElXR2g0aUppcEtUbEpXV2w1aVptcUtqcEtXbXA2aXBxckt6dExXMnQ3aTV1c0xEeE1YR3g4akp5dExUMU5YVzE5aloydUxqNU9YbTUranA2dkx6OVBYMjkvajUrdi9hQUF3REFRQUNFUU1SQUQ4QTkvb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BLy85a0FXRTFRSUpvTUFBQThQM2h3WVdOclpYUWdZbVZuYVc0OUl1Kzd2eUlnYVdROUlsYzFUVEJOY0VObGFHbEllbkpsVTNwT1ZHTjZhMk01WkNJL1BpQThlRHA0YlhCdFpYUmhJSGh0Ykc1ek9uZzlJbUZrYjJKbE9tNXpPbTFsZEdFdklpQjRPbmh0Y0hSclBTSllUVkFnUTI5eVpTQTBMalF1TUMxRmVHbDJNaUkrSUR4eVpHWTZVa1JHSUhodGJHNXpPbkprWmowaWFIUjBjRG92TDNkM2R5NTNNeTV2Y21jdk1UazVPUzh3TWk4eU1pMXlaR1l0YzNsdWRHRjRMVzV6SXlJK0lEeHlaR1k2UkdWelkzSnBjSFJwYjI0Z2NtUm1PbUZpYjNWMFBTSWlJSGh0Ykc1ek9uaHRjRTFOUFNKb2RIUndPaTh2Ym5NdVlXUnZZbVV1WTI5dEwzaGhjQzh4TGpBdmJXMHZJaUI0Yld4dWN6cHpkRVYyZEQwaWFIUjBjRG92TDI1ekxtRmtiMkpsTG1OdmJTOTRZWEF2TVM0d0wzTlVlWEJsTDFKbGMyOTFjbU5sUlhabGJuUWpJaUI0Yld4dWN6cGtZejBpYUhSMGNEb3ZMM0IxY213dWIzSm5MMlJqTDJWc1pXMWxiblJ6THpFdU1TOGlJSGh0Ykc1ek9rZEpUVkE5SW1oMGRIQTZMeTkzZDNjdVoybHRjQzV2Y21jdmVHMXdMeUlnZUcxc2JuTTZkR2xtWmowaWFIUjBjRG92TDI1ekxtRmtiMkpsTG1OdmJTOTBhV1ptTHpFdU1DOGlJSGh0Ykc1ek9uaHRjRDBpYUhSMGNEb3ZMMjV6TG1Ga2IySmxMbU52YlM5NFlYQXZNUzR3THlJZ2VHMXdUVTA2Ukc5amRXMWxiblJKUkQwaVoybHRjRHBrYjJOcFpEcG5hVzF3T2pZNVpEQTFZbUU0TFdNelpqY3RORFJpWmkwNFlUSmhMVGxtWlRReU5UY3pZMlF5TWlJZ2VHMXdUVTA2U1c1emRHRnVZMlZKUkQwaWVHMXdMbWxwWkRveVlqUTFZMk5pTXkxbFpUSXhMVFF5TVRNdE9USTBOaTFtTmpabU9ETm1PVGN3TURFaUlIaHRjRTFOT2s5eWFXZHBibUZzUkc5amRXMWxiblJKUkQwaWVHMXdMbVJwWkRvNVpqTXpNRFE0TVMxaVpUbGtMVFJpWlRrdE9XRTFZaTA1TTJWbU1EQTBZakpoTVdJaUlHUmpPa1p2Y20xaGREMGlhVzFoWjJVdmQyVmljQ0lnUjBsTlVEcEJVRWs5SWpJdU1DSWdSMGxOVURwUWJHRjBabTl5YlQwaVRXRmpJRTlUSWlCSFNVMVFPbFJwYldWVGRHRnRjRDBpTVRZMk5UWTRORFl3T1RRek9USXlOaUlnUjBsTlVEcFdaWEp6YVc5dVBTSXlMakV3TGpJNElpQjBhV1ptT2s5eWFXVnVkR0YwYVc5dVBTSXhJaUI0YlhBNlEzSmxZWFJ2Y2xSdmIydzlJa2RKVFZBZ01pNHhNQ0krSUR4NGJYQk5UVHBJYVhOMGIzSjVQaUE4Y21SbU9sTmxjVDRnUEhKa1pqcHNhU0J6ZEVWMmREcGhZM1JwYjI0OUluTmhkbVZrSWlCemRFVjJkRHBqYUdGdVoyVmtQU0l2SWlCemRFVjJkRHBwYm5OMFlXNWpaVWxFUFNKNGJYQXVhV2xrT21GbE56QTNPR0kxTFRnMk4ySXRORGxsWlMwNE5EUXpMV05oWWpJeU9HRmlPVGhrTmlJZ2MzUkZkblE2YzI5bWRIZGhjbVZCWjJWdWREMGlSMmx0Y0NBeUxqRXdJQ2hOWVdNZ1QxTXBJaUJ6ZEVWMmREcDNhR1Z1UFNJeU1ESXlMVEV3TFRFelZESXdPakV3T2pBNUt6QXlPakF3SWk4K0lEd3ZjbVJtT2xObGNUNGdQQzk0YlhCTlRUcElhWE4wYjNKNVBpQThMM0prWmpwRVpYTmpjbWx3ZEdsdmJqNGdQQzl5WkdZNlVrUkdQaUE4TDNnNmVHMXdiV1YwWVQ0Z0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0FnSUNBZ0lDQWdJQ0E4UDNod1lXTnJaWFFnWlc1a1BTSjNJajgrJy8+Cjwvc3ZnPg==";
	}
	
	getPlusIcon () {
		return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA0NDggNTEyJz48IS0tIUZvbnQgQXdlc29tZSBGcmVlIDYuNi4wIGJ5IEBmb250YXdlc29tZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tIExpY2Vuc2UgLSBodHRwczovL2ZvbnRhd2Vzb21lLmNvbS9saWNlbnNlL2ZyZWUgQ29weXJpZ2h0IDIwMjQgRm9udGljb25zLCBJbmMuLS0+PHBhdGggZD0nTTI1NiA4MGMwLTE3LjctMTQuMy0zMi0zMi0zMnMtMzIgMTQuMy0zMiAzMmwwIDE0NEw0OCAyMjRjLTE3LjcgMC0zMiAxNC4zLTMyIDMyczE0LjMgMzIgMzIgMzJsMTQ0IDAgMCAxNDRjMCAxNy43IDE0LjMgMzIgMzIgMzJzMzItMTQuMyAzMi0zMmwwLTE0NCAxNDQgMGMxNy43IDAgMzItMTQuMyAzMi0zMnMtMTQuMy0zMi0zMi0zMmwtMTQ0IDAgMC0xNDR6Jy8+PC9zdmc+";
	}
	
	getEditIcon () {
		return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA1MTIgNTEyJz48IS0tIUZvbnQgQXdlc29tZSBGcmVlIDYuNi4wIGJ5IEBmb250YXdlc29tZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tIExpY2Vuc2UgLSBodHRwczovL2ZvbnRhd2Vzb21lLmNvbS9saWNlbnNlL2ZyZWUgQ29weXJpZ2h0IDIwMjQgRm9udGljb25zLCBJbmMuLS0+PHBhdGggZD0nTTE0Mi45IDE0Mi45Yy0xNy41IDE3LjUtMzAuMSAzOC0zNy44IDU5LjhjLTUuOSAxNi43LTI0LjIgMjUuNC00MC44IDE5LjVzLTI1LjQtMjQuMi0xOS41LTQwLjhDNTUuNiAxNTAuNyA3My4yIDEyMiA5Ny42IDk3LjZjODcuMi04Ny4yIDIyOC4zLTg3LjUgMzE1LjgtMUw0NTUgNTVjNi45LTYuOSAxNy4yLTguOSAyNi4yLTUuMnMxNC44IDEyLjUgMTQuOCAyMi4ybDAgMTI4YzAgMTMuMy0xMC43IDI0LTI0IDI0bC04LjQgMGMwIDAgMCAwIDAgMEwzNDQgMjI0Yy05LjcgMC0xOC41LTUuOC0yMi4yLTE0LjhzLTEuNy0xOS4zIDUuMi0yNi4ybDQxLjEtNDEuMWMtNjIuNi02MS41LTE2My4xLTYxLjItMjI1LjMgMXpNMTYgMzEyYzAtMTMuMyAxMC43LTI0IDI0LTI0bDcuNiAwIC43IDBMMTY4IDI4OGM5LjcgMCAxOC41IDUuOCAyMi4yIDE0LjhzMS43IDE5LjMtNS4yIDI2LjJsLTQxLjEgNDEuMWM2Mi42IDYxLjUgMTYzLjEgNjEuMiAyMjUuMy0xYzE3LjUtMTcuNSAzMC4xLTM4IDM3LjgtNTkuOGM1LjktMTYuNyAyNC4yLTI1LjQgNDAuOC0xOS41czI1LjQgMjQuMiAxOS41IDQwLjhjLTEwLjggMzAuNi0yOC40IDU5LjMtNTIuOSA4My44Yy04Ny4yIDg3LjItMjI4LjMgODcuNS0zMTUuOCAxTDU3IDQ1N2MtNi45IDYuOS0xNy4yIDguOS0yNi4yIDUuMlMxNiA0NDkuNyAxNiA0NDBsMC0xMTkuNiAwLS43IDAtNy42eicvPjwvc3ZnPg==";
	}
	
	getTrashIcon () {
		return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA0NDggNTEyJz48IS0tIUZvbnQgQXdlc29tZSBGcmVlIDYuNi4wIGJ5IEBmb250YXdlc29tZSAtIGh0dHBzOi8vZm9udGF3ZXNvbWUuY29tIExpY2Vuc2UgLSBodHRwczovL2ZvbnRhd2Vzb21lLmNvbS9saWNlbnNlL2ZyZWUgQ29weXJpZ2h0IDIwMjQgRm9udGljb25zLCBJbmMuLS0+PHBhdGggZD0nTTEzNS4yIDE3LjdDMTQwLjYgNi44IDE1MS43IDAgMTYzLjggMEwyODQuMiAwYzEyLjEgMCAyMy4yIDYuOCAyOC42IDE3LjdMMzIwIDMybDk2IDBjMTcuNyAwIDMyIDE0LjMgMzIgMzJzLTE0LjMgMzItMzIgMzJMMzIgOTZDMTQuMyA5NiAwIDgxLjcgMCA2NFMxNC4zIDMyIDMyIDMybDk2IDAgNy4yLTE0LjN6TTMyIDEyOGwzODQgMCAwIDMyMGMwIDM1LjMtMjguNyA2NC02NCA2NEw5NiA1MTJjLTM1LjMgMC02NC0yOC43LTY0LTY0bDAtMzIwem05NiA2NGMtOC44IDAtMTYgNy4yLTE2IDE2bDAgMjI0YzAgOC44IDcuMiAxNiAxNiAxNnMxNi03LjIgMTYtMTZsMC0yMjRjMC04LjgtNy4yLTE2LTE2LTE2em05NiAwYy04LjggMC0xNiA3LjItMTYgMTZsMCAyMjRjMCA4LjggNy4yIDE2IDE2IDE2czE2LTcuMiAxNi0xNmwwLTIyNGMwLTguOC03LjItMTYtMTYtMTZ6bTk2IDBjLTguOCAwLTE2IDcuMi0xNiAxNmwwIDIyNGMwIDguOCA3LjIgMTYgMTYgMTZzMTYtNy4yIDE2LTE2bDAtMjI0YzAtOC44LTcuMi0xNi0xNi0xNnonLz48L3N2Zz4=";
	}
	
	async render(params){

			if(params)
				Object.assign(this.options, params);
			
			let options= Object.assign({}, await this.defaultOptions(), this.options);
			
			let templateEl = null;
			if(options && options.renderContext.length >0){
				templateEl = document.querySelector("template[id="+options.renderContext+"]");	
			}
			
			if(!templateEl)
				templateEl = document.querySelector("div[id="+options.id+"]");
			
			let parent = templateEl.parentElement;
			parent.removeChild(templateEl);
			let barEl =Utils.htmlToElement(options.template);
			if(options?.classList) barEl.className += options.classList;
			parent.append(barEl);
			this.activateListeners(barEl);
						
			if(!this.isEnable()){
				document.querySelector("#dicebar").style.display = 'None';
				console.log("DiceBar Enable:" + this.isEnable());
			}
	}

	/* -------------------------------------------- */

	getData(options) {
		this.dice = this._getDiceByPage(this.page);
		return {
			template: "dicebar",
			page: this.page,
			dice: this.dice,
			barClass: this._collapsed ? "collapsed" : ""
		};
	}

	/* -------------------------------------------- */

	/**
	 * Get the Array of Dice (or null) values that should be displayed on a numbered page of the DiceBar
	 * @param {number} page
	 * @returns {Array}
	 * @private
	 */
	_getDiceByPage(page) {
		const dice = [];
		let i = 0;
		connectedDice.forEach((die) => {
			dice.push(this.getDiceBarItem(die,i));
			i++;
		});
		dice.push(this.getDiceBarItem(new Object(),i));
		Utils.setDiceBarMaxSlots();
		return dice;
	}

	/**
	* Get an Array of Dice Entities on this User's Hotbar by page
	* @param {number} page     The dicebar page number
	* @return {Array.<Object>}
	*/
	getDiceBarItem(die, i) {
		let imgFolder = Utils.getModulePath() + "images/";
		let isDice = die instanceof GoDiceExt || die instanceof GoDice;
		let dieType = isDice ? die.getDieType(true).replace("X", "") : "";
		let dieColor = isDice ? die.getDieColor(true) : "";
		let d = new Object();
		
		d.customSlot = parseInt(i) < 9 ? parseInt(i) + 1 : 0;
		d.cssClass = isDice ? "active" : "inactive";
		d.icon = isDice ? 'fas fa-dice-' + dieType.toLowerCase() : 'fas fa-plus';
		d.img = isDice ? new GoDiceExt().diceImages[dieType] : this.getBorderedPlusIcon();
		d.dieColor = isDice? dieColor : "";
		d.diceId = isDice ? die.diceId : "";
		d.tooltip = isDice ? dieType + " - " + dieColor : "GODICE_ROLLS.Tools.AddDice";
		
		return d;
	}

	/* -------------------------------------------- */
	/**
	 * Collapse the ui.dicebar, minimizing its display.
	 * @return {Promise}    A promise which resolves once the collapse animation completes
	 */
	async collapse() {
		if (this._collapsed) return true;
		const toggle =  document.querySelector("#dicebar-toggle");
		const icon = toggle.querySelector("i");
		const bar =  document.querySelector("#dice-action-bar");
		return new Promise(resolve => {
			$(bar).slideUp(200, () => {
				bar.classList.add("collapsed");
				icon.classList.remove("fa-caret-down");
				icon.classList.add("fa-caret-up");
				this._collapsed = true;
				resolve(true);
			});
		});
	}

	/* -------------------------------------------- */
	/**
	 * Expand the CustomHotbar, displaying it normally.
	 * @return {Promise}    A promise which resolves once the expand animation completes
	 */
	expand() {
		if (!this._collapsed) return true;
		const toggle =  document.querySelector("#dicebar-toggle");
		const icon = toggle.querySelector("i");
		const bar =  document.querySelector("#dice-action-bar");
		return new Promise(resolve => {
			$(bar).slideDown(200, () => {
				bar.style.display= "block";
				bar.classList.remove("collapsed");
				icon.classList.remove("fa-caret-up");
				icon.classList.add("fa-caret-down");
				this._collapsed = false;
				resolve(true);
			});
		});
	}

	/* -------------------------------------------- */

	_onToggleBar(){
		if (this._collapsed){
			this.expand();
		}else{
			this.collapse();
		}
	}
	
	/** @inheritdoc */
	_contextMenu(element) {
		element.querySelectorAll(".dice.active").forEach((elem) => {
			$(elem).contextPopup({
				title: 'Modify Die',
			    items: this._getEntryContextOptions()
			});
		});
		element.querySelectorAll(".dice.inactive").forEach((elem) => {
			$(elem).contextPopup({
				title: 'Add Die',
			    items:this._getEntryContextEmptyOptions()
			});
		});
		
		
		//element.querySelectorAll(".dice.inactive").forEach((elem) => {$(elem).simpleContextMenu({options: this._getEntryContextEmptyOptions()})});
		//ContextMenu.create(this, html, ".dice.inactive", this._getEntryContextEmptyOptions());
	}

	/* -------------------------------------------- */

	/**
	 * Get the Dice entry context options
	 * @returns {object[]}  The Dice entry context options
	 * @private
	 */
	_getEntryContextOptions() {
		return [
			{
				label: "EditType",
				icon: this.getEditIcon(),
				action: async li => {
					let diceInstance = connectedDice.get(li.currentTarget.dataset?.diceId);
					let diePrompt = new DieTypePrompt();
					let dieType = await diePrompt.showTypePrompt(diceInstance);
					if(dieType) {
						diceInstance.setDieType(dieType);
						Utils.saveDices();
					}else
						console.log("Error retrieving die type.", diceInstance);
					this.render();
				}
			},
			{
				label: "RemoveDice",
				icon: this.getTrashIcon(),
				action: async li => {
					Utils.disconnectDice(li.currentTarget.dataset?.diceId);
				}
			},
		];
	}
	
		/**
	 * Get the Dice entry context options
	 * @returns {object[]}  The Dice entry context options
	 * @private
	 */
	_getEntryContextEmptyOptions() {
		return [
			{
				label: "AddDice",
				icon: this.getPlusIcon(),
				action: async li => {
					Utils.openConnectionDialog();
				}
			},
		];
	}

	/* -------------------------------------------- */
	/*  Event Listeners and Handlers
	  /* -------------------------------------------- */
	/** @override */
	activateListeners(element) {
		// Macro actions
		element.querySelector("#dicebar-toggle").addEventListener("click", this._onToggleBar.bind(this));
		element.querySelectorAll(".dice").forEach((elem) => {elem.addEventListener("click", this._onClickDie.bind(this))});

		// Activate context menu
		this._contextMenu(element);
	}

	/* -------------------------------------------- */

	/**
	 * Handle left-click events
	 * @param event
	 * @private
	 */
	async _onClickDie(event) {
		console.debug("Die click detected!", event);

		event.preventDefault();
		const li = event.currentTarget;

		// Case 1 - connect a new die
		if (li.classList.contains("inactive")) {
			Utils.openConnectionDialog();
		}

		// Case 2 - make die blink
		else {
			const die = connectedDice.get(li.dataset.diceId);
			die?die.pulseLed(5, 5, 5, [0, 0, 255]):"";
		}
	}
}