[*
//////////////////////////////////////
// GLOBALLY USED VARS AND FUNCTIONS //
//////////////////////////////////////

var cons = {
	global : '.global',
	objGlobal : '.objGlobal',
	val : '.val#',
	arr : '.arr#',
	obj : '.obj#',
	unset : '.uns#'
}

var state = {
	/**
	 * Sym table for looking up values.
	 */
	symTables : {
		'.global' : {}
	},
	
	/**
	 * Table for keeping actual values
	 */
	valTable : {},
	
	/**
	 * Table for keeping actual arrays
	 */
	arrTable : {},
	
	/**
	 * Table for keeping actual objects
	 */
	objTable : {},
	
	/**
	 * Variable for keeping track of currently executing function.
	 */
	curFun : cons.global,
	
	/**
	 * Variable for keeping track of formal parameters for a function declaration.
	 */
	curParams : [],
	
	/**
	 * Variable for keeping track of currently passed actual parameters of a function invocation.
	 */
	passedParams : 0,
	
	/**
	 * Function table
	 */
	funTable : {},
	
	/**
	 * Class table
	 */
	classTable : {},
	
	/**
	 * Variable telling whether a termination event has been received (i.e. a return).
	 */
	term : false,
	
	/**
	 * Variable for keeping track of most recent return value.
	 */
	'return' : ''
}

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
 * Value object
 */
function VAL() {
	var type;
	var value;
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
 * Function for creating values (constant types, arrays or objects).
 */
function createValue( type, value ) {
	var v = new VAL();
	v.type = type;
	v.value = value;
	
	return v;
}


/////////////////
// VAR LINKING //
/////////////////

/**
 * For linking variable references to values, preserving scopes.
 */
var linker = {
	assignVar : function(varName, val, scope) {
		if (!scope)
			scope = state.curFun;

		if (typeof(state.symTables[scope]) != 'object')
			state.symTables[scope] = {};
		
		var refTable = linker.getRefTableByVal(val);
		var prefix = linker.getConsDefByVal(val);
		
		state.symTables[scope][varName] = prefix+scope+'#'+varName
		refTable[scope+'#'+varName] = val;
	},
	
	assignArr : function(varName, key, val, scope) {
		if (!scope)
			scope = state.curFun;
		
		if (typeof(state.symTables[scope]) != 'object')
			state.symTables[scope] = {};
		
		// Initialize the variable as an array
		linker.unlinkVar(varName,scope);
		state.symTables[scope][varName] = cons.arr+scope+'#'+varName;
		
		// Check that the entry 
		var arrTableKey = scope+'#'+varName;
		if (typeof(state.arrTable[arrTableKey]) != 'object') {
			state.arrTable[arrTableKey] = {};
		}
			
		state.arrTable[arrTableKey][key.value] = val.value;
	},

	getValue : function(varName, scope) {
		if (!scope)
			scope = state.curFun;
		
		// Look up the potentially recursively defined variable.
		varName = linker.linkRecursively(varName);

		var refTable = linker.getRefTableByVar(varName);
		
		if (typeof(state.symTables[scope])=='object' && typeof(state.symTables[scope][varName])=='string') {
			var lookupStr = state.symTables[scope][varName];
			lookupStr = lookupStr.substr(5,lookupStr.length);
			
			return refTable[lookupStr];
		} else if (typeof(state.valTable[cons.global+'#'+varName])=='string') {
			return state.valTable[cons.global+'#'+varName];
		}

		throw varNotFound(varName);
	},
	
	/*
	 * For linking variable references.
	linkVar : function(locVarName, varName, scope) {
		if (!scope)
			scope = state.curFun;
		
		if (typeof(symTables[scope])!='object')
			state.symTables[scope] = {};
		
		state.symTables[scope][locVarName] = varName;
		if (typeof(state.valTable[scope+'#'+varName])!='string')
			state.valTable[scope+'#'+varName] = '';
	},
	*/
	
	unlinkVar : function(varName, scope) {
		if (!scope)
			scope = state.curFun;
		
		var prefix = linker.getConsDefByVar(varName);
		if (prefix == cons.unset)
			return;
		
		delete state.valTable[state.symTables[scope][varName]];
		delete state.symTables[prefix+scope+'#'+varName];
	},
	
	getRefTableByVal : function(value) {
		// Check for sym type
		switch (value.type) {
			case T_CONST:
				return state.valTable;
			case T_ARRAY:
				return state.arrTable;
			case T_OBJECT:
				return state.objTable;
			default:
				return null;
		}
	},
	
	getRefTableByVar : function(varName, scope) {
		if (!scope)
			scope = state.curFun;
		
		if (typeof(state.symTables[scope])!='object')
			state.symTables[scope] = {};
		
		// Get symbol name
		var symName = '';
		if (typeof(state.symTables[scope][varName])=='string')
			symName = state.symTables[scope][varName];
		else if (typeof(state.symTables[cons.global][varName])=='string')
			symName = state.symTables[cons.global][varName];
		else
			symName = cons.unset;
			
			
		// Check for sym type
		switch (symName.substring(0,5)) {
			case cons.val:
				return state.valTable;
			case cons.arr:
				return state.arrTable;
			case cons.obj:
				return state.objTable;
			default:
				return null;
		}
	},
	
	linkRecursively : function(varName) {
		if (typeof(varName) != 'string' && varName.type != T_CONST)
			return varName;
		
		else if (typeof(varName) == 'string') {
			varNameVal = varName;
		} else varNameVal = varName.value;
		
		var firstChar = varNameVal.substring(0,1);
		if (firstChar == "$") {
			varName = linker.getValue( varNameVal.substring( 1,varNameVal.length ) );
		}
		
		return varName;
	},
	
	getConsDefByVal : function(val) {
		var intType = val.type;
		switch (intType) {
			case T_CONST:
				return cons.val;
			case T_ARRAY:
				return cons.arr;
			case T_OBJECT:
				return cons.obj;
			default:
				return null;
		}
	},
	
	getConsDefByVar : function(varName, scope) {
		if (!scope)
			scope = state.curFun;
		
		if (typeof(state.symTables[scope])!='object')
			state.symTables[scope] = {};
		
		// Get symbol name
		var symName = '';
		if (typeof(state.symTables[scope][varName])=='string')
			symName = state.symTables[scope][varName];
		else if (typeof(state.symTables[cons.global][varName])=='string')
			symName = state.symTables[cons.global][varName];
		else
			symName = '.unset';
		
		return symName.substring(0,5);
	},
	
}


////////////////////
// OP DEFINITIONS //
////////////////////
var T_CONST = 0;
var T_ARRAY = 1;
var T_OBJECT = 2;

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
var OP_RETURN = 7;
var OP_ECHO	= 8;
var OP_ASSIGN_ARR = 9;
var OP_FETCH_ARR = 10;

/*
var OP_EQU	= 50;
var OP_NEQ	= 51;
var OP_GRT	= 52;
var OP_LOT	= 53;
var OP_GRE	= 54;
var OP_LOE	= 55;
var OP_ADD	= 56;
var OP_SUB	= 57;
var OP_DIV	= 58;
var OP_MUL	= 59;
var OP_NEG	= 60;
*/ 


////////////////
// EXCEPTIONS //
////////////////
function funNotFound(funName) {
	return 'Function not found: '+funName;
}

function funInvalidArgCount(argCount) {
	return 'Function '+state.curFun+'( ) expecting '+argCount+
			' arguments, but only found '+state.passedParams+'.';
} 

function funNameMustBeString(intType) {
	var type = '';
	switch (intType) {
		case T_ARRAY:
			type = 'Array';
			break;
		case T_OBJECT:
			type = 'Object';
			break;
		default:
			type = 'Unknown';
			break;
	}
	return 'Function name must be string. Found: '+type;
}

function valInvalid(varName, refType) {
	return 'Invalid value type of '+varName+': '+refType;
}

function varNotFound(varName) {
	return 'Variable not found: '+varName;
}


///////////////
// OPERATORS //
///////////////
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
		var val = execute( node.children[1] );
		linker.assignVar( node.children[0], val );
		
		return val;
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
		var prevPassedParams = state.passedParams;
		state.passedParams = 0;
		
		// Check if function name is recursively defined
		var funName = linker.linkRecursively(node.children[0]);
		
		var prevFun = state.curFun;
		
		if (funName.type == T_CONST)
			state.curFun = funName.value;
		else if (typeof(funName) == 'string') 
			state.curFun = funName;
		else 
			throw funNameMustBeString(funName.type);

		// Initialize parameters for the function scope
		if ( node.children[1] )
			execute( node.children[1] );
		
		// Execute function
		var f = state.funTable[state.curFun];
		if ( f && f.params.length <= state.passedParams ) {
			for ( var i=0; i<f.nodes.length; i++ )
				execute( f.nodes[i] );
		} else {
			if (!f) {
				throw funNotFound(funName);
			} else if (!(f.params.length <= state.passedParams))
				throw funInvalidArgCount(f.params.length);
		}
		
		// Clear parameters for the function scope
		for ( var i=0; i<f.params.length; i++ )
			linker.unlinkVar( f.params[i] );
		
		// State roll-back
		state.passedParams = prevPassedParams;
		state.curFun = prevFun;
		var ret = state['return'];
		state['return'] = 0;
		
		// Return the value saved in .return in our valTable.
		return ret;
	},

	// OP_PASS_PARAM
	'6' : function(node) {
		// Initialize parameter name
		var f = state.funTable[state.curFun];

		if (!f)
			throw funNotFound();
			
		// Link parameter name with passed value
		if ( node.children[0] ) {
			if ( node.children[0].value != OP_PASS_PARAM ) {
				// Initialize parameter name
				var paramName = '';
				if ( state.passedParams < f.params.length )
					paramName = f.params[state.passedParams].value;
				else
					paramName = '.arg'+state.passedParams;

				// Link
				linker.assignVar( paramName, execute( node.children[0] ) );
				state.passedParams++;
			} else {
				execute( node.children[0] );
			}
		}
		
		if ( node.children[1] ) {
			// Initialize parameter name
			var paramName = '';
			if ( state.passedParams < f.params.length )
				paramName = f.params[state.passedParams].value;
			else
				paramName = '.arg'+state.passedParams;
			
			// Link
			linker.assignVar( paramName, execute( node.children[1] ) );
			state.passedParams++;
		}
	},

	// OP_RETURN
	'7' : function(node) {
		if (node.children[0])
			state['return'] = execute( node.children[0] );
		
		state.term = true;
	},

	// OP_ECHO
	'8' : function(node) {
		var val = execute( node.children[0] );

		switch (val.type) {
			case T_CONST:
				phypeOut( val.value );
				break;
			case T_ARRAY:
				phypeOut( 'Array' );
				break;
			case T_OBJECT:
				phypeOut( 'Object' );
				break;
		}
	},
	
	// OP_ASSIGN_ARR
	'9' : function(node) {
		var varName = node.children[0];
		var key = execute( node.children[1] );
		var value = execute( node.children[2] );
		
		linker.assignArr( varName, key, value );
		
		return value;
	},
	
	// OP_FETCH_ARR
	'10' : function(node) {
		
	}
	
	/*// OP_EQU
	'50' : function(node) {
		return execute( node.children[0] ) == execute( node.children[1] );
	},
	
	// OP_NEQ
	'51' : function(node) {
		return execute( node.children[0] ) != execute( node.children[1] );
	},
	
	// OP_GRT
	'52' : function(node) {
		return execute( node.children[0] ) > execute( node.children[1] );
	},
	
	// OP_LOT
	'53' : function(node) {
		return execute( node.children[0] ) < execute( node.children[1] );
	},
	
	// OP_GRE
	'54' : function(node) {
		return execute( node.children[0] ) >= execute( node.children[1] );
	},
	
	// OP_LOE
	'55' : function(node) {
		return execute( node.children[0] ) <= execute( node.children[1] );
	},
	
	// OP_ADD
	'56' : function(node) {
		return execute( node.children[0] ) + execute( node.children[1] );
	},

	// OP_SUB
	'57' : function(node) {
		return execute( node.children[0] ) - execute( node.children[1] );
	},
	
	// OP_DIV
	'58' : function(node) {
		return execute( node.children[0] ) / execute( node.children[1] );
	},
	
	// OP_MUL
	'59' : function(node) {
		return execute( node.children[0] ) * execute( node.children[1] );
	},
	
	// OP_NEG
	'60' : function(node) {
		return execute( node.children[0] ) * -1;
	}*/
}

