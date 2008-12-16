var inBrowser = false;
var phypeTestSuite = true;

function SCRIPT(name, code) {
	this.name = name;
	this.code = code;
}
res = '';
for (var i=0; i<phpScripts.length; i++) {
	var failed = false;
	var thrownException = null;
	var secs = 'Unknown';
	try {
		var begin = new Date();
		interpret(phpScripts[i].code);
		var end = new Date();
		secs = ((end.getTime() - begin.getTime())/1000);
	} catch(exception) {
		failed = true;
		thrownException = exception;
	}

	if (pstate.assertion) {
		res = res+phpScripts[i].name+' '+secs+'\n';
		switch (pstate.assertion.type) {
			case ASS_ECHO:
				if (thrownException)
					res = res+'FAIL: Thrown exception: '+thrownException+'\n';
				break;
			case ASS_FAIL:
				if (!failed)
					res = res+'FAIL: Expected script to fail,'+
							' but no exceptions were raised.\n';
		}
		pstate.assertion = null;
	}
	
	resetState();
}
print(res);

// Set our echo-accumulation variable used for testing assertions against after parsing.
var phypeEcho = '';

// Set our phypeOut-variable (this function takes the generated parser-output, and should
// output this somewhere appropriate).
var phypeOut = function(out) {}