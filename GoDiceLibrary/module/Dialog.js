import { validateHTMLString } from "./Utils.js";
import { Popup }  from "./Popup.js";

export class Dialog extends Popup{
		
	constructor(params = {}) {
		params.id = params.id ?? "dialog";
		params.loadCallback = (popup) => { 
			console.debug("Popup ",popup.id," Loaded");
		};
		params.hideCallback = (popup) => {
			var el = document.getElementsByClassName(popup.id)[0];
			el.parentNode.removeChild(el);
			if(!this.data) this.cancel = true;
			console.debug("Popup closed!");
		};
		params.htmlcontent = validateHTMLString(params.content);
		super(params);
		this.data = null;
		this.cancel = null;
		this.popupEl.id = this.id;
		if(params.background) this.popupEl.getElementsByClassName("popup-content")[0].style.background = params.background;
		var form = document.getElementById(this.id).querySelectorAll("form")[0];
		form?.addEventListener("submit", this.handleSubmit.bind(this));
		var popupclose = document.getElementById(this.id).querySelectorAll(".popup-close")[0];
		popupclose?.addEventListener("click", this.handleSubmit.bind(this));
	}
	
	show(){
		super.show();
		return new Promise(this.waitForData.bind(this));
	}
		
	close(data){
		this.data = data;
		this.hide();
	}
	
	handleSubmit(event) {
		event.preventDefault();
		this.close(event.target);
	}
	
	waitForData(resolve, reject) {
        if (this.data)
            resolve(this.data);
        else if (this.cancel)
            reject(new Error("Cancelled"));
        else
            setTimeout(this.waitForData.bind(this, resolve, reject), 30);
    }
	
}