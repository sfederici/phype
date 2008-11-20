[*

//Structs
function NODE()
{
	var type;
	var value;
	var children;
}

//Defines
var NODE_OP	= 0;
var NODE_VAR	= 1;
var NODE_CONST	= 2;

var OP_NONE	= -1;
var OP_ASSIGN	= 0;
var OP_IF	= 1;
var OP_IF_ELSE	= 2;
var OP_WHILE_DO	= 3;
var OP_DO_WHILE	= 4;
var OP_READ	= 5;
var OP_ECHO	= 6;

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

//Management functions
function createNode( type, value, childs )
{
	var n = new NODE();
	n.type = type;
	n.value = value;	
	n.children = new Array();
	
	for( var i = 2; i < arguments.length; i++ )
		n.children.push( arguments[i] );
		
	return n;
}

var v_names = new Array();
var v_values = new Array();

//Interpreting function
function letvar( vname, value )
{
	var i;
	for( i = 0; i < v_names.length; i++ )
		if( v_names[i].toString() == vname.toString() )
			break;
		
	if( i == v_names.length )
	{
		v_names.push( vname );
		v_values.push( 0 );
	}

	v_values[i] = value;
}

function getvar( vname )
{
	var value = 0;
	var i;
	for( i = 0; i < v_names.length; i++ )
		if( v_names[i].toString() == vname.toString() )
			value = v_values[i];
	
	return value;
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
		letvar( node.children[0], execute( node.children[1] ) );
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
	
	// OP_READ
	'5' : function(node) {
		letvar( node.children[0].toString(), prompt( "Please enter a value:", "0"  ) );
	},

	// OP_ECHO
	'6' : function(node) {
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

function execute( node )
{
	var ret = 0;
	
	if( !node ) {
		return 0;
	}

	switch( node.type )
	{
		case NODE_OP:
			var tmp = ops[node.value](node);
			if (tmp && tmp != 'undefined')
			ret = tmp;
			break;
			
		case NODE_VAR:
			ret = getvar( node.value );
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
	"WRITE"
	"READ"
	'{'
	'}'
	';'
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
	'<\?([pP][hH][pP])?'						ScriptBegin
	'\?>'										ScriptEnd
	'\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*'	Variable [* %match = %match.substr(1,%match.length-1); *]
	'\'([^\']|\'\')*\''				String		[* %match = %match.substr(1,%match.length-2); %match = %match.replace( /\\'/g, "\'" );*]
	'[0-9]+'						Integer
	'[0-9]+\.[0-9]*|[0-9]*\.[0-9]+'	Float
	;

##

PHPScript:	ScriptBegin Stmt ScriptEnd		[* execute( %2 ); *]
		|
		;

Stmt_List:	Stmt_List Stmt			[* %% = createNode( NODE_OP, OP_NONE, %1, %2 ); *]
		|
		;
								
Stmt:		Stmt Stmt			[* %% = createNode ( NODE_OP, OP_NONE, %1, %2 ) *]
		| IF Expression Stmt 		[* %% = createNode( NODE_OP, OP_IF, %2, %3 ); *]
		| IF Expression Stmt ELSE Stmt	[* %% = createNode( NODE_OP, OP_IF_ELSE, %2, %3, %5 ); *]
		| WHILE Expression DO Stmt 	[* %% = createNode( NODE_OP, OP_WHILE_DO, %2, %4 ); *]
		| DO Stmt WHILE Expression ';'	[* %% = createNode( NODE_OP, OP_DO_WHILE, %2, %4 ); *]
		| ECHO Value ';'		[* %% = createNode( NODE_OP, OP_ECHO, %2 ); *]
		| WRITE Expression ';'		[* %% = createNode( NODE_OP, OP_WRITE, %2 ); *]
		| READ Variable ';'		[* %% = createNode( NODE_OP, OP_READ, %2 ); *]
		| Variable '=' Expression ';'	[* %% = createNode( NODE_OP, OP_ASSIGN, %1, %3 ); *]
		| '{' Stmt_List '}'		[* %% = %2; *]
		| ';'				[* %% = createNode( NODE_OP, OP_NONE ); *]
		;

Expression:	Expression '==' AddSubExp	[* %% = createNode( NODE_OP, OP_EQU, %1, %3 ); *]
		| Expression '<' AddSubExp	[* %% = createNode( NODE_OP, OP_LOT, %1, %3 ); *]
		| Expression '>' AddSubExp	[* %% = createNode( NODE_OP, OP_GRT, %1, %3 ); *]
		| Expression '<=' AddSubExp	[* %% = createNode( NODE_OP, OP_LOE, %1, %3 ); *]
		| Expression '>=' AddSubExp	[* %% = createNode( NODE_OP, OP_GRE, %1, %3 ); *]
		| Expression '!=' AddSubExp	[* %% = createNode( NODE_OP, OP_NEQ, %1, %3 ); *]
		| AddSubExp
		;

AddSubExp:	AddSubExp '-' MulDivExp		[* %% = createNode( NODE_OP, OP_SUB, %1, %3 ); *]
		| AddSubExp '+' MulDivExp	[* %% = createNode( NODE_OP, OP_ADD, %1, %3 ); *]
		| MulDivExp
		;
				
MulDivExp:	MulDivExp '*' NegExp		[* %% = createNode( NODE_OP, OP_MUL, %1, %3 ); *]
		| MulDivExp '/' NegExp		[* %% = createNode( NODE_OP, OP_DIV, %1, %3 ); *]
		| NegExp
		;
				
NegExp:		'-' Value			[* %% = createNode( NODE_OP, OP_NEG, %2 ); *]
		| Value
		;

Value:		Variable			[* %% = createNode( NODE_VAR, %1 ); *]
		| '(' Expression ')'	[* %% = %2; *]
		| String				[* %% = createNode( NODE_CONST, %1 ); *]
		| Integer				[* %% = createNode( NODE_CONST, %1 ); *]
		| Float					[* %% = createNode( NODE_CONST, %1 ); *]
		;

[*

var str = prompt( "Please enter a PHP-script to be executed:",
	"<? $a = 'Hello World'; echo $a; echo '?>'; ?>" );

// UNFUNCTIONAL
function preParse(str) {
	var nonPhpStrs = str.split(/<\?([^\?>]|'(\?>|.)*'|"(\?>|.)*")*\?>/g);
	var phpStrs = str.match(/<\?([^\?>]|'(\?>|.)*'|"(\?>|.)*")*\?>/g);
	
	var res = '<?php ';
	for (var i=0; i<nonPhpStrs.length; i++) {
		var nonPhpEcho = '';
		if (nonPhpStrs[i])
			nonPhpEcho = "echo '"+nonPhpStrs[i].replace(/'/,"\'")+"';";
			
		var phpClean = '';
		if (i < phpStrs.length) {
			phpClean = phpStrs[i].replace(/<\?([pP][hH][pP])?/,'');
			phpClean = phpClean.substr(0,phpClean.length-3);
		}
		
		res += nonPhpEcho+phpClean;
	}
	res += ' ?>';
	
	return res
}

var error_cnt 	= 0;
var error_off	= new Array();
var error_la	= new Array();

alert(preParse(str));

if( ( error_cnt = __parse( str, error_off, error_la ) ) > 0 )
{
	for( i = 0; i < error_cnt; i++ )
		alert( "Parse error near >" 
			+ str.substr( error_off[i], 30 ) + "<, expecting \"" + error_la[i].join() + "\"" );
}
*]