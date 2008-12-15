var fromShell = false;

/**
 * Borrowed from http://snippets.dzone.com/posts/show/2025
 */
var ajax={};
ajax.x=function(){try{return new ActiveXObject('Msxml2.XMLHTTP')}catch(e){try{return new ActiveXObject('Microsoft.XMLHTTP')}catch(e){return new XMLHttpRequest()}}};
ajax.send=function(u,f,m,a){var x=ajax.x();x.open(m,u,true);x.onreadystatechange=function(){if(x.readyState==4)f(x.responseText)};if(m=='POST')x.setRequestHeader('Content-type','application/x-www-form-urlencoded');x.send(a)};
ajax.gets=function(url){var x=ajax.x();x.open('GET',url,false);x.send(null);return x.responseText};
ajax.get=function(url,func){ajax.send(url,func,'GET')};

function SCRIPT(name, code) {
	this.name = name;
	this.code = code;
}

// Container for php scripts to be executed within our test suite
var phpScripts = [];

function loadPHPScripts() {
	var phpCode = '';
	var tmpScripts = [];
	var scripts = document.getElementsByTagName('script');
	var nonSourceCt = 0;
	for (var i=0; i<scripts.length; i++) {
		if (scripts[i].type == 'text/php') {
			if (scripts[i].src) {
				tmpScripts[tmpScripts.length] = new SCRIPT( scripts[i].src, ajax.gets(scripts[i].src) );
			} else {
				tmpScripts[tmpScripts.length] = new SCRIPT( "inline"+nonSourceCt, scripts[i].innerHTML );
			}
		}
	}

	return tmpScripts;
}

phpScripts = loadPHPScripts();
// Set our phypeDoc-variable. This should contain the document that phype should output to.
var phypeTestDoc = {
	writeTitle : function(str) {
		document.write('<td class="scriptTitle">'+str+'</td>\n');
	},
	
	writeExecTime : function(str) {
		document.write('<td class="execTime">'+str+'</td>\n');
	},
	
	writeStatus : function(statusType, str) {
		document.write('<td class="'+statusType+'">'+str+'</td>');
	},
	
	write : function(str) {
		document.write(str);
	}
}

// Set our echo-accumulation variable used for testing assertions against after parsing.
var phypeEcho = '';

// Set our phypeOut-variable (this function takes the generated parser-output, and should
// output this somewhere appropriate).
var phypeOut = function(out) {
	phypeEcho += out;
}

/**
 * Borrowed from http://snippets.dzone.com/posts/show/4296
 */
function var_dump(data,addwhitespace,safety,level) {
	var rtrn = '';
	var dt,it,spaces = '';
	if(!level) {level = 1;}
	for(var i=0; i<level; i++) {
		spaces += '   ';
	}//end for i<level
	if(typeof(data) != 'object') {
		dt = data;
		if(typeof(data) == 'string') {
			if(addwhitespace == 'html') {
				dt = dt.replace(/&/g,'&amp;');
				dt = dt.replace(/>/g,'&gt;');
				dt = dt.replace(/</g,'&lt;');
			}//end if addwhitespace == html
			dt = dt.replace(/\"/g,'\"');
			dt = '"' + dt + '"';
		}//end if typeof == string
		if(typeof(data) == 'function' && addwhitespace) {
			dt = new String(dt).replace(/\n/g,"<br/>"+spaces);
			if(addwhitespace == 'html') {
				dt = dt.replace(/&/g,'&amp;');
				dt = dt.replace(/>/g,'&gt;');
				dt = dt.replace(/</g,'&lt;');
			}//end if addwhitespace == html
		}//end if typeof == function
		if(typeof(data) == 'undefined') {
			dt = 'undefined';
		}//end if typeof == undefined
		if(addwhitespace == 'html') {
			if(typeof(dt) != 'string') {
				dt = new String(dt);
			}//end typeof != string
			dt = dt.replace(/ /g,"&nbsp;").replace(/\n/g,"<br/>");
		}//end if addwhitespace == html
		return dt;
	}//end if typeof != object && != array
	for (var x in data) {
		if(safety && (level > safety)) {
			dt = '*RECURSION*';
		} else {
			try {
			dt = var_dump(data[x],addwhitespace,safety,level+1);
			} catch (e) {continue;}
		}//end if-else level > safety
		it = var_dump(x,addwhitespace,safety,level+1);
		rtrn += it + ':' + dt + ',';
		if(addwhitespace) {
			rtrn += '<br/>'+spaces;
		}//end if addwhitespace
	}//end for...in
	if(addwhitespace) {
		rtrn = '{<br/>' + spaces + rtrn.substr(0,rtrn.length-(2+(level*3))) + '<br/>' +
					spaces.substr(0,spaces.length-3) + '}';
	} else {
		rtrn = '{' + rtrn.substr(0,rtrn.length-1) + '}';
	}//end if-else addwhitespace
	if(addwhitespace == 'html') {
		rtrn = rtrn.replace(/ /g,"&nbsp;").replace(/\n/g,"<br/>");
	}//end if addwhitespace == html
	return rtrn;
}

/**
 * Borrowed from http://ajaxcookbook.org/javascript-debug-log/
 */
function log(message) {
	if (!log.window_ || log.window_.closed) {
		var win = window.open("", null, "width=600,height=400," +
							"scrollbars=yes,resizable=yes,status=no," +
							"location=no,menubar=no,toolbar=no");
		if (!win) return;
		var doc = win.document;
		doc.write("<html><head><title>Debug Log</title></head>" +
				"<body></body></html>");
		doc.close();
		log.window_ = win;
	}
	var logLine = log.window_.document.createElement("div");
	logLine.appendChild(log.window_.document.createTextNode(message));
	log.window_.document.body.appendChild(logLine);
}

function var_log(variable) {
	log(var_dump(variable));
}