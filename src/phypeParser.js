
//////////////////////////////////////
// GLOBALLY USED VARS AND FUNCTIONS //
//////////////////////////////////////

var state = {
    /**
     * Sym table for looking up values.
     */
    symTables : {
    },
    
    /**
     * Val table for keeping values
     */
    valTable : {},
    
    /**
     * Variable for keeping track of currently executing function.
     */
    curFun : '.global',
    
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
            scope = state.curFun;

        if (typeof(state.symTables[scope]) != 'object')
            state.symTables[scope] = {};

        if (typeof(state.valTable['.global#'+varName])=='string'
            && typeof(state.valTable[scope+'#'+varName])!='string') {
            state.valTable['.global#'+varName] = value;
        } else {
            state.symTables[scope][varName] = scope+'#'+varName
            state.valTable[scope+'#'+varName] = value;
        }
    },

    getValue : function(varName, scope) {
        if (!scope)
            scope = state.curFun;
        
        var firstChar = varName.substring(0,1);
        if (firstChar == "$") {
            varName = linker.getValue( varName.substring(1,varName.length) );
        }

        if (typeof(state.symTables[scope])=='object' && typeof(state.symTables[scope][varName])=='string')
            return state.valTable[state.symTables[scope][varName]];
        else if (typeof(state.valTable['.global#'+varName])=='string')
            return state.valTable['.global#'+varName];
            
        throw varNotFound(varName);
    },
    
    /*linkArrKey : function( ) {
        
    }*/
    
    linkVar : function(locVarName, varName, scope) {
        if (!scope)
            scope = state.curFun;
        
        if (typeof(symTables[scope])!='object')
            state.symTables[scope] = {};
        
        state.symTables[scope][locVarName] = varName;
        if (typeof(state.valTable[scope+'#'+varName])!='string')
            state.valTable[scope+'#'+varName] = '';
    },
    
    unlinkVar : function(varName, scope) {
        if (!scope)
            scope = state.curFun;
        
        delete state.valTable[state.symTables[scope][varName]];
        delete state.symTables[scope+'#'+varName];
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
var OP_RETURN = 7;
var OP_ECHO    = 8;

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
    return 'Function not found: '+state.curFun;
}

function funInvalidArgCount(argCount) {
    return 'Function '+state.curFun+'( ) expecting '+argCount+' arguments, but only found '+state.passedParams+'.';
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
        var prevPassedParams = state.passedParams;
        state.passedParams = 0;
        
        // Check if function name is dynamically defined
        var funName = '';
        var firstChar = node.children[0].substring(0,1);
        if (firstChar == "$") {
            funName = linker.getValue( node.children[0].substring(1,node.children[0].length) );
        } else {
            funName = node.children[0];
        }
        
        var prevFun = state.curFun;
        state.curFun = funName;

        // Initialize parameters for the function scope
        if ( node.children[1] )
            execute( node.children[1] );
        
        // Execute function
        var f = state.funTable[state.curFun];
        if ( f && f.params.length <= state.passedParams ) {
            for ( var i=0; i<f.nodes.length; i++ )
                execute( f.nodes[i] );
        } else {
            if (!f)
                throw funNotFound();
            else if (!(f.params.length <= state.passedParams))
                throw funInvalidArgCount(f.params.length);
        }
        
        // Clear parameters for the function scope
        for ( var i=0; i<f.params.length; i++ )
            linker.unlinkVar( f.params[i] );
        
        // State roll-back
        state.passedParams = prevPassedParams;
        state.curFun = prevFun;
        
        // Return the value saved in .return in our valTable.
        return state['return'];
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
        phypeOut( execute( node.children[0] ) );
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
return 46; do
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
        else if( info.src.charCodeAt( pos ) == 33 ) state = 34;
        else if( info.src.charCodeAt( pos ) == 55 ) state = 35;
        else if( info.src.charCodeAt( pos ) == 36 ) state = 38;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 39;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 40;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 41;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 67 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 99 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 43;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 44;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 59;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 63;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 66;
        else if( info.src.charCodeAt( pos ) == 102 ) state = 70;
        else state = -1;
        break;

    case 1:
        state = -1;
        match = 1;
        match_pos = pos;
        break;

    case 2:
        state = -1;
        match = 25;
        match_pos = pos;
        break;

    case 3:
        state = -1;
        match = 23;
        match_pos = pos;
        break;

    case 4:
        state = -1;
        match = 24;
        match_pos = pos;
        break;

    case 5:
        state = -1;
        match = 22;
        match_pos = pos;
        break;

    case 6:
        state = -1;
        match = 19;
        match_pos = pos;
        break;

    case 7:
        state = -1;
        match = 11;
        match_pos = pos;
        break;

    case 8:
        state = -1;
        match = 20;
        match_pos = pos;
        break;

    case 9:
        state = -1;
        match = 21;
        match_pos = pos;
        break;

    case 10:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 10;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 21;
        else state = -1;
        match = 30;
        match_pos = pos;
        break;

    case 11:
        state = -1;
        match = 10;
        match_pos = pos;
        break;

    case 12:
        if( info.src.charCodeAt( pos ) == 61 ) state = 22;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 23;
        else state = -1;
        match = 18;
        match_pos = pos;
        break;

    case 13:
        if( info.src.charCodeAt( pos ) == 61 ) state = 24;
        else state = -1;
        match = 12;
        match_pos = pos;
        break;

    case 14:
        if( info.src.charCodeAt( pos ) == 61 ) state = 25;
        else state = -1;
        match = 17;
        match_pos = pos;
        break;

    case 15:
        state = -1;
        match = 8;
        match_pos = pos;
        break;

    case 16:
        state = -1;
        match = 9;
        match_pos = pos;
        break;

    case 17:
        state = -1;
        match = 14;
        match_pos = pos;
        break;

    case 18:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 18;
        else state = -1;
        match = 26;
        match_pos = pos;
        break;

    case 19:
        state = -1;
        match = 28;
        match_pos = pos;
        break;

    case 20:
        if( info.src.charCodeAt( pos ) == 39 ) state = 39;
        else state = -1;
        match = 29;
        match_pos = pos;
        break;

    case 21:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 21;
        else state = -1;
        match = 31;
        match_pos = pos;
        break;

    case 22:
        state = -1;
        match = 15;
        match_pos = pos;
        break;

    case 23:
        if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 45;
        else state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 24:
        state = -1;
        match = 13;
        match_pos = pos;
        break;

    case 25:
        state = -1;
        match = 16;
        match_pos = pos;
        break;

    case 26:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 59 ) || ( info.src.charCodeAt( pos ) >= 61 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 26;
        else if( info.src.charCodeAt( pos ) == 60 ) state = 46;
        else state = -1;
        match = 33;
        match_pos = pos;
        break;

    case 27:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        match = 5;
        match_pos = pos;
        break;

    case 28:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        match = 2;
        match_pos = pos;
        break;

    case 29:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        match = 6;
        match_pos = pos;
        break;

    case 30:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        match = 3;
        match_pos = pos;
        break;

    case 31:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        match = 4;
        match_pos = pos;
        break;

    case 32:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        match = 7;
        match_pos = pos;
        break;

    case 33:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 33;
        else state = -1;
        match = 27;
        match_pos = pos;
        break;

    case 34:
        if( info.src.charCodeAt( pos ) == 61 ) state = 17;
        else state = -1;
        break;

    case 35:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 35;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        match = 30;
        match_pos = pos;
        break;

    case 36:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 36;
        else state = -1;
        match = 26;
        match_pos = pos;
        break;

    case 37:
        state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 38:
        if( info.src.charCodeAt( pos ) == 36 ) state = 18;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 36;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 54 ) || ( info.src.charCodeAt( pos ) >= 56 && info.src.charCodeAt( pos ) <= 57 ) ) state = 42;
        else state = -1;
        break;

    case 39:
        if( info.src.charCodeAt( pos ) == 39 ) state = 20;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 39;
        else state = -1;
        break;

    case 40:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 21;
        else state = -1;
        break;

    case 41:
        if( info.src.charCodeAt( pos ) == 62 ) state = 26;
        else state = -1;
        break;

    case 42:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        break;

    case 43:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 27;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        break;

    case 44:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 70 || info.src.charCodeAt( pos ) == 102 ) state = 28;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 69 ) || ( info.src.charCodeAt( pos ) >= 71 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 101 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        break;

    case 45:
        if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 49;
        else state = -1;
        break;

    case 46:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 26;
        else state = -1;
        break;

    case 47:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 29;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        break;

    case 48:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 30;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        break;

    case 49:
        if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 37;
        else state = -1;
        break;

    case 50:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 31;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        break;

    case 51:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 32;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 77 ) || ( info.src.charCodeAt( pos ) >= 79 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else state = -1;
        break;

    case 52:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 32 ) state = 53;
        else state = -1;
        break;

    case 53:
        if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 33;
        else state = -1;
        break;

    case 54:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 47;
        else state = -1;
        break;

    case 55:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 48;
        else state = -1;
        break;

    case 56:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 50;
        else state = -1;
        break;

    case 57:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 51;
        else state = -1;
        break;

    case 58:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 52;
        else state = -1;
        break;

    case 59:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 54;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 55;
        else state = -1;
        break;

    case 60:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 56;
        else state = -1;
        break;

    case 61:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 57;
        else state = -1;
        break;

    case 62:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 111 ) state = 58;
        else state = -1;
        break;

    case 63:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 60;
        else state = -1;
        break;

    case 64:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 61;
        else state = -1;
        break;

    case 65:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 105 ) state = 62;
        else state = -1;
        break;

    case 66:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 64;
        else state = -1;
        break;

    case 67:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 116 ) state = 65;
        else state = -1;
        break;

    case 68:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 99 ) state = 67;
        else state = -1;
        break;

    case 69:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 68;
        else state = -1;
        break;

    case 70:
        if( info.src.charCodeAt( pos ) == 40 ) state = 19;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 42;
        else if( info.src.charCodeAt( pos ) == 117 ) state = 69;
        else state = -1;
        break;

}


