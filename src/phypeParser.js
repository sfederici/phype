
//////////////////////////////////////
// GLOBALLY USED VARS AND FUNCTIONS //
//////////////////////////////////////

var cons = {
    global : '.global',
    objGlobal : '.objGlobal'
}

var state = {
    /**
     * Sym table for looking up values.
     */
    symTables : {
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


/**
* For linking variable references to values, preserving scopes.
*/
var linker = {
    assignVar : function(varName, value, scope) {
        if (!scope)
            scope = state.curFun;

        if (typeof(state.symTables[scope]) != 'object')
            state.symTables[scope] = {};
        
        var refTable = linker.getRefTableByVal(value);
        
        // If the variable is set,
        // and the variable is set globally and NOT set in our current scope,
        // and we are NOT looking up the variable from within an object.
        if (refTable != null
                && typeof(refTable[cons.global+'#'+varName])!='undefined'
                && typeof(refTable[scope+'#'+varName])=='undefined') {
            if (refTable !== state.objTable)
                refTable[cons.global+'#'+varName] = value;
        }
        // Assign the variable to the ref table (if it exists)
        // from within the current scope.
        else {
            state.symTables[scope][varName] = scope+'#'+varName
            refTable[scope+'#'+varName] = value;
        }
        // Assign the variable into the appropriate ref table
    },

    getValue : function(varName, scope) {
        if (!scope)
            scope = state.curFun;
        
        // Look up the potentially recursively defined variable.
        varName = linker.linkRecursively(varName);

        if (typeof(state.symTables[scope])=='object' && typeof(state.symTables[scope][varName])=='string')
            return state.valTable[state.symTables[scope][varName]];
        else if (typeof(state.valTable[cons.global+'#'+varName])=='string')
            return state.valTable[cons.global+'#'+varName];

        throw varNotFound(varName);
    },
    
    /*linkArrKey : function( ) {
        
    }*/
    
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
        
        delete state.valTable[state.symTables[scope][varName]];
        delete state.symTables[scope+'#'+varName];
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
            symName = '.unset';
            
            
        // Check for sym type
        switch (symName.substring(0,4)) {
            case '.val':
                return state.valTable;
            case '.arr':
                return state.arrTable;
            case '.obj':
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
    }
    
}


////////////////////
// OP DEFINITIONS //
////////////////////
var T_CONST = 0;
var T_ARRAY = 1;
var T_OBJECT = 2;

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
var OP_ASSIGN_ARR = 9;
var OP_FETCH_ARR = 10;

/*
var OP_EQU    = 50;
var OP_NEQ    = 51;
var OP_GRT    = 52;
var OP_LOT    = 53;
var OP_GRE    = 54;
var OP_LOE    = 55;
var OP_ADD    = 56;
var OP_SUB    = 57;
var OP_DIV    = 58;
var OP_MUL    = 59;
var OP_NEG    = 60;
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
        var key = execute( node.children[1] );
        var val = execute( node.children[2] );
        
        linker.assignArr( key, val );
        
        return val;
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


var _dbg_withtrace = false; var _dbg_string = new String(); function __dbg_print( text )
{ _dbg_string += text + "\n";}
function __lex( info )
{ var state = 0; var match = -1; var match_pos = 0; var start = 0; var pos = info.offset + 1; do
{ pos--; state = 0; match = -2; start = pos; if( info.src.length <= start )
return 49; do
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
        else if( info.src.charCodeAt( pos ) == 91 ) state = 15;
        else if( info.src.charCodeAt( pos ) == 93 ) state = 16;
        else if( info.src.charCodeAt( pos ) == 123 ) state = 17;
        else if( info.src.charCodeAt( pos ) == 125 ) state = 18;
        else if( info.src.charCodeAt( pos ) == 33 ) state = 36;
        else if( info.src.charCodeAt( pos ) == 55 ) state = 37;
        else if( info.src.charCodeAt( pos ) == 36 ) state = 40;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 41;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 42;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 43;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 67 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 99 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 45;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 46;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 61;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 65;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 68;
        else if( info.src.charCodeAt( pos ) == 102 ) state = 72;
        else state = -1;
        break;

    case 1:
        state = -1;
        match = 1;
        match_pos = pos;
        break;

    case 2:
        state = -1;
        match = 27;
        match_pos = pos;
        break;

    case 3:
        state = -1;
        match = 25;
        match_pos = pos;
        break;

    case 4:
        state = -1;
        match = 26;
        match_pos = pos;
        break;

    case 5:
        state = -1;
        match = 24;
        match_pos = pos;
        break;

    case 6:
        state = -1;
        match = 21;
        match_pos = pos;
        break;

    case 7:
        state = -1;
        match = 13;
        match_pos = pos;
        break;

    case 8:
        state = -1;
        match = 22;
        match_pos = pos;
        break;

    case 9:
        state = -1;
        match = 23;
        match_pos = pos;
        break;

    case 10:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 10;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 23;
        else state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 11:
        state = -1;
        match = 12;
        match_pos = pos;
        break;

    case 12:
        if( info.src.charCodeAt( pos ) == 61 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 25;
        else state = -1;
        match = 20;
        match_pos = pos;
        break;

    case 13:
        if( info.src.charCodeAt( pos ) == 61 ) state = 26;
        else state = -1;
        match = 14;
        match_pos = pos;
        break;

    case 14:
        if( info.src.charCodeAt( pos ) == 61 ) state = 27;
        else state = -1;
        match = 19;
        match_pos = pos;
        break;

    case 15:
        state = -1;
        match = 10;
        match_pos = pos;
        break;

    case 16:
        state = -1;
        match = 11;
        match_pos = pos;
        break;

    case 17:
        state = -1;
        match = 8;
        match_pos = pos;
        break;

    case 18:
        state = -1;
        match = 9;
        match_pos = pos;
        break;

    case 19:
        state = -1;
        match = 16;
        match_pos = pos;
        break;

    case 20:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 20;
        else state = -1;
        match = 28;
        match_pos = pos;
        break;

    case 21:
        state = -1;
        match = 30;
        match_pos = pos;
        break;

    case 22:
        if( info.src.charCodeAt( pos ) == 39 ) state = 41;
        else state = -1;
        match = 31;
        match_pos = pos;
        break;

    case 23:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 23;
        else state = -1;
        match = 33;
        match_pos = pos;
        break;

    case 24:
        state = -1;
        match = 17;
        match_pos = pos;
        break;

    case 25:
        if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 47;
        else state = -1;
        match = 34;
        match_pos = pos;
        break;

    case 26:
        state = -1;
        match = 15;
        match_pos = pos;
        break;

    case 27:
        state = -1;
        match = 18;
        match_pos = pos;
        break;

    case 28:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 59 ) || ( info.src.charCodeAt( pos ) >= 61 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 28;
        else if( info.src.charCodeAt( pos ) == 60 ) state = 48;
        else state = -1;
        match = 35;
        match_pos = pos;
        break;

    case 29:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        match = 5;
        match_pos = pos;
        break;

    case 30:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        match = 2;
        match_pos = pos;
        break;

    case 31:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        match = 6;
        match_pos = pos;
        break;

    case 32:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        match = 3;
        match_pos = pos;
        break;

    case 33:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        match = 4;
        match_pos = pos;
        break;

    case 34:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        match = 7;
        match_pos = pos;
        break;

    case 35:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 35;
        else state = -1;
        match = 29;
        match_pos = pos;
        break;

    case 36:
        if( info.src.charCodeAt( pos ) == 61 ) state = 19;
        else state = -1;
        break;

    case 37:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 23;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 37;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 38:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 38;
        else state = -1;
        match = 28;
        match_pos = pos;
        break;

    case 39:
        state = -1;
        match = 34;
        match_pos = pos;
        break;

    case 40:
        if( info.src.charCodeAt( pos ) == 36 ) state = 20;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 38;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 54 ) || ( info.src.charCodeAt( pos ) >= 56 && info.src.charCodeAt( pos ) <= 57 ) ) state = 44;
        else state = -1;
        break;

    case 41:
        if( info.src.charCodeAt( pos ) == 39 ) state = 22;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 41;
        else state = -1;
        break;

    case 42:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 23;
        else state = -1;
        break;

    case 43:
        if( info.src.charCodeAt( pos ) == 62 ) state = 28;
        else state = -1;
        break;

    case 44:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        break;

    case 45:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 29;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        break;

    case 46:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 70 || info.src.charCodeAt( pos ) == 102 ) state = 30;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 69 ) || ( info.src.charCodeAt( pos ) >= 71 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 101 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        break;

    case 47:
        if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 51;
        else state = -1;
        break;

    case 48:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 28;
        else state = -1;
        break;

    case 49:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 31;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        break;

    case 50:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 32;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        break;

    case 51:
        if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 39;
        else state = -1;
        break;

    case 52:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 33;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        break;

    case 53:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 34;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 77 ) || ( info.src.charCodeAt( pos ) >= 79 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else state = -1;
        break;

    case 54:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 32 ) state = 55;
        else state = -1;
        break;

    case 55:
        if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 35;
        else state = -1;
        break;

    case 56:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 49;
        else state = -1;
        break;

    case 57:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 50;
        else state = -1;
        break;

    case 58:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 52;
        else state = -1;
        break;

    case 59:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 53;
        else state = -1;
        break;

    case 60:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 54;
        else state = -1;
        break;

    case 61:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 56;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 57;
        else state = -1;
        break;

    case 62:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 58;
        else state = -1;
        break;

    case 63:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 59;
        else state = -1;
        break;

    case 64:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 111 ) state = 60;
        else state = -1;
        break;

    case 65:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 62;
        else state = -1;
        break;

    case 66:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 63;
        else state = -1;
        break;

    case 67:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 105 ) state = 64;
        else state = -1;
        break;

    case 68:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 66;
        else state = -1;
        break;

    case 69:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 116 ) state = 67;
        else state = -1;
        break;

    case 70:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 99 ) state = 69;
        else state = -1;
        break;

    case 71:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 70;
        else state = -1;
        break;

    case 72:
        if( info.src.charCodeAt( pos ) == 40 ) state = 21;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 44;
        else if( info.src.charCodeAt( pos ) == 117 ) state = 71;
        else state = -1;
        break;

}


pos++;}
while( state > -1 );}
while( 1 > -1 && match == 1 ); if( match > -1 )
{ info.att = info.src.substr( start, match_pos - start ); info.offset = match_pos; switch( match )
{
    case 28:
        {
         info.att = info.att.substr(1,info.att.length-1);
        }
        break;

    case 29:
        {
         info.att = info.att.substr(9,info.att.length-1);
        }
        break;

    case 30:
        {
         info.att = info.att.substr(0,info.att.length-1);
        }
        break;

    case 31:
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
    new Array( 36/* PHPScript */, 4 ),
    new Array( 36/* PHPScript */, 0 ),
    new Array( 38/* Stmt_List */, 2 ),
    new Array( 38/* Stmt_List */, 0 ),
    new Array( 37/* Stmt */, 2 ),
    new Array( 37/* Stmt */, 7 ),
    new Array( 37/* Stmt */, 1 ),
    new Array( 37/* Stmt */, 1 ),
    new Array( 37/* Stmt */, 3 ),
    new Array( 37/* Stmt */, 5 ),
    new Array( 37/* Stmt */, 4 ),
    new Array( 37/* Stmt */, 5 ),
    new Array( 37/* Stmt */, 3 ),
    new Array( 37/* Stmt */, 4 ),
    new Array( 37/* Stmt */, 5 ),
    new Array( 37/* Stmt */, 3 ),
    new Array( 37/* Stmt */, 1 ),
    new Array( 39/* FormalParameterList */, 3 ),
    new Array( 39/* FormalParameterList */, 1 ),
    new Array( 39/* FormalParameterList */, 0 ),
    new Array( 40/* Return */, 2 ),
    new Array( 40/* Return */, 1 ),
    new Array( 41/* Expression */, 1 ),
    new Array( 41/* Expression */, 3 ),
    new Array( 41/* Expression */, 2 ),
    new Array( 42/* ArrayIndices */, 3 ),
    new Array( 44/* ActualParameterList */, 3 ),
    new Array( 44/* ActualParameterList */, 1 ),
    new Array( 44/* ActualParameterList */, 0 ),
    new Array( 43/* UnaryOp */, 3 ),
    new Array( 43/* UnaryOp */, 3 ),
    new Array( 43/* UnaryOp */, 3 ),
    new Array( 43/* UnaryOp */, 3 ),
    new Array( 43/* UnaryOp */, 3 ),
    new Array( 43/* UnaryOp */, 3 ),
    new Array( 43/* UnaryOp */, 1 ),
    new Array( 45/* AddSubExp */, 3 ),
    new Array( 45/* AddSubExp */, 3 ),
    new Array( 45/* AddSubExp */, 1 ),
    new Array( 46/* MulDivExp */, 3 ),
    new Array( 46/* MulDivExp */, 3 ),
    new Array( 46/* MulDivExp */, 1 ),
    new Array( 47/* NegExp */, 2 ),
    new Array( 47/* NegExp */, 1 ),
    new Array( 48/* Value */, 1 ),
    new Array( 48/* Value */, 3 ),
    new Array( 48/* Value */, 1 ),
    new Array( 48/* Value */, 1 ),
    new Array( 48/* Value */, 1 )
);