function execute( node ) {
	// Reset term-event boolean and terminate currently executing action, if a terminate-event was received.
	if (state.term) {
		state.term = false;
		return;
	}
	
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
			ret = createValue( T_CONST, node.value );
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
	"RETURN"
	'{'
	'}'
	'\['
	'\]'
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
	'<\?([pP][hH][pP])?'			ScriptBegin
	'\?>(([^<\?])|<[^\?])*'			ScriptEnd
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
										[* 	state.funTable[%1] = createFunction( %1, state.curParams, %6 );
											// Make sure to clean up param list for next function declaration
											state.curParams = []; *]
		|	Return
		|	Expression
		|	IF Expression Stmt 			[* %% = createNode( NODE_OP, OP_IF, %2, %3 ); *]
		|	IF Expression Stmt ELSE Stmt	
										[* %% = createNode( NODE_OP, OP_IF_ELSE, %2, %3, %5 ); *]
		|	WHILE Expression DO Stmt 	[* %% = createNode( NODE_OP, OP_WHILE_DO, %2, %4 ); *]
		|	DO Stmt WHILE Expression ';'	
										[* %% = createNode( NODE_OP, OP_DO_WHILE, %2, %4 ); *]
		|	ECHO Expression ';'			[* %% = createNode( NODE_OP, OP_ECHO, %2 ); *]
		|	Variable '=' Expression ';'	[* %% = createNode( NODE_OP, OP_ASSIGN, %1, %3 ); *]
		|	Variable ArrayIndices '=' Expression ';'
										[* %% = createNode( NODE_OP, OP_ASSIGN_ARR, %1, %2, %4 ); *]
		|	'{' Stmt_List '}'			[* %% = %2; *]
		|	';'							[* %% = createNode( NODE_OP, OP_NONE ); *]
		;
		
FormalParameterList:
			FormalParameterList ',' Variable
										[* state.curParams[state.curParams.length] = createNode( NODE_CONST, %3 ); *]
		|	Variable					[* state.curParams[state.curParams.length] = createNode( NODE_CONST, %1 ); *]
		|
		;	

Return:		RETURN Expression			[* %% = createNode( NODE_OP, OP_RETURN, %2 ); *]
		|	RETURN						[* %% = createNode( NODE_OP, OP_RETURN ); *]
		;

Expression:	UnaryOp
		|	FunctionInvoke ActualParameterList ')'
										[* %% = createNode( NODE_OP, OP_FCALL, %1, %2 ); *]
		|	Variable ArrayIndices		[* %% = createNode( NODE_OP, OP_FETCH_ARR, %1, %2 ); *]
		;
		
ArrayIndices:
			'[' Expression ']'			[* %% = %2; *]
		;

ActualParameterList:
			ActualParameterList ',' Expression
										[* %% = createNode( NODE_OP, OP_PASS_PARAM, %1, %3 ); *]
		|	Expression					[* %% = createNode( NODE_OP, OP_PASS_PARAM, %1 ); *]
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

//////////////////////
// PHYPE I/O-CHECKS //
//////////////////////
if (!phypeIn || phypeIn == 'undefined') {
	var phypeIn = function() {
		return prompt( "Please enter a PHP-script to be executed:",
		"<? function test($a) { echo $a; } test('foo'); ?>" );
	};
}

if (!phypeOut || phypeOut == 'undefined') {
	var phypeOut = alert;
}

var str = phypeIn();

/**
 * Creates an echo with non-PHP character data that precedes the first php-tag.
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

if( ( error_cnt = __parse( preParse(str), error_off, error_la ) ) > 0 ) {
	for( i = 0; i < error_cnt; i++ )
		alert( "Parse error near >" 
			+ str.substr( error_off[i], 30 ) + "<, expecting \"" + error_la[i].join() + "\"" );
}

if (phypeDoc && phypeDoc.open) {
	phypeDoc.close();
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