pos++;}
while( state > -1 );}
while( 1 > -1 && match == 1 ); if( match > -1 )
{ info.att = info.src.substr( start, match_pos - start ); info.offset = match_pos; switch( match )
{
    case 26:
        {
         info.att = info.att.substr(1,info.att.length-1);
        }
        break;

    case 27:
        {
         info.att = info.att.substr(9,info.att.length-1);
        }
        break;

    case 28:
        {
         info.att = info.att.substr(0,info.att.length-1);
        }
        break;

    case 29:
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
    new Array( 34/* PHPScript */, 4 ),
    new Array( 34/* PHPScript */, 0 ),
    new Array( 36/* Stmt_List */, 2 ),
    new Array( 36/* Stmt_List */, 0 ),
    new Array( 35/* Stmt */, 2 ),
    new Array( 35/* Stmt */, 7 ),
    new Array( 35/* Stmt */, 1 ),
    new Array( 35/* Stmt */, 1 ),
    new Array( 35/* Stmt */, 3 ),
    new Array( 35/* Stmt */, 5 ),
    new Array( 35/* Stmt */, 4 ),
    new Array( 35/* Stmt */, 5 ),
    new Array( 35/* Stmt */, 3 ),
    new Array( 35/* Stmt */, 4 ),
    new Array( 35/* Stmt */, 3 ),
    new Array( 35/* Stmt */, 1 ),
    new Array( 37/* FormalParameterList */, 3 ),
    new Array( 37/* FormalParameterList */, 1 ),
    new Array( 37/* FormalParameterList */, 0 ),
    new Array( 38/* Return */, 2 ),
    new Array( 38/* Return */, 1 ),
    new Array( 39/* Expression */, 1 ),
    new Array( 39/* Expression */, 3 ),
    new Array( 41/* ActualParameterList */, 3 ),
    new Array( 41/* ActualParameterList */, 1 ),
    new Array( 41/* ActualParameterList */, 0 ),
    new Array( 40/* UnaryOp */, 3 ),
    new Array( 40/* UnaryOp */, 3 ),
    new Array( 40/* UnaryOp */, 3 ),
    new Array( 40/* UnaryOp */, 3 ),
    new Array( 40/* UnaryOp */, 3 ),
    new Array( 40/* UnaryOp */, 3 ),
    new Array( 40/* UnaryOp */, 1 ),
    new Array( 42/* AddSubExp */, 3 ),
    new Array( 42/* AddSubExp */, 3 ),
    new Array( 42/* AddSubExp */, 1 ),
    new Array( 43/* MulDivExp */, 3 ),
    new Array( 43/* MulDivExp */, 3 ),
    new Array( 43/* MulDivExp */, 1 ),
    new Array( 44/* NegExp */, 2 ),
    new Array( 44/* NegExp */, 1 ),
    new Array( 45/* Value */, 1 ),
    new Array( 45/* Value */, 3 ),
    new Array( 45/* Value */, 1 ),
    new Array( 45/* Value */, 1 ),
    new Array( 45/* Value */, 1 )
);

/* Action-Table */
var act_tab = new Array(
    /* State 0 */ new Array( 46/* "$" */,-2 , 32/* "ScriptBegin" */,-2 ),
    /* State 1 */ new Array( 32/* "ScriptBegin" */,2 , 46/* "$" */,0 ),
    /* State 2 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 3 */ new Array( 33/* "ScriptEnd" */,27 , 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 4 */ new Array( 23/* "(" */,28 ),
    /* State 5 */ new Array( 33/* "ScriptEnd" */,-7 , 27/* "FunctionName" */,-7 , 2/* "IF" */,-7 , 4/* "WHILE" */,-7 , 5/* "DO" */,-7 , 6/* "ECHO" */,-7 , 26/* "Variable" */,-7 , 8/* "{" */,-7 , 10/* ";" */,-7 , 7/* "RETURN" */,-7 , 28/* "FunctionInvoke" */,-7 , 20/* "-" */,-7 , 23/* "(" */,-7 , 29/* "String" */,-7 , 30/* "Integer" */,-7 , 31/* "Float" */,-7 , 3/* "ELSE" */,-7 , 9/* "}" */,-7 ),
    /* State 6 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 33/* "ScriptEnd" */,-8 , 27/* "FunctionName" */,-8 , 2/* "IF" */,-8 , 4/* "WHILE" */,-8 , 5/* "DO" */,-8 , 6/* "ECHO" */,-8 , 26/* "Variable" */,-8 , 8/* "{" */,-8 , 10/* ";" */,-8 , 7/* "RETURN" */,-8 , 28/* "FunctionInvoke" */,-8 , 20/* "-" */,-8 , 23/* "(" */,-8 , 29/* "String" */,-8 , 30/* "Integer" */,-8 , 31/* "Float" */,-8 , 3/* "ELSE" */,-8 , 9/* "}" */,-8 ),
    /* State 7 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 8 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 9 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 10 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 11 */ new Array( 12/* "=" */,40 , 33/* "ScriptEnd" */,-42 , 27/* "FunctionName" */,-42 , 2/* "IF" */,-42 , 4/* "WHILE" */,-42 , 5/* "DO" */,-42 , 6/* "ECHO" */,-42 , 26/* "Variable" */,-42 , 8/* "{" */,-42 , 10/* ";" */,-42 , 7/* "RETURN" */,-42 , 28/* "FunctionInvoke" */,-42 , 20/* "-" */,-42 , 23/* "(" */,-42 , 29/* "String" */,-42 , 30/* "Integer" */,-42 , 31/* "Float" */,-42 , 19/* "+" */,-42 , 22/* "*" */,-42 , 21/* "/" */,-42 , 13/* "==" */,-42 , 18/* "<" */,-42 , 17/* ">" */,-42 , 15/* "<=" */,-42 , 16/* ">=" */,-42 , 14/* "!=" */,-42 , 3/* "ELSE" */,-42 , 9/* "}" */,-42 ),
    /* State 12 */ new Array( 9/* "}" */,-4 , 27/* "FunctionName" */,-4 , 2/* "IF" */,-4 , 4/* "WHILE" */,-4 , 5/* "DO" */,-4 , 6/* "ECHO" */,-4 , 26/* "Variable" */,-4 , 8/* "{" */,-4 , 10/* ";" */,-4 , 7/* "RETURN" */,-4 , 28/* "FunctionInvoke" */,-4 , 20/* "-" */,-4 , 23/* "(" */,-4 , 29/* "String" */,-4 , 30/* "Integer" */,-4 , 31/* "Float" */,-4 ),
    /* State 13 */ new Array( 33/* "ScriptEnd" */,-16 , 27/* "FunctionName" */,-16 , 2/* "IF" */,-16 , 4/* "WHILE" */,-16 , 5/* "DO" */,-16 , 6/* "ECHO" */,-16 , 26/* "Variable" */,-16 , 8/* "{" */,-16 , 10/* ";" */,-16 , 7/* "RETURN" */,-16 , 28/* "FunctionInvoke" */,-16 , 20/* "-" */,-16 , 23/* "(" */,-16 , 29/* "String" */,-16 , 30/* "Integer" */,-16 , 31/* "Float" */,-16 , 3/* "ELSE" */,-16 , 9/* "}" */,-16 ),
    /* State 14 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 , 33/* "ScriptEnd" */,-21 , 27/* "FunctionName" */,-21 , 2/* "IF" */,-21 , 4/* "WHILE" */,-21 , 5/* "DO" */,-21 , 6/* "ECHO" */,-21 , 8/* "{" */,-21 , 10/* ";" */,-21 , 7/* "RETURN" */,-21 , 3/* "ELSE" */,-21 , 9/* "}" */,-21 ),
    /* State 15 */ new Array( 33/* "ScriptEnd" */,-22 , 27/* "FunctionName" */,-22 , 2/* "IF" */,-22 , 4/* "WHILE" */,-22 , 5/* "DO" */,-22 , 6/* "ECHO" */,-22 , 26/* "Variable" */,-22 , 8/* "{" */,-22 , 10/* ";" */,-22 , 7/* "RETURN" */,-22 , 28/* "FunctionInvoke" */,-22 , 20/* "-" */,-22 , 23/* "(" */,-22 , 29/* "String" */,-22 , 30/* "Integer" */,-22 , 31/* "Float" */,-22 , 13/* "==" */,-22 , 18/* "<" */,-22 , 17/* ">" */,-22 , 15/* "<=" */,-22 , 16/* ">=" */,-22 , 14/* "!=" */,-22 , 24/* ")" */,-22 , 11/* "," */,-22 , 3/* "ELSE" */,-22 , 9/* "}" */,-22 ),
    /* State 16 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 , 24/* ")" */,-26 , 11/* "," */,-26 ),
    /* State 17 */ new Array( 19/* "+" */,45 , 20/* "-" */,46 , 33/* "ScriptEnd" */,-33 , 27/* "FunctionName" */,-33 , 2/* "IF" */,-33 , 4/* "WHILE" */,-33 , 5/* "DO" */,-33 , 6/* "ECHO" */,-33 , 26/* "Variable" */,-33 , 8/* "{" */,-33 , 10/* ";" */,-33 , 7/* "RETURN" */,-33 , 28/* "FunctionInvoke" */,-33 , 23/* "(" */,-33 , 29/* "String" */,-33 , 30/* "Integer" */,-33 , 31/* "Float" */,-33 , 13/* "==" */,-33 , 18/* "<" */,-33 , 17/* ">" */,-33 , 15/* "<=" */,-33 , 16/* ">=" */,-33 , 14/* "!=" */,-33 , 24/* ")" */,-33 , 11/* "," */,-33 , 3/* "ELSE" */,-33 , 9/* "}" */,-33 ),
    /* State 18 */ new Array( 21/* "/" */,47 , 22/* "*" */,48 , 33/* "ScriptEnd" */,-36 , 27/* "FunctionName" */,-36 , 2/* "IF" */,-36 , 4/* "WHILE" */,-36 , 5/* "DO" */,-36 , 6/* "ECHO" */,-36 , 26/* "Variable" */,-36 , 8/* "{" */,-36 , 10/* ";" */,-36 , 7/* "RETURN" */,-36 , 28/* "FunctionInvoke" */,-36 , 20/* "-" */,-36 , 23/* "(" */,-36 , 29/* "String" */,-36 , 30/* "Integer" */,-36 , 31/* "Float" */,-36 , 19/* "+" */,-36 , 13/* "==" */,-36 , 18/* "<" */,-36 , 17/* ">" */,-36 , 15/* "<=" */,-36 , 16/* ">=" */,-36 , 14/* "!=" */,-36 , 24/* ")" */,-36 , 11/* "," */,-36 , 3/* "ELSE" */,-36 , 9/* "}" */,-36 ),
    /* State 19 */ new Array( 33/* "ScriptEnd" */,-39 , 27/* "FunctionName" */,-39 , 2/* "IF" */,-39 , 4/* "WHILE" */,-39 , 5/* "DO" */,-39 , 6/* "ECHO" */,-39 , 26/* "Variable" */,-39 , 8/* "{" */,-39 , 10/* ";" */,-39 , 7/* "RETURN" */,-39 , 28/* "FunctionInvoke" */,-39 , 20/* "-" */,-39 , 23/* "(" */,-39 , 29/* "String" */,-39 , 30/* "Integer" */,-39 , 31/* "Float" */,-39 , 19/* "+" */,-39 , 22/* "*" */,-39 , 21/* "/" */,-39 , 13/* "==" */,-39 , 18/* "<" */,-39 , 17/* ">" */,-39 , 15/* "<=" */,-39 , 16/* ">=" */,-39 , 14/* "!=" */,-39 , 24/* ")" */,-39 , 11/* "," */,-39 , 3/* "ELSE" */,-39 , 9/* "}" */,-39 ),
    /* State 20 */ new Array( 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 21 */ new Array( 33/* "ScriptEnd" */,-41 , 27/* "FunctionName" */,-41 , 2/* "IF" */,-41 , 4/* "WHILE" */,-41 , 5/* "DO" */,-41 , 6/* "ECHO" */,-41 , 26/* "Variable" */,-41 , 8/* "{" */,-41 , 10/* ";" */,-41 , 7/* "RETURN" */,-41 , 28/* "FunctionInvoke" */,-41 , 20/* "-" */,-41 , 23/* "(" */,-41 , 29/* "String" */,-41 , 30/* "Integer" */,-41 , 31/* "Float" */,-41 , 19/* "+" */,-41 , 22/* "*" */,-41 , 21/* "/" */,-41 , 13/* "==" */,-41 , 18/* "<" */,-41 , 17/* ">" */,-41 , 15/* "<=" */,-41 , 16/* ">=" */,-41 , 14/* "!=" */,-41 , 24/* ")" */,-41 , 11/* "," */,-41 , 3/* "ELSE" */,-41 , 9/* "}" */,-41 ),
    /* State 22 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 23 */ new Array( 33/* "ScriptEnd" */,-44 , 27/* "FunctionName" */,-44 , 2/* "IF" */,-44 , 4/* "WHILE" */,-44 , 5/* "DO" */,-44 , 6/* "ECHO" */,-44 , 26/* "Variable" */,-44 , 8/* "{" */,-44 , 10/* ";" */,-44 , 7/* "RETURN" */,-44 , 28/* "FunctionInvoke" */,-44 , 20/* "-" */,-44 , 23/* "(" */,-44 , 29/* "String" */,-44 , 30/* "Integer" */,-44 , 31/* "Float" */,-44 , 19/* "+" */,-44 , 22/* "*" */,-44 , 21/* "/" */,-44 , 13/* "==" */,-44 , 18/* "<" */,-44 , 17/* ">" */,-44 , 15/* "<=" */,-44 , 16/* ">=" */,-44 , 14/* "!=" */,-44 , 24/* ")" */,-44 , 11/* "," */,-44 , 3/* "ELSE" */,-44 , 9/* "}" */,-44 ),
    /* State 24 */ new Array( 33/* "ScriptEnd" */,-45 , 27/* "FunctionName" */,-45 , 2/* "IF" */,-45 , 4/* "WHILE" */,-45 , 5/* "DO" */,-45 , 6/* "ECHO" */,-45 , 26/* "Variable" */,-45 , 8/* "{" */,-45 , 10/* ";" */,-45 , 7/* "RETURN" */,-45 , 28/* "FunctionInvoke" */,-45 , 20/* "-" */,-45 , 23/* "(" */,-45 , 29/* "String" */,-45 , 30/* "Integer" */,-45 , 31/* "Float" */,-45 , 19/* "+" */,-45 , 22/* "*" */,-45 , 21/* "/" */,-45 , 13/* "==" */,-45 , 18/* "<" */,-45 , 17/* ">" */,-45 , 15/* "<=" */,-45 , 16/* ">=" */,-45 , 14/* "!=" */,-45 , 24/* ")" */,-45 , 11/* "," */,-45 , 3/* "ELSE" */,-45 , 9/* "}" */,-45 ),
    /* State 25 */ new Array( 33/* "ScriptEnd" */,-46 , 27/* "FunctionName" */,-46 , 2/* "IF" */,-46 , 4/* "WHILE" */,-46 , 5/* "DO" */,-46 , 6/* "ECHO" */,-46 , 26/* "Variable" */,-46 , 8/* "{" */,-46 , 10/* ";" */,-46 , 7/* "RETURN" */,-46 , 28/* "FunctionInvoke" */,-46 , 20/* "-" */,-46 , 23/* "(" */,-46 , 29/* "String" */,-46 , 30/* "Integer" */,-46 , 31/* "Float" */,-46 , 19/* "+" */,-46 , 22/* "*" */,-46 , 21/* "/" */,-46 , 13/* "==" */,-46 , 18/* "<" */,-46 , 17/* ">" */,-46 , 15/* "<=" */,-46 , 16/* ">=" */,-46 , 14/* "!=" */,-46 , 24/* ")" */,-46 , 11/* "," */,-46 , 3/* "ELSE" */,-46 , 9/* "}" */,-46 ),
    /* State 26 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 , 33/* "ScriptEnd" */,-5 , 3/* "ELSE" */,-5 , 9/* "}" */,-5 ),
    /* State 27 */ new Array( 46/* "$" */,-1 , 32/* "ScriptBegin" */,-1 ),
    /* State 28 */ new Array( 26/* "Variable" */,52 , 24/* ")" */,-19 , 11/* "," */,-19 ),
    /* State 29 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 30 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 31 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 32 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 33 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 34 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 35 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 36 */ new Array( 27/* "FunctionName" */,-42 , 2/* "IF" */,-42 , 4/* "WHILE" */,-42 , 5/* "DO" */,-42 , 6/* "ECHO" */,-42 , 26/* "Variable" */,-42 , 8/* "{" */,-42 , 10/* ";" */,-42 , 7/* "RETURN" */,-42 , 28/* "FunctionInvoke" */,-42 , 20/* "-" */,-42 , 23/* "(" */,-42 , 29/* "String" */,-42 , 30/* "Integer" */,-42 , 31/* "Float" */,-42 , 19/* "+" */,-42 , 22/* "*" */,-42 , 21/* "/" */,-42 , 13/* "==" */,-42 , 18/* "<" */,-42 , 17/* ">" */,-42 , 15/* "<=" */,-42 , 16/* ">=" */,-42 , 14/* "!=" */,-42 , 33/* "ScriptEnd" */,-42 , 24/* ")" */,-42 , 11/* "," */,-42 , 3/* "ELSE" */,-42 , 9/* "}" */,-42 ),
    /* State 37 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 5/* "DO" */,60 ),
    /* State 38 */ new Array( 4/* "WHILE" */,61 , 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 39 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 10/* ";" */,62 ),
    /* State 40 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 41 */ new Array( 9/* "}" */,65 , 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 42 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 33/* "ScriptEnd" */,-20 , 27/* "FunctionName" */,-20 , 2/* "IF" */,-20 , 4/* "WHILE" */,-20 , 5/* "DO" */,-20 , 6/* "ECHO" */,-20 , 26/* "Variable" */,-20 , 8/* "{" */,-20 , 10/* ";" */,-20 , 7/* "RETURN" */,-20 , 28/* "FunctionInvoke" */,-20 , 20/* "-" */,-20 , 23/* "(" */,-20 , 29/* "String" */,-20 , 30/* "Integer" */,-20 , 31/* "Float" */,-20 , 3/* "ELSE" */,-20 , 9/* "}" */,-20 ),
    /* State 43 */ new Array( 11/* "," */,66 , 24/* ")" */,67 ),
    /* State 44 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 24/* ")" */,-25 , 11/* "," */,-25 ),
    /* State 45 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 46 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 47 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 48 */ new Array( 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 49 */ new Array( 33/* "ScriptEnd" */,-40 , 27/* "FunctionName" */,-40 , 2/* "IF" */,-40 , 4/* "WHILE" */,-40 , 5/* "DO" */,-40 , 6/* "ECHO" */,-40 , 26/* "Variable" */,-40 , 8/* "{" */,-40 , 10/* ";" */,-40 , 7/* "RETURN" */,-40 , 28/* "FunctionInvoke" */,-40 , 20/* "-" */,-40 , 23/* "(" */,-40 , 29/* "String" */,-40 , 30/* "Integer" */,-40 , 31/* "Float" */,-40 , 19/* "+" */,-40 , 22/* "*" */,-40 , 21/* "/" */,-40 , 13/* "==" */,-40 , 18/* "<" */,-40 , 17/* ">" */,-40 , 15/* "<=" */,-40 , 16/* ">=" */,-40 , 14/* "!=" */,-40 , 24/* ")" */,-40 , 11/* "," */,-40 , 3/* "ELSE" */,-40 , 9/* "}" */,-40 ),
    /* State 50 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 24/* ")" */,72 ),
    /* State 51 */ new Array( 11/* "," */,73 , 24/* ")" */,74 ),
    /* State 52 */ new Array( 24/* ")" */,-18 , 11/* "," */,-18 ),
    /* State 53 */ new Array( 19/* "+" */,45 , 20/* "-" */,46 , 33/* "ScriptEnd" */,-32 , 27/* "FunctionName" */,-32 , 2/* "IF" */,-32 , 4/* "WHILE" */,-32 , 5/* "DO" */,-32 , 6/* "ECHO" */,-32 , 26/* "Variable" */,-32 , 8/* "{" */,-32 , 10/* ";" */,-32 , 7/* "RETURN" */,-32 , 28/* "FunctionInvoke" */,-32 , 23/* "(" */,-32 , 29/* "String" */,-32 , 30/* "Integer" */,-32 , 31/* "Float" */,-32 , 13/* "==" */,-32 , 18/* "<" */,-32 , 17/* ">" */,-32 , 15/* "<=" */,-32 , 16/* ">=" */,-32 , 14/* "!=" */,-32 , 3/* "ELSE" */,-32 , 9/* "}" */,-32 , 24/* ")" */,-32 , 11/* "," */,-32 ),
    /* State 54 */ new Array( 19/* "+" */,45 , 20/* "-" */,46 , 33/* "ScriptEnd" */,-31 , 27/* "FunctionName" */,-31 , 2/* "IF" */,-31 , 4/* "WHILE" */,-31 , 5/* "DO" */,-31 , 6/* "ECHO" */,-31 , 26/* "Variable" */,-31 , 8/* "{" */,-31 , 10/* ";" */,-31 , 7/* "RETURN" */,-31 , 28/* "FunctionInvoke" */,-31 , 23/* "(" */,-31 , 29/* "String" */,-31 , 30/* "Integer" */,-31 , 31/* "Float" */,-31 , 13/* "==" */,-31 , 18/* "<" */,-31 , 17/* ">" */,-31 , 15/* "<=" */,-31 , 16/* ">=" */,-31 , 14/* "!=" */,-31 , 3/* "ELSE" */,-31 , 9/* "}" */,-31 , 24/* ")" */,-31 , 11/* "," */,-31 ),
    /* State 55 */ new Array( 19/* "+" */,45 , 20/* "-" */,46 , 33/* "ScriptEnd" */,-30 , 27/* "FunctionName" */,-30 , 2/* "IF" */,-30 , 4/* "WHILE" */,-30 , 5/* "DO" */,-30 , 6/* "ECHO" */,-30 , 26/* "Variable" */,-30 , 8/* "{" */,-30 , 10/* ";" */,-30 , 7/* "RETURN" */,-30 , 28/* "FunctionInvoke" */,-30 , 23/* "(" */,-30 , 29/* "String" */,-30 , 30/* "Integer" */,-30 , 31/* "Float" */,-30 , 13/* "==" */,-30 , 18/* "<" */,-30 , 17/* ">" */,-30 , 15/* "<=" */,-30 , 16/* ">=" */,-30 , 14/* "!=" */,-30 , 3/* "ELSE" */,-30 , 9/* "}" */,-30 , 24/* ")" */,-30 , 11/* "," */,-30 ),
    /* State 56 */ new Array( 19/* "+" */,45 , 20/* "-" */,46 , 33/* "ScriptEnd" */,-29 , 27/* "FunctionName" */,-29 , 2/* "IF" */,-29 , 4/* "WHILE" */,-29 , 5/* "DO" */,-29 , 6/* "ECHO" */,-29 , 26/* "Variable" */,-29 , 8/* "{" */,-29 , 10/* ";" */,-29 , 7/* "RETURN" */,-29 , 28/* "FunctionInvoke" */,-29 , 23/* "(" */,-29 , 29/* "String" */,-29 , 30/* "Integer" */,-29 , 31/* "Float" */,-29 , 13/* "==" */,-29 , 18/* "<" */,-29 , 17/* ">" */,-29 , 15/* "<=" */,-29 , 16/* ">=" */,-29 , 14/* "!=" */,-29 , 3/* "ELSE" */,-29 , 9/* "}" */,-29 , 24/* ")" */,-29 , 11/* "," */,-29 ),
    /* State 57 */ new Array( 19/* "+" */,45 , 20/* "-" */,46 , 33/* "ScriptEnd" */,-28 , 27/* "FunctionName" */,-28 , 2/* "IF" */,-28 , 4/* "WHILE" */,-28 , 5/* "DO" */,-28 , 6/* "ECHO" */,-28 , 26/* "Variable" */,-28 , 8/* "{" */,-28 , 10/* ";" */,-28 , 7/* "RETURN" */,-28 , 28/* "FunctionInvoke" */,-28 , 23/* "(" */,-28 , 29/* "String" */,-28 , 30/* "Integer" */,-28 , 31/* "Float" */,-28 , 13/* "==" */,-28 , 18/* "<" */,-28 , 17/* ">" */,-28 , 15/* "<=" */,-28 , 16/* ">=" */,-28 , 14/* "!=" */,-28 , 3/* "ELSE" */,-28 , 9/* "}" */,-28 , 24/* ")" */,-28 , 11/* "," */,-28 ),
    /* State 58 */ new Array( 19/* "+" */,45 , 20/* "-" */,46 , 33/* "ScriptEnd" */,-27 , 27/* "FunctionName" */,-27 , 2/* "IF" */,-27 , 4/* "WHILE" */,-27 , 5/* "DO" */,-27 , 6/* "ECHO" */,-27 , 26/* "Variable" */,-27 , 8/* "{" */,-27 , 10/* ";" */,-27 , 7/* "RETURN" */,-27 , 28/* "FunctionInvoke" */,-27 , 23/* "(" */,-27 , 29/* "String" */,-27 , 30/* "Integer" */,-27 , 31/* "Float" */,-27 , 13/* "==" */,-27 , 18/* "<" */,-27 , 17/* ">" */,-27 , 15/* "<=" */,-27 , 16/* ">=" */,-27 , 14/* "!=" */,-27 , 3/* "ELSE" */,-27 , 9/* "}" */,-27 , 24/* ")" */,-27 , 11/* "," */,-27 ),
    /* State 59 */ new Array( 3/* "ELSE" */,75 , 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 , 33/* "ScriptEnd" */,-9 , 9/* "}" */,-9 ),
    /* State 60 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 61 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 62 */ new Array( 33/* "ScriptEnd" */,-13 , 27/* "FunctionName" */,-13 , 2/* "IF" */,-13 , 4/* "WHILE" */,-13 , 5/* "DO" */,-13 , 6/* "ECHO" */,-13 , 26/* "Variable" */,-13 , 8/* "{" */,-13 , 10/* ";" */,-13 , 7/* "RETURN" */,-13 , 28/* "FunctionInvoke" */,-13 , 20/* "-" */,-13 , 23/* "(" */,-13 , 29/* "String" */,-13 , 30/* "Integer" */,-13 , 31/* "Float" */,-13 , 3/* "ELSE" */,-13 , 9/* "}" */,-13 ),
    /* State 63 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 10/* ";" */,78 ),
    /* State 64 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 , 9/* "}" */,-3 ),
    /* State 65 */ new Array( 33/* "ScriptEnd" */,-15 , 27/* "FunctionName" */,-15 , 2/* "IF" */,-15 , 4/* "WHILE" */,-15 , 5/* "DO" */,-15 , 6/* "ECHO" */,-15 , 26/* "Variable" */,-15 , 8/* "{" */,-15 , 10/* ";" */,-15 , 7/* "RETURN" */,-15 , 28/* "FunctionInvoke" */,-15 , 20/* "-" */,-15 , 23/* "(" */,-15 , 29/* "String" */,-15 , 30/* "Integer" */,-15 , 31/* "Float" */,-15 , 3/* "ELSE" */,-15 , 9/* "}" */,-15 ),
    /* State 66 */ new Array( 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 26/* "Variable" */,36 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 67 */ new Array( 33/* "ScriptEnd" */,-23 , 27/* "FunctionName" */,-23 , 2/* "IF" */,-23 , 4/* "WHILE" */,-23 , 5/* "DO" */,-23 , 6/* "ECHO" */,-23 , 26/* "Variable" */,-23 , 8/* "{" */,-23 , 10/* ";" */,-23 , 7/* "RETURN" */,-23 , 28/* "FunctionInvoke" */,-23 , 20/* "-" */,-23 , 23/* "(" */,-23 , 29/* "String" */,-23 , 30/* "Integer" */,-23 , 31/* "Float" */,-23 , 13/* "==" */,-23 , 18/* "<" */,-23 , 17/* ">" */,-23 , 15/* "<=" */,-23 , 16/* ">=" */,-23 , 14/* "!=" */,-23 , 24/* ")" */,-23 , 11/* "," */,-23 , 3/* "ELSE" */,-23 , 9/* "}" */,-23 ),
    /* State 68 */ new Array( 21/* "/" */,47 , 22/* "*" */,48 , 33/* "ScriptEnd" */,-35 , 27/* "FunctionName" */,-35 , 2/* "IF" */,-35 , 4/* "WHILE" */,-35 , 5/* "DO" */,-35 , 6/* "ECHO" */,-35 , 26/* "Variable" */,-35 , 8/* "{" */,-35 , 10/* ";" */,-35 , 7/* "RETURN" */,-35 , 28/* "FunctionInvoke" */,-35 , 20/* "-" */,-35 , 23/* "(" */,-35 , 29/* "String" */,-35 , 30/* "Integer" */,-35 , 31/* "Float" */,-35 , 19/* "+" */,-35 , 13/* "==" */,-35 , 18/* "<" */,-35 , 17/* ">" */,-35 , 15/* "<=" */,-35 , 16/* ">=" */,-35 , 14/* "!=" */,-35 , 24/* ")" */,-35 , 11/* "," */,-35 , 3/* "ELSE" */,-35 , 9/* "}" */,-35 ),
    /* State 69 */ new Array( 21/* "/" */,47 , 22/* "*" */,48 , 33/* "ScriptEnd" */,-34 , 27/* "FunctionName" */,-34 , 2/* "IF" */,-34 , 4/* "WHILE" */,-34 , 5/* "DO" */,-34 , 6/* "ECHO" */,-34 , 26/* "Variable" */,-34 , 8/* "{" */,-34 , 10/* ";" */,-34 , 7/* "RETURN" */,-34 , 28/* "FunctionInvoke" */,-34 , 20/* "-" */,-34 , 23/* "(" */,-34 , 29/* "String" */,-34 , 30/* "Integer" */,-34 , 31/* "Float" */,-34 , 19/* "+" */,-34 , 13/* "==" */,-34 , 18/* "<" */,-34 , 17/* ">" */,-34 , 15/* "<=" */,-34 , 16/* ">=" */,-34 , 14/* "!=" */,-34 , 24/* ")" */,-34 , 11/* "," */,-34 , 3/* "ELSE" */,-34 , 9/* "}" */,-34 ),
    /* State 70 */ new Array( 33/* "ScriptEnd" */,-38 , 27/* "FunctionName" */,-38 , 2/* "IF" */,-38 , 4/* "WHILE" */,-38 , 5/* "DO" */,-38 , 6/* "ECHO" */,-38 , 26/* "Variable" */,-38 , 8/* "{" */,-38 , 10/* ";" */,-38 , 7/* "RETURN" */,-38 , 28/* "FunctionInvoke" */,-38 , 20/* "-" */,-38 , 23/* "(" */,-38 , 29/* "String" */,-38 , 30/* "Integer" */,-38 , 31/* "Float" */,-38 , 19/* "+" */,-38 , 22/* "*" */,-38 , 21/* "/" */,-38 , 13/* "==" */,-38 , 18/* "<" */,-38 , 17/* ">" */,-38 , 15/* "<=" */,-38 , 16/* ">=" */,-38 , 14/* "!=" */,-38 , 24/* ")" */,-38 , 11/* "," */,-38 , 3/* "ELSE" */,-38 , 9/* "}" */,-38 ),
    /* State 71 */ new Array( 33/* "ScriptEnd" */,-37 , 27/* "FunctionName" */,-37 , 2/* "IF" */,-37 , 4/* "WHILE" */,-37 , 5/* "DO" */,-37 , 6/* "ECHO" */,-37 , 26/* "Variable" */,-37 , 8/* "{" */,-37 , 10/* ";" */,-37 , 7/* "RETURN" */,-37 , 28/* "FunctionInvoke" */,-37 , 20/* "-" */,-37 , 23/* "(" */,-37 , 29/* "String" */,-37 , 30/* "Integer" */,-37 , 31/* "Float" */,-37 , 19/* "+" */,-37 , 22/* "*" */,-37 , 21/* "/" */,-37 , 13/* "==" */,-37 , 18/* "<" */,-37 , 17/* ">" */,-37 , 15/* "<=" */,-37 , 16/* ">=" */,-37 , 14/* "!=" */,-37 , 24/* ")" */,-37 , 11/* "," */,-37 , 3/* "ELSE" */,-37 , 9/* "}" */,-37 ),
    /* State 72 */ new Array( 33/* "ScriptEnd" */,-43 , 27/* "FunctionName" */,-43 , 2/* "IF" */,-43 , 4/* "WHILE" */,-43 , 5/* "DO" */,-43 , 6/* "ECHO" */,-43 , 26/* "Variable" */,-43 , 8/* "{" */,-43 , 10/* ";" */,-43 , 7/* "RETURN" */,-43 , 28/* "FunctionInvoke" */,-43 , 20/* "-" */,-43 , 23/* "(" */,-43 , 29/* "String" */,-43 , 30/* "Integer" */,-43 , 31/* "Float" */,-43 , 19/* "+" */,-43 , 22/* "*" */,-43 , 21/* "/" */,-43 , 13/* "==" */,-43 , 18/* "<" */,-43 , 17/* ">" */,-43 , 15/* "<=" */,-43 , 16/* ">=" */,-43 , 14/* "!=" */,-43 , 24/* ")" */,-43 , 11/* "," */,-43 , 3/* "ELSE" */,-43 , 9/* "}" */,-43 ),
    /* State 73 */ new Array( 26/* "Variable" */,80 ),
    /* State 74 */ new Array( 8/* "{" */,81 ),
    /* State 75 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 76 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 , 33/* "ScriptEnd" */,-11 , 3/* "ELSE" */,-11 , 9/* "}" */,-11 ),
    /* State 77 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 10/* ";" */,83 , 5/* "DO" */,60 ),
    /* State 78 */ new Array( 33/* "ScriptEnd" */,-14 , 27/* "FunctionName" */,-14 , 2/* "IF" */,-14 , 4/* "WHILE" */,-14 , 5/* "DO" */,-14 , 6/* "ECHO" */,-14 , 26/* "Variable" */,-14 , 8/* "{" */,-14 , 10/* ";" */,-14 , 7/* "RETURN" */,-14 , 28/* "FunctionInvoke" */,-14 , 20/* "-" */,-14 , 23/* "(" */,-14 , 29/* "String" */,-14 , 30/* "Integer" */,-14 , 31/* "Float" */,-14 , 3/* "ELSE" */,-14 , 9/* "}" */,-14 ),
    /* State 79 */ new Array( 14/* "!=" */,29 , 16/* ">=" */,30 , 15/* "<=" */,31 , 17/* ">" */,32 , 18/* "<" */,33 , 13/* "==" */,34 , 24/* ")" */,-24 , 11/* "," */,-24 ),
    /* State 80 */ new Array( 24/* ")" */,-17 , 11/* "," */,-17 ),
    /* State 81 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 82 */ new Array( 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 , 33/* "ScriptEnd" */,-10 , 3/* "ELSE" */,-10 , 9/* "}" */,-10 ),
    /* State 83 */ new Array( 33/* "ScriptEnd" */,-12 , 27/* "FunctionName" */,-12 , 2/* "IF" */,-12 , 4/* "WHILE" */,-12 , 5/* "DO" */,-12 , 6/* "ECHO" */,-12 , 26/* "Variable" */,-12 , 8/* "{" */,-12 , 10/* ";" */,-12 , 7/* "RETURN" */,-12 , 28/* "FunctionInvoke" */,-12 , 20/* "-" */,-12 , 23/* "(" */,-12 , 29/* "String" */,-12 , 30/* "Integer" */,-12 , 31/* "Float" */,-12 , 3/* "ELSE" */,-12 , 9/* "}" */,-12 ),
    /* State 84 */ new Array( 9/* "}" */,85 , 27/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 26/* "Variable" */,11 , 8/* "{" */,12 , 10/* ";" */,13 , 7/* "RETURN" */,14 , 28/* "FunctionInvoke" */,16 , 20/* "-" */,20 , 23/* "(" */,22 , 29/* "String" */,23 , 30/* "Integer" */,24 , 31/* "Float" */,25 ),
    /* State 85 */ new Array( 33/* "ScriptEnd" */,-6 , 27/* "FunctionName" */,-6 , 2/* "IF" */,-6 , 4/* "WHILE" */,-6 , 5/* "DO" */,-6 , 6/* "ECHO" */,-6 , 26/* "Variable" */,-6 , 8/* "{" */,-6 , 10/* ";" */,-6 , 7/* "RETURN" */,-6 , 28/* "FunctionInvoke" */,-6 , 20/* "-" */,-6 , 23/* "(" */,-6 , 29/* "String" */,-6 , 30/* "Integer" */,-6 , 31/* "Float" */,-6 , 3/* "ELSE" */,-6 , 9/* "}" */,-6 )
);

