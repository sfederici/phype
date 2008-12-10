
//////////////////////////////////////
// GLOBALLY USED VARS AND FUNCTIONS //
//////////////////////////////////////

// If defined, this variable tells whether we should parse and check assertions.
var phypeTestSuite;
// Contains scripts to execute
var phpScripts;

// Constants used for keeping track of states and variables.
var cons = {
    global : '.global',
    objGlobal : '.objGlobal',
    val : '.val#',
    arr : '.arr#',
    obj : '.obj#',
    unset : '.uns#'
}

// State object.
var pstate = {
    // ACTUAL VALUES AND OBJECTS
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
    objList : [],
    
    
    // FORMAL DECLARATIONS
    /**
     * Function table
     */
    funTable : {},
    
    /**
     * Class table
     */
    classTable : {},
    
    
    // TEMPORARY STATE TRACKING VARIABLES
    /**
     * Variable for keeping track of currently executing function.
     */
    curFun : cons.global,
    
    /**
     * This variable contains the name of the class within whose scope we're performing actions.
     */
    curClass : '',
    
    /**
     * Variable for keeping track of formal parameters for a function declaration.
     */
    curParams : [],
    
    /**
     * Variable for keeping track of currently passed actual parameters of a function invocation.
     */
    passedParams : 0,
    
    /**
     * These variables keeps track of current members of the class being defined.
     */
    curAttrs : [],
    curFuns : [],
    
    /**
     * Variable telling whether a termination event has been received (i.e. a return).
     */
    term : false,
    
    /**
     * Variable for keeping track of most recent return value.
     */
    'return' : '',
    
    
    // TEST SUITE VARIABLES
    /**
     * Keeps track of assertions.
     */
    assertion : null
}

var origState = clone(pstate);

function resetState() {
    pstate = clone(origState);
}


///////////////////
// STATE OBJECTS //
///////////////////
function NODE() {
    var type;
    var value;
    var children;
}

function FUNC() {
    var name;
    var params;
    var nodes;
}

function VAL() {
    var type;
    var value;
}

function MEMBER() {
    var mod;
    var member;
}

function CLASS() {
    var mod;
    var name;
    var attrs;
    var funs;
}

function OBJECT() {
    var objListEntry;
    var references;
}

function ASSERTION() {
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
* Creates member objects for the class model.
*/
function createMember( mod, member ) {
    var m = new MEMBER();
    m.mod = mod;
    m.member = member;
    
    return m;
}

/**
* Creates a class model.
*/
function createClass( mod, name, attrs, funs ) {
    var c = new CLASS();
    c.mod = mod;
    c.name = name;
    c.attrs = attrs;
    c.funs = funs;
    
    return c;
}

/**
* Creates an object.
*/
function createObject( objListEntry ) {
    var obj = new OBJECT();
    obj.objListEntry = objListEntry;
    obj.references = 0;
    
    return obj;
}

/**
* Create a deep clone of a value.
*
* YES, it's expensive!! So is it in PHP.
*/
function clone( value ) {
    if(value == null || typeof(value) != 'object')
        return value;

    var tmp = {};
    for(var key in value)
        tmp[key] = clone(value[key]);

    return tmp;
}

/**
* Create an assertion for testing against when we are in our test suite
*/
function createAssertion( type, value ) {
    var a = new ASSERTION();
    a.type = type;
    a.value = value;
    
    return a;
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
            scope = pstate.curClass+pstate.curFun;

        if (typeof(pstate.symTables[scope]) != 'object')
            pstate.symTables[scope] = {};

        var refTable = linker.getRefTableByVal(val);
        var prefix = linker.getConsDefByVal(val);
        
        pstate.symTables[scope][varName] = prefix+scope+'#'+varName

        refTable[scope+'#'+varName] = val;
    },
    
    assignArr : function(varName, key, val, scope) {
        if (!scope)
            scope = pstate.curClass+pstate.curFun;
        
        if (typeof(pstate.symTables[scope]) != 'object')
            pstate.symTables[scope] = {};
        
        // Initialize the variable as an array
        linker.unlinkVar(varName,scope);
        pstate.symTables[scope][varName] = cons.arr+scope+'#'+varName;
        
        // Check that the entry exists. Initialize it if it does not.
        var arrTableKey = scope+'#'+varName;
        if (!pstate.arrTable[arrTableKey]) {
            var valArr = {};
            valArr[key.value] = val;
            pstate.arrTable[arrTableKey] = createValue( T_ARRAY, valArr );
        }
        // Else insert the array key into the existing entry
        else {
            pstate.arrTable[arrTableKey]["value"][key.value] = val;
        }
    },
    
    assignArrMulti : function(varName, keys, val, scope) {
        if (!scope)
            scope = pstate.curClass+pstate.curFun;
        
        if (typeof(pstate.symTables[scope]) != 'object')
            pstate.symTables[scope] = {};
        
        // Initialize the variable as an array
        linker.unlinkVar(varName,scope);
        pstate.symTables[scope][varName] = cons.arr+scope+'#'+varName;
        
        // Check that the entry exists. Initialize it if it does not.
        var arrTableKey = scope+'#'+varName;
        if (!pstate.arrTable[arrTableKey])
            pstate.arrTable[arrTableKey] = createValue( T_ARRAY, {} );

        var keyRef = 'pstate.arrTable[arrTableKey]["value"]';
        for ( var i=0; i<keys.length; i++ ) {
            eval('if (!'+keyRef+'["'+keys[i].value+'"]) '+keyRef+'["'+keys[i].value+'"] = createValue( T_ARRAY, {} );');
            keyRef = keyRef+'["'+keys[i].value+'"]["value"]';
        }

        keyRef = keyRef+' = val;';
        eval(keyRef);
    },

    getValue : function(varName, scope) {
        if (!scope)
            scope = pstate.curClass+pstate.curFun;
        
        // Look up the potentially recursively defined variable.
        varName = linker.linkRecursively(varName);

        var refTable = linker.getRefTableByVar(varName);
        
        if (typeof(pstate.symTables[scope])=='object' && typeof(pstate.symTables[scope][varName])=='string') {
            var lookupStr = pstate.symTables[scope][varName];
            lookupStr = lookupStr.substr(5,lookupStr.length);
            
            return clone(refTable[lookupStr]);
        } else if (typeof(pstate.symTables[cons.global])=='string') {
            var lookupStr = pstate.symTables[cons.global][cleanVarName];
            lookupStr = lookupStr.substr(5, lookupStr.length);
            
            return clone(refTable[lookupStr]);
        }

        throw varNotFound(varName);
    },
    
    getArrValue : function(varName, key, scope) {
        if (!scope)
            scope = pstate.curClass+pstate.curFun;
        
        var cleanVarName = varName.match(/[^\$]/);
        
        var result = '';
        if (typeof(pstate.symTables[scope])=='object' && typeof(pstate.symTables[scope][cleanVarName])=='string') {
            var prefix = pstate.symTables[scope][cleanVarName].substring(0,5);
            // THIS IS NOT COMPLIANT WITH STANDARD PHP!
            // PHP will lookup the character at the position defined by the array key.
            if (prefix != cons.arr) {
                throw expectedArrNotFound(cleanVarName);
            }
            
            var lookupStr = pstate.symTables[scope][cleanVarName];
            lookupStr = lookupStr.substr(5, lookupStr.length);

            // Look up the value of the variable
            if (pstate.arrTable[lookupStr] && pstate.arrTable[lookupStr]["value"][key.value])
                result = pstate.arrTable[lookupStr]["value"][key.value];
        } else if (typeof(pstate.symTables[cons.global])=='string') {
            var lookupStr = pstate.symTables[cons.global][cleanVarName];
            lookupStr = lookupStr.substr(5, lookupStr.length);
            
            // Look up the value of the variable
            if (pstate.arrTable[lookupStr] && pstate.arrTable[lookupStr]["value"][key.value])
                result = pstate.arrTable[lookupStr]["value"][key.value];
        } else {
            throw varNotFound(varName);
        }

        // Look up the potentially recursively defined variable.
        if (varName != cleanVarName) {
            return clone(linker.getValue(result));
        } else {
            return clone(result);
        }
    },
    
    getArrValueMulti : function(varName, keys, scope) {
        if (!scope)
            scope = pstate.curClass+pstate.curFun;
        
        var cleanVarName = varName.match(/[^\$]/);
        
        var result = '';
        if (typeof(pstate.symTables[scope])=='object' && typeof(pstate.symTables[scope][cleanVarName])=='string') {
            var prefix = pstate.symTables[scope][cleanVarName].substring(0,5);
            // THIS IS NOT COMPLIANT WITH STANDARD PHP!
            // PHP will lookup the character at the position defined by the array key.
            if (prefix != cons.arr) {
                throw expectedArrNotFound(cleanVarName);
            }
            
            var lookupStr = pstate.symTables[scope][cleanVarName];
            lookupStr = lookupStr.substr(5, lookupStr.length);

            // Generate key lookup-command
            var keyRef = 'pstate.arrTable[lookupStr]["value"]';
            for ( var i=0; i<keys.length; i++ ) {
                keyRef = keyRef+'["'+keys[i].value+'"]["value"]';
            }

            // Look up the value of the variable
            keyRef = 'result = '+keyRef+';';
            eval(keyRef);
        } else if (typeof(pstate.symTables[cons.global])=='string') {
            var lookupStr = pstate.symTables[cons.global][cleanVarName];
            lookupStr = lookupStr.substr(5, lookupStr.length);
            
            // Generate key lookup-command
            var keyRef = 'pstate.arrTable[lookupStr]["value"]';
            for ( var i=0; i<keys.length; i++ ) {
                keyRef = keyRef+'["'+keys[i].value+'"]["value"]';
            }
            
            // Look up the value of the variable
            keyRef = 'result = '+keyRef+';';
            eval(keyRef);
        } else {
            throw varNotFound(varName);
        }
        
        // Look up the potentially recursively defined variable.
        if (varName != cleanVarName) {
            return clone(linker.getValue(result));
        } else {
            return clone(result);
        }
    },
    
    /*
     * For linking variable references (unsupported as of yet).
    linkVar : function(locVarName, varName, scope) {
        if (!scope)
            scope = pstate.curFun;
        
        if (typeof(symTables[scope])!='object')
            pstate.symTables[scope] = {};
        
        pstate.symTables[scope][locVarName] = varName;
        if (typeof(pstate.valTable[scope+'#'+varName])!='string')
            pstate.valTable[scope+'#'+varName] = '';
    },
    */
    
    unlinkVar : function(varName, scope) {
        if (!scope)
            scope = pstate.curClass+pstate.curFun;
        
        var prefix = linker.getConsDefByVar(varName);
        if (prefix == cons.unset)
            return;
        
        delete pstate.valTable[pstate.symTables[scope][varName]];
        delete pstate.symTables[prefix+scope+'#'+varName];
    },
    
    getRefTableByVal : function(value) {
        // Check for sym type
        switch (value.type) {
            case T_INT:
            case T_FLOAT:
            case T_CONST:
                return pstate.valTable;
            case T_ARRAY:
                return pstate.arrTable;
            case T_OBJECT:
                return pstate.objList;
            default:
                return null;
        }
    },
    
    getRefTableByVar : function(varName, scope) {
        if (!scope)
            scope = pstate.curClass+pstate.curFun;
        
        if (typeof(pstate.symTables[scope])!='object')
            pstate.symTables[scope] = {};
        
        // Get symbol name
        var symName = '';
        if (typeof(pstate.symTables[scope][varName])=='string')
            symName = pstate.symTables[scope][varName];
        else if (typeof(pstate.symTables[cons.global][varName])=='string')
            symName = pstate.symTables[cons.global][varName];
        else
            symName = cons.unset;
            
            
        // Check for sym type
        switch (symName.substring(0,5)) {
            case cons.val:
                return pstate.valTable;
            case cons.arr:
                return pstate.arrTable;
            case cons.obj:
                return pstate.objList;
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
            case T_INT:
            case T_FLOAT:
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
            scope = pstate.curClass+pstate.curFun;
        
        if (typeof(pstate.symTables[scope])!='object')
            pstate.symTables[scope] = {};
        
        // Get symbol name
        var symName = '';
        if (typeof(pstate.symTables[scope][varName])=='string')
            symName = pstate.symTables[scope][varName];
        else if (typeof(pstate.symTables[cons.global][varName])=='string')
            symName = pstate.symTables[cons.global][varName];
        else
            symName = '.unset';
        
        return symName.substring(0,5);
    }
}


//////////////////////////
// CLASS/OBJECT LINKING //
//////////////////////////
var classLinker = {
    createObjectFromClass : function(classDef) {
        // Init object and add it to the list of objects.
        var objListLength = pstate.objList.length;
        var obj = createObject( objListLength );
        pstate.objList.push(classDef.name);
        
        // Init variable list
        for (var i=0; i<classDef.attrs; i++) {
            var vName = classDef.attrs[i].member.children[0];
            var vVal = classDef.attrs[i].member.children[1];
            if (!vVal || vVal == 'undefined')
                vVal = null;
            pstate.symTable[objListLength+'::'+vName] = vVal;
        }
        
        return obj;
    },
    
    decrementObjectRef : function(obj) {
        obj.references--;
        if (obj.references <= 0) {
            classLinker.deleteObject(obj);
        }
    },
    
    deleteObject : function(obj) {
        var className = pstate.objList[obj.objListEntry];
        
        // Remove from object list
        delete pstate.objList[obj.objListEntry];
        
        // Clear attributes
        for (var i=0; i<classDef.attrs; i++) {
            var vName = classDef.attrs[i].member.children[0];
            delete pstate.symTable[obj.objListEntry+'::'+vName];
        }
        
        delete obj;
    },
    
    checkVisibility : function(invokerClassName, targetClassName, targetMemberName) {
        // get MOD
        var_log(pstate.classTable);
        var_log(targetClassName+' ' +targetMemberName);
        var mod = -1;
        var fun = pstate.classTable[targetClassName]['funs'][targetMemberName];
        if (fun) mod = fun.mod;
        else mod = pstate.classTable[targetClassName]['attrs'][targetMemberName];
        switch (mod) {
            case MOD_PUBLIC:
                return true;
            case MOD_PRIVATE:
                return (invokerClassName == targetClassName);
            case MOD_PROTECTED:
                if (invokerClassName == targetClassName)
                    return true;
                else throw 'Inheritance not yet supported.';
        }
    }
}



/////////////////////////////
// OP AND TYPE DEFINITIONS //
/////////////////////////////

// Value types
var T_CONST            = 0;
var T_ARRAY            = 1;
var T_OBJECT        = 2;
var T_INT            = 3;
var T_FLOAT            = 4;

// Node types
var NODE_OP            = 0;
var NODE_VAR        = 1;
var NODE_CONST        = 2;
var NODE_INT        = 3;
var NODE_FLOAT        = 4;

// Op types
var OP_NONE            = -1;
var OP_ASSIGN        = 0;
var OP_IF            = 1;
var OP_IF_ELSE        = 2;
var OP_WHILE_DO        = 3;
var OP_DO_WHILE        = 4;
var OP_FCALL        = 5;
var OP_PASS_PARAM    = 6;
var OP_RETURN        = 7;
var OP_ECHO            = 8;
var OP_ASSIGN_ARR    = 9;
var OP_FETCH_ARR    = 10;
var OP_ARR_KEYS_R    = 11;
var OP_OBJ_NEW        = 12;
var OP_OBJ_FCALL    = 13;
var OP_EQU            = 50;
var OP_NEQ            = 51;
var OP_GRT            = 52;
var OP_LOT            = 53;
var OP_GRE            = 54;
var OP_LOE            = 55;
var OP_ADD            = 56;
var OP_SUB            = 57;
var OP_DIV            = 58;
var OP_MUL            = 59;
var OP_NEG            = 60;
var OP_CONCAT        = 61;

// Moderation types
var MOD_PUBLIC        = 0;
var MOD_PROTECTED    = 1;
var MOD_PRIVATE        = 2;

// Member types
var MEMBER_ATTR        = 0;
var MEMBER_FUN        = 1;

// Assertion types
var ASS_ECHO        = 0;
var ASS_FAIL        = 1;


////////////////
// EXCEPTIONS //
////////////////
function classDefNotFound(className) {
    return 'No class definition found: '+className;
}

function funRedeclare(funName) {
    return 'Cannot redeclare '+funName;
}

function expectedArrNotFound(varName) {
    return 'The variable is not an array: '+funName;
}

function funNotFound(funName) {
    return 'Function not found: '+funName;
}

function funInvalidArgCount(argCount) {
    return 'Function '+pstate.curFun+'( ) expecting '+argCount+
            ' arguments, but only found '+pstate.passedParams+'.';
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

function invocationTargetInvalid(intType) {
    var type = '';
    switch (intType) {
        case T_FLOAT:
        case T_BOOLEAN:
        case T_INT:
        case T_CONST:
            type = 'Const';
            break;
        case T_ARRAY:
            type = 'Array';
            break;
        default:
            type = 'Unknown';
            break;
    }
    return 'The target of an invocation must be an object. Found: '+type;
}

function memberNotVisible(memName) {
    return 'Call to a restricted member: '+memName;
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
    
    // OP_ASSIGN
    '0' : function(node) {
        // Look up potentially recursive variable name
        var varName = linker.linkRecursively(node.children[0]);
        
        // Check if the variable we are trying to assign to already contains an object;
        // decrement the reference count for the object if this is the case.
        var oldVal = null;
        try {
            oldVal = linker.getValue(varName);
        } catch (exception) {
            if (exception!=varNotFound(varName))
                throw exception;
            else
                oldVal = false;
        }
        
        if (oldVal && oldVal.type == T_OBJECT)
            classLinker.decrementObjectRef(linker.getValue(varName));
        
        try {
            var val = execute( node.children[1] );
        } catch(exception) {
            // If we get an undefined variable error, and the undefined variable is the variable
            // we are currently defining, initialize the current variable to 0, and try assigning again.
            if (exception == varNotFound(varName)) {
                execute( createNode( NODE_OP, OP_ASSIGN, varName, createValue( T_INT, 0 ) ) );
                val = execute( node.children[1] );
            } else {
                throw exception;
            }
        }
        
        // If we are assigning an object, increment its reference count.
        if (val.type == T_OBJECT) {
            val.value.references++;
        }
        
        linker.assignVar( node.children[0], val );
        
        return val;
    },
    
    // OP_IF
    '1' : function(node) {
        var condChild = execute(node.children[0]);
        if(condChild.value)
            return execute(node.children[1]);
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
        var prevPassedParams = pstate.passedParams;
        pstate.passedParams = 0;
        
        // Check if function name is recursively defined
        var funName = linker.linkRecursively(node.children[0]);
        
        var prevFun = pstate.curFun;
        
        // Set the name of the function (possibly with class name as prefix)
        if (funName.type == T_CONST)
            pstate.curFun = pstate.curClass+funName.value;
        else if (typeof(funName) == 'string')
            pstate.curFun = pstate.curClass+funName;
        else
            throw funNameMustBeString(funName.type);

        // Initialize parameters for the function scope
        if ( node.children[1] )
            execute( node.children[1] );
        
        // Execute function
        var f = pstate.funTable[pstate.curFun];
        if ( f && f.params.length <= pstate.passedParams ) {
            for ( var i=0; i<f.nodes.length; i++ )
                execute( f.nodes[i] );
        } else {
            if (!f) {
                throw funNotFound(funName);
            } else if (!(f.params.length <= pstate.passedParams))
                throw funInvalidArgCount(f.params.length);
        }
        
        // Clear parameters for the function scope
        for ( var i=0; i<f.params.length; i++ )
            linker.unlinkVar( f.params[i] );
        
        // State roll-back
        pstate.passedParams = prevPassedParams;
        pstate.curFun = prevFun;
        var ret = pstate['return'];
        pstate['return'] = 0;
        
        // Return the value saved in .return in our valTable.
        return ret;
    },

    // OP_PASS_PARAM
    '6' : function(node) {
        // Initialize parameter name
        var f = pstate.funTable[pstate.curFun];

        if (!f)
            throw funNotFound();
            
        // Link parameter name with passed value
        if ( node.children[0] ) {
            if ( node.children[0].value != OP_PASS_PARAM ) {
                // Initialize parameter name
                var paramName = '';
                if ( pstate.passedParams < f.params.length )
                    paramName = f.params[pstate.passedParams].value;
                else
                    paramName = '.arg'+pstate.passedParams;

                // Link
                linker.assignVar( paramName, execute( node.children[0] ) );
                pstate.passedParams++;
            } else {
                execute( node.children[0] );
            }
        }
        
        if ( node.children[1] ) {
            // Initialize parameter name
            var paramName = '';
            if ( pstate.passedParams < f.params.length )
                paramName = f.params[pstate.passedParams].value;
            else
                paramName = '.arg'+pstate.passedParams;
            
            // Link
            linker.assignVar( paramName, execute( node.children[1] ) );
            pstate.passedParams++;
        }
    },

    // OP_RETURN
    '7' : function(node) {
        if (node.children[0])
            pstate['return'] = execute( node.children[0] );
        
        pstate.term = true;
    },

    // OP_ECHO
    '8' : function(node) {
        var val = execute( node.children[0] );
        
        if (typeof(val) != 'string') {
            switch (val.type) {
                case T_INT:
                case T_FLOAT:
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
        } else {
            phypeOut( val );
        }
    },
    
    // OP_ASSIGN_ARR
    '9' : function(node) {
        var varName = node.children[0];
        var keys = execute( node.children[1] );
        var value = execute( node.children[2] );
        
        // If keys is an (javascript) array, assign it as a multi-dimensional array.
        if (typeof(keys) == 'object' && keys.length && keys.length != 'undefined')
            linker.assignArrMulti( varName, keys, value );
        // Otherwise, assign it ordinarily.
        else
            linker.assignArr( varName, keys, value );
        
        return value;
    },
    
    // OP_FETCH_ARR
    '10' : function(node) {
        var varName = node.children[0];
        var keys = execute( node.children[1] );
        
        var value = '';
        // If keys is a JS array, fetch the value as a multi-dimensional PHP array.
        if (typeof(keys) == 'object' && keys.length && keys.length != 'undefined')
            value = linker.getArrValueMulti(varName, keys);
        // Otherwise, fetch it ordinarily.
        else {
            value = linker.getArrValue(varName, keys);
        }

        return value;
    },
    
    // OP_ARR_KEYS_R
    '11' : function(node) {
        var arrKeys = new Array();
        
        if ( node.children[0] ) {
            // If the first child contains recursive array keys, fetch the the recursively defined array keys,
            // and join these with the existing array keys.
            if ( node.children[0].value == OP_ARR_KEYS_R ) {
                arrKeys.join( execute( node.children[0] ) );
            }
            // Otherwise, insert the array key at the end of our list of array.
            else {
                arrKeys.push( execute( node.children[0] ) );
            }
        }
        
        // Add the last array key (if it exists) to the list of array keys.
        if ( node.children[1] ) {
            arrKeys.push( execute( node.children[1] ) );
        }
        
        return arrKeys;
    },
    
    // OP_OBJ_NEW
    '12' : function(node) {
        // Lookup potentially recursively defined class name
        var className = linker.linkRecursively(node.children[0]);
        
        // Look up class in class table
        var realClass = pstate.classTable[node.children[0]];
        if (!realClass || realClass == 'undefined') {
            throw classDefNotFound(node.children[0]);
        }
        
        // Instantiate attributes
        var obj = classLinker.createObjectFromClass(realClass);
        
        // Set state
        pstate.curClass = className+'::';
        
        // Get and execute constructor
        var constructInvoke = null;
        // First look for __construct-function (higher precedence than class-named function as
        // constructor)
        if (realClass['funs']['__construct']) {
            constructInvoke = createNode( NODE_OP, OP_FCALL, className, '__construct' );
        }
        // Then look for class-named function as constructor
        else if (realClass['funs'][node.children[1]]) {
            constructInvoke = createNode( NODE_OP, OP_FCALL, className, node.children[1] );
        }
        
        // Only invoke the constructor if it is defined
        if (constructInvoke)
            execute( constructInvoke );
        
        //State rollback
        pstate.curClass = '';
        
        var_log(pstate.objList);
        
        // Return the instantiated object
        return createValue( T_OBJECT, obj );
    },
    
    // OP_OBJ_FCALL
    '13' : function(node) {
        var target = execute( node.children[0] );
        if (target.type != T_OBJECT) {
            throw invocationTargetInvalid(target.type);
        }
        
        // Check if function name is recursively defined
        var funName = linker.linkRecursively(node.children[1]);
        
        // Check that the function is visible to the invoker.
        var targetClass = pstate.objList[target.value.objListEntry];
        if (!classLinker.checkVisibility(pstate.curClass, targetClass, funName)) {
            throw memberNotVisible(funName);
        }
        
        // Invoke function
        var f = pstate.classTable[targetClass]['funs'][funName]['member'];
        {
            // State preservation
            var prevPassedParams = pstate.passedParams;
            pstate.passedParams = 0;
            // Check if function name is recursively defined
            var funName = linker.linkRecursively(node.children[0]);
            var prevFun = pstate.curFun;
            var prevClass = pstate.curClass;
            
            // Set executing function and class
            pstate.curFun = pstate.curClass+funName;
            pstate.curClass = pstate.targetClass;
    
            // Initialize parameters for the function scope
            if ( node.children[2] )
                execute( node.children[2] );
            
            // Execute function
            if ( f && f.params.length <= pstate.passedParams ) {
                for ( var i=0; i<f.nodes.length; i++ )
                    execute( f.nodes[i] );
            } else {
                if (!f) {
                    throw funNotFound(funName);
                } else if (!(f.params.length <= pstate.passedParams))
                    throw funInvalidArgCount(f.params.length);
            }
            
            // Clear parameters for the function scope
            for ( var i=0; i<f.params.length; i++ )
                linker.unlinkVar( f.params[i] );
            
            // State roll-back
            pstate.passedParams = prevPassedParams;
            pstate.curFun = prevFun;
            pstate.curFun = prevClass;
            var ret = pstate['return'];
            pstate['return'] = 0;
            
            // Return the value saved in .return in our valTable.
            return ret;
        }
    },
    
    // OP_EQU
    '50' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (leftChild.value == rightChild.value)
            resultNode = createValue(T_CONST, 1);
        else
            resultNode = createValue(T_CONST, 0);
        return resultNode;
    },
    
    // OP_NEQ
    '51' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (leftChild.value != rightChild.value)
            resultNode = createValue(T_CONST, 1);
        else
            resultNode = createValue(T_CONST, 0);
        return resultNode;
    },
    
    // OP_GRT
    '52' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (leftChild.value > rightChild.value)
            resultNode = createValue(T_CONST, 1);
        else
            resultNode = createValue(T_CONST, 0);
        return resultNode;
        },
    
    // OP_LOT
    '53' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (leftChild.value < rightChild.value)
            resultNode = createValue(T_CONST, 1);
        else
            resultNode = createValue(T_CONST, 0);
        return resultNode;
    },
    
    // OP_GRE
    '54' : function(node) {
                var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (leftChild.value >= rightChild.value)
            resultNode = createValue(T_CONST, 1);
        else
            resultNode = createValue(T_CONST, 0);
        return resultNode;
    },
    
    // OP_LOE
    '55' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (leftChild.value <= rightChild.value)
            resultNode = createValue(T_CONST, 1);
        else
            resultNode = createValue(T_CONST, 0);
        return resultNode;
    },
    
    // OP_ADD
    '56' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var leftValue;
        var rightValue;
        var type = T_INT;
        
        switch (leftChild.type) {
            // TODO: Check for PHP-standard.
            case T_INT:
            case T_CONST:
                leftValue = parseInt(leftChild.value);
                break;
            case T_FLOAT:
                leftValue = parseFloat(leftChild.value);
                type = T_FLOAT;
                break;
        }
        switch (rightChild.type) {
            // TODO: Check for PHP-standard.
            case T_INT:
            case T_CONST:
                rightValue = parseInt(rightChild.value);
                break;
            case T_FLOAT:
                rightValue = parseFloat(rightChild.value);
                type = T_FLOAT;
                break;
        }

        var result = leftValue + rightValue;
        var resultNode = createValue(type, result);

        return resultNode;
    },

    // OP_SUB
    '57' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var result = leftChild.value - rightChild.value;
        var resultNode = createValue(T_CONST, result);

        return resultNode;
    },
    
    // OP_DIV
    '58' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var result = leftChild.value / rightChild.value;
        var resultNode = createValue(T_CONST, result);

        return resultNode;
    },
    
    // OP_MUL
    '59' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var result = leftChild.value * rightChild.value;
        var resultNode = createValue(T_CONST, result);

        return resultNode;
    },
    
    // OP_NEG
    '60' : function(node) {
        var child = execute(node.children[0]);
        var result = -(child.value);
        var resultNode = createValue(T_CONST, result);

        return resultNode;
    },
    
    // OP_CONCAT
    '61' : function(node) {
        var leftChild = execute( node.children[0] );
        var rightChild = execute( node.children[1] );

        return createValue( T_CONST, leftChild.value+rightChild.value );
    }
}

