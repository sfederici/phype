
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
        else if (valTable['.global#'+varName])
            return valTable['.global#'+varName];
            
        throw varNotFound(varName);
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
var NODE_OP    = 0;
var NODE_VAR    = 1;
var NODE_CONST    = 2;

var OP_NONE    = -1;
var OP_ASSIGN    = 0;
var OP_IF    = 1;
var OP_IF_ELSE    = 2;
var OP_WHILE_DO    = 3;
var OP_DO_WHILE    = 4;
var OP_FCALL = 5;
var OP_PASS_PARAM = 6;
var OP_ECHO    = 7;

var OP_EQU    = 10;
var OP_NEQ    = 11;
var OP_GRT    = 12;
var OP_LOT    = 13;
var OP_GRE    = 14;
var OP_LOE    = 15;
var OP_ADD    = 16;
var OP_SUB    = 17;
var OP_DIV    = 18;
var OP_MUL    = 19;
var OP_NEG    = 20;


////////////////
// EXCEPTIONS //
////////////////
function funNotFound() {
    return 'Function not found: '+curFun;
}

function funInvalidArgCount(argCount) {
    return 'Function '+curFun+'( ) expecting '+argCount+' arguments, but only found '+passedParams+'.';
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
        
        // Check if function name is dynamically defined
        var funName = '';
        var firstChar = node.children[0].substring(0,1);
        if (firstChar == "$") {
            funName = linker.getValue( node.children[0].substring(1,node.children[0].length) );
        } else {
            funName = node.children[0];
        }
        
        var prevFun = curFun;
        curFun = funName;

        // Initialize parameters for the function scope
        if ( node.children[1] )
            execute( node.children[1] );
        
        // Execute function
        var ret = '';
        var f = funTable[curFun];
        if ( f && f.params.length <= passedParams ) {
            for ( var i=0; i<f.nodes.length; i++ )
                ret += execute( f.nodes[i] );
        } else {
            if (!f)
                throw funNotFound();
            else if (!(f.params.length <= passedParams))
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
            
        // Link parameter name with passed value
        if ( node.children[0] ) {
            if ( node.children[0].value != OP_PASS_PARAM ) {
                // Initialize parameter name
                var paramName = '';
                if ( passedParams < f.params.length )
                    paramName = f.params[passedParams].value;
                else
                    paramName = '.arg'+passedParams;
                
                // Link
                linker.assignVar( paramName, execute( node.children[0] ) );
                passedParams++;
            } else {
                execute( node.children[0] );
            }
        }
        
        if ( node.children[1] ) {
            // Initialize parameter name
            var paramName = '';
            if ( passedParams < f.params.length )
                paramName = f.params[passedParams].value;
            else
                paramName = '.arg'+passedParams;
            
            // Link
            linker.assignVar( paramName, execute( node.children[1] ) );
            passedParams++;
        }
        
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


var _dbg_withtrace = false; var _dbg_string = new String(); function __dbg_print( text )
{ _dbg_string += text + "\n";}
function __lex( info )
{ var state = 0; var match = -1; var match_pos = 0; var start = 0; var pos = info.offset + 1; do
{ pos--; state = 0; match = -2; start = pos; if( info.src.length <= start )
return 44; do
{ switch( state )
{
    case 0:
        if( ( info.src.charCodeAt( pos ) >= 9 && info.src.charCodeAt( pos ) <= 10 ) || info.src.charCodeAt( pos ) == 13 || info.src.charCodeAt( pos ) == 32 ) state = 1;
        else if( info.src.charCodeAt( pos ) == 35 ) state = 2;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 3;
        else if( info.src.charCodeAt( pos ) == 41 ) state = 4;
        else if( info.src.charCodeAt( pos ) == 42 ) state = 5;
        else if( info.src.charCodeAt( pos ) == 43 ) state = 6;
        else if( info.src.charCodeAt( pos ) == 44 ) state = 7;
        else if( info.src.charCodeAt( pos ) == 45 ) state = 8;
        else if( info.src.charCodeAt( pos ) == 47 ) state = 9;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 54 ) || ( info.src.charCodeAt( pos ) >= 56 && info.src.charCodeAt( pos ) <= 57 ) ) state = 10;
        else if( info.src.charCodeAt( pos ) == 59 ) state = 11;
        else if( info.src.charCodeAt( pos ) == 60 ) state = 12;
        else if( info.src.charCodeAt( pos ) == 61 ) state = 13;
        else if( info.src.charCodeAt( pos ) == 62 ) state = 14;
        else if( info.src.charCodeAt( pos ) == 123 ) state = 15;
        else if( info.src.charCodeAt( pos ) == 125 ) state = 16;
        else if( info.src.charCodeAt( pos ) == 33 ) state = 33;
        else if( info.src.charCodeAt( pos ) == 55 ) state = 34;
        else if( info.src.charCodeAt( pos ) == 36 ) state = 37;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 38;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 39;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 40;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 67 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 99 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 42;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 43;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 55;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 58;
        else if( info.src.charCodeAt( pos ) == 102 ) state = 63;
        else state = -1;
        break;

    case 1:
        state = -1;
        match = 1;
        match_pos = pos;
        break;

    case 2:
        state = -1;
        match = 24;
        match_pos = pos;
        break;

    case 3:
        state = -1;
        match = 22;
        match_pos = pos;
        break;

    case 4:
        state = -1;
        match = 23;
        match_pos = pos;
        break;

    case 5:
        state = -1;
        match = 21;
        match_pos = pos;
        break;

    case 6:
        state = -1;
        match = 18;
        match_pos = pos;
        break;

    case 7:
        state = -1;
        match = 10;
        match_pos = pos;
        break;

    case 8:
        state = -1;
        match = 19;
        match_pos = pos;
        break;

    case 9:
        state = -1;
        match = 20;
        match_pos = pos;
        break;

    case 10:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 10;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 21;
        else state = -1;
        match = 29;
        match_pos = pos;
        break;

    case 11:
        state = -1;
        match = 9;
        match_pos = pos;
        break;

    case 12:
        if( info.src.charCodeAt( pos ) == 61 ) state = 22;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 23;
        else state = -1;
        match = 17;
        match_pos = pos;
        break;

    case 13:
        if( info.src.charCodeAt( pos ) == 61 ) state = 24;
        else state = -1;
        match = 11;
        match_pos = pos;
        break;

    case 14:
        if( info.src.charCodeAt( pos ) == 61 ) state = 25;
        else state = -1;
        match = 16;
        match_pos = pos;
        break;

    case 15:
        state = -1;
        match = 7;
        match_pos = pos;
        break;

    case 16:
        state = -1;
        match = 8;
        match_pos = pos;
        break;

    case 17:
        state = -1;
        match = 13;
        match_pos = pos;
        break;

    case 18:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 18;
        else state = -1;
        match = 25;
        match_pos = pos;
        break;

    case 19:
        state = -1;
        match = 27;
        match_pos = pos;
        break;

    case 20:
        if( info.src.charCodeAt( pos ) == 39 ) state = 38;
        else state = -1;
        match = 28;
        match_pos = pos;
        break;

    case 21:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 21;
        else state = -1;
        match = 30;
        match_pos = pos;
        break;

    case 22:
        state = -1;
        match = 14;
        match_pos = pos;
        break;

    case 23:
        if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 44;
        else state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 24:
        state = -1;
        match = 12;
        match_pos = pos;
        break;

    case 25:
        state = -1;
        match = 15;
        match_pos = pos;
        break;

    case 26:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 59 ) || ( info.src.charCodeAt( pos ) >= 61 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 26;
        else state = -1;
        match = 31;
        match_pos = pos;
        break;

    case 27:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        match = 5;
        match_pos = pos;
        break;

    case 28:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        match = 2;
        match_pos = pos;
        break;

    case 29:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        match = 6;
        match_pos = pos;
        break;

    case 30:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        match = 3;
        match_pos = pos;
        break;

    case 31:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        match = 4;
        match_pos = pos;
        break;

    case 32:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 32;
        else state = -1;
        match = 26;
        match_pos = pos;
        break;

    case 33:
        if( info.src.charCodeAt( pos ) == 61 ) state = 17;
        else state = -1;
        break;

    case 34:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 34;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        match = 29;
        match_pos = pos;
        break;

    case 35:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 35;
        else state = -1;
        match = 25;
        match_pos = pos;
        break;

    case 36:
        state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 37:
        if( info.src.charCodeAt( pos ) == 36 ) state = 18;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 35;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 54 ) || ( info.src.charCodeAt( pos ) >= 56 && info.src.charCodeAt( pos ) <= 57 ) ) state = 41;
        else state = -1;
        break;

    case 38:
        if( info.src.charCodeAt( pos ) == 39 ) state = 20;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 38;
        else state = -1;
        break;

    case 39:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 21;
        else state = -1;
        break;

    case 40:
        if( info.src.charCodeAt( pos ) == 62 ) state = 26;
        else state = -1;
        break;

    case 41:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        break;

    case 42:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 27;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        break;

    case 43:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 70 || info.src.charCodeAt( pos ) == 102 ) state = 28;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 69 ) || ( info.src.charCodeAt( pos ) >= 71 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 101 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        break;

    case 44:
        if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 47;
        else state = -1;
        break;

    case 45:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 29;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        break;

    case 46:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 30;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        break;

    case 47:
        if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 36;
        else state = -1;
        break;

    case 48:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 31;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else state = -1;
        break;

    case 49:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 32 ) state = 50;
        else state = -1;
        break;

    case 50:
        if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 32;
        else state = -1;
        break;

    case 51:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 45;
        else state = -1;
        break;

    case 52:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 46;
        else state = -1;
        break;

    case 53:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 48;
        else state = -1;
        break;

    case 54:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 49;
        else state = -1;
        break;

    case 55:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 51;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 52;
        else state = -1;
        break;

    case 56:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 53;
        else state = -1;
        break;

    case 57:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 111 ) state = 54;
        else state = -1;
        break;

    case 58:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 56;
        else state = -1;
        break;

    case 59:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 105 ) state = 57;
        else state = -1;
        break;

    case 60:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 116 ) state = 59;
        else state = -1;
        break;

    case 61:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 99 ) state = 60;
        else state = -1;
        break;

    case 62:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 61;
        else state = -1;
        break;

    case 63:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 41;
        else if( info.src.charCodeAt( pos ) == 117 ) state = 62;
        else state = -1;
        break;

}