/* Action-Table */
var act_tab = new Array(
    /* State 0 */ new Array( 49/* "$" */,-2 , 34/* "ScriptBegin" */,-2 ),
    /* State 1 */ new Array( 34/* "ScriptBegin" */,2 , 49/* "$" */,0 ),
    /* State 2 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 3 */ new Array( 35/* "ScriptEnd" */,27 , 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 4 */ new Array( 25/* "(" */,28 ),
    /* State 5 */ new Array( 35/* "ScriptEnd" */,-7 , 29/* "FunctionName" */,-7 , 2/* "IF" */,-7 , 4/* "WHILE" */,-7 , 5/* "DO" */,-7 , 6/* "ECHO" */,-7 , 28/* "Variable" */,-7 , 8/* "{" */,-7 , 12/* ";" */,-7 , 7/* "RETURN" */,-7 , 30/* "FunctionInvoke" */,-7 , 22/* "-" */,-7 , 25/* "(" */,-7 , 31/* "String" */,-7 , 32/* "Integer" */,-7 , 33/* "Float" */,-7 , 3/* "ELSE" */,-7 , 9/* "}" */,-7 ),
    /* State 6 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 35/* "ScriptEnd" */,-8 , 29/* "FunctionName" */,-8 , 2/* "IF" */,-8 , 4/* "WHILE" */,-8 , 5/* "DO" */,-8 , 6/* "ECHO" */,-8 , 28/* "Variable" */,-8 , 8/* "{" */,-8 , 12/* ";" */,-8 , 7/* "RETURN" */,-8 , 30/* "FunctionInvoke" */,-8 , 22/* "-" */,-8 , 25/* "(" */,-8 , 31/* "String" */,-8 , 32/* "Integer" */,-8 , 33/* "Float" */,-8 , 3/* "ELSE" */,-8 , 9/* "}" */,-8 ),
    /* State 7 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 8 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 9 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 10 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 11 */ new Array( 14/* "=" */,41 , 10/* "[" */,42 , 35/* "ScriptEnd" */,-45 , 29/* "FunctionName" */,-45 , 2/* "IF" */,-45 , 4/* "WHILE" */,-45 , 5/* "DO" */,-45 , 6/* "ECHO" */,-45 , 28/* "Variable" */,-45 , 8/* "{" */,-45 , 12/* ";" */,-45 , 7/* "RETURN" */,-45 , 30/* "FunctionInvoke" */,-45 , 22/* "-" */,-45 , 25/* "(" */,-45 , 31/* "String" */,-45 , 32/* "Integer" */,-45 , 33/* "Float" */,-45 , 21/* "+" */,-45 , 24/* "*" */,-45 , 23/* "/" */,-45 , 15/* "==" */,-45 , 20/* "<" */,-45 , 19/* ">" */,-45 , 17/* "<=" */,-45 , 18/* ">=" */,-45 , 16/* "!=" */,-45 , 3/* "ELSE" */,-45 , 9/* "}" */,-45 ),
    /* State 12 */ new Array( 9/* "}" */,-4 , 29/* "FunctionName" */,-4 , 2/* "IF" */,-4 , 4/* "WHILE" */,-4 , 5/* "DO" */,-4 , 6/* "ECHO" */,-4 , 28/* "Variable" */,-4 , 8/* "{" */,-4 , 12/* ";" */,-4 , 7/* "RETURN" */,-4 , 30/* "FunctionInvoke" */,-4 , 22/* "-" */,-4 , 25/* "(" */,-4 , 31/* "String" */,-4 , 32/* "Integer" */,-4 , 33/* "Float" */,-4 ),
    /* State 13 */ new Array( 35/* "ScriptEnd" */,-17 , 29/* "FunctionName" */,-17 , 2/* "IF" */,-17 , 4/* "WHILE" */,-17 , 5/* "DO" */,-17 , 6/* "ECHO" */,-17 , 28/* "Variable" */,-17 , 8/* "{" */,-17 , 12/* ";" */,-17 , 7/* "RETURN" */,-17 , 30/* "FunctionInvoke" */,-17 , 22/* "-" */,-17 , 25/* "(" */,-17 , 31/* "String" */,-17 , 32/* "Integer" */,-17 , 33/* "Float" */,-17 , 3/* "ELSE" */,-17 , 9/* "}" */,-17 ),
    /* State 14 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 , 35/* "ScriptEnd" */,-22 , 29/* "FunctionName" */,-22 , 2/* "IF" */,-22 , 4/* "WHILE" */,-22 , 5/* "DO" */,-22 , 6/* "ECHO" */,-22 , 8/* "{" */,-22 , 12/* ";" */,-22 , 7/* "RETURN" */,-22 , 3/* "ELSE" */,-22 , 9/* "}" */,-22 ),
    /* State 15 */ new Array( 35/* "ScriptEnd" */,-23 , 29/* "FunctionName" */,-23 , 2/* "IF" */,-23 , 4/* "WHILE" */,-23 , 5/* "DO" */,-23 , 6/* "ECHO" */,-23 , 28/* "Variable" */,-23 , 8/* "{" */,-23 , 12/* ";" */,-23 , 7/* "RETURN" */,-23 , 30/* "FunctionInvoke" */,-23 , 22/* "-" */,-23 , 25/* "(" */,-23 , 31/* "String" */,-23 , 32/* "Integer" */,-23 , 33/* "Float" */,-23 , 15/* "==" */,-23 , 20/* "<" */,-23 , 19/* ">" */,-23 , 17/* "<=" */,-23 , 18/* ">=" */,-23 , 16/* "!=" */,-23 , 26/* ")" */,-23 , 13/* "," */,-23 , 3/* "ELSE" */,-23 , 11/* "]" */,-23 , 9/* "}" */,-23 ),
    /* State 16 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 , 26/* ")" */,-29 , 13/* "," */,-29 ),
    /* State 17 */ new Array( 21/* "+" */,47 , 22/* "-" */,48 , 35/* "ScriptEnd" */,-36 , 29/* "FunctionName" */,-36 , 2/* "IF" */,-36 , 4/* "WHILE" */,-36 , 5/* "DO" */,-36 , 6/* "ECHO" */,-36 , 28/* "Variable" */,-36 , 8/* "{" */,-36 , 12/* ";" */,-36 , 7/* "RETURN" */,-36 , 30/* "FunctionInvoke" */,-36 , 25/* "(" */,-36 , 31/* "String" */,-36 , 32/* "Integer" */,-36 , 33/* "Float" */,-36 , 15/* "==" */,-36 , 20/* "<" */,-36 , 19/* ">" */,-36 , 17/* "<=" */,-36 , 18/* ">=" */,-36 , 16/* "!=" */,-36 , 26/* ")" */,-36 , 13/* "," */,-36 , 3/* "ELSE" */,-36 , 11/* "]" */,-36 , 9/* "}" */,-36 ),
    /* State 18 */ new Array( 23/* "/" */,49 , 24/* "*" */,50 , 35/* "ScriptEnd" */,-39 , 29/* "FunctionName" */,-39 , 2/* "IF" */,-39 , 4/* "WHILE" */,-39 , 5/* "DO" */,-39 , 6/* "ECHO" */,-39 , 28/* "Variable" */,-39 , 8/* "{" */,-39 , 12/* ";" */,-39 , 7/* "RETURN" */,-39 , 30/* "FunctionInvoke" */,-39 , 22/* "-" */,-39 , 25/* "(" */,-39 , 31/* "String" */,-39 , 32/* "Integer" */,-39 , 33/* "Float" */,-39 , 21/* "+" */,-39 , 15/* "==" */,-39 , 20/* "<" */,-39 , 19/* ">" */,-39 , 17/* "<=" */,-39 , 18/* ">=" */,-39 , 16/* "!=" */,-39 , 26/* ")" */,-39 , 13/* "," */,-39 , 3/* "ELSE" */,-39 , 11/* "]" */,-39 , 9/* "}" */,-39 ),
    /* State 19 */ new Array( 35/* "ScriptEnd" */,-42 , 29/* "FunctionName" */,-42 , 2/* "IF" */,-42 , 4/* "WHILE" */,-42 , 5/* "DO" */,-42 , 6/* "ECHO" */,-42 , 28/* "Variable" */,-42 , 8/* "{" */,-42 , 12/* ";" */,-42 , 7/* "RETURN" */,-42 , 30/* "FunctionInvoke" */,-42 , 22/* "-" */,-42 , 25/* "(" */,-42 , 31/* "String" */,-42 , 32/* "Integer" */,-42 , 33/* "Float" */,-42 , 21/* "+" */,-42 , 24/* "*" */,-42 , 23/* "/" */,-42 , 15/* "==" */,-42 , 20/* "<" */,-42 , 19/* ">" */,-42 , 17/* "<=" */,-42 , 18/* ">=" */,-42 , 16/* "!=" */,-42 , 26/* ")" */,-42 , 13/* "," */,-42 , 3/* "ELSE" */,-42 , 11/* "]" */,-42 , 9/* "}" */,-42 ),
    /* State 20 */ new Array( 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 21 */ new Array( 35/* "ScriptEnd" */,-44 , 29/* "FunctionName" */,-44 , 2/* "IF" */,-44 , 4/* "WHILE" */,-44 , 5/* "DO" */,-44 , 6/* "ECHO" */,-44 , 28/* "Variable" */,-44 , 8/* "{" */,-44 , 12/* ";" */,-44 , 7/* "RETURN" */,-44 , 30/* "FunctionInvoke" */,-44 , 22/* "-" */,-44 , 25/* "(" */,-44 , 31/* "String" */,-44 , 32/* "Integer" */,-44 , 33/* "Float" */,-44 , 21/* "+" */,-44 , 24/* "*" */,-44 , 23/* "/" */,-44 , 15/* "==" */,-44 , 20/* "<" */,-44 , 19/* ">" */,-44 , 17/* "<=" */,-44 , 18/* ">=" */,-44 , 16/* "!=" */,-44 , 26/* ")" */,-44 , 13/* "," */,-44 , 3/* "ELSE" */,-44 , 11/* "]" */,-44 , 9/* "}" */,-44 ),
    /* State 22 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 23 */ new Array( 35/* "ScriptEnd" */,-47 , 29/* "FunctionName" */,-47 , 2/* "IF" */,-47 , 4/* "WHILE" */,-47 , 5/* "DO" */,-47 , 6/* "ECHO" */,-47 , 28/* "Variable" */,-47 , 8/* "{" */,-47 , 12/* ";" */,-47 , 7/* "RETURN" */,-47 , 30/* "FunctionInvoke" */,-47 , 22/* "-" */,-47 , 25/* "(" */,-47 , 31/* "String" */,-47 , 32/* "Integer" */,-47 , 33/* "Float" */,-47 , 21/* "+" */,-47 , 24/* "*" */,-47 , 23/* "/" */,-47 , 15/* "==" */,-47 , 20/* "<" */,-47 , 19/* ">" */,-47 , 17/* "<=" */,-47 , 18/* ">=" */,-47 , 16/* "!=" */,-47 , 26/* ")" */,-47 , 13/* "," */,-47 , 3/* "ELSE" */,-47 , 11/* "]" */,-47 , 9/* "}" */,-47 ),
    /* State 24 */ new Array( 35/* "ScriptEnd" */,-48 , 29/* "FunctionName" */,-48 , 2/* "IF" */,-48 , 4/* "WHILE" */,-48 , 5/* "DO" */,-48 , 6/* "ECHO" */,-48 , 28/* "Variable" */,-48 , 8/* "{" */,-48 , 12/* ";" */,-48 , 7/* "RETURN" */,-48 , 30/* "FunctionInvoke" */,-48 , 22/* "-" */,-48 , 25/* "(" */,-48 , 31/* "String" */,-48 , 32/* "Integer" */,-48 , 33/* "Float" */,-48 , 21/* "+" */,-48 , 24/* "*" */,-48 , 23/* "/" */,-48 , 15/* "==" */,-48 , 20/* "<" */,-48 , 19/* ">" */,-48 , 17/* "<=" */,-48 , 18/* ">=" */,-48 , 16/* "!=" */,-48 , 26/* ")" */,-48 , 13/* "," */,-48 , 3/* "ELSE" */,-48 , 11/* "]" */,-48 , 9/* "}" */,-48 ),
    /* State 25 */ new Array( 35/* "ScriptEnd" */,-49 , 29/* "FunctionName" */,-49 , 2/* "IF" */,-49 , 4/* "WHILE" */,-49 , 5/* "DO" */,-49 , 6/* "ECHO" */,-49 , 28/* "Variable" */,-49 , 8/* "{" */,-49 , 12/* ";" */,-49 , 7/* "RETURN" */,-49 , 30/* "FunctionInvoke" */,-49 , 22/* "-" */,-49 , 25/* "(" */,-49 , 31/* "String" */,-49 , 32/* "Integer" */,-49 , 33/* "Float" */,-49 , 21/* "+" */,-49 , 24/* "*" */,-49 , 23/* "/" */,-49 , 15/* "==" */,-49 , 20/* "<" */,-49 , 19/* ">" */,-49 , 17/* "<=" */,-49 , 18/* ">=" */,-49 , 16/* "!=" */,-49 , 26/* ")" */,-49 , 13/* "," */,-49 , 3/* "ELSE" */,-49 , 11/* "]" */,-49 , 9/* "}" */,-49 ),
    /* State 26 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 , 35/* "ScriptEnd" */,-5 , 3/* "ELSE" */,-5 , 9/* "}" */,-5 ),
    /* State 27 */ new Array( 49/* "$" */,-1 , 34/* "ScriptBegin" */,-1 ),
    /* State 28 */ new Array( 28/* "Variable" */,55 , 26/* ")" */,-20 , 13/* "," */,-20 ),
    /* State 29 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 30 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 31 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 32 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 33 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 34 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 35 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 36 */ new Array( 10/* "[" */,42 , 29/* "FunctionName" */,-45 , 2/* "IF" */,-45 , 4/* "WHILE" */,-45 , 5/* "DO" */,-45 , 6/* "ECHO" */,-45 , 28/* "Variable" */,-45 , 8/* "{" */,-45 , 12/* ";" */,-45 , 7/* "RETURN" */,-45 , 30/* "FunctionInvoke" */,-45 , 22/* "-" */,-45 , 25/* "(" */,-45 , 31/* "String" */,-45 , 32/* "Integer" */,-45 , 33/* "Float" */,-45 , 21/* "+" */,-45 , 24/* "*" */,-45 , 23/* "/" */,-45 , 15/* "==" */,-45 , 20/* "<" */,-45 , 19/* ">" */,-45 , 17/* "<=" */,-45 , 18/* ">=" */,-45 , 16/* "!=" */,-45 , 35/* "ScriptEnd" */,-45 , 26/* ")" */,-45 , 13/* "," */,-45 , 3/* "ELSE" */,-45 , 11/* "]" */,-45 , 9/* "}" */,-45 ),
    /* State 37 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 5/* "DO" */,64 ),
    /* State 38 */ new Array( 4/* "WHILE" */,65 , 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 39 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 12/* ";" */,66 ),
    /* State 40 */ new Array( 14/* "=" */,67 , 35/* "ScriptEnd" */,-25 , 29/* "FunctionName" */,-25 , 2/* "IF" */,-25 , 4/* "WHILE" */,-25 , 5/* "DO" */,-25 , 6/* "ECHO" */,-25 , 28/* "Variable" */,-25 , 8/* "{" */,-25 , 12/* ";" */,-25 , 7/* "RETURN" */,-25 , 30/* "FunctionInvoke" */,-25 , 22/* "-" */,-25 , 25/* "(" */,-25 , 31/* "String" */,-25 , 32/* "Integer" */,-25 , 33/* "Float" */,-25 , 15/* "==" */,-25 , 20/* "<" */,-25 , 19/* ">" */,-25 , 17/* "<=" */,-25 , 18/* ">=" */,-25 , 16/* "!=" */,-25 , 3/* "ELSE" */,-25 , 9/* "}" */,-25 ),
    /* State 41 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 42 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 43 */ new Array( 9/* "}" */,71 , 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 44 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 35/* "ScriptEnd" */,-21 , 29/* "FunctionName" */,-21 , 2/* "IF" */,-21 , 4/* "WHILE" */,-21 , 5/* "DO" */,-21 , 6/* "ECHO" */,-21 , 28/* "Variable" */,-21 , 8/* "{" */,-21 , 12/* ";" */,-21 , 7/* "RETURN" */,-21 , 30/* "FunctionInvoke" */,-21 , 22/* "-" */,-21 , 25/* "(" */,-21 , 31/* "String" */,-21 , 32/* "Integer" */,-21 , 33/* "Float" */,-21 , 3/* "ELSE" */,-21 , 9/* "}" */,-21 ),
    /* State 45 */ new Array( 13/* "," */,72 , 26/* ")" */,73 ),
    /* State 46 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 26/* ")" */,-28 , 13/* "," */,-28 ),
    /* State 47 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 48 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 49 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 50 */ new Array( 22/* "-" */,20 , 28/* "Variable" */,52 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 51 */ new Array( 35/* "ScriptEnd" */,-43 , 29/* "FunctionName" */,-43 , 2/* "IF" */,-43 , 4/* "WHILE" */,-43 , 5/* "DO" */,-43 , 6/* "ECHO" */,-43 , 28/* "Variable" */,-43 , 8/* "{" */,-43 , 12/* ";" */,-43 , 7/* "RETURN" */,-43 , 30/* "FunctionInvoke" */,-43 , 22/* "-" */,-43 , 25/* "(" */,-43 , 31/* "String" */,-43 , 32/* "Integer" */,-43 , 33/* "Float" */,-43 , 21/* "+" */,-43 , 24/* "*" */,-43 , 23/* "/" */,-43 , 15/* "==" */,-43 , 20/* "<" */,-43 , 19/* ">" */,-43 , 17/* "<=" */,-43 , 18/* ">=" */,-43 , 16/* "!=" */,-43 , 26/* ")" */,-43 , 13/* "," */,-43 , 3/* "ELSE" */,-43 , 11/* "]" */,-43 , 9/* "}" */,-43 ),
    /* State 52 */ new Array( 35/* "ScriptEnd" */,-45 , 29/* "FunctionName" */,-45 , 2/* "IF" */,-45 , 4/* "WHILE" */,-45 , 5/* "DO" */,-45 , 6/* "ECHO" */,-45 , 28/* "Variable" */,-45 , 8/* "{" */,-45 , 12/* ";" */,-45 , 7/* "RETURN" */,-45 , 30/* "FunctionInvoke" */,-45 , 22/* "-" */,-45 , 25/* "(" */,-45 , 31/* "String" */,-45 , 32/* "Integer" */,-45 , 33/* "Float" */,-45 , 21/* "+" */,-45 , 24/* "*" */,-45 , 23/* "/" */,-45 , 15/* "==" */,-45 , 20/* "<" */,-45 , 19/* ">" */,-45 , 17/* "<=" */,-45 , 18/* ">=" */,-45 , 16/* "!=" */,-45 , 26/* ")" */,-45 , 13/* "," */,-45 , 3/* "ELSE" */,-45 , 11/* "]" */,-45 , 9/* "}" */,-45 ),
    /* State 53 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 26/* ")" */,78 ),
    /* State 54 */ new Array( 13/* "," */,79 , 26/* ")" */,80 ),
    /* State 55 */ new Array( 26/* ")" */,-19 , 13/* "," */,-19 ),
    /* State 56 */ new Array( 21/* "+" */,47 , 22/* "-" */,48 , 35/* "ScriptEnd" */,-35 , 29/* "FunctionName" */,-35 , 2/* "IF" */,-35 , 4/* "WHILE" */,-35 , 5/* "DO" */,-35 , 6/* "ECHO" */,-35 , 28/* "Variable" */,-35 , 8/* "{" */,-35 , 12/* ";" */,-35 , 7/* "RETURN" */,-35 , 30/* "FunctionInvoke" */,-35 , 25/* "(" */,-35 , 31/* "String" */,-35 , 32/* "Integer" */,-35 , 33/* "Float" */,-35 , 15/* "==" */,-35 , 20/* "<" */,-35 , 19/* ">" */,-35 , 17/* "<=" */,-35 , 18/* ">=" */,-35 , 16/* "!=" */,-35 , 3/* "ELSE" */,-35 , 9/* "}" */,-35 , 26/* ")" */,-35 , 13/* "," */,-35 , 11/* "]" */,-35 ),
    /* State 57 */ new Array( 21/* "+" */,47 , 22/* "-" */,48 , 35/* "ScriptEnd" */,-34 , 29/* "FunctionName" */,-34 , 2/* "IF" */,-34 , 4/* "WHILE" */,-34 , 5/* "DO" */,-34 , 6/* "ECHO" */,-34 , 28/* "Variable" */,-34 , 8/* "{" */,-34 , 12/* ";" */,-34 , 7/* "RETURN" */,-34 , 30/* "FunctionInvoke" */,-34 , 25/* "(" */,-34 , 31/* "String" */,-34 , 32/* "Integer" */,-34 , 33/* "Float" */,-34 , 15/* "==" */,-34 , 20/* "<" */,-34 , 19/* ">" */,-34 , 17/* "<=" */,-34 , 18/* ">=" */,-34 , 16/* "!=" */,-34 , 3/* "ELSE" */,-34 , 9/* "}" */,-34 , 26/* ")" */,-34 , 13/* "," */,-34 , 11/* "]" */,-34 ),
    /* State 58 */ new Array( 21/* "+" */,47 , 22/* "-" */,48 , 35/* "ScriptEnd" */,-33 , 29/* "FunctionName" */,-33 , 2/* "IF" */,-33 , 4/* "WHILE" */,-33 , 5/* "DO" */,-33 , 6/* "ECHO" */,-33 , 28/* "Variable" */,-33 , 8/* "{" */,-33 , 12/* ";" */,-33 , 7/* "RETURN" */,-33 , 30/* "FunctionInvoke" */,-33 , 25/* "(" */,-33 , 31/* "String" */,-33 , 32/* "Integer" */,-33 , 33/* "Float" */,-33 , 15/* "==" */,-33 , 20/* "<" */,-33 , 19/* ">" */,-33 , 17/* "<=" */,-33 , 18/* ">=" */,-33 , 16/* "!=" */,-33 , 3/* "ELSE" */,-33 , 9/* "}" */,-33 , 26/* ")" */,-33 , 13/* "," */,-33 , 11/* "]" */,-33 ),
    /* State 59 */ new Array( 21/* "+" */,47 , 22/* "-" */,48 , 35/* "ScriptEnd" */,-32 , 29/* "FunctionName" */,-32 , 2/* "IF" */,-32 , 4/* "WHILE" */,-32 , 5/* "DO" */,-32 , 6/* "ECHO" */,-32 , 28/* "Variable" */,-32 , 8/* "{" */,-32 , 12/* ";" */,-32 , 7/* "RETURN" */,-32 , 30/* "FunctionInvoke" */,-32 , 25/* "(" */,-32 , 31/* "String" */,-32 , 32/* "Integer" */,-32 , 33/* "Float" */,-32 , 15/* "==" */,-32 , 20/* "<" */,-32 , 19/* ">" */,-32 , 17/* "<=" */,-32 , 18/* ">=" */,-32 , 16/* "!=" */,-32 , 3/* "ELSE" */,-32 , 9/* "}" */,-32 , 26/* ")" */,-32 , 13/* "," */,-32 , 11/* "]" */,-32 ),
    /* State 60 */ new Array( 21/* "+" */,47 , 22/* "-" */,48 , 35/* "ScriptEnd" */,-31 , 29/* "FunctionName" */,-31 , 2/* "IF" */,-31 , 4/* "WHILE" */,-31 , 5/* "DO" */,-31 , 6/* "ECHO" */,-31 , 28/* "Variable" */,-31 , 8/* "{" */,-31 , 12/* ";" */,-31 , 7/* "RETURN" */,-31 , 30/* "FunctionInvoke" */,-31 , 25/* "(" */,-31 , 31/* "String" */,-31 , 32/* "Integer" */,-31 , 33/* "Float" */,-31 , 15/* "==" */,-31 , 20/* "<" */,-31 , 19/* ">" */,-31 , 17/* "<=" */,-31 , 18/* ">=" */,-31 , 16/* "!=" */,-31 , 3/* "ELSE" */,-31 , 9/* "}" */,-31 , 26/* ")" */,-31 , 13/* "," */,-31 , 11/* "]" */,-31 ),
    /* State 61 */ new Array( 21/* "+" */,47 , 22/* "-" */,48 , 35/* "ScriptEnd" */,-30 , 29/* "FunctionName" */,-30 , 2/* "IF" */,-30 , 4/* "WHILE" */,-30 , 5/* "DO" */,-30 , 6/* "ECHO" */,-30 , 28/* "Variable" */,-30 , 8/* "{" */,-30 , 12/* ";" */,-30 , 7/* "RETURN" */,-30 , 30/* "FunctionInvoke" */,-30 , 25/* "(" */,-30 , 31/* "String" */,-30 , 32/* "Integer" */,-30 , 33/* "Float" */,-30 , 15/* "==" */,-30 , 20/* "<" */,-30 , 19/* ">" */,-30 , 17/* "<=" */,-30 , 18/* ">=" */,-30 , 16/* "!=" */,-30 , 3/* "ELSE" */,-30 , 9/* "}" */,-30 , 26/* ")" */,-30 , 13/* "," */,-30 , 11/* "]" */,-30 ),
    /* State 62 */ new Array( 3/* "ELSE" */,81 , 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 , 35/* "ScriptEnd" */,-9 , 9/* "}" */,-9 ),
    /* State 63 */ new Array( 29/* "FunctionName" */,-25 , 2/* "IF" */,-25 , 4/* "WHILE" */,-25 , 5/* "DO" */,-25 , 6/* "ECHO" */,-25 , 28/* "Variable" */,-25 , 8/* "{" */,-25 , 12/* ";" */,-25 , 7/* "RETURN" */,-25 , 30/* "FunctionInvoke" */,-25 , 22/* "-" */,-25 , 25/* "(" */,-25 , 31/* "String" */,-25 , 32/* "Integer" */,-25 , 33/* "Float" */,-25 , 15/* "==" */,-25 , 20/* "<" */,-25 , 19/* ">" */,-25 , 17/* "<=" */,-25 , 18/* ">=" */,-25 , 16/* "!=" */,-25 , 35/* "ScriptEnd" */,-25 , 26/* ")" */,-25 , 13/* "," */,-25 , 3/* "ELSE" */,-25 , 11/* "]" */,-25 , 9/* "}" */,-25 ),
    /* State 64 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 65 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 66 */ new Array( 35/* "ScriptEnd" */,-13 , 29/* "FunctionName" */,-13 , 2/* "IF" */,-13 , 4/* "WHILE" */,-13 , 5/* "DO" */,-13 , 6/* "ECHO" */,-13 , 28/* "Variable" */,-13 , 8/* "{" */,-13 , 12/* ";" */,-13 , 7/* "RETURN" */,-13 , 30/* "FunctionInvoke" */,-13 , 22/* "-" */,-13 , 25/* "(" */,-13 , 31/* "String" */,-13 , 32/* "Integer" */,-13 , 33/* "Float" */,-13 , 3/* "ELSE" */,-13 , 9/* "}" */,-13 ),
    /* State 67 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 68 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 12/* ";" */,85 ),
    /* State 69 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 11/* "]" */,86 ),
    /* State 70 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 , 9/* "}" */,-3 ),
    /* State 71 */ new Array( 35/* "ScriptEnd" */,-16 , 29/* "FunctionName" */,-16 , 2/* "IF" */,-16 , 4/* "WHILE" */,-16 , 5/* "DO" */,-16 , 6/* "ECHO" */,-16 , 28/* "Variable" */,-16 , 8/* "{" */,-16 , 12/* ";" */,-16 , 7/* "RETURN" */,-16 , 30/* "FunctionInvoke" */,-16 , 22/* "-" */,-16 , 25/* "(" */,-16 , 31/* "String" */,-16 , 32/* "Integer" */,-16 , 33/* "Float" */,-16 , 3/* "ELSE" */,-16 , 9/* "}" */,-16 ),
    /* State 72 */ new Array( 30/* "FunctionInvoke" */,16 , 28/* "Variable" */,36 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 73 */ new Array( 35/* "ScriptEnd" */,-24 , 29/* "FunctionName" */,-24 , 2/* "IF" */,-24 , 4/* "WHILE" */,-24 , 5/* "DO" */,-24 , 6/* "ECHO" */,-24 , 28/* "Variable" */,-24 , 8/* "{" */,-24 , 12/* ";" */,-24 , 7/* "RETURN" */,-24 , 30/* "FunctionInvoke" */,-24 , 22/* "-" */,-24 , 25/* "(" */,-24 , 31/* "String" */,-24 , 32/* "Integer" */,-24 , 33/* "Float" */,-24 , 15/* "==" */,-24 , 20/* "<" */,-24 , 19/* ">" */,-24 , 17/* "<=" */,-24 , 18/* ">=" */,-24 , 16/* "!=" */,-24 , 26/* ")" */,-24 , 13/* "," */,-24 , 3/* "ELSE" */,-24 , 11/* "]" */,-24 , 9/* "}" */,-24 ),
    /* State 74 */ new Array( 23/* "/" */,49 , 24/* "*" */,50 , 35/* "ScriptEnd" */,-38 , 29/* "FunctionName" */,-38 , 2/* "IF" */,-38 , 4/* "WHILE" */,-38 , 5/* "DO" */,-38 , 6/* "ECHO" */,-38 , 28/* "Variable" */,-38 , 8/* "{" */,-38 , 12/* ";" */,-38 , 7/* "RETURN" */,-38 , 30/* "FunctionInvoke" */,-38 , 22/* "-" */,-38 , 25/* "(" */,-38 , 31/* "String" */,-38 , 32/* "Integer" */,-38 , 33/* "Float" */,-38 , 21/* "+" */,-38 , 15/* "==" */,-38 , 20/* "<" */,-38 , 19/* ">" */,-38 , 17/* "<=" */,-38 , 18/* ">=" */,-38 , 16/* "!=" */,-38 , 26/* ")" */,-38 , 13/* "," */,-38 , 3/* "ELSE" */,-38 , 11/* "]" */,-38 , 9/* "}" */,-38 ),
    /* State 75 */ new Array( 23/* "/" */,49 , 24/* "*" */,50 , 35/* "ScriptEnd" */,-37 , 29/* "FunctionName" */,-37 , 2/* "IF" */,-37 , 4/* "WHILE" */,-37 , 5/* "DO" */,-37 , 6/* "ECHO" */,-37 , 28/* "Variable" */,-37 , 8/* "{" */,-37 , 12/* ";" */,-37 , 7/* "RETURN" */,-37 , 30/* "FunctionInvoke" */,-37 , 22/* "-" */,-37 , 25/* "(" */,-37 , 31/* "String" */,-37 , 32/* "Integer" */,-37 , 33/* "Float" */,-37 , 21/* "+" */,-37 , 15/* "==" */,-37 , 20/* "<" */,-37 , 19/* ">" */,-37 , 17/* "<=" */,-37 , 18/* ">=" */,-37 , 16/* "!=" */,-37 , 26/* ")" */,-37 , 13/* "," */,-37 , 3/* "ELSE" */,-37 , 11/* "]" */,-37 , 9/* "}" */,-37 ),
    /* State 76 */ new Array( 35/* "ScriptEnd" */,-41 , 29/* "FunctionName" */,-41 , 2/* "IF" */,-41 , 4/* "WHILE" */,-41 , 5/* "DO" */,-41 , 6/* "ECHO" */,-41 , 28/* "Variable" */,-41 , 8/* "{" */,-41 , 12/* ";" */,-41 , 7/* "RETURN" */,-41 , 30/* "FunctionInvoke" */,-41 , 22/* "-" */,-41 , 25/* "(" */,-41 , 31/* "String" */,-41 , 32/* "Integer" */,-41 , 33/* "Float" */,-41 , 21/* "+" */,-41 , 24/* "*" */,-41 , 23/* "/" */,-41 , 15/* "==" */,-41 , 20/* "<" */,-41 , 19/* ">" */,-41 , 17/* "<=" */,-41 , 18/* ">=" */,-41 , 16/* "!=" */,-41 , 26/* ")" */,-41 , 13/* "," */,-41 , 3/* "ELSE" */,-41 , 11/* "]" */,-41 , 9/* "}" */,-41 ),
    /* State 77 */ new Array( 35/* "ScriptEnd" */,-40 , 29/* "FunctionName" */,-40 , 2/* "IF" */,-40 , 4/* "WHILE" */,-40 , 5/* "DO" */,-40 , 6/* "ECHO" */,-40 , 28/* "Variable" */,-40 , 8/* "{" */,-40 , 12/* ";" */,-40 , 7/* "RETURN" */,-40 , 30/* "FunctionInvoke" */,-40 , 22/* "-" */,-40 , 25/* "(" */,-40 , 31/* "String" */,-40 , 32/* "Integer" */,-40 , 33/* "Float" */,-40 , 21/* "+" */,-40 , 24/* "*" */,-40 , 23/* "/" */,-40 , 15/* "==" */,-40 , 20/* "<" */,-40 , 19/* ">" */,-40 , 17/* "<=" */,-40 , 18/* ">=" */,-40 , 16/* "!=" */,-40 , 26/* ")" */,-40 , 13/* "," */,-40 , 3/* "ELSE" */,-40 , 11/* "]" */,-40 , 9/* "}" */,-40 ),
    /* State 78 */ new Array( 35/* "ScriptEnd" */,-46 , 29/* "FunctionName" */,-46 , 2/* "IF" */,-46 , 4/* "WHILE" */,-46 , 5/* "DO" */,-46 , 6/* "ECHO" */,-46 , 28/* "Variable" */,-46 , 8/* "{" */,-46 , 12/* ";" */,-46 , 7/* "RETURN" */,-46 , 30/* "FunctionInvoke" */,-46 , 22/* "-" */,-46 , 25/* "(" */,-46 , 31/* "String" */,-46 , 32/* "Integer" */,-46 , 33/* "Float" */,-46 , 21/* "+" */,-46 , 24/* "*" */,-46 , 23/* "/" */,-46 , 15/* "==" */,-46 , 20/* "<" */,-46 , 19/* ">" */,-46 , 17/* "<=" */,-46 , 18/* ">=" */,-46 , 16/* "!=" */,-46 , 26/* ")" */,-46 , 13/* "," */,-46 , 3/* "ELSE" */,-46 , 11/* "]" */,-46 , 9/* "}" */,-46 ),
    /* State 79 */ new Array( 28/* "Variable" */,88 ),
    /* State 80 */ new Array( 8/* "{" */,89 ),
    /* State 81 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 82 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 , 35/* "ScriptEnd" */,-11 , 3/* "ELSE" */,-11 , 9/* "}" */,-11 ),
    /* State 83 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 12/* ";" */,91 , 5/* "DO" */,64 ),
    /* State 84 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 12/* ";" */,92 ),
    /* State 85 */ new Array( 35/* "ScriptEnd" */,-14 , 29/* "FunctionName" */,-14 , 2/* "IF" */,-14 , 4/* "WHILE" */,-14 , 5/* "DO" */,-14 , 6/* "ECHO" */,-14 , 28/* "Variable" */,-14 , 8/* "{" */,-14 , 12/* ";" */,-14 , 7/* "RETURN" */,-14 , 30/* "FunctionInvoke" */,-14 , 22/* "-" */,-14 , 25/* "(" */,-14 , 31/* "String" */,-14 , 32/* "Integer" */,-14 , 33/* "Float" */,-14 , 3/* "ELSE" */,-14 , 9/* "}" */,-14 ),
    /* State 86 */ new Array( 14/* "=" */,-26 , 35/* "ScriptEnd" */,-26 , 29/* "FunctionName" */,-26 , 2/* "IF" */,-26 , 4/* "WHILE" */,-26 , 5/* "DO" */,-26 , 6/* "ECHO" */,-26 , 28/* "Variable" */,-26 , 8/* "{" */,-26 , 12/* ";" */,-26 , 7/* "RETURN" */,-26 , 30/* "FunctionInvoke" */,-26 , 22/* "-" */,-26 , 25/* "(" */,-26 , 31/* "String" */,-26 , 32/* "Integer" */,-26 , 33/* "Float" */,-26 , 15/* "==" */,-26 , 20/* "<" */,-26 , 19/* ">" */,-26 , 17/* "<=" */,-26 , 18/* ">=" */,-26 , 16/* "!=" */,-26 , 3/* "ELSE" */,-26 , 26/* ")" */,-26 , 13/* "," */,-26 , 11/* "]" */,-26 , 9/* "}" */,-26 ),
    /* State 87 */ new Array( 16/* "!=" */,29 , 18/* ">=" */,30 , 17/* "<=" */,31 , 19/* ">" */,32 , 20/* "<" */,33 , 15/* "==" */,34 , 26/* ")" */,-27 , 13/* "," */,-27 ),
    /* State 88 */ new Array( 26/* ")" */,-18 , 13/* "," */,-18 ),
    /* State 89 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 90 */ new Array( 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 , 35/* "ScriptEnd" */,-10 , 3/* "ELSE" */,-10 , 9/* "}" */,-10 ),
    /* State 91 */ new Array( 35/* "ScriptEnd" */,-12 , 29/* "FunctionName" */,-12 , 2/* "IF" */,-12 , 4/* "WHILE" */,-12 , 5/* "DO" */,-12 , 6/* "ECHO" */,-12 , 28/* "Variable" */,-12 , 8/* "{" */,-12 , 12/* ";" */,-12 , 7/* "RETURN" */,-12 , 30/* "FunctionInvoke" */,-12 , 22/* "-" */,-12 , 25/* "(" */,-12 , 31/* "String" */,-12 , 32/* "Integer" */,-12 , 33/* "Float" */,-12 , 3/* "ELSE" */,-12 , 9/* "}" */,-12 ),
    /* State 92 */ new Array( 35/* "ScriptEnd" */,-15 , 29/* "FunctionName" */,-15 , 2/* "IF" */,-15 , 4/* "WHILE" */,-15 , 5/* "DO" */,-15 , 6/* "ECHO" */,-15 , 28/* "Variable" */,-15 , 8/* "{" */,-15 , 12/* ";" */,-15 , 7/* "RETURN" */,-15 , 30/* "FunctionInvoke" */,-15 , 22/* "-" */,-15 , 25/* "(" */,-15 , 31/* "String" */,-15 , 32/* "Integer" */,-15 , 33/* "Float" */,-15 , 3/* "ELSE" */,-15 , 9/* "}" */,-15 ),
    /* State 93 */ new Array( 9/* "}" */,94 , 29/* "FunctionName" */,4 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 28/* "Variable" */,11 , 8/* "{" */,12 , 12/* ";" */,13 , 7/* "RETURN" */,14 , 30/* "FunctionInvoke" */,16 , 22/* "-" */,20 , 25/* "(" */,22 , 31/* "String" */,23 , 32/* "Integer" */,24 , 33/* "Float" */,25 ),
    /* State 94 */ new Array( 35/* "ScriptEnd" */,-6 , 29/* "FunctionName" */,-6 , 2/* "IF" */,-6 , 4/* "WHILE" */,-6 , 5/* "DO" */,-6 , 6/* "ECHO" */,-6 , 28/* "Variable" */,-6 , 8/* "{" */,-6 , 12/* ";" */,-6 , 7/* "RETURN" */,-6 , 30/* "FunctionInvoke" */,-6 , 22/* "-" */,-6 , 25/* "(" */,-6 , 31/* "String" */,-6 , 32/* "Integer" */,-6 , 33/* "Float" */,-6 , 3/* "ELSE" */,-6 , 9/* "}" */,-6 )
);