function execute( node ) {
    // Reset term-event boolean and terminate currently executing action, if a terminate-event was received.
    if (pstate.term) {
        pstate.term = false;
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
        
        case NODE_INT:
            ret = createValue( T_INT, node.value );
            break;
        
        case NODE_FLOAT:
            ret = createValue( T_FLOAT, node.value );
            break;
    }
    
    return ret;
}


var _dbg_withtrace = false; var _dbg_string = new String(); function __dbg_print( text )
{ _dbg_string += text + "\n";}
function __lex( info )
{ var state = 0; var match = -1; var match_pos = 0; var start = 0; var pos = info.offset + 1; do
{ pos--; state = 0; match = -2; start = pos; if( info.src.length <= start )
return 74; do
{ switch( state )
{
    case 0:
        if( ( info.src.charCodeAt( pos ) >= 9 && info.src.charCodeAt( pos ) <= 10 ) || info.src.charCodeAt( pos ) == 13 || info.src.charCodeAt( pos ) == 32 ) state = 1;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 2;
        else if( info.src.charCodeAt( pos ) == 41 ) state = 3;
        else if( info.src.charCodeAt( pos ) == 42 ) state = 4;
        else if( info.src.charCodeAt( pos ) == 43 ) state = 5;
        else if( info.src.charCodeAt( pos ) == 44 ) state = 6;
        else if( info.src.charCodeAt( pos ) == 45 ) state = 7;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 8;
        else if( info.src.charCodeAt( pos ) == 47 ) state = 9;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 54 ) || ( info.src.charCodeAt( pos ) >= 56 && info.src.charCodeAt( pos ) <= 57 ) ) state = 10;
        else if( info.src.charCodeAt( pos ) == 55 ) state = 11;
        else if( info.src.charCodeAt( pos ) == 59 ) state = 12;
        else if( info.src.charCodeAt( pos ) == 60 ) state = 13;
        else if( info.src.charCodeAt( pos ) == 61 ) state = 14;
        else if( info.src.charCodeAt( pos ) == 62 ) state = 15;
        else if( info.src.charCodeAt( pos ) == 91 ) state = 16;
        else if( info.src.charCodeAt( pos ) == 93 ) state = 17;
        else if( info.src.charCodeAt( pos ) == 123 ) state = 18;
        else if( info.src.charCodeAt( pos ) == 125 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 33 ) state = 49;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 77 ) || info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 81 || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 85 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 109 ) || info.src.charCodeAt( pos ) == 111 || info.src.charCodeAt( pos ) == 113 || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 117 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 34 ) state = 52;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 53;
        else if( info.src.charCodeAt( pos ) == 36 ) state = 54;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 55;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 56;
        else if( info.src.charCodeAt( pos ) == 58 ) state = 58;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 60;
        else if( info.src.charCodeAt( pos ) == 92 ) state = 62;
        else if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 91;
        else if( info.src.charCodeAt( pos ) == 86 || info.src.charCodeAt( pos ) == 118 ) state = 93;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 103;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 111;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 112;
        else if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 118;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 119;
        else if( info.src.charCodeAt( pos ) == 102 ) state = 126;
        else state = -1;
        break;

    case 1:
        state = -1;
        match = 1;
        match_pos = pos;
        break;

    case 2:
        state = -1;
        match = 34;
        match_pos = pos;
        break;

    case 3:
        state = -1;
        match = 35;
        match_pos = pos;
        break;

    case 4:
        state = -1;
        match = 33;
        match_pos = pos;
        break;

    case 5:
        state = -1;
        match = 30;
        match_pos = pos;
        break;

    case 6:
        state = -1;
        match = 19;
        match_pos = pos;
        break;

    case 7:
        if( info.src.charCodeAt( pos ) == 62 ) state = 25;
        else state = -1;
        match = 31;
        match_pos = pos;
        break;

    case 8:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 26;
        else state = -1;
        match = 20;
        match_pos = pos;
        break;

    case 9:
        if( info.src.charCodeAt( pos ) == 47 ) state = 27;
        else state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 10:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 10;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 26;
        else state = -1;
        match = 44;
        match_pos = pos;
        break;

    case 11:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 11;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 26;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 12:
        state = -1;
        match = 18;
        match_pos = pos;
        break;

    case 13:
        if( info.src.charCodeAt( pos ) == 33 ) state = 29;
        else if( info.src.charCodeAt( pos ) == 61 ) state = 30;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 31;
        else state = -1;
        match = 29;
        match_pos = pos;
        break;

    case 14:
        if( info.src.charCodeAt( pos ) == 61 ) state = 32;
        else state = -1;
        match = 21;
        match_pos = pos;
        break;

    case 15:
        if( info.src.charCodeAt( pos ) == 61 ) state = 33;
        else state = -1;
        match = 28;
        match_pos = pos;
        break;

    case 16:
        state = -1;
        match = 16;
        match_pos = pos;
        break;

    case 17:
        state = -1;
        match = 17;
        match_pos = pos;
        break;

    case 18:
        state = -1;
        match = 14;
        match_pos = pos;
        break;

    case 19:
        state = -1;
        match = 15;
        match_pos = pos;
        break;

    case 20:
        state = -1;
        match = 23;
        match_pos = pos;
        break;

    case 21:
        state = -1;
        match = 25;
        match_pos = pos;
        break;

    case 22:
        state = -1;
        match = 43;
        match_pos = pos;
        break;

    case 23:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 23;
        else state = -1;
        match = 39;
        match_pos = pos;
        break;

    case 24:
        state = -1;
        match = 41;
        match_pos = pos;
        break;

    case 25:
        state = -1;
        match = 36;
        match_pos = pos;
        break;

    case 26:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 26;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 27:
        state = -1;
        match = 38;
        match_pos = pos;
        break;

    case 28:
        state = -1;
        match = 37;
        match_pos = pos;
        break;

    case 29:
        state = -1;
        match = 24;
        match_pos = pos;
        break;

    case 30:
        state = -1;
        match = 26;
        match_pos = pos;
        break;

    case 31:
        state = -1;
        match = 46;
        match_pos = pos;
        break;

    case 32:
        state = -1;
        match = 22;
        match_pos = pos;
        break;

    case 33:
        state = -1;
        match = 27;
        match_pos = pos;
        break;

    case 34:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 59 ) || ( info.src.charCodeAt( pos ) >= 61 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 34;
        else if( info.src.charCodeAt( pos ) == 60 ) state = 68;
        else state = -1;
        match = 47;
        match_pos = pos;
        break;

    case 35:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 5;
        match_pos = pos;
        break;

    case 36:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 2;
        match_pos = pos;
        break;

    case 37:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 8;
        match_pos = pos;
        break;

    case 38:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 11;
        match_pos = pos;
        break;

    case 39:
        state = -1;
        match = 48;
        match_pos = pos;
        break;

    case 40:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 6;
        match_pos = pos;
        break;

    case 41:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 3;
        match_pos = pos;
        break;

    case 42:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 9;
        match_pos = pos;
        break;

    case 43:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 4;
        match_pos = pos;
        break;

    case 44:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 10;
        match_pos = pos;
        break;

    case 45:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 7;
        match_pos = pos;
        break;

    case 46:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 12;
        match_pos = pos;
        break;

    case 47:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 13;
        match_pos = pos;
        break;

    case 48:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 49:
        if( info.src.charCodeAt( pos ) == 61 ) state = 20;
        else if( info.src.charCodeAt( pos ) == 62 ) state = 21;
        else state = -1;
        break;

    case 50:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 51:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 51;
        else state = -1;
        match = 39;
        match_pos = pos;
        break;

    case 52:
        if( info.src.charCodeAt( pos ) == 34 ) state = 22;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 33 ) || ( info.src.charCodeAt( pos ) >= 35 && info.src.charCodeAt( pos ) <= 254 ) ) state = 52;
        else state = -1;
        break;

    case 53:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 35;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 54:
        if( info.src.charCodeAt( pos ) == 36 ) state = 23;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 51;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 54 ) || ( info.src.charCodeAt( pos ) >= 56 && info.src.charCodeAt( pos ) <= 57 ) ) state = 64;
        else state = -1;
        break;

    case 55:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 70 || info.src.charCodeAt( pos ) == 102 ) state = 36;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 69 ) || ( info.src.charCodeAt( pos ) >= 71 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 101 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 56:
        if( info.src.charCodeAt( pos ) == 39 ) state = 22;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 56;
        else state = -1;
        break;

    case 57:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 37;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 58:
        if( info.src.charCodeAt( pos ) == 58 ) state = 28;
        else state = -1;
        break;

    case 59:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 38;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 60:
        if( info.src.charCodeAt( pos ) == 62 ) state = 34;
        else state = -1;
        break;

    case 61:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 40;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 62:
        if( info.src.charCodeAt( pos ) == 32 ) state = 66;
        else state = -1;
        break;

    case 63:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 41;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 64:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 64;
        else state = -1;
        break;

    case 65:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 42;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 66:
        if( info.src.charCodeAt( pos ) == 97 ) state = 70;
        else state = -1;
        break;

    case 67:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 43;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 68:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 34;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 39;
        else state = -1;
        break;

    case 69:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 44;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 70:
        if( info.src.charCodeAt( pos ) == 115 ) state = 92;
        else state = -1;
        break;

    case 71:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 45;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 77 ) || ( info.src.charCodeAt( pos ) >= 79 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 72:
        if( info.src.charCodeAt( pos ) == 101 ) state = 74;
        else state = -1;
        break;

    case 73:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 46;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 74:
        if( info.src.charCodeAt( pos ) == 114 ) state = 76;
        else state = -1;
        break;

    case 75:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 47;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 67 ) || ( info.src.charCodeAt( pos ) >= 69 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 99 ) || ( info.src.charCodeAt( pos ) >= 101 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 76:
        if( info.src.charCodeAt( pos ) == 116 ) state = 78;
        else state = -1;
        break;

    case 77:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 32 ) state = 81;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 78:
        if( info.src.charCodeAt( pos ) == 69 ) state = 79;
        else if( info.src.charCodeAt( pos ) == 70 ) state = 80;
        else state = -1;
        break;

    case 79:
        if( info.src.charCodeAt( pos ) == 99 ) state = 82;
        else state = -1;
        break;

    case 80:
        if( info.src.charCodeAt( pos ) == 97 ) state = 83;
        else state = -1;
        break;

    case 81:
        if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        break;

    case 82:
        if( info.src.charCodeAt( pos ) == 104 ) state = 84;
        else state = -1;
        break;

    case 83:
        if( info.src.charCodeAt( pos ) == 105 ) state = 85;
        else state = -1;
        break;

    case 84:
        if( info.src.charCodeAt( pos ) == 111 ) state = 86;
        else state = -1;
        break;

    case 85:
        if( info.src.charCodeAt( pos ) == 108 ) state = 87;
        else state = -1;
        break;

    case 86:
        if( info.src.charCodeAt( pos ) == 32 ) state = 88;
        else state = -1;
        break;

    case 87:
        if( info.src.charCodeAt( pos ) == 36 ) state = 1;
        else if( info.src.charCodeAt( pos ) == 115 ) state = 87;
        else state = -1;
        break;

    case 88:
        if( info.src.charCodeAt( pos ) == 34 ) state = 89;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 90;
        else state = -1;
        break;

    case 89:
        if( info.src.charCodeAt( pos ) == 34 ) state = 87;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 33 ) || ( info.src.charCodeAt( pos ) >= 35 && info.src.charCodeAt( pos ) <= 254 ) ) state = 89;
        else state = -1;
        break;

    case 90:
        if( info.src.charCodeAt( pos ) == 39 ) state = 87;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 90;
        else state = -1;
        break;

    case 91:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 57;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 92:
        if( info.src.charCodeAt( pos ) == 115 ) state = 72;
        else state = -1;
        break;

    case 93:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 66 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 65 || info.src.charCodeAt( pos ) == 97 ) state = 59;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 94:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 61;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 95:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 63;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 96:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 65;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 97:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 67;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 98:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 69;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 99:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 71;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 100:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 73;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 101:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 75;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 102:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 77;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 103:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 94;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 95;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 104:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 66 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 65 || info.src.charCodeAt( pos ) == 97 ) state = 96;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 105:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 97;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 106:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 98;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 107:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 99;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 108:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 66 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 65 || info.src.charCodeAt( pos ) == 97 ) state = 100;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 109:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 101;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 110:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 111 ) state = 102;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 111:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 104;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 112:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 105;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 113:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || info.src.charCodeAt( pos ) == 65 || ( info.src.charCodeAt( pos ) >= 67 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || info.src.charCodeAt( pos ) == 97 || ( info.src.charCodeAt( pos ) >= 99 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 66 || info.src.charCodeAt( pos ) == 98 ) state = 106;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 114:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 107;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 115:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 85 ) || ( info.src.charCodeAt( pos ) >= 87 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 117 ) || ( info.src.charCodeAt( pos ) >= 119 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 86 || info.src.charCodeAt( pos ) == 118 ) state = 108;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 116:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 109;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 117:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 105 ) state = 110;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 118:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 113;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 120;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 119:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 114;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 120:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 115;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 123;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 121:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 116;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 122:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 116 ) state = 117;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 123:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 121;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 124:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 99 ) state = 122;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 125:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 124;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 126:
        if( info.src.charCodeAt( pos ) == 40 ) state = 24;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 50;
        else if( info.src.charCodeAt( pos ) == 117 ) state = 125;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

}


