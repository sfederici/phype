
function importPHPScripts() {
	var phpScripts = [];
	var scripts = document.getElementsByTagName('script');
	for (var i=0; i<scripts.length; i++) {
		if (scripts[i].type == 'text/php') {
			phpScripts[phpScripts.length] = scripts[i].src;
		}
	}
	
	return phpScripts;
}

var phpScripts = importPHPScripts();

var phypeScripts = [];
window.onload = function(){
	for (var i=0; i<phpScripts.length; i++) {
		phypeScripts[phypeScripts.length] = eval(ajax.gets('src/phpToJSON.php?file='+phpScripts[i]));
	}
	
	var phpOutput = '';
	for (var i=0; i<phypeScripts.length; i++) {
		phpOutput += interpret(phypeScripts[i]);
	}
	document.body.innerHTML = phpOutput;
}

/**
 * Interprets an array of JSON-objects with parsekit formatted opcodes.
 * 
 * @param {Array} phypeCodes An array of JSON-objects with parsekit formatted opcodes.
 */
function interpret(phypeCodes) {
	for (index in phypeCodes) {
		if (index != 'function_table' && index != 'class_table') {
			var op = parsePhypeCode(phypeCodes[index]);
			//alert('code: '+op.code+', arg1: '+op.arg1+', arg2: '+op.arg2+', arg3: '+op.arg3);
		}
	}
}

/**
 * UTILS
 */
var ajax={};
ajax.x=function(){try{return new ActiveXObject('Msxml2.XMLHTTP')}catch(e){try{return new ActiveXObject('Microsoft.XMLHTTP')}catch(e){return new XMLHttpRequest()}}};
ajax.send=function(u,f,m,a){var x=ajax.x();x.open(m,u,true);x.onreadystatechange=function(){if(x.readyState==4)f(x.responseText)};if(m=='POST')x.setRequestHeader('Content-type','application/x-www-form-urlencoded');x.send(a)};
ajax.gets=function(url){var x=ajax.x();x.open('GET',url,false);x.send(null);return x.responseText};
ajax.get=function(url,func){ajax.send(url,func,'GET')};

/**
 * Takes a parsekit formatted opcode string and parses it into a JSON object with the properties:
 *  - command: The name of the opcode.
 *  - arg1: First argument.
 *  - arg2: Second argument.
 *  - arg3: Third argument.
 * 
 * @param {String} phypeCode The opcode string to parse.
 */
function parsePhypeCode(phypeCode) {
	var json = {};
	
	var firstSpace = phypeCode.indexOf(' ');
	json.code = phypeCode.substring(0,firstSpace);
	var argStr = phypeCode.substring(firstSpace,phypeCode.length);
	json.arg1 = argStr.match(/('[^']*'|UNUSED|NULL|T\([0-9]+\)|[0-9]+|0x[a-fA-F0-9]+)/)[0];
	argStr = argStr.substring(json.arg1.length,argStr.length);
	json.arg2 = argStr.match(/('[^']*'|UNUSED|NULL|T\([0-9]+\)|[0-9]+|0x[a-fA-F0-9]+)/)[0];
	argStr = argStr.substring(json.arg2.length,argStr.length);
	json.arg3 = argStr.match(/('[^']*'|UNUSED|NULL|T\([0-9]+\)|[0-9]+|0x[a-fA-F0-9]+)/)[0];
	
	return json;
}