/* Goto-Table */
var goto_tab = new Array(
    /* State 0 */ new Array( 36/* PHPScript */,1 ),
    /* State 1 */ new Array( ),
    /* State 2 */ new Array( 37/* Stmt */,3 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 3 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 4 */ new Array( ),
    /* State 5 */ new Array( ),
    /* State 6 */ new Array( ),
    /* State 7 */ new Array( 41/* Expression */,35 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 8 */ new Array( 41/* Expression */,37 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 9 */ new Array( 37/* Stmt */,38 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 10 */ new Array( 41/* Expression */,39 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 11 */ new Array( 42/* ArrayIndices */,40 ),
    /* State 12 */ new Array( 38/* Stmt_List */,43 ),
    /* State 13 */ new Array( ),
    /* State 14 */ new Array( 41/* Expression */,44 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 15 */ new Array( ),
    /* State 16 */ new Array( 44/* ActualParameterList */,45 , 41/* Expression */,46 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 17 */ new Array( ),
    /* State 18 */ new Array( ),
    /* State 19 */ new Array( ),
    /* State 20 */ new Array( 48/* Value */,51 ),
    /* State 21 */ new Array( ),
    /* State 22 */ new Array( 41/* Expression */,53 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 23 */ new Array( ),
    /* State 24 */ new Array( ),
    /* State 25 */ new Array( ),
    /* State 26 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 27 */ new Array( ),
    /* State 28 */ new Array( 39/* FormalParameterList */,54 ),
    /* State 29 */ new Array( 45/* AddSubExp */,56 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 30 */ new Array( 45/* AddSubExp */,57 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 31 */ new Array( 45/* AddSubExp */,58 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 32 */ new Array( 45/* AddSubExp */,59 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 33 */ new Array( 45/* AddSubExp */,60 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 34 */ new Array( 45/* AddSubExp */,61 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 35 */ new Array( 37/* Stmt */,62 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 36 */ new Array( 42/* ArrayIndices */,63 ),
    /* State 37 */ new Array( ),
    /* State 38 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 39 */ new Array( ),
    /* State 40 */ new Array( ),
    /* State 41 */ new Array( 41/* Expression */,68 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 42 */ new Array( 41/* Expression */,69 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 43 */ new Array( 37/* Stmt */,70 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 44 */ new Array( ),
    /* State 45 */ new Array( ),
    /* State 46 */ new Array( ),
    /* State 47 */ new Array( 46/* MulDivExp */,74 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 48 */ new Array( 46/* MulDivExp */,75 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 49 */ new Array( 47/* NegExp */,76 , 48/* Value */,21 ),
    /* State 50 */ new Array( 47/* NegExp */,77 , 48/* Value */,21 ),
    /* State 51 */ new Array( ),
    /* State 52 */ new Array( ),
    /* State 53 */ new Array( ),
    /* State 54 */ new Array( ),
    /* State 55 */ new Array( ),
    /* State 56 */ new Array( ),
    /* State 57 */ new Array( ),
    /* State 58 */ new Array( ),
    /* State 59 */ new Array( ),
    /* State 60 */ new Array( ),
    /* State 61 */ new Array( ),
    /* State 62 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 63 */ new Array( ),
    /* State 64 */ new Array( 37/* Stmt */,82 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 65 */ new Array( 41/* Expression */,83 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 66 */ new Array( ),
    /* State 67 */ new Array( 41/* Expression */,84 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 68 */ new Array( ),
    /* State 69 */ new Array( ),
    /* State 70 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 71 */ new Array( ),
    /* State 72 */ new Array( 41/* Expression */,87 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 73 */ new Array( ),
    /* State 74 */ new Array( ),
    /* State 75 */ new Array( ),
    /* State 76 */ new Array( ),
    /* State 77 */ new Array( ),
    /* State 78 */ new Array( ),
    /* State 79 */ new Array( ),
    /* State 80 */ new Array( ),
    /* State 81 */ new Array( 37/* Stmt */,90 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 82 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 83 */ new Array( ),
    /* State 84 */ new Array( ),
    /* State 85 */ new Array( ),
    /* State 86 */ new Array( ),
    /* State 87 */ new Array( ),
    /* State 88 */ new Array( ),
    /* State 89 */ new Array( 37/* Stmt */,93 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 90 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 91 */ new Array( ),
    /* State 92 */ new Array( ),
    /* State 93 */ new Array( 37/* Stmt */,26 , 40/* Return */,5 , 41/* Expression */,6 , 43/* UnaryOp */,15 , 45/* AddSubExp */,17 , 46/* MulDivExp */,18 , 47/* NegExp */,19 , 48/* Value */,21 ),
    /* State 94 */ new Array( )
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
    "[" /* Terminal symbol */,
    "]" /* Terminal symbol */,
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
    "ArrayIndices" /* Non-terminal symbol */,
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
{ act = 96; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
if( _dbg_withtrace && sstack.length > 0 )
{ __dbg_print( "\nState " + sstack[sstack.length-1] + "\n" + "\tLookahead: " + labels[la] + " (\"" + info.att + "\")\n" + "\tAction: " + act + "\n" + "\tSource: \"" + info.src.substr( info.offset, 30 ) + ( ( info.offset + 30 < info.src.length ) ?
"..." : "" ) + "\"\n" + "\tStack: " + sstack.join() + "\n" + "\tValue stack: " + vstack.join() + "\n" );}
if( act == 96 )
{ if( _dbg_withtrace )
__dbg_print( "Error detected: There is no reduce or shift on the symbol " + labels[la] ); err_cnt++; err_off.push( info.offset - info.att.length ); err_la.push( new Array() ); for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
err_la[err_la.length-1].push( labels[act_tab[sstack[sstack.length-1]][i]] ); var rsstack = new Array(); var rvstack = new Array(); for( var i = 0; i < sstack.length; i++ )
{ rsstack[i] = sstack[i]; rvstack[i] = vstack[i];}
while( act == 96 && la != 49 )
{ if( _dbg_withtrace )
__dbg_print( "\tError recovery\n" + "Current lookahead: " + labels[la] + " (" + info.att + ")\n" + "Action: " + act + "\n\n" ); if( la == -1 )
info.offset++; while( act == 96 && sstack.length > 0 )
{ sstack.pop(); vstack.pop(); if( sstack.length == 0 )
break; act = 96; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
}
if( act != 96 )
break; for( var i = 0; i < rsstack.length; i++ )
{ sstack.push( rsstack[i] ); vstack.push( rvstack[i] );}
la = __lex( info );}
if( act == 96 )
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
         rval = createNode( NODE_OP, OP_ASSIGN_ARR, vstack[ vstack.length - 5 ], vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 16:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 17:
    {
         rval = createNode( NODE_OP, OP_NONE );
    }
    break;
    case 18:
    {
         state.curParams[state.curParams.length] = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 19:
    {
         state.curParams[state.curParams.length] = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 20:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 21:
    {
         rval = createNode( NODE_OP, OP_RETURN, vstack[ vstack.length - 1 ] );
    }
    break;
    case 22:
    {
         rval = createNode( NODE_OP, OP_RETURN );
    }
    break;
    case 23:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 24:
    {
         rval = createNode( NODE_OP, OP_FCALL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 25:
    {
         rval = createNode( NODE_OP, OP_FETCH_ARR, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 26:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 27:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 28:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 1 ] );
    }
    break;
    case 29:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 30:
    {
         rval = createNode( NODE_OP, OP_EQU, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 31:
    {
         rval = createNode( NODE_OP, OP_LOT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 32:
    {
         rval = createNode( NODE_OP, OP_GRT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 33:
    {
         rval = createNode( NODE_OP, OP_LOE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 34:
    {
         rval = createNode( NODE_OP, OP_GRE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 35:
    {
         rval = createNode( NODE_OP, OP_NEQ, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 36:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 37:
    {
         rval = createNode( NODE_OP, OP_SUB, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 38:
    {
         rval = createNode( NODE_OP, OP_ADD, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 39:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 40:
    {
         rval = createNode( NODE_OP, OP_MUL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 41:
    {
         rval = createNode( NODE_OP, OP_DIV, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 42:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 43:
    {
         rval = createNode( NODE_OP, OP_NEG, vstack[ vstack.length - 1 ] );
    }
    break;
    case 44:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 45:
    {
         rval = createNode( NODE_VAR, vstack[ vstack.length - 1 ] );
    }
    break;
    case 46:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 47:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 48:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 49:
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
        "<? $a = 'test'; test(); function test() { echo 'hello world'; } ?>" );
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