pos++;}
while( state > -1 );}
while( 1 > -1 && match == 1 ); if( match > -1 )
{ info.att = info.src.substr( start, match_pos - start ); info.offset = match_pos; switch( match )
{
    case 39:
        {
         info.att = info.att.substr(1,info.att.length-1);
        }
        break;

    case 40:
        {
         info.att = info.att.substr(9,info.att.length-1);
        }
        break;

    case 41:
        {
         info.att = info.att.substr(0,info.att.length-1);
        }
        break;

    case 43:
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
    new Array( 49/* PHPScript */, 2 ),
    new Array( 49/* PHPScript */, 0 ),
    new Array( 50/* Script */, 3 ),
    new Array( 53/* ClassDefinition */, 5 ),
    new Array( 52/* Member */, 2 ),
    new Array( 52/* Member */, 2 ),
    new Array( 52/* Member */, 0 ),
    new Array( 56/* AttributeMod */, 1 ),
    new Array( 56/* AttributeMod */, 1 ),
    new Array( 56/* AttributeMod */, 1 ),
    new Array( 56/* AttributeMod */, 1 ),
    new Array( 57/* FunctionMod */, 1 ),
    new Array( 57/* FunctionMod */, 0 ),
    new Array( 57/* FunctionMod */, 1 ),
    new Array( 57/* FunctionMod */, 1 ),
    new Array( 59/* FunctionDefinition */, 7 ),
    new Array( 55/* ClassFunctionDefinition */, 8 ),
    new Array( 54/* AttributeDefinition */, 3 ),
    new Array( 51/* Stmt */, 2 ),
    new Array( 51/* Stmt */, 2 ),
    new Array( 51/* Stmt */, 2 ),
    new Array( 51/* Stmt */, 3 ),
    new Array( 51/* Stmt */, 5 ),
    new Array( 51/* Stmt */, 4 ),
    new Array( 51/* Stmt */, 5 ),
    new Array( 51/* Stmt */, 3 ),
    new Array( 51/* Stmt */, 4 ),
    new Array( 51/* Stmt */, 1 ),
    new Array( 51/* Stmt */, 1 ),
    new Array( 51/* Stmt */, 5 ),
    new Array( 51/* Stmt */, 3 ),
    new Array( 51/* Stmt */, 1 ),
    new Array( 51/* Stmt */, 2 ),
    new Array( 63/* AssertStmt */, 2 ),
    new Array( 63/* AssertStmt */, 1 ),
    new Array( 63/* AssertStmt */, 0 ),
    new Array( 58/* FormalParameterList */, 3 ),
    new Array( 58/* FormalParameterList */, 1 ),
    new Array( 58/* FormalParameterList */, 0 ),
    new Array( 60/* Return */, 2 ),
    new Array( 60/* Return */, 1 ),
    new Array( 61/* Expression */, 3 ),
    new Array( 61/* Expression */, 1 ),
    new Array( 61/* Expression */, 1 ),
    new Array( 61/* Expression */, 4 ),
    new Array( 61/* Expression */, 2 ),
    new Array( 66/* ActualParameterList */, 3 ),
    new Array( 66/* ActualParameterList */, 1 ),
    new Array( 66/* ActualParameterList */, 0 ),
    new Array( 62/* ArrayIndices */, 4 ),
    new Array( 62/* ArrayIndices */, 3 ),
    new Array( 65/* FunctionInvocation */, 1 ),
    new Array( 65/* FunctionInvocation */, 1 ),
    new Array( 67/* SimpleFunctionInvocation */, 3 ),
    new Array( 68/* PrefixedFunctionInvocation */, 5 ),
    new Array( 69/* Target */, 1 ),
    new Array( 64/* BinaryOp */, 3 ),
    new Array( 64/* BinaryOp */, 3 ),
    new Array( 64/* BinaryOp */, 3 ),
    new Array( 64/* BinaryOp */, 3 ),
    new Array( 64/* BinaryOp */, 3 ),
    new Array( 64/* BinaryOp */, 3 ),
    new Array( 64/* BinaryOp */, 3 ),
    new Array( 64/* BinaryOp */, 1 ),
    new Array( 70/* AddSubExp */, 3 ),
    new Array( 70/* AddSubExp */, 3 ),
    new Array( 70/* AddSubExp */, 1 ),
    new Array( 71/* MulDivExp */, 3 ),
    new Array( 71/* MulDivExp */, 3 ),
    new Array( 71/* MulDivExp */, 1 ),
    new Array( 72/* UnaryOp */, 2 ),
    new Array( 72/* UnaryOp */, 1 ),
    new Array( 73/* Value */, 1 ),
    new Array( 73/* Value */, 3 ),
    new Array( 73/* Value */, 1 ),
    new Array( 73/* Value */, 1 ),
    new Array( 73/* Value */, 1 )
);

/* Action-Table */
var act_tab = new Array(
    /* State 0 */ new Array( 74/* "$" */,-2 , 46/* "ScriptBegin" */,-2 ),
    /* State 1 */ new Array( 46/* "ScriptBegin" */,3 , 74/* "$" */,0 ),
    /* State 2 */ new Array( 74/* "$" */,-1 , 46/* "ScriptBegin" */,-1 ),
    /* State 3 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 4 */ new Array( 47/* "ScriptEnd" */,37 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 5 */ new Array( 18/* ";" */,38 ),
    /* State 6 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 18/* ";" */,46 , 36/* "->" */,-56 ),
    /* State 7 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 8 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 9 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 10 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 11 */ new Array( 21/* "=" */,53 , 16/* "[" */,54 , 18/* ";" */,-73 , 31/* "-" */,-73 , 30/* "+" */,-73 , 33/* "*" */,-73 , 32/* "/" */,-73 , 22/* "==" */,-73 , 29/* "<" */,-73 , 28/* ">" */,-73 , 26/* "<=" */,-73 , 27/* ">=" */,-73 , 23/* "!=" */,-73 , 20/* "." */,-73 , 36/* "->" */,-73 ),
    /* State 12 */ new Array( 47/* "ScriptEnd" */,-28 , 2/* "IF" */,-28 , 4/* "WHILE" */,-28 , 5/* "DO" */,-28 , 6/* "ECHO" */,-28 , 39/* "Variable" */,-28 , 14/* "{" */,-28 , 48/* "InternalNonScript" */,-28 , 38/* "//" */,-28 , 7/* "RETURN" */,-28 , 34/* "(" */,-28 , 8/* "NewToken" */,-28 , 9/* "ClassToken" */,-28 , 40/* "FunctionName" */,-28 , 41/* "FunctionInvoke" */,-28 , 31/* "-" */,-28 , 43/* "String" */,-28 , 44/* "Integer" */,-28 , 45/* "Float" */,-28 , 15/* "}" */,-28 , 3/* "ELSE" */,-28 ),
    /* State 13 */ new Array( 47/* "ScriptEnd" */,-29 , 2/* "IF" */,-29 , 4/* "WHILE" */,-29 , 5/* "DO" */,-29 , 6/* "ECHO" */,-29 , 39/* "Variable" */,-29 , 14/* "{" */,-29 , 48/* "InternalNonScript" */,-29 , 38/* "//" */,-29 , 7/* "RETURN" */,-29 , 34/* "(" */,-29 , 8/* "NewToken" */,-29 , 9/* "ClassToken" */,-29 , 40/* "FunctionName" */,-29 , 41/* "FunctionInvoke" */,-29 , 31/* "-" */,-29 , 43/* "String" */,-29 , 44/* "Integer" */,-29 , 45/* "Float" */,-29 , 15/* "}" */,-29 , 3/* "ELSE" */,-29 ),
    /* State 14 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 15 */ new Array( 47/* "ScriptEnd" */,-32 , 2/* "IF" */,-32 , 4/* "WHILE" */,-32 , 5/* "DO" */,-32 , 6/* "ECHO" */,-32 , 39/* "Variable" */,-32 , 14/* "{" */,-32 , 48/* "InternalNonScript" */,-32 , 38/* "//" */,-32 , 7/* "RETURN" */,-32 , 34/* "(" */,-32 , 8/* "NewToken" */,-32 , 9/* "ClassToken" */,-32 , 40/* "FunctionName" */,-32 , 41/* "FunctionInvoke" */,-32 , 31/* "-" */,-32 , 43/* "String" */,-32 , 44/* "Integer" */,-32 , 45/* "Float" */,-32 , 15/* "}" */,-32 , 3/* "ELSE" */,-32 ),
    /* State 16 */ new Array( 42/* "ClassName" */,57 , 47/* "ScriptEnd" */,-36 , 2/* "IF" */,-36 , 4/* "WHILE" */,-36 , 5/* "DO" */,-36 , 6/* "ECHO" */,-36 , 39/* "Variable" */,-36 , 14/* "{" */,-36 , 48/* "InternalNonScript" */,-36 , 38/* "//" */,-36 , 7/* "RETURN" */,-36 , 34/* "(" */,-36 , 8/* "NewToken" */,-36 , 9/* "ClassToken" */,-36 , 40/* "FunctionName" */,-36 , 41/* "FunctionInvoke" */,-36 , 31/* "-" */,-36 , 43/* "String" */,-36 , 44/* "Integer" */,-36 , 45/* "Float" */,-36 , 15/* "}" */,-36 ),
    /* State 17 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 18/* ";" */,-41 ),
    /* State 18 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 19 */ new Array( 18/* ";" */,-43 , 22/* "==" */,-43 , 29/* "<" */,-43 , 28/* ">" */,-43 , 26/* "<=" */,-43 , 27/* ">=" */,-43 , 23/* "!=" */,-43 , 20/* "." */,-43 , 36/* "->" */,-43 , 2/* "IF" */,-43 , 4/* "WHILE" */,-43 , 5/* "DO" */,-43 , 6/* "ECHO" */,-43 , 39/* "Variable" */,-43 , 14/* "{" */,-43 , 48/* "InternalNonScript" */,-43 , 38/* "//" */,-43 , 7/* "RETURN" */,-43 , 34/* "(" */,-43 , 8/* "NewToken" */,-43 , 9/* "ClassToken" */,-43 , 40/* "FunctionName" */,-43 , 41/* "FunctionInvoke" */,-43 , 31/* "-" */,-43 , 43/* "String" */,-43 , 44/* "Integer" */,-43 , 45/* "Float" */,-43 , 35/* ")" */,-43 , 19/* "," */,-43 , 17/* "]" */,-43 ),
    /* State 20 */ new Array( 18/* ";" */,-44 , 22/* "==" */,-44 , 29/* "<" */,-44 , 28/* ">" */,-44 , 26/* "<=" */,-44 , 27/* ">=" */,-44 , 23/* "!=" */,-44 , 20/* "." */,-44 , 36/* "->" */,-44 , 2/* "IF" */,-44 , 4/* "WHILE" */,-44 , 5/* "DO" */,-44 , 6/* "ECHO" */,-44 , 39/* "Variable" */,-44 , 14/* "{" */,-44 , 48/* "InternalNonScript" */,-44 , 38/* "//" */,-44 , 7/* "RETURN" */,-44 , 34/* "(" */,-44 , 8/* "NewToken" */,-44 , 9/* "ClassToken" */,-44 , 40/* "FunctionName" */,-44 , 41/* "FunctionInvoke" */,-44 , 31/* "-" */,-44 , 43/* "String" */,-44 , 44/* "Integer" */,-44 , 45/* "Float" */,-44 , 35/* ")" */,-44 , 19/* "," */,-44 , 17/* "]" */,-44 ),
    /* State 21 */ new Array( 41/* "FunctionInvoke" */,60 ),
    /* State 22 */ new Array( 42/* "ClassName" */,61 ),
    /* State 23 */ new Array( 34/* "(" */,62 ),
    /* State 24 */ new Array( 30/* "+" */,63 , 31/* "-" */,64 , 18/* ";" */,-64 , 22/* "==" */,-64 , 29/* "<" */,-64 , 28/* ">" */,-64 , 26/* "<=" */,-64 , 27/* ">=" */,-64 , 23/* "!=" */,-64 , 20/* "." */,-64 , 36/* "->" */,-64 , 2/* "IF" */,-64 , 4/* "WHILE" */,-64 , 5/* "DO" */,-64 , 6/* "ECHO" */,-64 , 39/* "Variable" */,-64 , 14/* "{" */,-64 , 48/* "InternalNonScript" */,-64 , 38/* "//" */,-64 , 7/* "RETURN" */,-64 , 34/* "(" */,-64 , 8/* "NewToken" */,-64 , 9/* "ClassToken" */,-64 , 40/* "FunctionName" */,-64 , 41/* "FunctionInvoke" */,-64 , 43/* "String" */,-64 , 44/* "Integer" */,-64 , 45/* "Float" */,-64 , 35/* ")" */,-64 , 19/* "," */,-64 , 17/* "]" */,-64 ),
    /* State 25 */ new Array( 18/* ";" */,-52 , 22/* "==" */,-52 , 29/* "<" */,-52 , 28/* ">" */,-52 , 26/* "<=" */,-52 , 27/* ">=" */,-52 , 23/* "!=" */,-52 , 20/* "." */,-52 , 36/* "->" */,-52 , 2/* "IF" */,-52 , 4/* "WHILE" */,-52 , 5/* "DO" */,-52 , 6/* "ECHO" */,-52 , 39/* "Variable" */,-52 , 14/* "{" */,-52 , 48/* "InternalNonScript" */,-52 , 38/* "//" */,-52 , 7/* "RETURN" */,-52 , 34/* "(" */,-52 , 8/* "NewToken" */,-52 , 9/* "ClassToken" */,-52 , 40/* "FunctionName" */,-52 , 41/* "FunctionInvoke" */,-52 , 31/* "-" */,-52 , 43/* "String" */,-52 , 44/* "Integer" */,-52 , 45/* "Float" */,-52 , 35/* ")" */,-52 , 19/* "," */,-52 , 17/* "]" */,-52 ),
    /* State 26 */ new Array( 18/* ";" */,-53 , 22/* "==" */,-53 , 29/* "<" */,-53 , 28/* ">" */,-53 , 26/* "<=" */,-53 , 27/* ">=" */,-53 , 23/* "!=" */,-53 , 20/* "." */,-53 , 36/* "->" */,-53 , 2/* "IF" */,-53 , 4/* "WHILE" */,-53 , 5/* "DO" */,-53 , 6/* "ECHO" */,-53 , 39/* "Variable" */,-53 , 14/* "{" */,-53 , 48/* "InternalNonScript" */,-53 , 38/* "//" */,-53 , 7/* "RETURN" */,-53 , 34/* "(" */,-53 , 8/* "NewToken" */,-53 , 9/* "ClassToken" */,-53 , 40/* "FunctionName" */,-53 , 41/* "FunctionInvoke" */,-53 , 31/* "-" */,-53 , 43/* "String" */,-53 , 44/* "Integer" */,-53 , 45/* "Float" */,-53 , 35/* ")" */,-53 , 19/* "," */,-53 , 17/* "]" */,-53 ),
    /* State 27 */ new Array( 32/* "/" */,65 , 33/* "*" */,66 , 18/* ";" */,-67 , 31/* "-" */,-67 , 30/* "+" */,-67 , 22/* "==" */,-67 , 29/* "<" */,-67 , 28/* ">" */,-67 , 26/* "<=" */,-67 , 27/* ">=" */,-67 , 23/* "!=" */,-67 , 20/* "." */,-67 , 36/* "->" */,-67 , 2/* "IF" */,-67 , 4/* "WHILE" */,-67 , 5/* "DO" */,-67 , 6/* "ECHO" */,-67 , 39/* "Variable" */,-67 , 14/* "{" */,-67 , 48/* "InternalNonScript" */,-67 , 38/* "//" */,-67 , 7/* "RETURN" */,-67 , 34/* "(" */,-67 , 8/* "NewToken" */,-67 , 9/* "ClassToken" */,-67 , 40/* "FunctionName" */,-67 , 41/* "FunctionInvoke" */,-67 , 43/* "String" */,-67 , 44/* "Integer" */,-67 , 45/* "Float" */,-67 , 35/* ")" */,-67 , 19/* "," */,-67 , 17/* "]" */,-67 ),
    /* State 28 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 35/* ")" */,-49 , 19/* "," */,-49 ),
    /* State 29 */ new Array( 36/* "->" */,69 ),
    /* State 30 */ new Array( 18/* ";" */,-70 , 31/* "-" */,-70 , 30/* "+" */,-70 , 33/* "*" */,-70 , 32/* "/" */,-70 , 22/* "==" */,-70 , 29/* "<" */,-70 , 28/* ">" */,-70 , 26/* "<=" */,-70 , 27/* ">=" */,-70 , 23/* "!=" */,-70 , 20/* "." */,-70 , 36/* "->" */,-70 , 2/* "IF" */,-70 , 4/* "WHILE" */,-70 , 5/* "DO" */,-70 , 6/* "ECHO" */,-70 , 39/* "Variable" */,-70 , 14/* "{" */,-70 , 48/* "InternalNonScript" */,-70 , 38/* "//" */,-70 , 7/* "RETURN" */,-70 , 34/* "(" */,-70 , 8/* "NewToken" */,-70 , 9/* "ClassToken" */,-70 , 40/* "FunctionName" */,-70 , 41/* "FunctionInvoke" */,-70 , 43/* "String" */,-70 , 44/* "Integer" */,-70 , 45/* "Float" */,-70 , 35/* ")" */,-70 , 19/* "," */,-70 , 17/* "]" */,-70 ),
    /* State 31 */ new Array( 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 32 */ new Array( 18/* ";" */,-72 , 31/* "-" */,-72 , 30/* "+" */,-72 , 33/* "*" */,-72 , 32/* "/" */,-72 , 22/* "==" */,-72 , 29/* "<" */,-72 , 28/* ">" */,-72 , 26/* "<=" */,-72 , 27/* ">=" */,-72 , 23/* "!=" */,-72 , 20/* "." */,-72 , 36/* "->" */,-72 , 2/* "IF" */,-72 , 4/* "WHILE" */,-72 , 5/* "DO" */,-72 , 6/* "ECHO" */,-72 , 39/* "Variable" */,-72 , 14/* "{" */,-72 , 48/* "InternalNonScript" */,-72 , 38/* "//" */,-72 , 7/* "RETURN" */,-72 , 34/* "(" */,-72 , 8/* "NewToken" */,-72 , 9/* "ClassToken" */,-72 , 40/* "FunctionName" */,-72 , 41/* "FunctionInvoke" */,-72 , 43/* "String" */,-72 , 44/* "Integer" */,-72 , 45/* "Float" */,-72 , 35/* ")" */,-72 , 19/* "," */,-72 , 17/* "]" */,-72 ),
    /* State 33 */ new Array( 18/* ";" */,-75 , 31/* "-" */,-75 , 30/* "+" */,-75 , 33/* "*" */,-75 , 32/* "/" */,-75 , 22/* "==" */,-75 , 29/* "<" */,-75 , 28/* ">" */,-75 , 26/* "<=" */,-75 , 27/* ">=" */,-75 , 23/* "!=" */,-75 , 20/* "." */,-75 , 36/* "->" */,-75 , 2/* "IF" */,-75 , 4/* "WHILE" */,-75 , 5/* "DO" */,-75 , 6/* "ECHO" */,-75 , 39/* "Variable" */,-75 , 14/* "{" */,-75 , 48/* "InternalNonScript" */,-75 , 38/* "//" */,-75 , 7/* "RETURN" */,-75 , 34/* "(" */,-75 , 8/* "NewToken" */,-75 , 9/* "ClassToken" */,-75 , 40/* "FunctionName" */,-75 , 41/* "FunctionInvoke" */,-75 , 43/* "String" */,-75 , 44/* "Integer" */,-75 , 45/* "Float" */,-75 , 35/* ")" */,-75 , 19/* "," */,-75 , 17/* "]" */,-75 ),
    /* State 34 */ new Array( 18/* ";" */,-76 , 31/* "-" */,-76 , 30/* "+" */,-76 , 33/* "*" */,-76 , 32/* "/" */,-76 , 22/* "==" */,-76 , 29/* "<" */,-76 , 28/* ">" */,-76 , 26/* "<=" */,-76 , 27/* ">=" */,-76 , 23/* "!=" */,-76 , 20/* "." */,-76 , 36/* "->" */,-76 , 2/* "IF" */,-76 , 4/* "WHILE" */,-76 , 5/* "DO" */,-76 , 6/* "ECHO" */,-76 , 39/* "Variable" */,-76 , 14/* "{" */,-76 , 48/* "InternalNonScript" */,-76 , 38/* "//" */,-76 , 7/* "RETURN" */,-76 , 34/* "(" */,-76 , 8/* "NewToken" */,-76 , 9/* "ClassToken" */,-76 , 40/* "FunctionName" */,-76 , 41/* "FunctionInvoke" */,-76 , 43/* "String" */,-76 , 44/* "Integer" */,-76 , 45/* "Float" */,-76 , 35/* ")" */,-76 , 19/* "," */,-76 , 17/* "]" */,-76 ),
    /* State 35 */ new Array( 18/* ";" */,-77 , 31/* "-" */,-77 , 30/* "+" */,-77 , 33/* "*" */,-77 , 32/* "/" */,-77 , 22/* "==" */,-77 , 29/* "<" */,-77 , 28/* ">" */,-77 , 26/* "<=" */,-77 , 27/* ">=" */,-77 , 23/* "!=" */,-77 , 20/* "." */,-77 , 36/* "->" */,-77 , 2/* "IF" */,-77 , 4/* "WHILE" */,-77 , 5/* "DO" */,-77 , 6/* "ECHO" */,-77 , 39/* "Variable" */,-77 , 14/* "{" */,-77 , 48/* "InternalNonScript" */,-77 , 38/* "//" */,-77 , 7/* "RETURN" */,-77 , 34/* "(" */,-77 , 8/* "NewToken" */,-77 , 9/* "ClassToken" */,-77 , 40/* "FunctionName" */,-77 , 41/* "FunctionInvoke" */,-77 , 43/* "String" */,-77 , 44/* "Integer" */,-77 , 45/* "Float" */,-77 , 35/* ")" */,-77 , 19/* "," */,-77 , 17/* "]" */,-77 ),
    /* State 36 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 47/* "ScriptEnd" */,-19 , 15/* "}" */,-19 , 3/* "ELSE" */,-19 ),
    /* State 37 */ new Array( 74/* "$" */,-3 , 46/* "ScriptBegin" */,-3 ),
    /* State 38 */ new Array( 47/* "ScriptEnd" */,-20 , 2/* "IF" */,-20 , 4/* "WHILE" */,-20 , 5/* "DO" */,-20 , 6/* "ECHO" */,-20 , 39/* "Variable" */,-20 , 14/* "{" */,-20 , 48/* "InternalNonScript" */,-20 , 38/* "//" */,-20 , 7/* "RETURN" */,-20 , 34/* "(" */,-20 , 8/* "NewToken" */,-20 , 9/* "ClassToken" */,-20 , 40/* "FunctionName" */,-20 , 41/* "FunctionInvoke" */,-20 , 31/* "-" */,-20 , 43/* "String" */,-20 , 44/* "Integer" */,-20 , 45/* "Float" */,-20 , 15/* "}" */,-20 , 3/* "ELSE" */,-20 ),
    /* State 39 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 40 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 41 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 42 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 43 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 44 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 45 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 46 */ new Array( 47/* "ScriptEnd" */,-21 , 2/* "IF" */,-21 , 4/* "WHILE" */,-21 , 5/* "DO" */,-21 , 6/* "ECHO" */,-21 , 39/* "Variable" */,-21 , 14/* "{" */,-21 , 48/* "InternalNonScript" */,-21 , 38/* "//" */,-21 , 7/* "RETURN" */,-21 , 34/* "(" */,-21 , 8/* "NewToken" */,-21 , 9/* "ClassToken" */,-21 , 40/* "FunctionName" */,-21 , 41/* "FunctionInvoke" */,-21 , 31/* "-" */,-21 , 43/* "String" */,-21 , 44/* "Integer" */,-21 , 45/* "Float" */,-21 , 15/* "}" */,-21 , 3/* "ELSE" */,-21 ),
    /* State 47 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 36/* "->" */,-56 ),
    /* State 48 */ new Array( 16/* "[" */,54 , 2/* "IF" */,-73 , 4/* "WHILE" */,-73 , 5/* "DO" */,-73 , 6/* "ECHO" */,-73 , 39/* "Variable" */,-73 , 14/* "{" */,-73 , 48/* "InternalNonScript" */,-73 , 38/* "//" */,-73 , 7/* "RETURN" */,-73 , 34/* "(" */,-73 , 8/* "NewToken" */,-73 , 9/* "ClassToken" */,-73 , 40/* "FunctionName" */,-73 , 41/* "FunctionInvoke" */,-73 , 31/* "-" */,-73 , 43/* "String" */,-73 , 44/* "Integer" */,-73 , 45/* "Float" */,-73 , 30/* "+" */,-73 , 33/* "*" */,-73 , 32/* "/" */,-73 , 22/* "==" */,-73 , 29/* "<" */,-73 , 28/* ">" */,-73 , 26/* "<=" */,-73 , 27/* ">=" */,-73 , 23/* "!=" */,-73 , 20/* "." */,-73 , 36/* "->" */,-73 , 18/* ";" */,-73 , 35/* ")" */,-73 , 19/* "," */,-73 , 17/* "]" */,-73 ),
    /* State 49 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 5/* "DO" */,82 , 36/* "->" */,-56 ),
    /* State 50 */ new Array( 4/* "WHILE" */,83 , 2/* "IF" */,7 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 51 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 18/* ";" */,84 , 36/* "->" */,-56 ),
    /* State 52 */ new Array( 16/* "[" */,85 , 21/* "=" */,86 , 18/* ";" */,-46 , 22/* "==" */,-46 , 29/* "<" */,-46 , 28/* ">" */,-46 , 26/* "<=" */,-46 , 27/* ">=" */,-46 , 23/* "!=" */,-46 , 20/* "." */,-46 , 36/* "->" */,-46 ),
    /* State 53 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 54 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 55 */ new Array( 15/* "}" */,89 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 56 */ new Array( 47/* "ScriptEnd" */,-33 , 2/* "IF" */,-33 , 4/* "WHILE" */,-33 , 5/* "DO" */,-33 , 6/* "ECHO" */,-33 , 39/* "Variable" */,-33 , 14/* "{" */,-33 , 48/* "InternalNonScript" */,-33 , 38/* "//" */,-33 , 7/* "RETURN" */,-33 , 34/* "(" */,-33 , 8/* "NewToken" */,-33 , 9/* "ClassToken" */,-33 , 40/* "FunctionName" */,-33 , 41/* "FunctionInvoke" */,-33 , 31/* "-" */,-33 , 43/* "String" */,-33 , 44/* "Integer" */,-33 , 45/* "Float" */,-33 , 15/* "}" */,-33 , 3/* "ELSE" */,-33 ),
    /* State 57 */ new Array( 43/* "String" */,90 , 47/* "ScriptEnd" */,-35 , 2/* "IF" */,-35 , 4/* "WHILE" */,-35 , 5/* "DO" */,-35 , 6/* "ECHO" */,-35 , 39/* "Variable" */,-35 , 14/* "{" */,-35 , 48/* "InternalNonScript" */,-35 , 38/* "//" */,-35 , 7/* "RETURN" */,-35 , 34/* "(" */,-35 , 8/* "NewToken" */,-35 , 9/* "ClassToken" */,-35 , 40/* "FunctionName" */,-35 , 41/* "FunctionInvoke" */,-35 , 31/* "-" */,-35 , 44/* "Integer" */,-35 , 45/* "Float" */,-35 , 15/* "}" */,-35 , 3/* "ELSE" */,-35 ),
    /* State 58 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 18/* ";" */,-40 , 36/* "->" */,-56 ),
    /* State 59 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 35/* ")" */,91 , 36/* "->" */,-56 ),
    /* State 60 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 35/* ")" */,-49 , 19/* "," */,-49 ),
    /* State 61 */ new Array( 14/* "{" */,93 ),
    /* State 62 */ new Array( 39/* "Variable" */,95 , 35/* ")" */,-39 , 19/* "," */,-39 ),
    /* State 63 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 64 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 65 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 66 */ new Array( 31/* "-" */,31 , 39/* "Variable" */,71 , 34/* "(" */,72 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 67 */ new Array( 19/* "," */,100 , 35/* ")" */,101 ),
    /* State 68 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 35/* ")" */,-48 , 19/* "," */,-48 , 36/* "->" */,-56 ),
    /* State 69 */ new Array( 41/* "FunctionInvoke" */,102 ),
    /* State 70 */ new Array( 18/* ";" */,-71 , 31/* "-" */,-71 , 30/* "+" */,-71 , 33/* "*" */,-71 , 32/* "/" */,-71 , 22/* "==" */,-71 , 29/* "<" */,-71 , 28/* ">" */,-71 , 26/* "<=" */,-71 , 27/* ">=" */,-71 , 23/* "!=" */,-71 , 20/* "." */,-71 , 36/* "->" */,-71 , 2/* "IF" */,-71 , 4/* "WHILE" */,-71 , 5/* "DO" */,-71 , 6/* "ECHO" */,-71 , 39/* "Variable" */,-71 , 14/* "{" */,-71 , 48/* "InternalNonScript" */,-71 , 38/* "//" */,-71 , 7/* "RETURN" */,-71 , 34/* "(" */,-71 , 8/* "NewToken" */,-71 , 9/* "ClassToken" */,-71 , 40/* "FunctionName" */,-71 , 41/* "FunctionInvoke" */,-71 , 43/* "String" */,-71 , 44/* "Integer" */,-71 , 45/* "Float" */,-71 , 35/* ")" */,-71 , 19/* "," */,-71 , 17/* "]" */,-71 ),
    /* State 71 */ new Array( 18/* ";" */,-73 , 31/* "-" */,-73 , 30/* "+" */,-73 , 33/* "*" */,-73 , 32/* "/" */,-73 , 22/* "==" */,-73 , 29/* "<" */,-73 , 28/* ">" */,-73 , 26/* "<=" */,-73 , 27/* ">=" */,-73 , 23/* "!=" */,-73 , 20/* "." */,-73 , 36/* "->" */,-73 , 2/* "IF" */,-73 , 4/* "WHILE" */,-73 , 5/* "DO" */,-73 , 6/* "ECHO" */,-73 , 39/* "Variable" */,-73 , 14/* "{" */,-73 , 48/* "InternalNonScript" */,-73 , 38/* "//" */,-73 , 7/* "RETURN" */,-73 , 34/* "(" */,-73 , 8/* "NewToken" */,-73 , 9/* "ClassToken" */,-73 , 40/* "FunctionName" */,-73 , 41/* "FunctionInvoke" */,-73 , 43/* "String" */,-73 , 44/* "Integer" */,-73 , 45/* "Float" */,-73 , 35/* ")" */,-73 , 19/* "," */,-73 , 17/* "]" */,-73 ),
    /* State 72 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 73 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 18/* ";" */,-63 , 36/* "->" */,-56 , 2/* "IF" */,-63 , 4/* "WHILE" */,-63 , 5/* "DO" */,-63 , 6/* "ECHO" */,-63 , 39/* "Variable" */,-63 , 14/* "{" */,-63 , 48/* "InternalNonScript" */,-63 , 38/* "//" */,-63 , 7/* "RETURN" */,-63 , 34/* "(" */,-63 , 8/* "NewToken" */,-63 , 9/* "ClassToken" */,-63 , 40/* "FunctionName" */,-63 , 41/* "FunctionInvoke" */,-63 , 31/* "-" */,-63 , 43/* "String" */,-63 , 44/* "Integer" */,-63 , 45/* "Float" */,-63 , 35/* ")" */,-63 , 19/* "," */,-63 , 17/* "]" */,-63 ),
    /* State 74 */ new Array( 30/* "+" */,63 , 31/* "-" */,64 , 18/* ";" */,-62 , 22/* "==" */,-62 , 29/* "<" */,-62 , 28/* ">" */,-62 , 26/* "<=" */,-62 , 27/* ">=" */,-62 , 23/* "!=" */,-62 , 20/* "." */,-62 , 36/* "->" */,-62 , 2/* "IF" */,-62 , 4/* "WHILE" */,-62 , 5/* "DO" */,-62 , 6/* "ECHO" */,-62 , 39/* "Variable" */,-62 , 14/* "{" */,-62 , 48/* "InternalNonScript" */,-62 , 38/* "//" */,-62 , 7/* "RETURN" */,-62 , 34/* "(" */,-62 , 8/* "NewToken" */,-62 , 9/* "ClassToken" */,-62 , 40/* "FunctionName" */,-62 , 41/* "FunctionInvoke" */,-62 , 43/* "String" */,-62 , 44/* "Integer" */,-62 , 45/* "Float" */,-62 , 35/* ")" */,-62 , 19/* "," */,-62 , 17/* "]" */,-62 ),
    /* State 75 */ new Array( 30/* "+" */,63 , 31/* "-" */,64 , 18/* ";" */,-61 , 22/* "==" */,-61 , 29/* "<" */,-61 , 28/* ">" */,-61 , 26/* "<=" */,-61 , 27/* ">=" */,-61 , 23/* "!=" */,-61 , 20/* "." */,-61 , 36/* "->" */,-61 , 2/* "IF" */,-61 , 4/* "WHILE" */,-61 , 5/* "DO" */,-61 , 6/* "ECHO" */,-61 , 39/* "Variable" */,-61 , 14/* "{" */,-61 , 48/* "InternalNonScript" */,-61 , 38/* "//" */,-61 , 7/* "RETURN" */,-61 , 34/* "(" */,-61 , 8/* "NewToken" */,-61 , 9/* "ClassToken" */,-61 , 40/* "FunctionName" */,-61 , 41/* "FunctionInvoke" */,-61 , 43/* "String" */,-61 , 44/* "Integer" */,-61 , 45/* "Float" */,-61 , 35/* ")" */,-61 , 19/* "," */,-61 , 17/* "]" */,-61 ),
    /* State 76 */ new Array( 30/* "+" */,63 , 31/* "-" */,64 , 18/* ";" */,-60 , 22/* "==" */,-60 , 29/* "<" */,-60 , 28/* ">" */,-60 , 26/* "<=" */,-60 , 27/* ">=" */,-60 , 23/* "!=" */,-60 , 20/* "." */,-60 , 36/* "->" */,-60 , 2/* "IF" */,-60 , 4/* "WHILE" */,-60 , 5/* "DO" */,-60 , 6/* "ECHO" */,-60 , 39/* "Variable" */,-60 , 14/* "{" */,-60 , 48/* "InternalNonScript" */,-60 , 38/* "//" */,-60 , 7/* "RETURN" */,-60 , 34/* "(" */,-60 , 8/* "NewToken" */,-60 , 9/* "ClassToken" */,-60 , 40/* "FunctionName" */,-60 , 41/* "FunctionInvoke" */,-60 , 43/* "String" */,-60 , 44/* "Integer" */,-60 , 45/* "Float" */,-60 , 35/* ")" */,-60 , 19/* "," */,-60 , 17/* "]" */,-60 ),
    /* State 77 */ new Array( 30/* "+" */,63 , 31/* "-" */,64 , 18/* ";" */,-59 , 22/* "==" */,-59 , 29/* "<" */,-59 , 28/* ">" */,-59 , 26/* "<=" */,-59 , 27/* ">=" */,-59 , 23/* "!=" */,-59 , 20/* "." */,-59 , 36/* "->" */,-59 , 2/* "IF" */,-59 , 4/* "WHILE" */,-59 , 5/* "DO" */,-59 , 6/* "ECHO" */,-59 , 39/* "Variable" */,-59 , 14/* "{" */,-59 , 48/* "InternalNonScript" */,-59 , 38/* "//" */,-59 , 7/* "RETURN" */,-59 , 34/* "(" */,-59 , 8/* "NewToken" */,-59 , 9/* "ClassToken" */,-59 , 40/* "FunctionName" */,-59 , 41/* "FunctionInvoke" */,-59 , 43/* "String" */,-59 , 44/* "Integer" */,-59 , 45/* "Float" */,-59 , 35/* ")" */,-59 , 19/* "," */,-59 , 17/* "]" */,-59 ),
    /* State 78 */ new Array( 30/* "+" */,63 , 31/* "-" */,64 , 18/* ";" */,-58 , 22/* "==" */,-58 , 29/* "<" */,-58 , 28/* ">" */,-58 , 26/* "<=" */,-58 , 27/* ">=" */,-58 , 23/* "!=" */,-58 , 20/* "." */,-58 , 36/* "->" */,-58 , 2/* "IF" */,-58 , 4/* "WHILE" */,-58 , 5/* "DO" */,-58 , 6/* "ECHO" */,-58 , 39/* "Variable" */,-58 , 14/* "{" */,-58 , 48/* "InternalNonScript" */,-58 , 38/* "//" */,-58 , 7/* "RETURN" */,-58 , 34/* "(" */,-58 , 8/* "NewToken" */,-58 , 9/* "ClassToken" */,-58 , 40/* "FunctionName" */,-58 , 41/* "FunctionInvoke" */,-58 , 43/* "String" */,-58 , 44/* "Integer" */,-58 , 45/* "Float" */,-58 , 35/* ")" */,-58 , 19/* "," */,-58 , 17/* "]" */,-58 ),
    /* State 79 */ new Array( 30/* "+" */,63 , 31/* "-" */,64 , 18/* ";" */,-57 , 22/* "==" */,-57 , 29/* "<" */,-57 , 28/* ">" */,-57 , 26/* "<=" */,-57 , 27/* ">=" */,-57 , 23/* "!=" */,-57 , 20/* "." */,-57 , 36/* "->" */,-57 , 2/* "IF" */,-57 , 4/* "WHILE" */,-57 , 5/* "DO" */,-57 , 6/* "ECHO" */,-57 , 39/* "Variable" */,-57 , 14/* "{" */,-57 , 48/* "InternalNonScript" */,-57 , 38/* "//" */,-57 , 7/* "RETURN" */,-57 , 34/* "(" */,-57 , 8/* "NewToken" */,-57 , 9/* "ClassToken" */,-57 , 40/* "FunctionName" */,-57 , 41/* "FunctionInvoke" */,-57 , 43/* "String" */,-57 , 44/* "Integer" */,-57 , 45/* "Float" */,-57 , 35/* ")" */,-57 , 19/* "," */,-57 , 17/* "]" */,-57 ),
    /* State 80 */ new Array( 3/* "ELSE" */,104 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 47/* "ScriptEnd" */,-22 , 15/* "}" */,-22 ),
    /* State 81 */ new Array( 16/* "[" */,85 , 2/* "IF" */,-46 , 4/* "WHILE" */,-46 , 5/* "DO" */,-46 , 6/* "ECHO" */,-46 , 39/* "Variable" */,-46 , 14/* "{" */,-46 , 48/* "InternalNonScript" */,-46 , 38/* "//" */,-46 , 7/* "RETURN" */,-46 , 34/* "(" */,-46 , 8/* "NewToken" */,-46 , 9/* "ClassToken" */,-46 , 40/* "FunctionName" */,-46 , 41/* "FunctionInvoke" */,-46 , 31/* "-" */,-46 , 43/* "String" */,-46 , 44/* "Integer" */,-46 , 45/* "Float" */,-46 , 22/* "==" */,-46 , 29/* "<" */,-46 , 28/* ">" */,-46 , 26/* "<=" */,-46 , 27/* ">=" */,-46 , 23/* "!=" */,-46 , 20/* "." */,-46 , 36/* "->" */,-46 , 18/* ";" */,-46 , 35/* ")" */,-46 , 19/* "," */,-46 , 17/* "]" */,-46 ),
    /* State 82 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 83 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 84 */ new Array( 47/* "ScriptEnd" */,-26 , 2/* "IF" */,-26 , 4/* "WHILE" */,-26 , 5/* "DO" */,-26 , 6/* "ECHO" */,-26 , 39/* "Variable" */,-26 , 14/* "{" */,-26 , 48/* "InternalNonScript" */,-26 , 38/* "//" */,-26 , 7/* "RETURN" */,-26 , 34/* "(" */,-26 , 8/* "NewToken" */,-26 , 9/* "ClassToken" */,-26 , 40/* "FunctionName" */,-26 , 41/* "FunctionInvoke" */,-26 , 31/* "-" */,-26 , 43/* "String" */,-26 , 44/* "Integer" */,-26 , 45/* "Float" */,-26 , 15/* "}" */,-26 , 3/* "ELSE" */,-26 ),
    /* State 85 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 86 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 87 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 18/* ";" */,109 , 36/* "->" */,-56 ),
    /* State 88 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 17/* "]" */,110 , 36/* "->" */,-56 ),
    /* State 89 */ new Array( 47/* "ScriptEnd" */,-31 , 2/* "IF" */,-31 , 4/* "WHILE" */,-31 , 5/* "DO" */,-31 , 6/* "ECHO" */,-31 , 39/* "Variable" */,-31 , 14/* "{" */,-31 , 48/* "InternalNonScript" */,-31 , 38/* "//" */,-31 , 7/* "RETURN" */,-31 , 34/* "(" */,-31 , 8/* "NewToken" */,-31 , 9/* "ClassToken" */,-31 , 40/* "FunctionName" */,-31 , 41/* "FunctionInvoke" */,-31 , 31/* "-" */,-31 , 43/* "String" */,-31 , 44/* "Integer" */,-31 , 45/* "Float" */,-31 , 15/* "}" */,-31 , 3/* "ELSE" */,-31 ),
    /* State 90 */ new Array( 47/* "ScriptEnd" */,-34 , 2/* "IF" */,-34 , 4/* "WHILE" */,-34 , 5/* "DO" */,-34 , 6/* "ECHO" */,-34 , 39/* "Variable" */,-34 , 14/* "{" */,-34 , 48/* "InternalNonScript" */,-34 , 38/* "//" */,-34 , 7/* "RETURN" */,-34 , 34/* "(" */,-34 , 8/* "NewToken" */,-34 , 9/* "ClassToken" */,-34 , 40/* "FunctionName" */,-34 , 41/* "FunctionInvoke" */,-34 , 31/* "-" */,-34 , 43/* "String" */,-34 , 44/* "Integer" */,-34 , 45/* "Float" */,-34 , 15/* "}" */,-34 , 3/* "ELSE" */,-34 ),
    /* State 91 */ new Array( 18/* ";" */,-42 , 22/* "==" */,-42 , 29/* "<" */,-42 , 28/* ">" */,-42 , 26/* "<=" */,-42 , 27/* ">=" */,-42 , 23/* "!=" */,-42 , 20/* "." */,-42 , 36/* "->" */,-42 , 2/* "IF" */,-42 , 4/* "WHILE" */,-42 , 5/* "DO" */,-42 , 6/* "ECHO" */,-42 , 39/* "Variable" */,-42 , 14/* "{" */,-42 , 48/* "InternalNonScript" */,-42 , 38/* "//" */,-42 , 7/* "RETURN" */,-42 , 34/* "(" */,-42 , 8/* "NewToken" */,-42 , 9/* "ClassToken" */,-42 , 40/* "FunctionName" */,-42 , 41/* "FunctionInvoke" */,-42 , 31/* "-" */,-42 , 43/* "String" */,-42 , 44/* "Integer" */,-42 , 45/* "Float" */,-42 , 35/* ")" */,-42 , 19/* "," */,-42 , 17/* "]" */,-42 , 30/* "+" */,-74 , 33/* "*" */,-74 , 32/* "/" */,-74 ),
    /* State 92 */ new Array( 19/* "," */,100 , 35/* ")" */,111 ),
    /* State 93 */ new Array( 15/* "}" */,-7 , 10/* "PublicToken" */,-7 , 11/* "VarToken" */,-7 , 13/* "ProtectedToken" */,-7 , 12/* "PrivateToken" */,-7 , 40/* "FunctionName" */,-7 ),
    /* State 94 */ new Array( 19/* "," */,113 , 35/* ")" */,114 ),
    /* State 95 */ new Array( 35/* ")" */,-38 , 19/* "," */,-38 ),
    /* State 96 */ new Array( 32/* "/" */,65 , 33/* "*" */,66 , 18/* ";" */,-66 , 31/* "-" */,-66 , 30/* "+" */,-66 , 22/* "==" */,-66 , 29/* "<" */,-66 , 28/* ">" */,-66 , 26/* "<=" */,-66 , 27/* ">=" */,-66 , 23/* "!=" */,-66 , 20/* "." */,-66 , 36/* "->" */,-66 , 2/* "IF" */,-66 , 4/* "WHILE" */,-66 , 5/* "DO" */,-66 , 6/* "ECHO" */,-66 , 39/* "Variable" */,-66 , 14/* "{" */,-66 , 48/* "InternalNonScript" */,-66 , 38/* "//" */,-66 , 7/* "RETURN" */,-66 , 34/* "(" */,-66 , 8/* "NewToken" */,-66 , 9/* "ClassToken" */,-66 , 40/* "FunctionName" */,-66 , 41/* "FunctionInvoke" */,-66 , 43/* "String" */,-66 , 44/* "Integer" */,-66 , 45/* "Float" */,-66 , 35/* ")" */,-66 , 19/* "," */,-66 , 17/* "]" */,-66 ),
    /* State 97 */ new Array( 32/* "/" */,65 , 33/* "*" */,66 , 18/* ";" */,-65 , 31/* "-" */,-65 , 30/* "+" */,-65 , 22/* "==" */,-65 , 29/* "<" */,-65 , 28/* ">" */,-65 , 26/* "<=" */,-65 , 27/* ">=" */,-65 , 23/* "!=" */,-65 , 20/* "." */,-65 , 36/* "->" */,-65 , 2/* "IF" */,-65 , 4/* "WHILE" */,-65 , 5/* "DO" */,-65 , 6/* "ECHO" */,-65 , 39/* "Variable" */,-65 , 14/* "{" */,-65 , 48/* "InternalNonScript" */,-65 , 38/* "//" */,-65 , 7/* "RETURN" */,-65 , 34/* "(" */,-65 , 8/* "NewToken" */,-65 , 9/* "ClassToken" */,-65 , 40/* "FunctionName" */,-65 , 41/* "FunctionInvoke" */,-65 , 43/* "String" */,-65 , 44/* "Integer" */,-65 , 45/* "Float" */,-65 , 35/* ")" */,-65 , 19/* "," */,-65 , 17/* "]" */,-65 ),
    /* State 98 */ new Array( 18/* ";" */,-69 , 31/* "-" */,-69 , 30/* "+" */,-69 , 33/* "*" */,-69 , 32/* "/" */,-69 , 22/* "==" */,-69 , 29/* "<" */,-69 , 28/* ">" */,-69 , 26/* "<=" */,-69 , 27/* ">=" */,-69 , 23/* "!=" */,-69 , 20/* "." */,-69 , 36/* "->" */,-69 , 2/* "IF" */,-69 , 4/* "WHILE" */,-69 , 5/* "DO" */,-69 , 6/* "ECHO" */,-69 , 39/* "Variable" */,-69 , 14/* "{" */,-69 , 48/* "InternalNonScript" */,-69 , 38/* "//" */,-69 , 7/* "RETURN" */,-69 , 34/* "(" */,-69 , 8/* "NewToken" */,-69 , 9/* "ClassToken" */,-69 , 40/* "FunctionName" */,-69 , 41/* "FunctionInvoke" */,-69 , 43/* "String" */,-69 , 44/* "Integer" */,-69 , 45/* "Float" */,-69 , 35/* ")" */,-69 , 19/* "," */,-69 , 17/* "]" */,-69 ),
    /* State 99 */ new Array( 18/* ";" */,-68 , 31/* "-" */,-68 , 30/* "+" */,-68 , 33/* "*" */,-68 , 32/* "/" */,-68 , 22/* "==" */,-68 , 29/* "<" */,-68 , 28/* ">" */,-68 , 26/* "<=" */,-68 , 27/* ">=" */,-68 , 23/* "!=" */,-68 , 20/* "." */,-68 , 36/* "->" */,-68 , 2/* "IF" */,-68 , 4/* "WHILE" */,-68 , 5/* "DO" */,-68 , 6/* "ECHO" */,-68 , 39/* "Variable" */,-68 , 14/* "{" */,-68 , 48/* "InternalNonScript" */,-68 , 38/* "//" */,-68 , 7/* "RETURN" */,-68 , 34/* "(" */,-68 , 8/* "NewToken" */,-68 , 9/* "ClassToken" */,-68 , 40/* "FunctionName" */,-68 , 41/* "FunctionInvoke" */,-68 , 43/* "String" */,-68 , 44/* "Integer" */,-68 , 45/* "Float" */,-68 , 35/* ")" */,-68 , 19/* "," */,-68 , 17/* "]" */,-68 ),
    /* State 100 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 101 */ new Array( 18/* ";" */,-54 , 22/* "==" */,-54 , 29/* "<" */,-54 , 28/* ">" */,-54 , 26/* "<=" */,-54 , 27/* ">=" */,-54 , 23/* "!=" */,-54 , 20/* "." */,-54 , 36/* "->" */,-54 , 2/* "IF" */,-54 , 4/* "WHILE" */,-54 , 5/* "DO" */,-54 , 6/* "ECHO" */,-54 , 39/* "Variable" */,-54 , 14/* "{" */,-54 , 48/* "InternalNonScript" */,-54 , 38/* "//" */,-54 , 7/* "RETURN" */,-54 , 34/* "(" */,-54 , 8/* "NewToken" */,-54 , 9/* "ClassToken" */,-54 , 40/* "FunctionName" */,-54 , 41/* "FunctionInvoke" */,-54 , 31/* "-" */,-54 , 43/* "String" */,-54 , 44/* "Integer" */,-54 , 45/* "Float" */,-54 , 35/* ")" */,-54 , 19/* "," */,-54 , 17/* "]" */,-54 ),
    /* State 102 */ new Array( 34/* "(" */,18 , 8/* "NewToken" */,21 , 39/* "Variable" */,48 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 35/* ")" */,-49 , 19/* "," */,-49 ),
    /* State 103 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 35/* ")" */,117 , 36/* "->" */,-56 ),
    /* State 104 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 105 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 47/* "ScriptEnd" */,-24 , 15/* "}" */,-24 , 3/* "ELSE" */,-24 ),
    /* State 106 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 18/* ";" */,119 , 5/* "DO" */,82 , 36/* "->" */,-56 ),
    /* State 107 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 17/* "]" */,120 , 36/* "->" */,-56 ),
    /* State 108 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 18/* ";" */,121 , 36/* "->" */,-56 ),
    /* State 109 */ new Array( 47/* "ScriptEnd" */,-27 , 2/* "IF" */,-27 , 4/* "WHILE" */,-27 , 5/* "DO" */,-27 , 6/* "ECHO" */,-27 , 39/* "Variable" */,-27 , 14/* "{" */,-27 , 48/* "InternalNonScript" */,-27 , 38/* "//" */,-27 , 7/* "RETURN" */,-27 , 34/* "(" */,-27 , 8/* "NewToken" */,-27 , 9/* "ClassToken" */,-27 , 40/* "FunctionName" */,-27 , 41/* "FunctionInvoke" */,-27 , 31/* "-" */,-27 , 43/* "String" */,-27 , 44/* "Integer" */,-27 , 45/* "Float" */,-27 , 15/* "}" */,-27 , 3/* "ELSE" */,-27 ),
    /* State 110 */ new Array( 21/* "=" */,-51 , 18/* ";" */,-51 , 22/* "==" */,-51 , 29/* "<" */,-51 , 28/* ">" */,-51 , 26/* "<=" */,-51 , 27/* ">=" */,-51 , 23/* "!=" */,-51 , 20/* "." */,-51 , 36/* "->" */,-51 , 16/* "[" */,-51 , 2/* "IF" */,-51 , 4/* "WHILE" */,-51 , 5/* "DO" */,-51 , 6/* "ECHO" */,-51 , 39/* "Variable" */,-51 , 14/* "{" */,-51 , 48/* "InternalNonScript" */,-51 , 38/* "//" */,-51 , 7/* "RETURN" */,-51 , 34/* "(" */,-51 , 8/* "NewToken" */,-51 , 9/* "ClassToken" */,-51 , 40/* "FunctionName" */,-51 , 41/* "FunctionInvoke" */,-51 , 31/* "-" */,-51 , 43/* "String" */,-51 , 44/* "Integer" */,-51 , 45/* "Float" */,-51 , 35/* ")" */,-51 , 19/* "," */,-51 , 17/* "]" */,-51 ),
    /* State 111 */ new Array( 18/* ";" */,-45 , 22/* "==" */,-45 , 29/* "<" */,-45 , 28/* ">" */,-45 , 26/* "<=" */,-45 , 27/* ">=" */,-45 , 23/* "!=" */,-45 , 20/* "." */,-45 , 36/* "->" */,-45 , 2/* "IF" */,-45 , 4/* "WHILE" */,-45 , 5/* "DO" */,-45 , 6/* "ECHO" */,-45 , 39/* "Variable" */,-45 , 14/* "{" */,-45 , 48/* "InternalNonScript" */,-45 , 38/* "//" */,-45 , 7/* "RETURN" */,-45 , 34/* "(" */,-45 , 8/* "NewToken" */,-45 , 9/* "ClassToken" */,-45 , 40/* "FunctionName" */,-45 , 41/* "FunctionInvoke" */,-45 , 31/* "-" */,-45 , 43/* "String" */,-45 , 44/* "Integer" */,-45 , 45/* "Float" */,-45 , 35/* ")" */,-45 , 19/* "," */,-45 , 17/* "]" */,-45 ),
    /* State 112 */ new Array( 15/* "}" */,124 , 10/* "PublicToken" */,127 , 11/* "VarToken" */,128 , 13/* "ProtectedToken" */,129 , 12/* "PrivateToken" */,130 , 40/* "FunctionName" */,-13 ),
    /* State 113 */ new Array( 39/* "Variable" */,131 ),
    /* State 114 */ new Array( 14/* "{" */,132 ),
    /* State 115 */ new Array( 20/* "." */,39 , 23/* "!=" */,40 , 27/* ">=" */,41 , 26/* "<=" */,42 , 28/* ">" */,43 , 29/* "<" */,44 , 22/* "==" */,45 , 35/* ")" */,-47 , 19/* "," */,-47 , 36/* "->" */,-56 ),
    /* State 116 */ new Array( 19/* "," */,100 , 35/* ")" */,133 ),
    /* State 117 */ new Array( 18/* ";" */,-74 , 31/* "-" */,-74 , 30/* "+" */,-74 , 33/* "*" */,-74 , 32/* "/" */,-74 , 22/* "==" */,-74 , 29/* "<" */,-74 , 28/* ">" */,-74 , 26/* "<=" */,-74 , 27/* ">=" */,-74 , 23/* "!=" */,-74 , 20/* "." */,-74 , 36/* "->" */,-74 , 2/* "IF" */,-74 , 4/* "WHILE" */,-74 , 5/* "DO" */,-74 , 6/* "ECHO" */,-74 , 39/* "Variable" */,-74 , 14/* "{" */,-74 , 48/* "InternalNonScript" */,-74 , 38/* "//" */,-74 , 7/* "RETURN" */,-74 , 34/* "(" */,-74 , 8/* "NewToken" */,-74 , 9/* "ClassToken" */,-74 , 40/* "FunctionName" */,-74 , 41/* "FunctionInvoke" */,-74 , 43/* "String" */,-74 , 44/* "Integer" */,-74 , 45/* "Float" */,-74 , 35/* ")" */,-74 , 19/* "," */,-74 , 17/* "]" */,-74 ),
    /* State 118 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 , 47/* "ScriptEnd" */,-23 , 15/* "}" */,-23 , 3/* "ELSE" */,-23 ),
    /* State 119 */ new Array( 47/* "ScriptEnd" */,-25 , 2/* "IF" */,-25 , 4/* "WHILE" */,-25 , 5/* "DO" */,-25 , 6/* "ECHO" */,-25 , 39/* "Variable" */,-25 , 14/* "{" */,-25 , 48/* "InternalNonScript" */,-25 , 38/* "//" */,-25 , 7/* "RETURN" */,-25 , 34/* "(" */,-25 , 8/* "NewToken" */,-25 , 9/* "ClassToken" */,-25 , 40/* "FunctionName" */,-25 , 41/* "FunctionInvoke" */,-25 , 31/* "-" */,-25 , 43/* "String" */,-25 , 44/* "Integer" */,-25 , 45/* "Float" */,-25 , 15/* "}" */,-25 , 3/* "ELSE" */,-25 ),
    /* State 120 */ new Array( 21/* "=" */,-50 , 18/* ";" */,-50 , 22/* "==" */,-50 , 29/* "<" */,-50 , 28/* ">" */,-50 , 26/* "<=" */,-50 , 27/* ">=" */,-50 , 23/* "!=" */,-50 , 20/* "." */,-50 , 36/* "->" */,-50 , 16/* "[" */,-50 , 2/* "IF" */,-50 , 4/* "WHILE" */,-50 , 5/* "DO" */,-50 , 6/* "ECHO" */,-50 , 39/* "Variable" */,-50 , 14/* "{" */,-50 , 48/* "InternalNonScript" */,-50 , 38/* "//" */,-50 , 7/* "RETURN" */,-50 , 34/* "(" */,-50 , 8/* "NewToken" */,-50 , 9/* "ClassToken" */,-50 , 40/* "FunctionName" */,-50 , 41/* "FunctionInvoke" */,-50 , 31/* "-" */,-50 , 43/* "String" */,-50 , 44/* "Integer" */,-50 , 45/* "Float" */,-50 , 35/* ")" */,-50 , 19/* "," */,-50 , 17/* "]" */,-50 ),
    /* State 121 */ new Array( 47/* "ScriptEnd" */,-30 , 2/* "IF" */,-30 , 4/* "WHILE" */,-30 , 5/* "DO" */,-30 , 6/* "ECHO" */,-30 , 39/* "Variable" */,-30 , 14/* "{" */,-30 , 48/* "InternalNonScript" */,-30 , 38/* "//" */,-30 , 7/* "RETURN" */,-30 , 34/* "(" */,-30 , 8/* "NewToken" */,-30 , 9/* "ClassToken" */,-30 , 40/* "FunctionName" */,-30 , 41/* "FunctionInvoke" */,-30 , 31/* "-" */,-30 , 43/* "String" */,-30 , 44/* "Integer" */,-30 , 45/* "Float" */,-30 , 15/* "}" */,-30 , 3/* "ELSE" */,-30 ),
    /* State 122 */ new Array( 15/* "}" */,-6 , 10/* "PublicToken" */,-6 , 11/* "VarToken" */,-6 , 13/* "ProtectedToken" */,-6 , 12/* "PrivateToken" */,-6 , 40/* "FunctionName" */,-6 ),
    /* State 123 */ new Array( 15/* "}" */,-5 , 10/* "PublicToken" */,-5 , 11/* "VarToken" */,-5 , 13/* "ProtectedToken" */,-5 , 12/* "PrivateToken" */,-5 , 40/* "FunctionName" */,-5 ),
    /* State 124 */ new Array( 47/* "ScriptEnd" */,-4 , 2/* "IF" */,-4 , 4/* "WHILE" */,-4 , 5/* "DO" */,-4 , 6/* "ECHO" */,-4 , 39/* "Variable" */,-4 , 14/* "{" */,-4 , 48/* "InternalNonScript" */,-4 , 38/* "//" */,-4 , 7/* "RETURN" */,-4 , 34/* "(" */,-4 , 8/* "NewToken" */,-4 , 9/* "ClassToken" */,-4 , 40/* "FunctionName" */,-4 , 41/* "FunctionInvoke" */,-4 , 31/* "-" */,-4 , 43/* "String" */,-4 , 44/* "Integer" */,-4 , 45/* "Float" */,-4 , 15/* "}" */,-4 , 3/* "ELSE" */,-4 ),
    /* State 125 */ new Array( 39/* "Variable" */,134 ),
    /* State 126 */ new Array( 40/* "FunctionName" */,135 ),
    /* State 127 */ new Array( 39/* "Variable" */,-8 , 40/* "FunctionName" */,-12 ),
    /* State 128 */ new Array( 39/* "Variable" */,-9 ),
    /* State 129 */ new Array( 39/* "Variable" */,-10 , 40/* "FunctionName" */,-14 ),
    /* State 130 */ new Array( 39/* "Variable" */,-11 , 40/* "FunctionName" */,-15 ),
    /* State 131 */ new Array( 35/* ")" */,-37 , 19/* "," */,-37 ),
    /* State 132 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 133 */ new Array( 18/* ";" */,-55 , 22/* "==" */,-55 , 29/* "<" */,-55 , 28/* ">" */,-55 , 26/* "<=" */,-55 , 27/* ">=" */,-55 , 23/* "!=" */,-55 , 20/* "." */,-55 , 36/* "->" */,-55 , 2/* "IF" */,-55 , 4/* "WHILE" */,-55 , 5/* "DO" */,-55 , 6/* "ECHO" */,-55 , 39/* "Variable" */,-55 , 14/* "{" */,-55 , 48/* "InternalNonScript" */,-55 , 38/* "//" */,-55 , 7/* "RETURN" */,-55 , 34/* "(" */,-55 , 8/* "NewToken" */,-55 , 9/* "ClassToken" */,-55 , 40/* "FunctionName" */,-55 , 41/* "FunctionInvoke" */,-55 , 31/* "-" */,-55 , 43/* "String" */,-55 , 44/* "Integer" */,-55 , 45/* "Float" */,-55 , 35/* ")" */,-55 , 19/* "," */,-55 , 17/* "]" */,-55 ),
    /* State 134 */ new Array( 18/* ";" */,137 ),
    /* State 135 */ new Array( 34/* "(" */,138 ),
    /* State 136 */ new Array( 15/* "}" */,139 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 137 */ new Array( 15/* "}" */,-18 , 10/* "PublicToken" */,-18 , 11/* "VarToken" */,-18 , 13/* "ProtectedToken" */,-18 , 12/* "PrivateToken" */,-18 , 40/* "FunctionName" */,-18 ),
    /* State 138 */ new Array( 39/* "Variable" */,95 , 35/* ")" */,-39 , 19/* "," */,-39 ),
    /* State 139 */ new Array( 47/* "ScriptEnd" */,-16 , 2/* "IF" */,-16 , 4/* "WHILE" */,-16 , 5/* "DO" */,-16 , 6/* "ECHO" */,-16 , 39/* "Variable" */,-16 , 14/* "{" */,-16 , 48/* "InternalNonScript" */,-16 , 38/* "//" */,-16 , 7/* "RETURN" */,-16 , 34/* "(" */,-16 , 8/* "NewToken" */,-16 , 9/* "ClassToken" */,-16 , 40/* "FunctionName" */,-16 , 41/* "FunctionInvoke" */,-16 , 31/* "-" */,-16 , 43/* "String" */,-16 , 44/* "Integer" */,-16 , 45/* "Float" */,-16 , 15/* "}" */,-16 , 3/* "ELSE" */,-16 ),
    /* State 140 */ new Array( 19/* "," */,113 , 35/* ")" */,141 ),
    /* State 141 */ new Array( 14/* "{" */,142 ),
    /* State 142 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 143 */ new Array( 15/* "}" */,144 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 39/* "Variable" */,11 , 14/* "{" */,14 , 48/* "InternalNonScript" */,15 , 38/* "//" */,16 , 7/* "RETURN" */,17 , 34/* "(" */,18 , 8/* "NewToken" */,21 , 9/* "ClassToken" */,22 , 40/* "FunctionName" */,23 , 41/* "FunctionInvoke" */,28 , 31/* "-" */,31 , 43/* "String" */,33 , 44/* "Integer" */,34 , 45/* "Float" */,35 ),
    /* State 144 */ new Array( 15/* "}" */,-17 , 10/* "PublicToken" */,-17 , 11/* "VarToken" */,-17 , 13/* "ProtectedToken" */,-17 , 12/* "PrivateToken" */,-17 , 40/* "FunctionName" */,-17 )
);

