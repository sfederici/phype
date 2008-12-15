var inBrowser = false;
var phypeTestSuite = true;

function SCRIPT(name, code) {
	this.name = name;
	this.code = code;
}
var res = 'TESTCASE                  | TIME       | STATUS         \n';
var res = res+'==========================|============|================\n';
for (var i=0; i<phpScripts.length; i++) {
	var failed = false;
	var thrownException = null;
	var secs = 'Unknown';
	try {
		var begin = new Date();
		interpret(phpScripts[i].code);
		var end = new Date();
		secs = ((end.getTime() - begin.getTime())/1000)+" sec";
	} catch(exception) {
		failed = true;
		thrownException = exception;
	}

	if (pstate.assertion) {
		res = res+truncate(phpScripts[i].name, 25);
		res = res+' | ';
		res = res+truncate(secs, 10);
		res = res+' | ';
		switch (pstate.assertion.type) {
			case ASS_ECHO:
				if (thrownException)
					res = res+'FAIL: Thrown exception: '+thrownException+'\n';
				else if (phypeEcho != pstate.assertion.value) {
					res = res+'OK\n';
				}
				break;
			case ASS_FAIL:
				if (!failed)
					res = res+'FAIL: Expected script to fail,'+
							' but no exceptions were raised.\n';
				else {
					res = res+'OK\n';
				}
		}
		pstate.assertion = null;
	}
	
	resetState();
}
print(res);

function truncate(str, amount) {
	if (str.length < amount) {
		while (str.length<amount) {
			str += ' ';
		}
	} else if (str.length > amount) {
		str = str.substring(0, amount);
	}
	
	return str;
}

// Set our echo-accumulation variable used for testing assertions against after parsing.
var phypeEcho = '';

// Set our phypeOut-variable (this function takes the generated parser-output, and should
// output this somewhere appropriate).
var phypeOut = function(out) {
	phypeEcho += out;
}