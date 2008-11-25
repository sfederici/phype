[*
//////////////////////////////////////
// GLOBALLY USED VARS AND FUNCTIONS //
//////////////////////////////////////

/**
 * Sym table for looking up values.
 */
var symTables = {};

/**
 * Val table for keeping values
 */
var valTable = {};

/**
 * Variable for keeping track of currently executing function.
 */
var curFun = '.global';

/**
 * Variable for keeping track of formal parameters for a function declaration.
 */
var curParams = [];

/**
 * Variable for keeping track of currently passed actual parameters of a function invocation.
 */
var passedParams = 0;

/**
 * Function table
 */
var funTable = {};

/**
 * Node object
 */
function NODE() {
	var type;
	var value;
	var children;
}

/**
 * Function object
 */
function FUNC() {
	var name;
	var params;
	var nodes;
}

/**
 * Function for creating node objects.
 */
function createNode( type, value, children ) {
	var n = new NODE();
	n.type = type;
	n.value = value;	
	n.children = new Array();
	
	for( var i = 2; i < arguments.length; i++ )
		n.children.push( arguments[i] );
		
	return n;
}

/**
 * Function for creating functions.
 */
function createFunction( name, params, nodes ) {
	var f = new FUNC();
	f.name = name;
	f.params = params;
	f.nodes = new Array();
	
	for( var i = 2; i < arguments.length; i++ )
		f.nodes.push( arguments[i] );
		
	return f;
}

/**
 * For linking variable references to values, preserving scopes.
 */
var linker = {
	assignVar : function(varName, value, scope) {
		if (!scope)
			scope = curFun;
		
		if (!symTables[scope] || symTables[scope] == 'undefined')
			symTables[scope] = {};
		
		symTables[scope][varName] = scope+'#'+varName
		valTable[scope+'#'+varName] = value;
	},
	
	getValue : function(varName) {
		var firstChar = varName.substring(0,1);
		if (firstChar == "$") {
			varName = linker.getValue( varName.substring(1,varName.length) );
		}

		if (symTables[curFun] && symTables[curFun][varName])
			return valTable[symTables[curFun][varName]];

		return valTable['.global#'+varName];
	},
	
	/*linkArrKey : function( ) {
		
	}*/
	
	linkVar : function(locVarName, varName, scope) {
		if (!scope)
			scope = curFun;
		
		if (!symTables[scope])
			symTables[scope] = {};
		
		symTables[scope][locVarName] = varName;
		if (!valTable[scope+'#'+varName])
			valTable[scope+'#'+varName] = null;
	},
	
	unlinkVar : function(varName, scope) {
		if (!scope)
			scope = curFun;
		
		delete valTable[symTables[scope][varName]];
		delete symTables[scope+'#'+varName];
	}
	
}


////////////////////
// OP DEFINITIONS //
////////////////////
var NODE_OP	= 0;
var NODE_VAR	= 1;
var NODE_CONST	= 2;

var OP_NONE	= -1;
var OP_ASSIGN	= 0;
var OP_IF	= 1;
var OP_IF_ELSE	= 2;
var OP_WHILE_DO	= 3;
var OP_DO_WHILE	= 4;
var OP_FCALL = 5;
var OP_PASS_PARAM = 6;
var OP_ECHO	= 7;

var OP_EQU	= 10;
var OP_NEQ	= 11;
var OP_GRT	= 12;
var OP_LOT	= 13;
var OP_GRE	= 14;
var OP_LOE	= 15;
var OP_ADD	= 16;
var OP_SUB	= 17;
var OP_DIV	= 18;
var OP_MUL	= 19;
var OP_NEG	= 20;


////////////////
// EXCEPTIONS //
////////////////
function funNotFound() {
	return 'Function not found: '+curFun;
}

function funInvalidArgCount(argCount) {
	return 'Function '+curFun+'( ) expecting '+passedParams+' arguments, but only found '+(f.params.length-passedParams)+'.';
} 

var ops = {
	// OP_NONE
	'-1' : function(node) {
		var ret = null;
		if( node.children[0] )
			ret = execute( node.children[0] );
		if( node.children[1] )
			ret = ret+execute( node.children[1] );

		return ret;
	},
	
	//OP_ASSIGN
	'0' : function(node) {
		linker.assignVar( node.children[0], execute( node.children[1] ) );
	},
	
	// OP_IF
	'1' : function(node) {
		if( execute( node.children[0] ) )
			return execute( node.children[1] );
	},
	
	// OP_IF_ELSE
	'2' : function(node) {
		if( execute( node.children[0] ) )
			return execute( node.children[1] );
		else
			return execute( node.children[2] );
	},
	
	// OP_WHILE_DO
	'3' : function(node) {
		var ret = 0;
		while( execute( node.children[0] ) )
			ret = ret+execute( node.children[1] );
			
		return ret;
	},

	// OP_DO_WHILE
	'4' : function(node) {
		var ret = 0;
		do {
			ret = ret+execute( node.children[0] );
		} while( execute( node.children[1] ) );
		
		return ret;
	},
	
	// OP_FCALL
	'5' : function (node) {
		// State preservation
		var prevPassedParams = passedParams;
		passedParams = 0;
		
		var prevFun = curFun;
		curFun = node.children[0];

		// Initialize parameters for the function scope
		if ( node.children[1] )
			execute( node.children[1] );
		
		// Execute function
		var ret = '';
		var f = funTable[curFun];
		if ( f && f.params.length >= passedParams ) {
			for ( var i=0; i<f.nodes.length; i++ )
				ret += execute( f.nodes[i] );
		} else {
			if (!f)
				throw funNotFound();
			else if (!(f.params.length >= passedParams))
				throw funInvalidArgCount(f.params.length);
		}
		
		// Clear parameters for the function scope
		for ( var i=0; i<f.params.length; i++ )
			linker.unlinkVar( f.params[i] );
		
		// State roll-back
		passedParams = prevPassedParams;
		curFun = prevFun;
	},

	// OP_PASS_PARAM
	'6' : function(node) {
		// Initialize parameter name
		var f = funTable[curFun];

		if (!f)
			throw funNotFound();
		
		var paramName = '';
		if ( passedParams < f.params.length )
			paramName = f.params[passedParams].value;
		else
			paramName = '.arg'+passedParams;
			
		// Link parameter name with passed value
		if ( node.children[0] && node.children[0].type != OP_PASS_PARAM )
			linker.assignVar( paramName, execute( node.children[0] ) );
		else
			execute( node.children[0] );
		
		passedParams++;
		
		if ( node.children[1] ) {
			// Reinitialize parameter name
			var paramName = '';
			if ( passedParams < f.params.length )
				paramName = f.params[passedParams].value;
			else
				paramName = '.arg'+passedParams;
			
			// Link
			linker.assignVar( paramName, execute( node.children[1] ) );
		}
		
		passedParams++;
	},

	// OP_ECHO
	'7' : function(node) {
		var_log(symTables);
		var_log(valTable);
		alert( execute( node.children[0] ) );
	},
	
	// OP_EQU
	'10' : function(node) {
		return execute( node.children[0] ) == execute( node.children[1] );
	},
	
	// OP_NEQ
	'11' : function(node) {
		return execute( node.children[0] ) != execute( node.children[1] );
	},
	
	// OP_GRT
	'12' : function(node) {
		return execute( node.children[0] ) > execute( node.children[1] );
	},
	
	// OP_LOT
	'13' : function(node) {
		return execute( node.children[0] ) < execute( node.children[1] );
	},
	
	// OP_GRE
	'14' : function(node) {
		return execute( node.children[0] ) >= execute( node.children[1] );
	},
	
	// OP_LOE
	'15' : function(node) {
		return execute( node.children[0] ) <= execute( node.children[1] );
	},
	
	// OP_ADD
	'16' : function(node) {
		return execute( node.children[0] ) + execute( node.children[1] );
	},

	// OP_SUB
	'17' : function(node) {
		return execute( node.children[0] ) - execute( node.children[1] );
	},
	
	// OP_DIV
	'18' : function(node) {
		return execute( node.children[0] ) / execute( node.children[1] );
	},
	
	// OP_MUL
	'19' : function(node) {
		return execute( node.children[0] ) * execute( node.children[1] );
	},
	
	// OP_NEG
	'20' : function(node) {
		return execute( node.children[0] ) * -1;
	}
}

function execute( node ) {
	var ret = 0;
	
	if( !node ) {
		return 0;
	}

	switch( node.type ) {
		case NODE_OP:
			var tmp = ops[node.value](node);
			if (tmp && tmp != 'undefined')
			ret = tmp;
			break;
			
		case NODE_VAR:
			ret = linker.getValue( node.value );
			break;
			
		case NODE_CONST:
			ret = node.value;
			break;
	}
	
	return ret;
}

*]