/* Goto-Table */
var goto_tab = new Array(
    /* State 0 */ new Array( 34/* PHPScript */,1 ),
    /* State 1 */ new Array( ),
    /* State 2 */ new Array( 35/* Stmt */,3 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 3 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 4 */ new Array( ),
    /* State 5 */ new Array( ),
    /* State 6 */ new Array( ),
    /* State 7 */ new Array( 39/* Expression */,35 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 8 */ new Array( 39/* Expression */,37 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 9 */ new Array( 35/* Stmt */,38 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 10 */ new Array( 39/* Expression */,39 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 11 */ new Array( ),
    /* State 12 */ new Array( 36/* Stmt_List */,41 ),
    /* State 13 */ new Array( ),
    /* State 14 */ new Array( 39/* Expression */,42 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 15 */ new Array( ),
    /* State 16 */ new Array( 41/* ActualParameterList */,43 , 39/* Expression */,44 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 17 */ new Array( ),
    /* State 18 */ new Array( ),
    /* State 19 */ new Array( ),
    /* State 20 */ new Array( 45/* Value */,49 ),
    /* State 21 */ new Array( ),
    /* State 22 */ new Array( 39/* Expression */,50 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 23 */ new Array( ),
    /* State 24 */ new Array( ),
    /* State 25 */ new Array( ),
    /* State 26 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 27 */ new Array( ),
    /* State 28 */ new Array( 37/* FormalParameterList */,51 ),
    /* State 29 */ new Array( 42/* AddSubExp */,53 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 30 */ new Array( 42/* AddSubExp */,54 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 31 */ new Array( 42/* AddSubExp */,55 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 32 */ new Array( 42/* AddSubExp */,56 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 33 */ new Array( 42/* AddSubExp */,57 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 34 */ new Array( 42/* AddSubExp */,58 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 35 */ new Array( 35/* Stmt */,59 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 36 */ new Array( ),
    /* State 37 */ new Array( ),
    /* State 38 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 39 */ new Array( ),
    /* State 40 */ new Array( 39/* Expression */,63 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 41 */ new Array( 35/* Stmt */,64 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 42 */ new Array( ),
    /* State 43 */ new Array( ),
    /* State 44 */ new Array( ),
    /* State 45 */ new Array( 43/* MulDivExp */,68 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 46 */ new Array( 43/* MulDivExp */,69 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 47 */ new Array( 44/* NegExp */,70 , 45/* Value */,21 ),
    /* State 48 */ new Array( 44/* NegExp */,71 , 45/* Value */,21 ),
    /* State 49 */ new Array( ),
    /* State 50 */ new Array( ),
    /* State 51 */ new Array( ),
    /* State 52 */ new Array( ),
    /* State 53 */ new Array( ),
    /* State 54 */ new Array( ),
    /* State 55 */ new Array( ),
    /* State 56 */ new Array( ),
    /* State 57 */ new Array( ),
    /* State 58 */ new Array( ),
    /* State 59 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 60 */ new Array( 35/* Stmt */,76 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 61 */ new Array( 39/* Expression */,77 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 62 */ new Array( ),
    /* State 63 */ new Array( ),
    /* State 64 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 65 */ new Array( ),
    /* State 66 */ new Array( 39/* Expression */,79 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 67 */ new Array( ),
    /* State 68 */ new Array( ),
    /* State 69 */ new Array( ),
    /* State 70 */ new Array( ),
    /* State 71 */ new Array( ),
    /* State 72 */ new Array( ),
    /* State 73 */ new Array( ),
    /* State 74 */ new Array( ),
    /* State 75 */ new Array( 35/* Stmt */,82 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 76 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 77 */ new Array( ),
    /* State 78 */ new Array( ),
    /* State 79 */ new Array( ),
    /* State 80 */ new Array( ),
    /* State 81 */ new Array( 35/* Stmt */,84 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 82 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 83 */ new Array( ),
    /* State 84 */ new Array( 35/* Stmt */,26 , 38/* Return */,5 , 39/* Expression */,6 , 40/* UnaryOp */,15 , 42/* AddSubExp */,17 , 43/* MulDivExp */,18 , 44/* NegExp */,19 , 45/* Value */,21 ),
    /* State 85 */ new Array( )
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
    "RETURN" /* Terminal symbol */,
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
    "ScriptBegin" /* Terminal symbol */,
    "ScriptEnd" /* Terminal symbol */,
    "PHPScript" /* Non-terminal symbol */,
    "Stmt" /* Non-terminal symbol */,
    "Stmt_List" /* Non-terminal symbol */,
    "FormalParameterList" /* Non-terminal symbol */,
    "Return" /* Non-terminal symbol */,
    "Expression" /* Non-terminal symbol */,
    "UnaryOp" /* Non-terminal symbol */,
    "ActualParameterList" /* Non-terminal symbol */,
    "AddSubExp" /* Non-terminal symbol */,
    "MulDivExp" /* Non-terminal symbol */,
    "NegExp" /* Non-terminal symbol */,
    "Value" /* Non-terminal symbol */,
    "$" /* Terminal symbol */
);


info.offset = 0; info.src = src; info.att = new String(); if( !err_off )
err_off = new Array(); if( !err_la )
err_la = new Array(); sstack.push( 0 ); vstack.push( 0 ); la = __lex( info ); while( true )
{ act = 87; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
if( _dbg_withtrace && sstack.length > 0 )
{ __dbg_print( "\nState " + sstack[sstack.length-1] + "\n" + "\tLookahead: " + labels[la] + " (\"" + info.att + "\")\n" + "\tAction: " + act + "\n" + "\tSource: \"" + info.src.substr( info.offset, 30 ) + ( ( info.offset + 30 < info.src.length ) ?
"..." : "" ) + "\"\n" + "\tStack: " + sstack.join() + "\n" + "\tValue stack: " + vstack.join() + "\n" );}
if( act == 87 )
{ if( _dbg_withtrace )
__dbg_print( "Error detected: There is no reduce or shift on the symbol " + labels[la] ); err_cnt++; err_off.push( info.offset - info.att.length ); err_la.push( new Array() ); for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
err_la[err_la.length-1].push( labels[act_tab[sstack[sstack.length-1]][i]] ); var rsstack = new Array(); var rvstack = new Array(); for( var i = 0; i < sstack.length; i++ )
{ rsstack[i] = sstack[i]; rvstack[i] = vstack[i];}
while( act == 87 && la != 46 )
{ if( _dbg_withtrace )
__dbg_print( "\tError recovery\n" + "Current lookahead: " + labels[la] + " (" + info.att + ")\n" + "Action: " + act + "\n\n" ); if( la == -1 )
info.offset++; while( act == 87 && sstack.length > 0 )
{ sstack.pop(); vstack.pop(); if( sstack.length == 0 )
break; act = 87; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
}
if( act != 87 )
break; for( var i = 0; i < rsstack.length; i++ )
{ sstack.push( rsstack[i] ); vstack.push( rvstack[i] );}
la = __lex( info );}
if( act == 87 )
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
             state.funTable[vstack[ vstack.length - 7 ]] = createFunction( vstack[ vstack.length - 7 ], state.curParams, vstack[ vstack.length - 2 ] );
                                            // Make sure to clean up param list for next function declaration
                                            state.curParams = [];
    }
    break;
    case 7:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 8:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 9:
    {
         rval = createNode( NODE_OP, OP_IF, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 10:
    {
         rval = createNode( NODE_OP, OP_IF_ELSE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 11:
    {
         rval = createNode( NODE_OP, OP_WHILE_DO, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 12:
    {
         rval = createNode( NODE_OP, OP_DO_WHILE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 13:
    {
         rval = createNode( NODE_OP, OP_ECHO, vstack[ vstack.length - 2 ] );
    }
    break;
    case 14:
    {
         rval = createNode( NODE_OP, OP_ASSIGN, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 15:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 16:
    {
         rval = createNode( NODE_OP, OP_NONE );
    }
    break;
    case 17:
    {
         state.curParams[state.curParams.length] = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 18:
    {
         state.curParams[state.curParams.length] = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 19:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 20:
    {
         rval = createNode( NODE_OP, OP_RETURN, vstack[ vstack.length - 1 ] );
    }
    break;
    case 21:
    {
         rval = createNode( NODE_OP, OP_RETURN );
    }
    break;
    case 22:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 23:
    {
         rval = createNode( NODE_OP, OP_FCALL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 24:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 25:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 1 ] );
    }
    break;
    case 26:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 27:
    {
         rval = createNode( NODE_OP, OP_EQU, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 28:
    {
         rval = createNode( NODE_OP, OP_LOT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 29:
    {
         rval = createNode( NODE_OP, OP_GRT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 30:
    {
         rval = createNode( NODE_OP, OP_LOE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 31:
    {
         rval = createNode( NODE_OP, OP_GRE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 32:
    {
         rval = createNode( NODE_OP, OP_NEQ, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 33:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 34:
    {
         rval = createNode( NODE_OP, OP_SUB, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 35:
    {
         rval = createNode( NODE_OP, OP_ADD, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 36:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 37:
    {
         rval = createNode( NODE_OP, OP_MUL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 38:
    {
         rval = createNode( NODE_OP, OP_DIV, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 39:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 40:
    {
         rval = createNode( NODE_OP, OP_NEG, vstack[ vstack.length - 1 ] );
    }
    break;
    case 41:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 42:
    {
         rval = createNode( NODE_VAR, vstack[ vstack.length - 1 ] );
    }
    break;
    case 43:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 44:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 45:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 46:
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


//////////////////////
// PHYPE I/O-CHECKS //
//////////////////////
if (!phypeIn || phypeIn == 'undefined') {
    var phypeIn = function() {
        return prompt( "Please enter a PHP-script to be executed:",
                "<? $a = ''; test('hej verden'); function test($p1) { $a = $p1;" +
                " } echo $a; ?> </div> <? echo 'asd'; ?>" );
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

var error_cnt     = 0;
var error_off    = new Array();
var error_la    = new Array();

if( ( error_cnt = __parse( preParse(str), error_off, error_la ) ) > 0 ) {
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
