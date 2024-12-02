import { Utils } from './Utils.js';
import { RollResult } from "./RollResult.js";
import { GoDiceExt } from "./GoDiceExt.js";
import { settings } from "../settings.js";
import * as css from "../style/main.css";
import  "../templates/template.hbs";

export { RollResult };
export { Utils };

let scripts = [
	//GoDiceLibrary dependences ({src:url , type:"module"(optional for module)})
	{ src: "lib/handlebars.min-v4.7.8.js" },
	{ src: "lib/jquery.contextmenu.js" },
	//Always last
	{ src: "module/startup.js", type:"module"}
];

let styles = [
	//GoDiceLibrary stylesheet
	"style/main.css"
];

console.debug("GoDiceLibrary module loading");

window.godice = {};
window.godice.godiceext = new GoDiceExt();
window.godice.settings = settings.default;
Utils.getModulePath();
Utils.injectScript(scripts);
Utils.injectStylesheet(styles);

console.debug("GoDiceLibrary module loaded");