/* Goto-Table */
var goto_tab = new Array(
    /* State 0 */ new Array( 49/* PHPScript */,1 ),
    /* State 1 */ new Array( 50/* Script */,2 ),
    /* State 2 */ new Array( ),
    /* State 3 */ new Array( 51/* Stmt */,4 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 4 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 5 */ new Array( ),
    /* State 6 */ new Array( ),
    /* State 7 */ new Array( 61/* Expression */,47 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 8 */ new Array( 61/* Expression */,49 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 9 */ new Array( 51/* Stmt */,50 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 10 */ new Array( 61/* Expression */,51 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 11 */ new Array( 62/* ArrayIndices */,52 ),
    /* State 12 */ new Array( ),
    /* State 13 */ new Array( ),
    /* State 14 */ new Array( 51/* Stmt */,55 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 15 */ new Array( ),
    /* State 16 */ new Array( 63/* AssertStmt */,56 ),
    /* State 17 */ new Array( 61/* Expression */,58 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 18 */ new Array( 61/* Expression */,59 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 19 */ new Array( ),
    /* State 20 */ new Array( ),
    /* State 21 */ new Array( ),
    /* State 22 */ new Array( ),
    /* State 23 */ new Array( ),
    /* State 24 */ new Array( ),
    /* State 25 */ new Array( ),
    /* State 26 */ new Array( ),
    /* State 27 */ new Array( ),
    /* State 28 */ new Array( 66/* ActualParameterList */,67 , 61/* Expression */,68 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 29 */ new Array( ),
    /* State 30 */ new Array( ),
    /* State 31 */ new Array( 73/* Value */,70 ),
    /* State 32 */ new Array( ),
    /* State 33 */ new Array( ),
    /* State 34 */ new Array( ),
    /* State 35 */ new Array( ),
    /* State 36 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 37 */ new Array( ),
    /* State 38 */ new Array( ),
    /* State 39 */ new Array( 61/* Expression */,73 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 40 */ new Array( 70/* AddSubExp */,74 , 71/* MulDivExp */,27 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 41 */ new Array( 70/* AddSubExp */,75 , 71/* MulDivExp */,27 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 42 */ new Array( 70/* AddSubExp */,76 , 71/* MulDivExp */,27 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 43 */ new Array( 70/* AddSubExp */,77 , 71/* MulDivExp */,27 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 44 */ new Array( 70/* AddSubExp */,78 , 71/* MulDivExp */,27 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 45 */ new Array( 70/* AddSubExp */,79 , 71/* MulDivExp */,27 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 46 */ new Array( ),
    /* State 47 */ new Array( 51/* Stmt */,80 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 48 */ new Array( 62/* ArrayIndices */,81 ),
    /* State 49 */ new Array( ),
    /* State 50 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 51 */ new Array( ),
    /* State 52 */ new Array( ),
    /* State 53 */ new Array( 61/* Expression */,87 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 54 */ new Array( 61/* Expression */,88 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 55 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 56 */ new Array( ),
    /* State 57 */ new Array( ),
    /* State 58 */ new Array( ),
    /* State 59 */ new Array( ),
    /* State 60 */ new Array( 66/* ActualParameterList */,92 , 61/* Expression */,68 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 61 */ new Array( ),
    /* State 62 */ new Array( 58/* FormalParameterList */,94 ),
    /* State 63 */ new Array( 71/* MulDivExp */,96 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 64 */ new Array( 71/* MulDivExp */,97 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 65 */ new Array( 72/* UnaryOp */,98 , 73/* Value */,32 ),
    /* State 66 */ new Array( 72/* UnaryOp */,99 , 73/* Value */,32 ),
    /* State 67 */ new Array( ),
    /* State 68 */ new Array( ),
    /* State 69 */ new Array( ),
    /* State 70 */ new Array( ),
    /* State 71 */ new Array( ),
    /* State 72 */ new Array( 61/* Expression */,103 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 73 */ new Array( ),
    /* State 74 */ new Array( ),
    /* State 75 */ new Array( ),
    /* State 76 */ new Array( ),
    /* State 77 */ new Array( ),
    /* State 78 */ new Array( ),
    /* State 79 */ new Array( ),
    /* State 80 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 81 */ new Array( ),
    /* State 82 */ new Array( 51/* Stmt */,105 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 83 */ new Array( 61/* Expression */,106 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 84 */ new Array( ),
    /* State 85 */ new Array( 61/* Expression */,107 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 86 */ new Array( 61/* Expression */,108 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 87 */ new Array( ),
    /* State 88 */ new Array( ),
    /* State 89 */ new Array( ),
    /* State 90 */ new Array( ),
    /* State 91 */ new Array( ),
    /* State 92 */ new Array( ),
    /* State 93 */ new Array( 52/* Member */,112 ),
    /* State 94 */ new Array( ),
    /* State 95 */ new Array( ),
    /* State 96 */ new Array( ),
    /* State 97 */ new Array( ),
    /* State 98 */ new Array( ),
    /* State 99 */ new Array( ),
    /* State 100 */ new Array( 61/* Expression */,115 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 101 */ new Array( ),
    /* State 102 */ new Array( 66/* ActualParameterList */,116 , 61/* Expression */,68 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 103 */ new Array( ),
    /* State 104 */ new Array( 51/* Stmt */,118 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 105 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 106 */ new Array( ),
    /* State 107 */ new Array( ),
    /* State 108 */ new Array( ),
    /* State 109 */ new Array( ),
    /* State 110 */ new Array( ),
    /* State 111 */ new Array( ),
    /* State 112 */ new Array( 55/* ClassFunctionDefinition */,122 , 54/* AttributeDefinition */,123 , 56/* AttributeMod */,125 , 57/* FunctionMod */,126 ),
    /* State 113 */ new Array( ),
    /* State 114 */ new Array( ),
    /* State 115 */ new Array( ),
    /* State 116 */ new Array( ),
    /* State 117 */ new Array( ),
    /* State 118 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 119 */ new Array( ),
    /* State 120 */ new Array( ),
    /* State 121 */ new Array( ),
    /* State 122 */ new Array( ),
    /* State 123 */ new Array( ),
    /* State 124 */ new Array( ),
    /* State 125 */ new Array( ),
    /* State 126 */ new Array( ),
    /* State 127 */ new Array( ),
    /* State 128 */ new Array( ),
    /* State 129 */ new Array( ),
    /* State 130 */ new Array( ),
    /* State 131 */ new Array( ),
    /* State 132 */ new Array( 51/* Stmt */,136 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 133 */ new Array( ),
    /* State 134 */ new Array( ),
    /* State 135 */ new Array( ),
    /* State 136 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 137 */ new Array( ),
    /* State 138 */ new Array( 58/* FormalParameterList */,140 ),
    /* State 139 */ new Array( ),
    /* State 140 */ new Array( ),
    /* State 141 */ new Array( ),
    /* State 142 */ new Array( 51/* Stmt */,143 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 143 */ new Array( 51/* Stmt */,36 , 60/* Return */,5 , 61/* Expression */,6 , 53/* ClassDefinition */,12 , 59/* FunctionDefinition */,13 , 64/* BinaryOp */,19 , 65/* FunctionInvocation */,20 , 70/* AddSubExp */,24 , 67/* SimpleFunctionInvocation */,25 , 68/* PrefixedFunctionInvocation */,26 , 71/* MulDivExp */,27 , 69/* Target */,29 , 72/* UnaryOp */,30 , 73/* Value */,32 ),
    /* State 144 */ new Array( )
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
    "NewToken" /* Terminal symbol */,
    "ClassToken" /* Terminal symbol */,
    "PublicToken" /* Terminal symbol */,
    "VarToken" /* Terminal symbol */,
    "PrivateToken" /* Terminal symbol */,
    "ProtectedToken" /* Terminal symbol */,
    "{" /* Terminal symbol */,
    "}" /* Terminal symbol */,
    "[" /* Terminal symbol */,
    "]" /* Terminal symbol */,
    ";" /* Terminal symbol */,
    "," /* Terminal symbol */,
    "." /* Terminal symbol */,
    "=" /* Terminal symbol */,
    "==" /* Terminal symbol */,
    "!=" /* Terminal symbol */,
    "<!" /* Terminal symbol */,
    "!>" /* Terminal symbol */,
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
    "->" /* Terminal symbol */,
    "::" /* Terminal symbol */,
    "//" /* Terminal symbol */,
    "Variable" /* Terminal symbol */,
    "FunctionName" /* Terminal symbol */,
    "FunctionInvoke" /* Terminal symbol */,
    "ClassName" /* Terminal symbol */,
    "String" /* Terminal symbol */,
    "Integer" /* Terminal symbol */,
    "Float" /* Terminal symbol */,
    "ScriptBegin" /* Terminal symbol */,
    "ScriptEnd" /* Terminal symbol */,
    "InternalNonScript" /* Terminal symbol */,
    "PHPScript" /* Non-terminal symbol */,
    "Script" /* Non-terminal symbol */,
    "Stmt" /* Non-terminal symbol */,
    "Member" /* Non-terminal symbol */,
    "ClassDefinition" /* Non-terminal symbol */,
    "AttributeDefinition" /* Non-terminal symbol */,
    "ClassFunctionDefinition" /* Non-terminal symbol */,
    "AttributeMod" /* Non-terminal symbol */,
    "FunctionMod" /* Non-terminal symbol */,
    "FormalParameterList" /* Non-terminal symbol */,
    "FunctionDefinition" /* Non-terminal symbol */,
    "Return" /* Non-terminal symbol */,
    "Expression" /* Non-terminal symbol */,
    "ArrayIndices" /* Non-terminal symbol */,
    "AssertStmt" /* Non-terminal symbol */,
    "BinaryOp" /* Non-terminal symbol */,
    "FunctionInvocation" /* Non-terminal symbol */,
    "ActualParameterList" /* Non-terminal symbol */,
    "SimpleFunctionInvocation" /* Non-terminal symbol */,
    "PrefixedFunctionInvocation" /* Non-terminal symbol */,
    "Target" /* Non-terminal symbol */,
    "AddSubExp" /* Non-terminal symbol */,
    "MulDivExp" /* Non-terminal symbol */,
    "UnaryOp" /* Non-terminal symbol */,
    "Value" /* Non-terminal symbol */,
    "$" /* Terminal symbol */
);


info.offset = 0; info.src = src; info.att = new String(); if( !err_off )
err_off = new Array(); if( !err_la )
err_la = new Array(); sstack.push( 0 ); vstack.push( 0 ); la = __lex( info ); while( true )
{ act = 146; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
if( _dbg_withtrace && sstack.length > 0 )
{ __dbg_print( "\nState " + sstack[sstack.length-1] + "\n" + "\tLookahead: " + labels[la] + " (\"" + info.att + "\")\n" + "\tAction: " + act + "\n" + "\tSource: \"" + info.src.substr( info.offset, 30 ) + ( ( info.offset + 30 < info.src.length ) ?
"..." : "" ) + "\"\n" + "\tStack: " + sstack.join() + "\n" + "\tValue stack: " + vstack.join() + "\n" );}
if( act == 146 )
{ if( _dbg_withtrace )
__dbg_print( "Error detected: There is no reduce or shift on the symbol " + labels[la] ); err_cnt++; err_off.push( info.offset - info.att.length ); err_la.push( new Array() ); for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
err_la[err_la.length-1].push( labels[act_tab[sstack[sstack.length-1]][i]] ); var rsstack = new Array(); var rvstack = new Array(); for( var i = 0; i < sstack.length; i++ )
{ rsstack[i] = sstack[i]; rvstack[i] = vstack[i];}
while( act == 146 && la != 74 )
{ if( _dbg_withtrace )
__dbg_print( "\tError recovery\n" + "Current lookahead: " + labels[la] + " (" + info.att + ")\n" + "Action: " + act + "\n\n" ); if( la == -1 )
info.offset++; while( act == 146 && sstack.length > 0 )
{ sstack.pop(); vstack.pop(); if( sstack.length == 0 )
break; act = 146; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
}
if( act != 146 )
break; for( var i = 0; i < rsstack.length; i++ )
{ sstack.push( rsstack[i] ); vstack.push( rvstack[i] );}
la = __lex( info );}
if( act == 146 )
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
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 2:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 3:
    {
            
                                            execute( vstack[ vstack.length - 2 ] );
                                            if (vstack[ vstack.length - 1 ].length > 2) {
                                                var strNode = createNode( NODE_CONST, vstack[ vstack.length - 1 ].substring(2,vstack[ vstack.length - 1 ].length) );
                                                execute( createNode( NODE_OP, OP_ECHO, strNode ) );
                                            }
                                        
    }
    break;
    case 4:
    {
            
                                            pstate.curClass = vstack[ vstack.length - 4 ]+'::';
                                            pstate.classTable[vstack[ vstack.length - 4 ]] =
                                                createClass( MOD_PUBLIC, vstack[ vstack.length - 4 ], pstate.curAttrs, pstate.curFuns );
                                            pstate.curAttrs = [];
                                            pstate.curFuns = [];
                                            pstate.curClass = '';
                                        
    }
    break;
    case 5:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 6:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 7:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 8:
    {
         rval = MOD_PUBLIC;
    }
    break;
    case 9:
    {
         rval = MOD_PUBLIC;
    }
    break;
    case 10:
    {
         rval = MOD_PROTECTED;
    }
    break;
    case 11:
    {
         rval = MOD_PRIVATE;
    }
    break;
    case 12:
    {
         rval = MOD_PUBLIC;
    }
    break;
    case 13:
    {
         rval = MOD_PUBLIC;
    }
    break;
    case 14:
    {
         rval = MOD_PROTECTED;
    }
    break;
    case 15:
    {
         rval = MOD_PRIVATE;
    }
    break;
    case 16:
    {
             
                                            // Check that the function is not defined twice.
                                            if (pstate.funTable[vstack[ vstack.length - 7 ]]) {
                                                throw funRedeclare(vstack[ vstack.length - 7 ]);
                                            }
                                            pstate.funTable[vstack[ vstack.length - 7 ]] =
                                                createFunction( vstack[ vstack.length - 7 ], pstate.curParams, vstack[ vstack.length - 2 ] );
                                            // Make sure to clean up param list
                                            // for next function declaration
                                            pstate.curParams = [];
                                        
    }
    break;
    case 17:
    {
             
                                            // Check that the function is not defined twice within
                                            // the same object
                                            if (pstate.curClass && pstate.curFuns[pstate.curClass+vstack[ vstack.length - 7 ]]) {
                                                throw funRedeclare(pstate.curClass+vstack[ vstack.length - 7 ]);
                                            }
                                            var fun = createFunction( vstack[ vstack.length - 7 ], pstate.curParams, vstack[ vstack.length - 2 ] );
                                            pstate.curFuns[vstack[ vstack.length - 7 ]] =
                                                createMember( vstack[ vstack.length - 8 ], fun );
                                            // Make sure to clean up param list
                                            // for next function declaration
                                            pstate.curParams = [];
                                        
    }
    break;
    case 18:
    {
        
                                            pstate.curAttrs[vstack[ vstack.length - 2 ]] = createMember( vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
                                        
    }
    break;
    case 19:
    {
         rval = createNode ( NODE_OP, OP_NONE, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 20:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 21:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 22:
    {
         rval = createNode( NODE_OP, OP_IF, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 23:
    {
         rval = createNode( NODE_OP, OP_IF_ELSE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 24:
    {
         rval = createNode( NODE_OP, OP_WHILE_DO, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 25:
    {
         rval = createNode( NODE_OP, OP_DO_WHILE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 26:
    {
         rval = createNode( NODE_OP, OP_ECHO, vstack[ vstack.length - 2 ] );
    }
    break;
    case 27:
    {
         rval = createNode( NODE_OP, OP_ASSIGN, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 28:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 29:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 30:
    {
         rval = createNode( NODE_OP, OP_ASSIGN_ARR, vstack[ vstack.length - 5 ], vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 31:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 32:
    {
        
                                            if (vstack[ vstack.length - 1 ].length > 4) {
                                                var strNode = createNode( NODE_CONST, vstack[ vstack.length - 1 ].substring(2,vstack[ vstack.length - 1 ].length-2) );
                                                rval = createNode( NODE_OP, OP_ECHO, strNode );
                                            }
                                        
    }
    break;
    case 33:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 34:
    {
            
                                            if (phypeTestSuite && vstack[ vstack.length - 2 ] == "assertEcho") {
                                                pstate.assertion = createAssertion( ASS_ECHO, vstack[ vstack.length - 1 ] );
                                            }
                                        
    }
    break;
    case 35:
    {
        
                                            if (phypeTestSuite && vstack[ vstack.length - 1 ] == "assertFail") {
                                                pstate.assertion = createAssertion( ASS_FAIL, 0 );
                                            }
                                        
    }
    break;
    case 36:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 37:
    {
        
                                            pstate.curParams[pstate.curParams.length] =
                                                createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
                                        
    }
    break;
    case 38:
    {
        
                                            pstate.curParams[pstate.curParams.length] =
                                                createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
                                        
    }
    break;
    case 39:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 40:
    {
         rval = createNode( NODE_OP, OP_RETURN, vstack[ vstack.length - 1 ] );
    }
    break;
    case 41:
    {
         rval = createNode( NODE_OP, OP_RETURN );
    }
    break;
    case 42:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 43:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 44:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 45:
    {
         rval = createNode( NODE_OP, OP_OBJ_NEW, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 46:
    {
         rval = createNode( NODE_OP, OP_FETCH_ARR, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 47:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 48:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 1 ] );
    }
    break;
    case 49:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 50:
    {
         rval = createNode( NODE_OP, OP_ARR_KEYS_R, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 51:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 52:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 53:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 54:
    {
         rval = createNode( NODE_OP, OP_FCALL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 55:
    {
         rval = createNode( NODE_OP, OP_OBJ_FCALL, vstack[ vstack.length - 5 ], vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 56:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 57:
    {
         rval = createNode( NODE_OP, OP_EQU, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 58:
    {
         rval = createNode( NODE_OP, OP_LOT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 59:
    {
         rval = createNode( NODE_OP, OP_GRT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 60:
    {
         rval = createNode( NODE_OP, OP_LOE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 61:
    {
         rval = createNode( NODE_OP, OP_GRE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 62:
    {
         rval = createNode( NODE_OP, OP_NEQ, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 63:
    {
         rval = createNode( NODE_OP, OP_CONCAT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 64:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 65:
    {
         rval = createNode( NODE_OP, OP_SUB, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 66:
    {
         rval = createNode( NODE_OP, OP_ADD, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 67:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 68:
    {
         rval = createNode( NODE_OP, OP_MUL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 69:
    {
         rval = createNode( NODE_OP, OP_DIV, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 70:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 71:
    {
         rval = createNode( NODE_OP, OP_NEG, vstack[ vstack.length - 1 ] );
    }
    break;
    case 72:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 73:
    {
         rval = createNode( NODE_VAR, vstack[ vstack.length - 1 ] );
    }
    break;
    case 74:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 75:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 76:
    {
         rval = createNode( NODE_INT, vstack[ vstack.length - 1 ] );
    }
    break;
    case 77:
    {
         rval = createNode( NODE_FLOAT, vstack[ vstack.length - 1 ] );
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
        //    "<? $a[1] = 'foo'; $foo = 'bar'; echo $a[1].$foo; ?>"
            //"<? $a=1; $b=2; $c=3; echo 'starting'; if ($a+$b == 3){ $r = $r + 1; if ($c-$b > 0) { $r = $r + 1; if ($c*$b < 7) {    $r = $r + 1; if ($c*$a+$c == 6) { $r = $r + 1; if ($c*$c/$b <= 5) echo $r; }}}} echo 'Done'; echo $r;?>"
            //"<? $a[0]['d'] = 'hej'; $a[0][1] = '!'; $b = $a; $c = $a; $b[0] = 'verden'; echo $a[0]['d']; echo $b[0]; echo $c[0][1]; echo $c[0]; echo $c; if ($c) { ?>C er sat<? } ?>"
            "<? " +
            "class test {" +
            "    private $var;" +
            "    function hello() { echo 'hello world!'; }" +
            "}" +
            "$a = new test();" +
            "$a->hello();" +
            "?>"
        );
    };
}

// Set phypeOut if it is not set.
if (!phypeOut || phypeOut == 'undefined') {
    var phypeOut = alert;
}

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


/////////////
// PARSING //
/////////////

// If we are not in our test suite, load all the scripts all at once.
if (!phypeTestSuite) {
    var str = phypeIn();

    var error_cnt     = 0;
    var error_off    = new Array();
    var error_la    = new Array();
    
    if( ( error_cnt = __parse( preParse(str), error_off, error_la ) ) > 0 ) {
        for(var i=0; i<error_cnt; i++)
            alert( "Parse error near >"
                + str.substr( error_off[i], 30 ) + "<, expecting \"" + error_la[i].join() + "\"" );
    }
    
    if (phypeDoc && phypeDoc.open) {
        phypeDoc.close();
    }
}
// If we are, parse it accordingly
else if (phpScripts) {
    for (var i=0; i<phpScripts.length; i++) {
        var script = phpScripts[i];

        var error_cnt     = 0;
        var error_off    = new Array();
        var error_la    = new Array();
        
        if (i>0) __parse( preParse(script.code) );
        
        phypeEcho = '';
        
        var failed = false;
        var thrownException = null;
        try {
            if( ( error_cnt = __parse( preParse(script.code), error_off, error_la ) ) > 0 ) {
                for(var i=0; i<error_cnt; i++)
                    throw "Parse error near >"
                        + script.code.substr( error_off[i], 30 ) + "<, expecting \"" + error_la[i].join() + "\"" ;
            }
        } catch(exception) {
            failed = true;
            thrownException = exception;
        }

        switch (pstate.assertion.type) {
            case ASS_ECHO:
                if (phypeEcho != pstate.assertion.value)
                    phypeDoc.write('"'+script.name+'" failed assertion. Expected output: "'+
                            pstate.assertion.value+'". Actual output: "'+phypeEcho+'".<br/>\n<br/>\n');
                if (thrownException)
                    throw thrownException;
                break;
            case ASS_FAIL:
                if (!failed)
                    phypeDoc.write('"'+script.name+'" failed assertion. Expected script to fail,'+
                            ' but no exceptions were raised.<br/>\n<br/>\n');
        }
        pstate.assertion = null;
        resetState();
    }
    if (phypeDoc && phypeDoc.open) {
        phypeDoc.write('Testing done!');
        phypeDoc.close();
    }
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
        rtrn = '{<br/>' + spaces + rtrn.substr(0,rtrn.length-(2+(level*3))) + '<br/>' +
                    spaces.substr(0,spaces.length-3) + '}';
    } else {
        rtrn = '{' + rtrn.substr(0,rtrn.length-1) + '}';
    }//end if-else addwhitespace
    if(addwhitespace == 'html') {
        rtrn = rtrn.replace(/ /g," ").replace(/\n/g,"<br/>");
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
