function loadPHP() {
	var phpCode = '';
	var scripts = document.getElementsByTagName('script');
	for (var i=0; i<scripts.length; i++) {
		if (scripts[i].type == 'text/php') {
			if (scripts[i].src)
				phpCode += ajax.gets(scripts[i].src);
			else
				phpCode += scripts[i].innerHTML;
		}
	}

	return phpCode;
}

// Set our phypeIn-variable (the return of this function will be parsed by our phypeParser).
var phypeIn = loadPHP;

// Set our phypeOut-variable (this function takes the generated parser-output, and should
// output this somewhere appropriate).
var phypeOut = function(out) {
	document.write(out);
}
