// Imports
function importScript(scriptName) {
	var script = document.createElement('script');
	script.src = scriptName;
	script.type = 'text/javascript';
	script.defer = true;
	
	// Insert the created object to the html head element
	var head = document.getElementsByTagName('head').item(0);
	head.appendChild(script);
}

if (debugOn) importScript('src/debug.js');
importScript('src/utils.js');
importScript('jsparse/jsparse.js');
importScript('src/ops.js');
importScript('src/interpret.js');