pos++;}
while( state > -1 );}
while( 1 > -1 && match == 1 ); if( match > -1 )
{ info.att = info.src.substr( start, match_pos - start ); info.offset = match_pos; switch( match )
{
    case 25:
        {
         info.att = info.att.substr(1,info.att.length-1);
        }
        break;

    case 26:
        {
         info.att = info.att.substr(9,info.att.length-1);
        }
        break;

    case 27:
        {
         info.att = info.att.substr(0,info.att.length-1);
        }
        break;

    case 28:
        {
            info.att = info.att.substr(1,info.att.length-2);
                                            info.att = info.att.replace( /\\'/g, "'" );
        }
        break;

}


}
else
{ info.att = new String(); match = -1;}
return match;}
function __parse( src, err_off, err_la )
{ var sstack = new Array(); var vstack = new Array(); var err_cnt = 0; var act; var go; var la; var rval; var parseinfo = new Function( "", "var offset; var src; var att;" ); var info = new parseinfo(); /* Pop-Table */
var pop_tab = new Array(
    new Array( 0/* PHPScript' */, 1 ),
    new Array( 33/* PHPScript */, 4 ),
    new Array( 33/* PHPScript */, 0 ),
    new Array( 35/* Stmt_List */, 2 ),
    new Array( 35/* Stmt_List */, 0 ),
    new Array( 34/* Stmt */, 2 ),
    new Array( 34/* Stmt */, 7 ),
    new Array( 34/* Stmt */, 1 ),
    new Array( 34/* Stmt */, 3 ),
    new Array( 34/* Stmt */, 5 ),
    new Array( 34/* Stmt */, 4 ),
    new Array( 34/* Stmt */, 5 ),
    new Array( 34/* Stmt */, 3 ),
    new Array( 34/* Stmt */, 4 ),
    new Array( 34/* Stmt */, 3 ),
    new Array( 34/* Stmt */, 1 ),
    new Array( 36/* FormalParameterList */, 3 ),
    new Array( 36/* FormalParameterList */, 1 ),
    new Array( 36/* FormalParameterList */, 0 ),
    new Array( 37/* Expression */, 1 ),
    new Array( 37/* Expression */, 3 ),
    new Array( 40/* ActualParameterList */, 3 ),
    new Array( 40/* ActualParameterList */, 1 ),
    new Array( 40/* ActualParameterList */, 0 ),
    new Array( 39/* UnaryOp */, 3 ),
    new Array( 39/* UnaryOp */, 3 ),
    new Array( 39/* UnaryOp */, 3 ),
    new Array( 39/* UnaryOp */, 3 ),
    new Array( 39/* UnaryOp */, 3 ),
    new Array( 39/* UnaryOp */, 3 ),
    new Array( 39/* UnaryOp */, 1 ),
    new Array( 41/* AddSubExp */, 3 ),
    new Array( 41/* AddSubExp */, 3 ),
    new Array( 41/* AddSubExp */, 1 ),
    new Array( 42/* MulDivExp */, 3 ),
    new Array( 42/* MulDivExp */, 3 ),
    new Array( 42/* MulDivExp */, 1 ),
    new Array( 43/* NegExp */, 2 ),
    new Array( 43/* NegExp */, 1 ),
    new Array( 38/* Value */, 1 ),
    new Array( 38/* Value */, 3 ),
    new Array( 38/* Value */, 1 ),
    new Array( 38/* Value */, 1 ),
    new Array( 38/* Value */, 1 )
);

/* Action-Table */
var act_tab = new Array(
    /* State 0 */ new Array( 44/* "$" */,-2 , 32/* "ScriptBegin" */,-2 ),
    /* State 1 */ new Array( 32/* "ScriptBegin" */,2 , 44/* "$" */,0 ),
    /* State 2 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 3 */ new Array( 31/* "ScriptEnd" */,25 , 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 4 */ new Array( 22/* "(" */,26 ),
    /* State 5 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 31/* "ScriptEnd" */,-7 , 26/* "FunctionName" */,-7 , 2/* "IF" */,-7 , 4/* "WHILE" */,-7 , 5/* "DO" */,-7 , 6/* "ECHO" */,-7 , 25/* "Variable" */,-7 , 7/* "{" */,-7 , 9/* ";" */,-7 , 27/* "FunctionInvoke" */,-7 , 19/* "-" */,-7 , 22/* "(" */,-7 , 28/* "String" */,-7 , 29/* "Integer" */,-7 , 30/* "Float" */,-7 , 3/* "ELSE" */,-7 , 8/* "}" */,-7 ),
    /* State 6 */ new Array( 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 7 */ new Array( 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 8 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 9 */ new Array( 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 10 */ new Array( 11/* "=" */,38 , 31/* "ScriptEnd" */,-39 , 26/* "FunctionName" */,-39 , 2/* "IF" */,-39 , 4/* "WHILE" */,-39 , 5/* "DO" */,-39 , 6/* "ECHO" */,-39 , 25/* "Variable" */,-39 , 7/* "{" */,-39 , 9/* ";" */,-39 , 27/* "FunctionInvoke" */,-39 , 19/* "-" */,-39 , 22/* "(" */,-39 , 28/* "String" */,-39 , 29/* "Integer" */,-39 , 30/* "Float" */,-39 , 18/* "+" */,-39 , 21/* "*" */,-39 , 20/* "/" */,-39 , 12/* "==" */,-39 , 17/* "<" */,-39 , 16/* ">" */,-39 , 14/* "<=" */,-39 , 15/* ">=" */,-39 , 13/* "!=" */,-39 , 3/* "ELSE" */,-39 , 8/* "}" */,-39 ),
    /* State 11 */ new Array( 8/* "}" */,-4 , 26/* "FunctionName" */,-4 , 2/* "IF" */,-4 , 4/* "WHILE" */,-4 , 5/* "DO" */,-4 , 6/* "ECHO" */,-4 , 25/* "Variable" */,-4 , 7/* "{" */,-4 , 9/* ";" */,-4 , 27/* "FunctionInvoke" */,-4 , 19/* "-" */,-4 , 22/* "(" */,-4 , 28/* "String" */,-4 , 29/* "Integer" */,-4 , 30/* "Float" */,-4 ),
    /* State 12 */ new Array( 31/* "ScriptEnd" */,-15 , 26/* "FunctionName" */,-15 , 2/* "IF" */,-15 , 4/* "WHILE" */,-15 , 5/* "DO" */,-15 , 6/* "ECHO" */,-15 , 25/* "Variable" */,-15 , 7/* "{" */,-15 , 9/* ";" */,-15 , 27/* "FunctionInvoke" */,-15 , 19/* "-" */,-15 , 22/* "(" */,-15 , 28/* "String" */,-15 , 29/* "Integer" */,-15 , 30/* "Float" */,-15 , 3/* "ELSE" */,-15 , 8/* "}" */,-15 ),
    /* State 13 */ new Array( 31/* "ScriptEnd" */,-19 , 26/* "FunctionName" */,-19 , 2/* "IF" */,-19 , 4/* "WHILE" */,-19 , 5/* "DO" */,-19 , 6/* "ECHO" */,-19 , 25/* "Variable" */,-19 , 7/* "{" */,-19 , 9/* ";" */,-19 , 27/* "FunctionInvoke" */,-19 , 19/* "-" */,-19 , 22/* "(" */,-19 , 28/* "String" */,-19 , 29/* "Integer" */,-19 , 30/* "Float" */,-19 , 12/* "==" */,-19 , 17/* "<" */,-19 , 16/* ">" */,-19 , 14/* "<=" */,-19 , 15/* ">=" */,-19 , 13/* "!=" */,-19 , 23/* ")" */,-19 , 10/* "," */,-19 , 3/* "ELSE" */,-19 , 8/* "}" */,-19 ),
    /* State 14 */ new Array( 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 , 23/* ")" */,-23 , 10/* "," */,-23 ),
    /* State 15 */ new Array( 18/* "+" */,42 , 19/* "-" */,43 , 31/* "ScriptEnd" */,-30 , 26/* "FunctionName" */,-30 , 2/* "IF" */,-30 , 4/* "WHILE" */,-30 , 5/* "DO" */,-30 , 6/* "ECHO" */,-30 , 25/* "Variable" */,-30 , 7/* "{" */,-30 , 9/* ";" */,-30 , 27/* "FunctionInvoke" */,-30 , 22/* "(" */,-30 , 28/* "String" */,-30 , 29/* "Integer" */,-30 , 30/* "Float" */,-30 , 12/* "==" */,-30 , 17/* "<" */,-30 , 16/* ">" */,-30 , 14/* "<=" */,-30 , 15/* ">=" */,-30 , 13/* "!=" */,-30 , 23/* ")" */,-30 , 10/* "," */,-30 , 3/* "ELSE" */,-30 , 8/* "}" */,-30 ),
    /* State 16 */ new Array( 20/* "/" */,44 , 21/* "*" */,45 , 31/* "ScriptEnd" */,-33 , 26/* "FunctionName" */,-33 , 2/* "IF" */,-33 , 4/* "WHILE" */,-33 , 5/* "DO" */,-33 , 6/* "ECHO" */,-33 , 25/* "Variable" */,-33 , 7/* "{" */,-33 , 9/* ";" */,-33 , 27/* "FunctionInvoke" */,-33 , 19/* "-" */,-33 , 22/* "(" */,-33 , 28/* "String" */,-33 , 29/* "Integer" */,-33 , 30/* "Float" */,-33 , 18/* "+" */,-33 , 12/* "==" */,-33 , 17/* "<" */,-33 , 16/* ">" */,-33 , 14/* "<=" */,-33 , 15/* ">=" */,-33 , 13/* "!=" */,-33 , 23/* ")" */,-33 , 10/* "," */,-33 , 3/* "ELSE" */,-33 , 8/* "}" */,-33 ),
    /* State 17 */ new Array( 31/* "ScriptEnd" */,-36 , 26/* "FunctionName" */,-36 , 2/* "IF" */,-36 , 4/* "WHILE" */,-36 , 5/* "DO" */,-36 , 6/* "ECHO" */,-36 , 25/* "Variable" */,-36 , 7/* "{" */,-36 , 9/* ";" */,-36 , 27/* "FunctionInvoke" */,-36 , 19/* "-" */,-36 , 22/* "(" */,-36 , 28/* "String" */,-36 , 29/* "Integer" */,-36 , 30/* "Float" */,-36 , 18/* "+" */,-36 , 21/* "*" */,-36 , 20/* "/" */,-36 , 12/* "==" */,-36 , 17/* "<" */,-36 , 16/* ">" */,-36 , 14/* "<=" */,-36 , 15/* ">=" */,-36 , 13/* "!=" */,-36 , 23/* ")" */,-36 , 10/* "," */,-36 , 3/* "ELSE" */,-36 , 8/* "}" */,-36 ),
    /* State 18 */ new Array( 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 19 */ new Array( 31/* "ScriptEnd" */,-38 , 26/* "FunctionName" */,-38 , 2/* "IF" */,-38 , 4/* "WHILE" */,-38 , 5/* "DO" */,-38 , 6/* "ECHO" */,-38 , 25/* "Variable" */,-38 , 7/* "{" */,-38 , 9/* ";" */,-38 , 27/* "FunctionInvoke" */,-38 , 19/* "-" */,-38 , 22/* "(" */,-38 , 28/* "String" */,-38 , 29/* "Integer" */,-38 , 30/* "Float" */,-38 , 18/* "+" */,-38 , 21/* "*" */,-38 , 20/* "/" */,-38 , 12/* "==" */,-38 , 17/* "<" */,-38 , 16/* ">" */,-38 , 14/* "<=" */,-38 , 15/* ">=" */,-38 , 13/* "!=" */,-38 , 23/* ")" */,-38 , 10/* "," */,-38 , 3/* "ELSE" */,-38 , 8/* "}" */,-38 ),
    /* State 20 */ new Array( 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 21 */ new Array( 31/* "ScriptEnd" */,-41 , 26/* "FunctionName" */,-41 , 2/* "IF" */,-41 , 4/* "WHILE" */,-41 , 5/* "DO" */,-41 , 6/* "ECHO" */,-41 , 25/* "Variable" */,-41 , 7/* "{" */,-41 , 9/* ";" */,-41 , 27/* "FunctionInvoke" */,-41 , 19/* "-" */,-41 , 22/* "(" */,-41 , 28/* "String" */,-41 , 29/* "Integer" */,-41 , 30/* "Float" */,-41 , 18/* "+" */,-41 , 21/* "*" */,-41 , 20/* "/" */,-41 , 12/* "==" */,-41 , 17/* "<" */,-41 , 16/* ">" */,-41 , 14/* "<=" */,-41 , 15/* ">=" */,-41 , 13/* "!=" */,-41 , 23/* ")" */,-41 , 10/* "," */,-41 , 3/* "ELSE" */,-41 , 8/* "}" */,-41 ),
    /* State 22 */ new Array( 31/* "ScriptEnd" */,-42 , 26/* "FunctionName" */,-42 , 2/* "IF" */,-42 , 4/* "WHILE" */,-42 , 5/* "DO" */,-42 , 6/* "ECHO" */,-42 , 25/* "Variable" */,-42 , 7/* "{" */,-42 , 9/* ";" */,-42 , 27/* "FunctionInvoke" */,-42 , 19/* "-" */,-42 , 22/* "(" */,-42 , 28/* "String" */,-42 , 29/* "Integer" */,-42 , 30/* "Float" */,-42 , 18/* "+" */,-42 , 21/* "*" */,-42 , 20/* "/" */,-42 , 12/* "==" */,-42 , 17/* "<" */,-42 , 16/* ">" */,-42 , 14/* "<=" */,-42 , 15/* ">=" */,-42 , 13/* "!=" */,-42 , 23/* ")" */,-42 , 10/* "," */,-42 , 3/* "ELSE" */,-42 , 8/* "}" */,-42 ),
    /* State 23 */ new Array( 31/* "ScriptEnd" */,-43 , 26/* "FunctionName" */,-43 , 2/* "IF" */,-43 , 4/* "WHILE" */,-43 , 5/* "DO" */,-43 , 6/* "ECHO" */,-43 , 25/* "Variable" */,-43 , 7/* "{" */,-43 , 9/* ";" */,-43 , 27/* "FunctionInvoke" */,-43 , 19/* "-" */,-43 , 22/* "(" */,-43 , 28/* "String" */,-43 , 29/* "Integer" */,-43 , 30/* "Float" */,-43 , 18/* "+" */,-43 , 21/* "*" */,-43 , 20/* "/" */,-43 , 12/* "==" */,-43 , 17/* "<" */,-43 , 16/* ">" */,-43 , 14/* "<=" */,-43 , 15/* ">=" */,-43 , 13/* "!=" */,-43 , 23/* ")" */,-43 , 10/* "," */,-43 , 3/* "ELSE" */,-43 , 8/* "}" */,-43 ),
    /* State 24 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 , 31/* "ScriptEnd" */,-5 , 3/* "ELSE" */,-5 , 8/* "}" */,-5 ),
    /* State 25 */ new Array( 44/* "$" */,-1 , 32/* "ScriptBegin" */,-1 ),
    /* State 26 */ new Array( 25/* "Variable" */,49 , 23/* ")" */,-18 , 10/* "," */,-18 ),
    /* State 27 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 28 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 29 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 30 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 31 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 32 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 33 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 34 */ new Array( 26/* "FunctionName" */,-39 , 2/* "IF" */,-39 , 4/* "WHILE" */,-39 , 5/* "DO" */,-39 , 6/* "ECHO" */,-39 , 25/* "Variable" */,-39 , 7/* "{" */,-39 , 9/* ";" */,-39 , 27/* "FunctionInvoke" */,-39 , 19/* "-" */,-39 , 22/* "(" */,-39 , 28/* "String" */,-39 , 29/* "Integer" */,-39 , 30/* "Float" */,-39 , 18/* "+" */,-39 , 21/* "*" */,-39 , 20/* "/" */,-39 , 12/* "==" */,-39 , 17/* "<" */,-39 , 16/* ">" */,-39 , 14/* "<=" */,-39 , 15/* ">=" */,-39 , 13/* "!=" */,-39 , 23/* ")" */,-39 , 10/* "," */,-39 , 31/* "ScriptEnd" */,-39 , 3/* "ELSE" */,-39 , 8/* "}" */,-39 ),
    /* State 35 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 5/* "DO" */,57 ),
    /* State 36 */ new Array( 4/* "WHILE" */,58 , 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 37 */ new Array( 9/* ";" */,59 ),
    /* State 38 */ new Array( 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 39 */ new Array( 8/* "}" */,62 , 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 40 */ new Array( 10/* "," */,63 , 23/* ")" */,64 ),
    /* State 41 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 23/* ")" */,-22 , 10/* "," */,-22 ),
    /* State 42 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 43 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 44 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 45 */ new Array( 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 46 */ new Array( 31/* "ScriptEnd" */,-37 , 26/* "FunctionName" */,-37 , 2/* "IF" */,-37 , 4/* "WHILE" */,-37 , 5/* "DO" */,-37 , 6/* "ECHO" */,-37 , 25/* "Variable" */,-37 , 7/* "{" */,-37 , 9/* ";" */,-37 , 27/* "FunctionInvoke" */,-37 , 19/* "-" */,-37 , 22/* "(" */,-37 , 28/* "String" */,-37 , 29/* "Integer" */,-37 , 30/* "Float" */,-37 , 18/* "+" */,-37 , 21/* "*" */,-37 , 20/* "/" */,-37 , 12/* "==" */,-37 , 17/* "<" */,-37 , 16/* ">" */,-37 , 14/* "<=" */,-37 , 15/* ">=" */,-37 , 13/* "!=" */,-37 , 23/* ")" */,-37 , 10/* "," */,-37 , 3/* "ELSE" */,-37 , 8/* "}" */,-37 ),
    /* State 47 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 23/* ")" */,69 ),
    /* State 48 */ new Array( 10/* "," */,70 , 23/* ")" */,71 ),
    /* State 49 */ new Array( 23/* ")" */,-17 , 10/* "," */,-17 ),
    /* State 50 */ new Array( 18/* "+" */,42 , 19/* "-" */,43 , 31/* "ScriptEnd" */,-29 , 26/* "FunctionName" */,-29 , 2/* "IF" */,-29 , 4/* "WHILE" */,-29 , 5/* "DO" */,-29 , 6/* "ECHO" */,-29 , 25/* "Variable" */,-29 , 7/* "{" */,-29 , 9/* ";" */,-29 , 27/* "FunctionInvoke" */,-29 , 22/* "(" */,-29 , 28/* "String" */,-29 , 29/* "Integer" */,-29 , 30/* "Float" */,-29 , 12/* "==" */,-29 , 17/* "<" */,-29 , 16/* ">" */,-29 , 14/* "<=" */,-29 , 15/* ">=" */,-29 , 13/* "!=" */,-29 , 3/* "ELSE" */,-29 , 8/* "}" */,-29 , 23/* ")" */,-29 , 10/* "," */,-29 ),
    /* State 51 */ new Array( 18/* "+" */,42 , 19/* "-" */,43 , 31/* "ScriptEnd" */,-28 , 26/* "FunctionName" */,-28 , 2/* "IF" */,-28 , 4/* "WHILE" */,-28 , 5/* "DO" */,-28 , 6/* "ECHO" */,-28 , 25/* "Variable" */,-28 , 7/* "{" */,-28 , 9/* ";" */,-28 , 27/* "FunctionInvoke" */,-28 , 22/* "(" */,-28 , 28/* "String" */,-28 , 29/* "Integer" */,-28 , 30/* "Float" */,-28 , 12/* "==" */,-28 , 17/* "<" */,-28 , 16/* ">" */,-28 , 14/* "<=" */,-28 , 15/* ">=" */,-28 , 13/* "!=" */,-28 , 3/* "ELSE" */,-28 , 8/* "}" */,-28 , 23/* ")" */,-28 , 10/* "," */,-28 ),
    /* State 52 */ new Array( 18/* "+" */,42 , 19/* "-" */,43 , 31/* "ScriptEnd" */,-27 , 26/* "FunctionName" */,-27 , 2/* "IF" */,-27 , 4/* "WHILE" */,-27 , 5/* "DO" */,-27 , 6/* "ECHO" */,-27 , 25/* "Variable" */,-27 , 7/* "{" */,-27 , 9/* ";" */,-27 , 27/* "FunctionInvoke" */,-27 , 22/* "(" */,-27 , 28/* "String" */,-27 , 29/* "Integer" */,-27 , 30/* "Float" */,-27 , 12/* "==" */,-27 , 17/* "<" */,-27 , 16/* ">" */,-27 , 14/* "<=" */,-27 , 15/* ">=" */,-27 , 13/* "!=" */,-27 , 3/* "ELSE" */,-27 , 8/* "}" */,-27 , 23/* ")" */,-27 , 10/* "," */,-27 ),
    /* State 53 */ new Array( 18/* "+" */,42 , 19/* "-" */,43 , 31/* "ScriptEnd" */,-26 , 26/* "FunctionName" */,-26 , 2/* "IF" */,-26 , 4/* "WHILE" */,-26 , 5/* "DO" */,-26 , 6/* "ECHO" */,-26 , 25/* "Variable" */,-26 , 7/* "{" */,-26 , 9/* ";" */,-26 , 27/* "FunctionInvoke" */,-26 , 22/* "(" */,-26 , 28/* "String" */,-26 , 29/* "Integer" */,-26 , 30/* "Float" */,-26 , 12/* "==" */,-26 , 17/* "<" */,-26 , 16/* ">" */,-26 , 14/* "<=" */,-26 , 15/* ">=" */,-26 , 13/* "!=" */,-26 , 3/* "ELSE" */,-26 , 8/* "}" */,-26 , 23/* ")" */,-26 , 10/* "," */,-26 ),
    /* State 54 */ new Array( 18/* "+" */,42 , 19/* "-" */,43 , 31/* "ScriptEnd" */,-25 , 26/* "FunctionName" */,-25 , 2/* "IF" */,-25 , 4/* "WHILE" */,-25 , 5/* "DO" */,-25 , 6/* "ECHO" */,-25 , 25/* "Variable" */,-25 , 7/* "{" */,-25 , 9/* ";" */,-25 , 27/* "FunctionInvoke" */,-25 , 22/* "(" */,-25 , 28/* "String" */,-25 , 29/* "Integer" */,-25 , 30/* "Float" */,-25 , 12/* "==" */,-25 , 17/* "<" */,-25 , 16/* ">" */,-25 , 14/* "<=" */,-25 , 15/* ">=" */,-25 , 13/* "!=" */,-25 , 3/* "ELSE" */,-25 , 8/* "}" */,-25 , 23/* ")" */,-25 , 10/* "," */,-25 ),
    /* State 55 */ new Array( 18/* "+" */,42 , 19/* "-" */,43 , 31/* "ScriptEnd" */,-24 , 26/* "FunctionName" */,-24 , 2/* "IF" */,-24 , 4/* "WHILE" */,-24 , 5/* "DO" */,-24 , 6/* "ECHO" */,-24 , 25/* "Variable" */,-24 , 7/* "{" */,-24 , 9/* ";" */,-24 , 27/* "FunctionInvoke" */,-24 , 22/* "(" */,-24 , 28/* "String" */,-24 , 29/* "Integer" */,-24 , 30/* "Float" */,-24 , 12/* "==" */,-24 , 17/* "<" */,-24 , 16/* ">" */,-24 , 14/* "<=" */,-24 , 15/* ">=" */,-24 , 13/* "!=" */,-24 , 3/* "ELSE" */,-24 , 8/* "}" */,-24 , 23/* ")" */,-24 , 10/* "," */,-24 ),
    /* State 56 */ new Array( 3/* "ELSE" */,72 , 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 , 31/* "ScriptEnd" */,-8 , 8/* "}" */,-8 ),
    /* State 57 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 58 */ new Array( 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 59 */ new Array( 31/* "ScriptEnd" */,-12 , 26/* "FunctionName" */,-12 , 2/* "IF" */,-12 , 4/* "WHILE" */,-12 , 5/* "DO" */,-12 , 6/* "ECHO" */,-12 , 25/* "Variable" */,-12 , 7/* "{" */,-12 , 9/* ";" */,-12 , 27/* "FunctionInvoke" */,-12 , 19/* "-" */,-12 , 22/* "(" */,-12 , 28/* "String" */,-12 , 29/* "Integer" */,-12 , 30/* "Float" */,-12 , 3/* "ELSE" */,-12 , 8/* "}" */,-12 ),
    /* State 60 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 9/* ";" */,75 ),
    /* State 61 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 , 8/* "}" */,-3 ),
    /* State 62 */ new Array( 31/* "ScriptEnd" */,-14 , 26/* "FunctionName" */,-14 , 2/* "IF" */,-14 , 4/* "WHILE" */,-14 , 5/* "DO" */,-14 , 6/* "ECHO" */,-14 , 25/* "Variable" */,-14 , 7/* "{" */,-14 , 9/* ";" */,-14 , 27/* "FunctionInvoke" */,-14 , 19/* "-" */,-14 , 22/* "(" */,-14 , 28/* "String" */,-14 , 29/* "Integer" */,-14 , 30/* "Float" */,-14 , 3/* "ELSE" */,-14 , 8/* "}" */,-14 ),
    /* State 63 */ new Array( 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 25/* "Variable" */,34 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 64 */ new Array( 31/* "ScriptEnd" */,-20 , 26/* "FunctionName" */,-20 , 2/* "IF" */,-20 , 4/* "WHILE" */,-20 , 5/* "DO" */,-20 , 6/* "ECHO" */,-20 , 25/* "Variable" */,-20 , 7/* "{" */,-20 , 9/* ";" */,-20 , 27/* "FunctionInvoke" */,-20 , 19/* "-" */,-20 , 22/* "(" */,-20 , 28/* "String" */,-20 , 29/* "Integer" */,-20 , 30/* "Float" */,-20 , 12/* "==" */,-20 , 17/* "<" */,-20 , 16/* ">" */,-20 , 14/* "<=" */,-20 , 15/* ">=" */,-20 , 13/* "!=" */,-20 , 23/* ")" */,-20 , 10/* "," */,-20 , 3/* "ELSE" */,-20 , 8/* "}" */,-20 ),
    /* State 65 */ new Array( 20/* "/" */,44 , 21/* "*" */,45 , 31/* "ScriptEnd" */,-32 , 26/* "FunctionName" */,-32 , 2/* "IF" */,-32 , 4/* "WHILE" */,-32 , 5/* "DO" */,-32 , 6/* "ECHO" */,-32 , 25/* "Variable" */,-32 , 7/* "{" */,-32 , 9/* ";" */,-32 , 27/* "FunctionInvoke" */,-32 , 19/* "-" */,-32 , 22/* "(" */,-32 , 28/* "String" */,-32 , 29/* "Integer" */,-32 , 30/* "Float" */,-32 , 18/* "+" */,-32 , 12/* "==" */,-32 , 17/* "<" */,-32 , 16/* ">" */,-32 , 14/* "<=" */,-32 , 15/* ">=" */,-32 , 13/* "!=" */,-32 , 23/* ")" */,-32 , 10/* "," */,-32 , 3/* "ELSE" */,-32 , 8/* "}" */,-32 ),
    /* State 66 */ new Array( 20/* "/" */,44 , 21/* "*" */,45 , 31/* "ScriptEnd" */,-31 , 26/* "FunctionName" */,-31 , 2/* "IF" */,-31 , 4/* "WHILE" */,-31 , 5/* "DO" */,-31 , 6/* "ECHO" */,-31 , 25/* "Variable" */,-31 , 7/* "{" */,-31 , 9/* ";" */,-31 , 27/* "FunctionInvoke" */,-31 , 19/* "-" */,-31 , 22/* "(" */,-31 , 28/* "String" */,-31 , 29/* "Integer" */,-31 , 30/* "Float" */,-31 , 18/* "+" */,-31 , 12/* "==" */,-31 , 17/* "<" */,-31 , 16/* ">" */,-31 , 14/* "<=" */,-31 , 15/* ">=" */,-31 , 13/* "!=" */,-31 , 23/* ")" */,-31 , 10/* "," */,-31 , 3/* "ELSE" */,-31 , 8/* "}" */,-31 ),
    /* State 67 */ new Array( 31/* "ScriptEnd" */,-35 , 26/* "FunctionName" */,-35 , 2/* "IF" */,-35 , 4/* "WHILE" */,-35 , 5/* "DO" */,-35 , 6/* "ECHO" */,-35 , 25/* "Variable" */,-35 , 7/* "{" */,-35 , 9/* ";" */,-35 , 27/* "FunctionInvoke" */,-35 , 19/* "-" */,-35 , 22/* "(" */,-35 , 28/* "String" */,-35 , 29/* "Integer" */,-35 , 30/* "Float" */,-35 , 18/* "+" */,-35 , 21/* "*" */,-35 , 20/* "/" */,-35 , 12/* "==" */,-35 , 17/* "<" */,-35 , 16/* ">" */,-35 , 14/* "<=" */,-35 , 15/* ">=" */,-35 , 13/* "!=" */,-35 , 23/* ")" */,-35 , 10/* "," */,-35 , 3/* "ELSE" */,-35 , 8/* "}" */,-35 ),
    /* State 68 */ new Array( 31/* "ScriptEnd" */,-34 , 26/* "FunctionName" */,-34 , 2/* "IF" */,-34 , 4/* "WHILE" */,-34 , 5/* "DO" */,-34 , 6/* "ECHO" */,-34 , 25/* "Variable" */,-34 , 7/* "{" */,-34 , 9/* ";" */,-34 , 27/* "FunctionInvoke" */,-34 , 19/* "-" */,-34 , 22/* "(" */,-34 , 28/* "String" */,-34 , 29/* "Integer" */,-34 , 30/* "Float" */,-34 , 18/* "+" */,-34 , 21/* "*" */,-34 , 20/* "/" */,-34 , 12/* "==" */,-34 , 17/* "<" */,-34 , 16/* ">" */,-34 , 14/* "<=" */,-34 , 15/* ">=" */,-34 , 13/* "!=" */,-34 , 23/* ")" */,-34 , 10/* "," */,-34 , 3/* "ELSE" */,-34 , 8/* "}" */,-34 ),
    /* State 69 */ new Array( 31/* "ScriptEnd" */,-40 , 26/* "FunctionName" */,-40 , 2/* "IF" */,-40 , 4/* "WHILE" */,-40 , 5/* "DO" */,-40 , 6/* "ECHO" */,-40 , 25/* "Variable" */,-40 , 7/* "{" */,-40 , 9/* ";" */,-40 , 27/* "FunctionInvoke" */,-40 , 19/* "-" */,-40 , 22/* "(" */,-40 , 28/* "String" */,-40 , 29/* "Integer" */,-40 , 30/* "Float" */,-40 , 18/* "+" */,-40 , 21/* "*" */,-40 , 20/* "/" */,-40 , 12/* "==" */,-40 , 17/* "<" */,-40 , 16/* ">" */,-40 , 14/* "<=" */,-40 , 15/* ">=" */,-40 , 13/* "!=" */,-40 , 23/* ")" */,-40 , 10/* "," */,-40 , 3/* "ELSE" */,-40 , 8/* "}" */,-40 ),
    /* State 70 */ new Array( 25/* "Variable" */,77 ),
    /* State 71 */ new Array( 7/* "{" */,78 ),
    /* State 72 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 73 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 , 31/* "ScriptEnd" */,-10 , 3/* "ELSE" */,-10 , 8/* "}" */,-10 ),
    /* State 74 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 9/* ";" */,80 , 5/* "DO" */,57 ),
    /* State 75 */ new Array( 31/* "ScriptEnd" */,-13 , 26/* "FunctionName" */,-13 , 2/* "IF" */,-13 , 4/* "WHILE" */,-13 , 5/* "DO" */,-13 , 6/* "ECHO" */,-13 , 25/* "Variable" */,-13 , 7/* "{" */,-13 , 9/* ";" */,-13 , 27/* "FunctionInvoke" */,-13 , 19/* "-" */,-13 , 22/* "(" */,-13 , 28/* "String" */,-13 , 29/* "Integer" */,-13 , 30/* "Float" */,-13 , 3/* "ELSE" */,-13 , 8/* "}" */,-13 ),
    /* State 76 */ new Array( 13/* "!=" */,27 , 15/* ">=" */,28 , 14/* "<=" */,29 , 16/* ">" */,30 , 17/* "<" */,31 , 12/* "==" */,32 , 23/* ")" */,-21 , 10/* "," */,-21 ),
    /* State 77 */ new Array( 23/* ")" */,-16 , 10/* "," */,-16 ),
    /* State 78 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 79 */ new Array( 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 , 31/* "ScriptEnd" */,-9 , 3/* "ELSE" */,-9 , 8/* "}" */,-9 ),
    /* State 80 */ new Array( 31/* "ScriptEnd" */,-11 , 26/* "FunctionName" */,-11 , 2/* "IF" */,-11 , 4/* "WHILE" */,-11 , 5/* "DO" */,-11 , 6/* "ECHO" */,-11 , 25/* "Variable" */,-11 , 7/* "{" */,-11 , 9/* ";" */,-11 , 27/* "FunctionInvoke" */,-11 , 19/* "-" */,-11 , 22/* "(" */,-11 , 28/* "String" */,-11 , 29/* "Integer" */,-11 , 30/* "Float" */,-11 , 3/* "ELSE" */,-11 , 8/* "}" */,-11 ),
    /* State 81 */ new Array( 8/* "}" */,82 , 26/* "FunctionName" */,4 , 2/* "IF" */,6 , 4/* "WHILE" */,7 , 5/* "DO" */,8 , 6/* "ECHO" */,9 , 25/* "Variable" */,10 , 7/* "{" */,11 , 9/* ";" */,12 , 27/* "FunctionInvoke" */,14 , 19/* "-" */,18 , 22/* "(" */,20 , 28/* "String" */,21 , 29/* "Integer" */,22 , 30/* "Float" */,23 ),
    /* State 82 */ new Array( 31/* "ScriptEnd" */,-6 , 26/* "FunctionName" */,-6 , 2/* "IF" */,-6 , 4/* "WHILE" */,-6 , 5/* "DO" */,-6 , 6/* "ECHO" */,-6 , 25/* "Variable" */,-6 , 7/* "{" */,-6 , 9/* ";" */,-6 , 27/* "FunctionInvoke" */,-6 , 19/* "-" */,-6 , 22/* "(" */,-6 , 28/* "String" */,-6 , 29/* "Integer" */,-6 , 30/* "Float" */,-6 , 3/* "ELSE" */,-6 , 8/* "}" */,-6 )
);

/* Goto-Table */
var goto_tab = new Array(
    /* State 0 */ new Array( 33/* PHPScript */,1 ),
    /* State 1 */ new Array( ),
    /* State 2 */ new Array( 34/* Stmt */,3 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 3 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 4 */ new Array( ),
    /* State 5 */ new Array( ),
    /* State 6 */ new Array( 37/* Expression */,33 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 7 */ new Array( 37/* Expression */,35 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 8 */ new Array( 34/* Stmt */,36 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 9 */ new Array( 38/* Value */,37 ),
    /* State 10 */ new Array( ),
    /* State 11 */ new Array( 35/* Stmt_List */,39 ),
    /* State 12 */ new Array( ),
    /* State 13 */ new Array( ),
    /* State 14 */ new Array( 40/* ActualParameterList */,40 , 37/* Expression */,41 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 15 */ new Array( ),
    /* State 16 */ new Array( ),
    /* State 17 */ new Array( ),
    /* State 18 */ new Array( 38/* Value */,46 ),
    /* State 19 */ new Array( ),
    /* State 20 */ new Array( 37/* Expression */,47 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 21 */ new Array( ),
    /* State 22 */ new Array( ),
    /* State 23 */ new Array( ),
    /* State 24 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 25 */ new Array( ),
    /* State 26 */ new Array( 36/* FormalParameterList */,48 ),
    /* State 27 */ new Array( 41/* AddSubExp */,50 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 28 */ new Array( 41/* AddSubExp */,51 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 29 */ new Array( 41/* AddSubExp */,52 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 30 */ new Array( 41/* AddSubExp */,53 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 31 */ new Array( 41/* AddSubExp */,54 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 32 */ new Array( 41/* AddSubExp */,55 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 33 */ new Array( 34/* Stmt */,56 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 34 */ new Array( ),
    /* State 35 */ new Array( ),
    /* State 36 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 37 */ new Array( ),
    /* State 38 */ new Array( 37/* Expression */,60 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 39 */ new Array( 34/* Stmt */,61 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 40 */ new Array( ),
    /* State 41 */ new Array( ),
    /* State 42 */ new Array( 42/* MulDivExp */,65 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 43 */ new Array( 42/* MulDivExp */,66 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 44 */ new Array( 43/* NegExp */,67 , 38/* Value */,19 ),
    /* State 45 */ new Array( 43/* NegExp */,68 , 38/* Value */,19 ),
    /* State 46 */ new Array( ),
    /* State 47 */ new Array( ),
    /* State 48 */ new Array( ),
    /* State 49 */ new Array( ),
    /* State 50 */ new Array( ),
    /* State 51 */ new Array( ),
    /* State 52 */ new Array( ),
    /* State 53 */ new Array( ),
    /* State 54 */ new Array( ),
    /* State 55 */ new Array( ),
    /* State 56 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 57 */ new Array( 34/* Stmt */,73 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 58 */ new Array( 37/* Expression */,74 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 59 */ new Array( ),
    /* State 60 */ new Array( ),
    /* State 61 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 62 */ new Array( ),
    /* State 63 */ new Array( 37/* Expression */,76 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 64 */ new Array( ),
    /* State 65 */ new Array( ),
    /* State 66 */ new Array( ),
    /* State 67 */ new Array( ),
    /* State 68 */ new Array( ),
    /* State 69 */ new Array( ),
    /* State 70 */ new Array( ),
    /* State 71 */ new Array( ),
    /* State 72 */ new Array( 34/* Stmt */,79 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 73 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 74 */ new Array( ),
    /* State 75 */ new Array( ),
    /* State 76 */ new Array( ),
    /* State 77 */ new Array( ),
    /* State 78 */ new Array( 34/* Stmt */,81 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 79 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 80 */ new Array( ),
    /* State 81 */ new Array( 34/* Stmt */,24 , 37/* Expression */,5 , 39/* UnaryOp */,13 , 41/* AddSubExp */,15 , 42/* MulDivExp */,16 , 43/* NegExp */,17 , 38/* Value */,19 ),
    /* State 82 */ new Array( )
);


/* Symbol labels */
var labels = new Array(
    "PHPScript'" /* Non-terminal symbol */,
    "^" /* Terminal symbol */,
    "IF" /* Terminal symbol */,
    "ELSE" /* Terminal symbol */,
    "WHILE" /* Terminal symbol */,
    "DO" /* Terminal symbol */,
    "ECHO" /* Terminal symbol */,
    "{" /* Terminal symbol */,
    "}" /* Terminal symbol */,
    ";" /* Terminal symbol */,
    "," /* Terminal symbol */,
    "=" /* Terminal symbol */,
    "==" /* Terminal symbol */,
    "!=" /* Terminal symbol */,
    "<=" /* Terminal symbol */,
    ">=" /* Terminal symbol */,
    ">" /* Terminal symbol */,
    "<" /* Terminal symbol */,
    "+" /* Terminal symbol */,
    "-" /* Terminal symbol */,
    "/" /* Terminal symbol */,
    "*" /* Terminal symbol */,
    "(" /* Terminal symbol */,
    ")" /* Terminal symbol */,
    "#" /* Terminal symbol */,
    "Variable" /* Terminal symbol */,
    "FunctionName" /* Terminal symbol */,
    "FunctionInvoke" /* Terminal symbol */,
    "String" /* Terminal symbol */,
    "Integer" /* Terminal symbol */,
    "Float" /* Terminal symbol */,
    "ScriptEnd" /* Terminal symbol */,
    "ScriptBegin" /* Terminal symbol */,
    "PHPScript" /* Non-terminal symbol */,
    "Stmt" /* Non-terminal symbol */,
    "Stmt_List" /* Non-terminal symbol */,
    "FormalParameterList" /* Non-terminal symbol */,
    "Expression" /* Non-terminal symbol */,
    "Value" /* Non-terminal symbol */,
    "UnaryOp" /* Non-terminal symbol */,
    "ActualParameterList" /* Non-terminal symbol */,
    "AddSubExp" /* Non-terminal symbol */,
    "MulDivExp" /* Non-terminal symbol */,
    "NegExp" /* Non-terminal symbol */,
    "$" /* Terminal symbol */
);


info.offset = 0; info.src = src; info.att = new String(); if( !err_off )
err_off = new Array(); if( !err_la )
err_la = new Array(); sstack.push( 0 ); vstack.push( 0 ); la = __lex( info ); while( true )
{ act = 84; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
if( _dbg_withtrace && sstack.length > 0 )
{ __dbg_print( "\nState " + sstack[sstack.length-1] + "\n" + "\tLookahead: " + labels[la] + " (\"" + info.att + "\")\n" + "\tAction: " + act + "\n" + "\tSource: \"" + info.src.substr( info.offset, 30 ) + ( ( info.offset + 30 < info.src.length ) ?
"..." : "" ) + "\"\n" + "\tStack: " + sstack.join() + "\n" + "\tValue stack: " + vstack.join() + "\n" );}
if( act == 84 )
{ if( _dbg_withtrace )
__dbg_print( "Error detected: There is no reduce or shift on the symbol " + labels[la] ); err_cnt++; err_off.push( info.offset - info.att.length ); err_la.push( new Array() ); for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
err_la[err_la.length-1].push( labels[act_tab[sstack[sstack.length-1]][i]] ); var rsstack = new Array(); var rvstack = new Array(); for( var i = 0; i < sstack.length; i++ )
{ rsstack[i] = sstack[i]; rvstack[i] = vstack[i];}
while( act == 84 && la != 44 )
{ if( _dbg_withtrace )
__dbg_print( "\tError recovery\n" + "Current lookahead: " + labels[la] + " (" + info.att + ")\n" + "Action: " + act + "\n\n" ); if( la == -1 )
info.offset++; while( act == 84 && sstack.length > 0 )
{ sstack.pop(); vstack.pop(); if( sstack.length == 0 )
break; act = 84; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
}
if( act != 84 )
break; for( var i = 0; i < rsstack.length; i++ )
{ sstack.push( rsstack[i] ); vstack.push( rvstack[i] );}
la = __lex( info );}
if( act == 84 )
{ if( _dbg_withtrace )
__dbg_print( "\tError recovery failed, terminating parse process..." ); break;}
if( _dbg_withtrace )
__dbg_print( "\tError recovery succeeded, continuing" );}
if( act > 0 )
{ if( _dbg_withtrace )
__dbg_print( "Shifting symbol: " + labels[la] + " (" + info.att + ")" ); sstack.push( act ); vstack.push( info.att ); la = __lex( info ); if( _dbg_withtrace )
__dbg_print( "\tNew lookahead symbol: " + labels[la] + " (" + info.att + ")" );}
else
{ act *= -1; if( _dbg_withtrace )
__dbg_print( "Reducing by producution: " + act ); rval = void(0); if( _dbg_withtrace )
__dbg_print( "\tPerforming semantic action..." ); switch( act )
{
    case 0:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 1:
    {
            execute( vstack[ vstack.length - 2 ] );
                                            if (vstack[ vstack.length - 1 ].length > 2) {
                                                var strNode = createNode( NODE_CONST, vstack[ vstack.length - 1 ].substring(2,vstack[ vstack.length - 1 ].length) );
                                                execute( createNode( NODE_OP, OP_ECHO, strNode ) );
                                            }
    }
    break;
    case 2:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 3:
    {
         rval = createNode( NODE_OP, OP_NONE, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 4:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 5:
    {
         rval = createNode ( NODE_OP, OP_NONE, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] )
    }
    break;
    case 6:
    {
             funTable[vstack[ vstack.length - 7 ]] = createFunction( vstack[ vstack.length - 7 ], curParams, vstack[ vstack.length - 2 ] );
                                            // Make sure to clean up param list for next function declaration
                                            curParams = [];
    }
    break;
    case 7:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 8:
    {
         rval = createNode( NODE_OP, OP_IF, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 9:
    {
         rval = createNode( NODE_OP, OP_IF_ELSE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 10:
    {
         rval = createNode( NODE_OP, OP_WHILE_DO, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 11:
    {
         rval = createNode( NODE_OP, OP_DO_WHILE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 12:
    {
         rval = createNode( NODE_OP, OP_ECHO, vstack[ vstack.length - 2 ] );
    }
    break;
    case 13:
    {
         rval = createNode( NODE_OP, OP_ASSIGN, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 14:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 15:
    {
         rval = createNode( NODE_OP, OP_NONE );
    }
    break;
    case 16:
    {
         curParams[curParams.length] = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 17:
    {
         curParams[curParams.length] = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 18:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 19:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 20:
    {
         rval = createNode( NODE_OP, OP_FCALL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 21:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 22:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 23:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 24:
    {
         rval = createNode( NODE_OP, OP_EQU, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 25:
    {
         rval = createNode( NODE_OP, OP_LOT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 26:
    {
         rval = createNode( NODE_OP, OP_GRT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 27:
    {
         rval = createNode( NODE_OP, OP_LOE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 28:
    {
         rval = createNode( NODE_OP, OP_GRE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 29:
    {
         rval = createNode( NODE_OP, OP_NEQ, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 30:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 31:
    {
         rval = createNode( NODE_OP, OP_SUB, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 32:
    {
         rval = createNode( NODE_OP, OP_ADD, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 33:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 34:
    {
         rval = createNode( NODE_OP, OP_MUL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 35:
    {
         rval = createNode( NODE_OP, OP_DIV, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 36:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 37:
    {
         rval = createNode( NODE_OP, OP_NEG, vstack[ vstack.length - 1 ] );
    }
    break;
    case 38:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 39:
    {
         rval = createNode( NODE_VAR, vstack[ vstack.length - 1 ] );
    }
    break;
    case 40:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 41:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 42:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 43:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
}


if( _dbg_withtrace )
__dbg_print( "\tPopping " + pop_tab[act][1] + " off the stack..." ); for( var i = 0; i < pop_tab[act][1]; i++ )
{ sstack.pop(); vstack.pop();}
go = -1; for( var i = 0; i < goto_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( goto_tab[sstack[sstack.length-1]][i] == pop_tab[act][0] )
{ go = goto_tab[sstack[sstack.length-1]][i+1]; break;}
}
if( act == 0 )
break; if( _dbg_withtrace )
__dbg_print( "\tPushing non-terminal " + labels[ pop_tab[act][0] ] ); sstack.push( go ); vstack.push( rval );}
if( _dbg_withtrace )
{ alert( _dbg_string ); _dbg_string = new String();}
}
if( _dbg_withtrace )
{ __dbg_print( "\nParse complete." ); alert( _dbg_string );}
return err_cnt;}


var str = prompt( "Please enter a PHP-script to be executed:",
    "<? $a = 'test'; function test($p1,$p2) { echo 'hello '; echo 'world'; echo $p1; } $a('a','b'); ?>" );
    //"<? $a = 'b'; $b='Hello World'; echo $$a; ?> hej <? echo 'hej igen.'; ?>" );

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

var error_cnt     = 0;
var error_off    = new Array();
var error_la    = new Array();

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
        spaces += ' ';
    }//end for i<level
    if(typeof(data) != 'object') {
        dt = data;
        if(typeof(data) == 'string') {
            if(addwhitespace == 'html') {
                dt = dt.replace(/&/g,'&');
                dt = dt.replace(/>/g,'>');
                dt = dt.replace(/</g,'<');
            }//end if addwhitespace == html
            dt = dt.replace(/\"/g,'\"');
            dt = '"' + dt + '"';
        }//end if typeof == string
        if(typeof(data) == 'function' && addwhitespace) {
            dt = new String(dt).replace(/\n/g,"<br/>"+spaces);
            if(addwhitespace == 'html') {
                dt = dt.replace(/&/g,'&');
                dt = dt.replace(/>/g,'>');
                dt = dt.replace(/</g,'<');
            }//end if addwhitespace == html
        }//end if typeof == function
        if(typeof(data) == 'undefined') {
            dt = 'undefined';
        }//end if typeof == undefined
        if(addwhitespace == 'html') {
            if(typeof(dt) != 'string') {
                dt = new String(dt);
            }//end typeof != string
            dt = dt.replace(/ /g," ").replace(/\n/g,"<br/>");
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
        rtrn = rtrn.replace(/ /g," ").replace(/\n/g,"<br/>");
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
