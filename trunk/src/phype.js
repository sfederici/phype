// Imports
function importScript(scriptName) {
	var script = document.createElement('script');
	script.src = scriptName;
	script.type = 'text/javascript';
	script.defer = true;
	
	// Insert the created object to the body
	document.body.appendChild(script);
}

window.onload = function() {
	if (phypeTestSuite) {
		prefix = '../';
		importScript(prefix+'src/phypeUtils.js');
		importScript(prefix+'src/phypeTestSuiteLoader.js');
		importScript(prefix+'src/phypeParser.js');
	} else {
		importScript('src/phypeUtils.js');
		importScript('src/phypeLoader.js');
		importScript('src/phypeParser.js');
	}
}