!	' |\r|\n|\t'

	"IF"
	"ELSE"
	"WHILE"
	"DO"
	"ECHO"
	'{'
	'}'
	';'
	','
	'='
	'=='
	'!='
	'<='
	'>='
	'>'
	'<'
	'\+'
	'\-'
	'/'
	'\*'
	'\('
	'\)'
	'#'
	'\$[\$a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*'
									Variable
										[* %match = %match.substr(1,%match.length-1); *]
	'function [a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*'
									FunctionName
										[* %match = %match.substr(9,%match.length-1); *]
	'[\$a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*\('
									FunctionInvoke
										[* %match = %match.substr(0,%match.length-1); *]
	'\'([^\']|\'\')*\''				String	
										[*	%match = %match.substr(1,%match.length-2);
											%match = %match.replace( /\\'/g, "'" ); *]
	'[0-9]+'						Integer
	'[0-9]+\.[0-9]*|[0-9]*\.[0-9]+'	Float
	'\?>[^<\?]*'					ScriptEnd
	'<\?([pP][hH][pP])?'			ScriptBegin
	;

##

PHPScript:	PHPScript ScriptBegin Stmt ScriptEnd
										[*	execute( %3 );
											if (%4.length > 2) {
												var strNode = createNode( NODE_CONST, %4.substring(2,%4.length) );
												execute( createNode( NODE_OP, OP_ECHO, strNode ) );
											} *]
		|
		;

Stmt_List:	Stmt_List Stmt				[* %% = createNode( NODE_OP, OP_NONE, %1, %2 ); *]
		|
		;
								
Stmt:		Stmt Stmt					[* %% = createNode ( NODE_OP, OP_NONE, %1, %2 ) *]
		|	FunctionName '(' FormalParameterList ')' '{' Stmt '}'
										[* 	funTable[%1] = createFunction( %1, curParams, %6 );
											// Make sure to clean up param list for next function declaration
											curParams = []; *]
		|	Expression
		|	IF Expression Stmt 			[* %% = createNode( NODE_OP, OP_IF, %2, %3 ); *]
		|	IF Expression Stmt ELSE Stmt	
										[* %% = createNode( NODE_OP, OP_IF_ELSE, %2, %3, %5 ); *]
		|	WHILE Expression DO Stmt 	[* %% = createNode( NODE_OP, OP_WHILE_DO, %2, %4 ); *]
		|	DO Stmt WHILE Expression ';'	
										[* %% = createNode( NODE_OP, OP_DO_WHILE, %2, %4 ); *]
		|	ECHO Value ';'				[* %% = createNode( NODE_OP, OP_ECHO, %2 ); *]
		|	Variable '=' Expression ';'	[* %% = createNode( NODE_OP, OP_ASSIGN, %1, %3 ); *]
		|	'{' Stmt_List '}'			[* %% = %2; *]
		|	';'							[* %% = createNode( NODE_OP, OP_NONE ); *]
		;
		
FormalParameterList:
			FormalParameterList ',' Variable
										[* curParams[curParams.length] = createNode( NODE_CONST, %3 ); *]
		|	Variable					[* curParams[curParams.length] = createNode( NODE_CONST, %1 ); *]
		|
		;	

Expression:	UnaryOp
		|	FunctionInvoke ActualParameterList ')'
										[* %% = createNode( NODE_OP, OP_FCALL, %1, %2 ); *]
		;

ActualParameterList:
			ActualParameterList ',' Expression
										[* %% = createNode( NODE_OP, OP_PASS_PARAM, %1, %3 ); *]
		|	Expression
		|
		;

UnaryOp:	Expression '==' AddSubExp	[* %% = createNode( NODE_OP, OP_EQU, %1, %3 ); *]
		|	Expression '<' AddSubExp	[* %% = createNode( NODE_OP, OP_LOT, %1, %3 ); *]
		|	Expression '>' AddSubExp	[* %% = createNode( NODE_OP, OP_GRT, %1, %3 ); *]
		|	Expression '<=' AddSubExp	[* %% = createNode( NODE_OP, OP_LOE, %1, %3 ); *]
		|	Expression '>=' AddSubExp	[* %% = createNode( NODE_OP, OP_GRE, %1, %3 ); *]
		|	Expression '!=' AddSubExp	[* %% = createNode( NODE_OP, OP_NEQ, %1, %3 ); *]
		|	AddSubExp
		;

AddSubExp:	AddSubExp '-' MulDivExp		[* %% = createNode( NODE_OP, OP_SUB, %1, %3 ); *]
		|	AddSubExp '+' MulDivExp		[* %% = createNode( NODE_OP, OP_ADD, %1, %3 ); *]
		|	MulDivExp
		;
				
MulDivExp:	MulDivExp '*' NegExp		[* %% = createNode( NODE_OP, OP_MUL, %1, %3 ); *]
		|	MulDivExp '/' NegExp		[* %% = createNode( NODE_OP, OP_DIV, %1, %3 ); *]
		|	NegExp
		;
				
NegExp:		'-' Value					[* %% = createNode( NODE_OP, OP_NEG, %2 ); *]
		|	Value
		;

Value:		Variable					[* %% = createNode( NODE_VAR, %1 ); *]
		|	'(' Expression ')'			[* %% = %2; *]
		|	String						[* %% = createNode( NODE_CONST, %1 ); *]
		|	Integer						[* %% = createNode( NODE_CONST, %1 ); *]
		|	Float						[* %% = createNode( NODE_CONST, %1 ); *]
		;

[*

var str = prompt( "Please enter a PHP-script to be executed:",
	"<? function test($p1,$p2) { echo 'hello '; echo 'world'; echo $p1; } test('a','b'); ?>" );
	//"<? $a = 'b'; $b='Hello World'; echo $$$a; ?> hej <? echo 'hej igen.'; ?>" );

/**
 * Creates an echo  with non-PHP character data that precedes the first php-tag.
 */
function preParse(str) {
	var firstPhp = str.indexOf('<?');
	var res = '';
	if (firstPhp > 0 || firstPhp == -1) {
		if (firstPhp == -1) firstPhp = str.length;
		var echoStr = '<? ';
		echoStr += "echo '"+str.substring(0,firstPhp).replace("'","\'")+"';";
		echoStr += ' ?>';
		res = echoStr+str.substring(firstPhp,str.length);
	} else {
		res = str;
	}
	
	return res
}

var error_cnt 	= 0;
var error_off	= new Array();
var error_la	= new Array();

alert(preParse(str));
if( ( error_cnt = __parse( preParse(str), error_off, error_la ) ) > 0 )
{
	for( i = 0; i < error_cnt; i++ )
		alert( "Parse error near >" 
			+ str.substr( error_off[i], 30 ) + "<, expecting \"" + error_la[i].join() + "\"" );
}

///////////////
// DEBUGGING //
///////////////
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
		rtrn = '{<br/>' + spaces + rtrn.substr(0,rtrn.length-(2+(level*3))) + '<br/>' + spaces.substr(0,spaces.length-3) + '}';
	} else {
		rtrn = '{' + rtrn.substr(0,rtrn.length-1) + '}';
	}//end if-else addwhitespace
	if(addwhitespace == 'html') {
		rtrn = rtrn.replace(/ /g,"&nbsp;").replace(/\n/g,"<br/>");
	}//end if addwhitespace == html
	return rtrn;
}

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
*]