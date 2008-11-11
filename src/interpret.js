
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
 * Interprets an array of ZEND byte codes in JSON-format.
 * 
 */
function interpret(phypeCodes) {
	for (code in phypeCodes) {
		if (code != '')
		alert(phypeCodes[code]);
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
