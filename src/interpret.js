window.onload = function(){
	// Import and compile PHP scripts
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

	document.body.innerHTML = interpreter.interpret(phpScripts);
}

var interpreter = {
	currentScript : '',
	curOp : 0,
	
	/**
	 * Interprets an array of JSON-objects with parsekit formatted opcodes.
	 * 
	 * @param {Array} phypeCodes An array of JSON-objects with parsekit formatted opcodes.
	 */
	interpret : function(phpScripts) {
		var output = '';
		for (var i=0; i<phpScripts.length; i++) {
			interpreter.currentScript = phpScripts[i]
			var phypeCodes = eval(ajax.gets('src/phpToJSON.php?file='+phpScripts[i]));
			str = "function_table";

			// Iterate through op array without iterating through function- and class-table.
			while (phypeCodes[interpreter.curOp] && phypeCodes[interpreter.curOp] != 'undefined') {
				var op = parser.parse(phypeCodes[interpreter.curOp]);

				output += eval(op.code+'("'+op.arg1+'", "'+op.arg2+'", "'+op.arg3+'")');
				alert(op.code+'("'+op.arg1+'", "'+op.arg2+'", "'+op.arg3+'")');
				
				interpreter.curOp++;
			}
		}
		
		return output;
	}
}

/***********
 * HELPERS *
 ***********/
var parser = {
	/**
	 * Takes a parsekit formatted opcode string and parses it into a JSON object with the properties:
	 *  - command: The name of the opcode.
	 *  - arg1: First argument.
	 *  - arg2: Second argument.
	 *  - arg3: Third argument.
	 * 
	 * @param {String} phypeCode The opcode string to parse.
	 */
	parse : function(phypeCode) {
		var json = {};

		var firstSpace = phypeCode.indexOf(' ');
		json.code = phypeCode.substring(0,firstSpace);
		
		var argStr = phypeCode.substring(firstSpace,phypeCode.length);
		json.arg1 = argStr.match(/('[^']*'|UNUSED|NULL|T\([0-9]+\)|[0-9]+|0x[a-fA-F0-9]+|#[0-9]+)/)[0];
		json.arg1 = parser.parseString(json.arg1);
		
		argStr = argStr.substring(json.arg1.length,argStr.length);
		json.arg2 = argStr.match(/('[^']*'|UNUSED|NULL|T\([0-9]+\)|[0-9]+|0x[a-fA-F0-9]+|#[0-9]+)/)[0];
		json.arg2 = parser.parseString(json.arg2);
		
		argStr = argStr.substring(json.arg2.length,argStr.length);
		json.arg3 = argStr.match(/('[^']*'|UNUSED|NULL|T\([0-9]+\)|[0-9]+|0x[a-fA-F0-9]+|#[0-9]+)/)[0];
		json.arg3 = parser.parseString(json.arg3);
		
		return json;
	},
	
	/**
	 * Removes pings from strings and removes the annoying three dots added to strings over 16 chars.
	 */
	parseString : function(str) {
		if (str.indexOf('\'')==0 && str.length > 19)
			str = str.substring(1, str.length-4);
		
		return str;
	},
	
	/**
	 * Converts variable reference-numbers from "T(xx)" to simply "xx".
	 */
	parseVar : function(str) {
		var num = str.match(/[0-9]+/);
		
		return num;
	},
	
	/**
	 * 
	 */
	generateSymTable : function(str) {
		// Strip all white-space.
		var str = str.replace(/\s*|\n*|\f*|\r*|\t*|\v*/,'');
		
		// Find all assignments
		var assigns = str.match(/$[a-zA-Z0-9_]=[^;]+;/);
		for (var i=0; i<assigns.length; i++) {
			
		}
	}
}

var symTables = {};