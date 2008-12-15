
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
    symTables : {
        '.global' : {}
    },
    valTable : {},
    arrTable : {},
    objMapping : {},
    
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
    curClass : '',
    curObj : -1,
    
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
    var init;
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
    var classDef;
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
function createMember( mod, member, init ) {
    var m = new MEMBER();
    m.mod = mod;
    m.member = member;
    if (init)
        m.init = init;
    
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
function createObject( objListEntry, classDefName ) {
    var obj = new OBJECT();
    obj.objListEntry = objListEntry;
    obj.references = 0;
    obj.classDef = classDefName;
    
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
            scope = pstate.curFun;

        if (typeof(pstate.symTables[scope]) != 'object')
            pstate.symTables[scope] = {};

        var refTable = linker.getRefTableByVal(val);
        var prefix = linker.getConsDefByVal(val);
        
        pstate.symTables[scope][varName] = prefix+scope+'#'+varName

        // If we are assigning an object, make a reference to the assigned object,
        // and increment the object's reference count.
        if (val.type == T_OBJECT) {
            var entry = val.value.objListEntry;
            pstate.objList[entry].value.references++;
            refTable[scope+'#'+varName] = entry;
        } else
            refTable[scope+'#'+varName] = val;
    },
    
    assignArr : function(varName, key, val, scope) {
        if (!scope)
            scope = pstate.curFun;
        
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
            scope = pstate.curFun;
        
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
            scope = pstate.curFun;
        
        // Look up the potentially recursively defined variable.
        varName = linker.linkRecursively(varName);
        
        if (varName == 'this') {
            return pstate.objList[pstate.curObj];
        }
        
        var refTable = linker.getRefTableByVar(varName);
        
        if (typeof(pstate.symTables[scope])=='object' && typeof(pstate.symTables[scope][varName])=='string') {
            var lookupStr = pstate.symTables[scope][varName];
            lookupStr = lookupStr.substr(5,lookupStr.length);
            
            var ret = null;
            if (refTable == pstate.objMapping)
                ret = pstate.objList[refTable[lookupStr]];
            else
                ret = clone(refTable[lookupStr]);
                
            return ret;
        } else if (typeof(pstate.symTables[cons.global])=='string') {
            var lookupStr = pstate.symTables[cons.global][cleanVarName];
            lookupStr = lookupStr.substr(5, lookupStr.length);
            
            var ret = null;
            if (refTable == pstate.objMapping)
                ret = pstate.objList[refTable[lookupStr]];
            else
                ret = clone(refTable[lookupStr]);
            return ret;
        }
        
        throw varNotFound(varName);
    },
    
    getValueFromObj : function(targetObj, varName, scope) {
        // Look up the potentially recursively defined variable.
        varName = linker.linkRecursively(varName);
        varName = targetObj+'::'+varName;
        
        return linker.getValue(varName);
    },
    
    getArrValue : function(varName, key, scope) {
        if (!scope)
            scope = pstate.curFun;
        
        var cleanVarName = varName.match(/[^\$]*/);

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
            if (pstate.arrTable[lookupStr] && pstate.arrTable[lookupStr]["value"][key.value]) {
                result = pstate.arrTable[lookupStr]["value"][key.value];
            }
        } else if (typeof(pstate.symTables[cons.global][cleanVarName])=='string') {
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
            return linker.getValue(result);
        } else {
            return clone(result);
        }
    },
    
    getArrValueMulti : function(varName, keys, scope) {
        if (!scope)
            scope = pstate.curFun;
        
        var cleanVarName = varName.match(/[^\$]*/);
        
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
        } else if (typeof(pstate.symTables[cons.global][cleanVarName])=='string') {
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
            return linker.getValue(result);
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
            scope = pstate.curFun;
        
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
                return pstate.objMapping;
            default:
                return null;
        }
    },
    
    getRefTableByConsDef : function(consDef) {
        switch (consDef) {
            case cons.val:
                return pstate.valTable;
            case cons.arr:
                return pstate.arrTable;
            case cons.obj:
                return pstate.objMapping;
            default:
                return null;
        }
    },
    
    getRefTableByVar : function(varName, scope) {
        if (!scope)
            scope = pstate.curFun;
        
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
                return pstate.objMapping;
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
            scope = pstate.curFun;
        
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
        var obj = createObject( objListLength, classDef.name );
        pstate.objList[pstate.objList.length] = createValue( T_OBJECT, obj );
        
        // Init variable list
        for (var attr in classDef.attrs) {
            var vName = classDef.attrs[attr].member;
            var vVal = execute( classDef.attrs[attr].init );
            if (!vVal || vVal == 'undefined')
                vVal = null;
            
            var lookupStr = objListLength+'::'+vName;
            pstate.symTables['.global'][objListLength+'::'+vName] = linker.getConsDefByVal(vVal)+lookupStr;
            
            var refTable = linker.getRefTableByVal(vVal);

            refTable[lookupStr] = vVal;
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
            var r = pstate.symTables['.global'][obj.objListEntry+'::'+vName]
            var refTable = linker.getRefTableByConsDef(r.substring(0,5));
            delete refTable[r.substring(5,r.length)];
            delete pstate.symTables['.global'][obj.objListEntry+'::'+vName];
        }
        
        delete obj;
    },
    
    checkVisibility : function(invokerClassName, targetClassName, targetMemberName) {
        // get MOD
        var mod = -1;
        var fun = pstate.classTable[targetClassName]['funs'][targetMemberName];

        if (fun)
            mod = fun.mod;
        else {
            attr = pstate.classTable[targetClassName]['attrs'][targetMemberName];
            if (!attr) return false;
            mod = attr.mod;
        }
    
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
    },
    
    assignObjToVar : function(varName, obj, scope) {
        if (!scope)
            scope = pstate.curFun;
            
        if (typeof(pstate.symTables[scope]) != 'object')
            pstate.symTables[scope] = {};

        var prefix = linker.getConsDefByVal(val);
        
        pstate.symTables[scope][varName] = prefix+scope+'#'+varName
        
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
var OP_OBJ_FETCH    = 14;
var OP_ATTR_ASSIGN    = 15;
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

function fetchTargetInvalid() {
    return 'The target of the variable access was not an object.';
}

function memberNotVisible(memName) {
    return 'Call to a restricted member: '+memName;
}

function nonConstAttrInit(varName, className) {
    return 'Initialization value for attributes must be constant expressions.' +
            ' A non-constant expression was used for "'+varName+'" in "'+className+'"';
}

function thisRedeclare() {
    return 'Cannot redeclare $this';
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
        // $this cannot be redeclared.
        if (varName == 'this')
            throw thisRedeclare();
            
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
            classLinker.decrementObjectRef(linker.getValue(varName).value);
        
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
        if (oldVal.value != val.value) {
            if (oldVal && oldVal.type == T_OBJECT)
                classLinker.decrementObjectRef(linker.getValue(varName));
            
            if (val.type == T_OBJECT && oldVal.value != val.value)
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
        
        // If any className,
        var className = '';
        if (pstate.curClass && pstate.curClass != '')
            className = pstate.curClass+'::';
        
        // Set the name of the function (possibly with class name as prefix)
        if (funName.type == T_CONST)
            pstate.curFun = className+funName.value;
        else if (typeof(funName) == 'string')
            pstate.curFun = className+funName;
        else
            throw funNameMustBeString(funName.type);

        // Initialize parameters for the function scope
        if ( node.children[1] )
            execute( node.children[1] );
        
        var f = pstate.funTable[pstate.curFun];
        
        // If f expects no parameters, make sure params' length attribute is set correctly
        if (!f.params.length)
            f.params.length = 0;
        
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
        pstate.curClass = className;
        pstate.curObj = obj.objListEntry;
        
        // Get and execute constructor
        var constructInvoke = null;
        // First look for __contruct-function (higher precedence than class-named function as
        // constructor)
        if (realClass['funs']['__construct']) {
            constructInvoke = createNode( NODE_OP, OP_OBJ_FCALL, createNode( NODE_VAR, 'this' ),
                                    className, '__construct' );
        }
        // Then look for class-named function as constructor
        else if (realClass['funs'][className]) {
            constructInvoke = createNode( NODE_OP, OP_OBJ_FCALL, createNode( NODE_VAR, 'this' ),
                                    className, className );
        }
        
        // Only invoke the constructor if it is defined
        if (constructInvoke)
            execute( constructInvoke );
        
        //State rollback
        pstate.curClass = '';
        pstate.curObj = -1;
        
        // Return the instantiated object
        return createValue( T_OBJECT, obj );
    },
    
    // OP_OBJ_FCALL
    '13' : function(node) {
        var target = execute( node.children[0] );
        if (!target) {
            return execute( createNode(NODE_OP, OP_FCALL, node.children[1], node.children[2]) );
        }
        
        // The function name can be defined by an expression. Execute it.
        if (typeof(node.children[1]) != 'string')
            node.children[1] = execute(node.children[1]);
        
        // Check if function name is recursively defined
        var funName = linker.linkRecursively(node.children[1]);
        
        var targetClass = null;
        var targetObj = -1;
        if (target == 'this') {
            targetClass = pstate.curClass;
            targetObj = pstate.curObj;
        } else {
            if (target.type != T_OBJECT) {
                throw invocationTargetInvalid(target.type);
            }
            
            targetClass = pstate.objList[target.value.objListEntry].value.classDef;
            targetObj = target.value.objListEntry;
        }
        
        // Invoke function
        {
            // State preservation
            var prevPassedParams = pstate.passedParams;
            pstate.passedParams = 0;
            
            // Check if function name is recursively defined
            var prevFun = pstate.curFun;
            var prevClass = pstate.curClass;
            var prevObj = pstate.curObj;
            
            // Set executing function and class
            pstate.curFun = pstate.curClass+'::'+funName;
            pstate.curClass = targetClass;
            pstate.curObj = targetObj;
    
            // Check visibility
            if (!classLinker.checkVisibility(pstate.curClass, targetClass, funName)) {
                throw memberNotVisible(funName);
            }
            
            // Fetch function
            var f = pstate.classTable[targetClass]['funs'][funName]['member'];
            // Initialize parameters for the function scope
            if ( node.children[2] )
                execute( node.children[2] );
            
            // If f expects no parameters, make sure params' length attribute is set correctly
            if (!f.params.length)
                f.params.length = 0;
        
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
            pstate.curClass = prevClass;
            pstate.curObj = prevObj;
            var ret = pstate['return'];
            pstate['return'] = 0;
            
            // Return the value saved in .return in our valTable.
            return ret;
        }
    },
    
    // OP_OBJ_FETCH
    '14' : function(node) {
        // The variable name can be defined by an expression. Execute it.
        if (typeof(node.children[1]) != 'string')
            node.children[1] = execute(node.children[1]);
        
        // Check if function name is recursively defined
        var varName = linker.linkRecursively(node.children[1]);
        
        var targetClass = null;
        var targetObj = -1;
        var target = execute( node.children[0] );
        if (target == 'this') {
            targetClass = pstate.curClass;
            targetObj = pstate.curObj;
        } else {
            if (target.type != T_OBJECT) {
                throw invocationTargetInvalid(target.type);
            }
            
            targetClass = pstate.objList[target.value.objListEntry];
            targetObj = target.value.objListEntry;
        }
        
        if (!classLinker.checkVisibility(pstate.curClass, targetClass.value.classDef, varName)) {
            throw memberNotVisible(varName);
        }
        
        if (targetObj == -1)
            throw fetchTargetInvalid();
            
        var lookupStr = pstate.symTables['.global'][targetObj+'::'+varName];
        if (lookupStr)
            var refTable = linker.getRefTableByConsDef(lookupStr.substring(0,5));
        
        if (refTable)
            return refTable[lookupStr.substring(5,lookupStr.length)];
    },
    
    // OP_ATTR_ASSIGN
    '15' : function(node) {
        // Look up potentially recursive variable name
        var varName = linker.linkRecursively(node.children[1]);
        
        // Figure out target object
        var targetClass = null;
        var targetObj = -1;
        var target = execute( node.children[0] );
        if (target == 'this') {
            targetClass = pstate.curClass;
            targetObj = pstate.curObj;
        } else {
            if (target.type != T_OBJECT) {
                throw invocationTargetInvalid(target.type);
            }
            
            targetClass = pstate.objList[target.value.objListEntry];
            targetObj = target.value.objListEntry;
        }
        
        if (targetObj == -1)
            throw fetchTargetInvalid();
        
        // Check if the variable we are trying to assign to already contains an object;
        // decrement the reference count for the object if this is the case.
        var oldVal = null;
        try {
            oldVal = linker.getValueFromObj(targetObj, varName);
        } catch (exception) {
            if (exception!=varNotFound(varName))
                throw exception;
            else
                oldVal = false;
        }
        
        try {
            var val = execute( node.children[2] );
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
        if (oldVal.value != val.value) {
            if (oldVal && oldVal.type == T_OBJECT)
                classLinker.decrementObjectRef(linker.getValue(varName));
            
            if (val.type == T_OBJECT && oldVal.value != val.value)
                val.value.references++;
        }
        
        linker.assignVar( node.children[0], val );
        
        return val;
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
    // Reset term-event boolean and terminate currently executing action, if a terminate-event
    // was received.
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
        else if( info.src.charCodeAt( pos ) == 33 ) state = 47;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 77 ) || info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 81 || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 109 ) || info.src.charCodeAt( pos ) == 111 || info.src.charCodeAt( pos ) == 113 || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 34 ) state = 49;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 50;
        else if( info.src.charCodeAt( pos ) == 36 ) state = 51;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 52;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 53;
        else if( info.src.charCodeAt( pos ) == 58 ) state = 55;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 57;
        else if( info.src.charCodeAt( pos ) == 92 ) state = 59;
        else if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 86;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 97;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 105;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 106;
        else if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 112;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 113;
        else if( info.src.charCodeAt( pos ) == 102 ) state = 120;
        else state = -1;
        break;

    case 1:
        state = -1;
        match = 1;
        match_pos = pos;
        break;

    case 2:
        state = -1;
        match = 33;
        match_pos = pos;
        break;

    case 3:
        state = -1;
        match = 34;
        match_pos = pos;
        break;

    case 4:
        state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 5:
        state = -1;
        match = 29;
        match_pos = pos;
        break;

    case 6:
        state = -1;
        match = 18;
        match_pos = pos;
        break;

    case 7:
        if( info.src.charCodeAt( pos ) == 62 ) state = 24;
        else state = -1;
        match = 30;
        match_pos = pos;
        break;

    case 8:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 25;
        else state = -1;
        match = 19;
        match_pos = pos;
        break;

    case 9:
        if( info.src.charCodeAt( pos ) == 47 ) state = 26;
        else state = -1;
        match = 31;
        match_pos = pos;
        break;

    case 10:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 10;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 25;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 11:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 11;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 25;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 12:
        state = -1;
        match = 17;
        match_pos = pos;
        break;

    case 13:
        if( info.src.charCodeAt( pos ) == 33 ) state = 28;
        else if( info.src.charCodeAt( pos ) == 61 ) state = 29;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 30;
        else state = -1;
        match = 28;
        match_pos = pos;
        break;

    case 14:
        if( info.src.charCodeAt( pos ) == 61 ) state = 31;
        else state = -1;
        match = 20;
        match_pos = pos;
        break;

    case 15:
        if( info.src.charCodeAt( pos ) == 61 ) state = 32;
        else state = -1;
        match = 27;
        match_pos = pos;
        break;

    case 16:
        state = -1;
        match = 15;
        match_pos = pos;
        break;

    case 17:
        state = -1;
        match = 16;
        match_pos = pos;
        break;

    case 18:
        state = -1;
        match = 13;
        match_pos = pos;
        break;

    case 19:
        state = -1;
        match = 14;
        match_pos = pos;
        break;

    case 20:
        state = -1;
        match = 22;
        match_pos = pos;
        break;

    case 21:
        state = -1;
        match = 24;
        match_pos = pos;
        break;

    case 22:
        state = -1;
        match = 41;
        match_pos = pos;
        break;

    case 23:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 23;
        else state = -1;
        match = 38;
        match_pos = pos;
        break;

    case 24:
        state = -1;
        match = 35;
        match_pos = pos;
        break;

    case 25:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 25;
        else state = -1;
        match = 43;
        match_pos = pos;
        break;

    case 26:
        state = -1;
        match = 37;
        match_pos = pos;
        break;

    case 27:
        state = -1;
        match = 36;
        match_pos = pos;
        break;

    case 28:
        state = -1;
        match = 23;
        match_pos = pos;
        break;

    case 29:
        state = -1;
        match = 25;
        match_pos = pos;
        break;

    case 30:
        state = -1;
        match = 44;
        match_pos = pos;
        break;

    case 31:
        state = -1;
        match = 21;
        match_pos = pos;
        break;

    case 32:
        state = -1;
        match = 26;
        match_pos = pos;
        break;

    case 33:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 59 ) || ( info.src.charCodeAt( pos ) >= 61 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 33;
        else if( info.src.charCodeAt( pos ) == 60 ) state = 63;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 34:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 5;
        match_pos = pos;
        break;

    case 35:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 2;
        match_pos = pos;
        break;

    case 36:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 8;
        match_pos = pos;
        break;

    case 37:
        state = -1;
        match = 46;
        match_pos = pos;
        break;

    case 38:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 6;
        match_pos = pos;
        break;

    case 39:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 3;
        match_pos = pos;
        break;

    case 40:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 9;
        match_pos = pos;
        break;

    case 41:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 4;
        match_pos = pos;
        break;

    case 42:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 10;
        match_pos = pos;
        break;

    case 43:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 7;
        match_pos = pos;
        break;

    case 44:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 11;
        match_pos = pos;
        break;

    case 45:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 12;
        match_pos = pos;
        break;

    case 46:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 46;
        else state = -1;
        match = 39;
        match_pos = pos;
        break;

    case 47:
        if( info.src.charCodeAt( pos ) == 61 ) state = 20;
        else if( info.src.charCodeAt( pos ) == 62 ) state = 21;
        else state = -1;
        break;

    case 48:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 49:
        if( info.src.charCodeAt( pos ) == 34 ) state = 22;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 33 ) || ( info.src.charCodeAt( pos ) >= 35 && info.src.charCodeAt( pos ) <= 254 ) ) state = 49;
        else state = -1;
        break;

    case 50:
        if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 34;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 51:
        if( info.src.charCodeAt( pos ) == 36 || info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 23;
        else state = -1;
        break;

    case 52:
        if( info.src.charCodeAt( pos ) == 70 || info.src.charCodeAt( pos ) == 102 ) state = 35;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 69 ) || ( info.src.charCodeAt( pos ) >= 71 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 101 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 53:
        if( info.src.charCodeAt( pos ) == 39 ) state = 22;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 53;
        else state = -1;
        break;

    case 54:
        if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 36;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 55:
        if( info.src.charCodeAt( pos ) == 58 ) state = 27;
        else state = -1;
        break;

    case 56:
        if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 38;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 57:
        if( info.src.charCodeAt( pos ) == 62 ) state = 33;
        else state = -1;
        break;

    case 58:
        if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 39;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 59:
        if( info.src.charCodeAt( pos ) == 32 ) state = 61;
        else state = -1;
        break;

    case 60:
        if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 40;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 61:
        if( info.src.charCodeAt( pos ) == 97 ) state = 65;
        else state = -1;
        break;

    case 62:
        if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 41;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 63:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 33;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 37;
        else state = -1;
        break;

    case 64:
        if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 42;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 65:
        if( info.src.charCodeAt( pos ) == 115 ) state = 87;
        else state = -1;
        break;

    case 66:
        if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 43;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 77 ) || ( info.src.charCodeAt( pos ) >= 79 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 67:
        if( info.src.charCodeAt( pos ) == 101 ) state = 69;
        else state = -1;
        break;

    case 68:
        if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 44;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 69:
        if( info.src.charCodeAt( pos ) == 114 ) state = 71;
        else state = -1;
        break;

    case 70:
        if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 45;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 67 ) || ( info.src.charCodeAt( pos ) >= 69 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 99 ) || ( info.src.charCodeAt( pos ) >= 101 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 71:
        if( info.src.charCodeAt( pos ) == 116 ) state = 73;
        else state = -1;
        break;

    case 72:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 32 ) state = 76;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 73:
        if( info.src.charCodeAt( pos ) == 69 ) state = 74;
        else if( info.src.charCodeAt( pos ) == 70 ) state = 75;
        else state = -1;
        break;

    case 74:
        if( info.src.charCodeAt( pos ) == 99 ) state = 77;
        else state = -1;
        break;

    case 75:
        if( info.src.charCodeAt( pos ) == 97 ) state = 78;
        else state = -1;
        break;

    case 76:
        if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 46;
        else state = -1;
        break;

    case 77:
        if( info.src.charCodeAt( pos ) == 104 ) state = 79;
        else state = -1;
        break;

    case 78:
        if( info.src.charCodeAt( pos ) == 105 ) state = 80;
        else state = -1;
        break;

    case 79:
        if( info.src.charCodeAt( pos ) == 111 ) state = 81;
        else state = -1;
        break;

    case 80:
        if( info.src.charCodeAt( pos ) == 108 ) state = 82;
        else state = -1;
        break;

    case 81:
        if( info.src.charCodeAt( pos ) == 32 ) state = 83;
        else state = -1;
        break;

    case 82:
        if( info.src.charCodeAt( pos ) == 36 ) state = 1;
        else if( info.src.charCodeAt( pos ) == 115 ) state = 82;
        else state = -1;
        break;

    case 83:
        if( info.src.charCodeAt( pos ) == 34 ) state = 84;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 85;
        else state = -1;
        break;

    case 84:
        if( info.src.charCodeAt( pos ) == 34 ) state = 82;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 33 ) || ( info.src.charCodeAt( pos ) >= 35 && info.src.charCodeAt( pos ) <= 254 ) ) state = 84;
        else state = -1;
        break;

    case 85:
        if( info.src.charCodeAt( pos ) == 39 ) state = 82;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 85;
        else state = -1;
        break;

    case 86:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 54;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 87:
        if( info.src.charCodeAt( pos ) == 115 ) state = 67;
        else state = -1;
        break;

    case 88:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 56;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 89:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 58;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 90:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 60;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 91:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 62;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 92:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 64;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 93:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 66;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 94:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 68;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 95:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 70;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 96:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 72;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 97:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 88;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 89;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 98:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 66 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 65 || info.src.charCodeAt( pos ) == 97 ) state = 90;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 99:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 91;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 100:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 92;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 101:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 93;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 102:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 66 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 65 || info.src.charCodeAt( pos ) == 97 ) state = 94;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 103:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 95;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 104:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 111 ) state = 96;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 105:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 98;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 106:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 99;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 107:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || info.src.charCodeAt( pos ) == 65 || ( info.src.charCodeAt( pos ) >= 67 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || info.src.charCodeAt( pos ) == 97 || ( info.src.charCodeAt( pos ) >= 99 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 66 || info.src.charCodeAt( pos ) == 98 ) state = 100;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 108:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 101;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 109:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 85 ) || ( info.src.charCodeAt( pos ) >= 87 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 117 ) || ( info.src.charCodeAt( pos ) >= 119 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 86 || info.src.charCodeAt( pos ) == 118 ) state = 102;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 110:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 103;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 111:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 105 ) state = 104;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 112:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 107;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 114;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 113:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 108;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 114:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 109;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 117;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 115:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 110;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 116:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 116 ) state = 111;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 117:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 115;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 118:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 99 ) state = 116;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 119:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 118;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 120:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else if( info.src.charCodeAt( pos ) == 117 ) state = 119;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

}


pos++;}
while( state > -1 );}
while( 1 > -1 && match == 1 ); if( match > -1 )
{ info.att = info.src.substr( start, match_pos - start ); info.offset = match_pos; switch( match )
{
    case 38:
        {
         info.att = info.att.substr(1,info.att.length-1);
        }
        break;

    case 39:
        {
         info.att = info.att.substr(9,info.att.length-1);
        }
        break;

    case 41:
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
    new Array( 47/* PHPScript */, 2 ),
    new Array( 47/* PHPScript */, 0 ),
    new Array( 48/* Script */, 3 ),
    new Array( 51/* ClassDefinition */, 5 ),
    new Array( 50/* Member */, 2 ),
    new Array( 50/* Member */, 2 ),
    new Array( 50/* Member */, 0 ),
    new Array( 54/* AttributeMod */, 1 ),
    new Array( 54/* AttributeMod */, 1 ),
    new Array( 54/* AttributeMod */, 1 ),
    new Array( 55/* FunctionMod */, 1 ),
    new Array( 55/* FunctionMod */, 0 ),
    new Array( 55/* FunctionMod */, 1 ),
    new Array( 55/* FunctionMod */, 1 ),
    new Array( 57/* FunctionDefinition */, 7 ),
    new Array( 53/* ClassFunctionDefinition */, 8 ),
    new Array( 52/* AttributeDefinition */, 3 ),
    new Array( 52/* AttributeDefinition */, 5 ),
    new Array( 49/* Stmt */, 2 ),
    new Array( 49/* Stmt */, 2 ),
    new Array( 49/* Stmt */, 2 ),
    new Array( 49/* Stmt */, 3 ),
    new Array( 49/* Stmt */, 5 ),
    new Array( 49/* Stmt */, 4 ),
    new Array( 49/* Stmt */, 5 ),
    new Array( 49/* Stmt */, 3 ),
    new Array( 49/* Stmt */, 4 ),
    new Array( 49/* Stmt */, 6 ),
    new Array( 49/* Stmt */, 1 ),
    new Array( 49/* Stmt */, 1 ),
    new Array( 49/* Stmt */, 5 ),
    new Array( 49/* Stmt */, 3 ),
    new Array( 49/* Stmt */, 1 ),
    new Array( 49/* Stmt */, 2 ),
    new Array( 63/* AssertStmt */, 2 ),
    new Array( 63/* AssertStmt */, 1 ),
    new Array( 63/* AssertStmt */, 0 ),
    new Array( 56/* FormalParameterList */, 3 ),
    new Array( 56/* FormalParameterList */, 1 ),
    new Array( 56/* FormalParameterList */, 0 ),
    new Array( 59/* Return */, 2 ),
    new Array( 59/* Return */, 1 ),
    new Array( 60/* Target */, 1 ),
    new Array( 68/* ExpressionNotFunAccess */, 1 ),
    new Array( 68/* ExpressionNotFunAccess */, 4 ),
    new Array( 68/* ExpressionNotFunAccess */, 3 ),
    new Array( 68/* ExpressionNotFunAccess */, 2 ),
    new Array( 68/* ExpressionNotFunAccess */, 3 ),
    new Array( 58/* Expression */, 1 ),
    new Array( 58/* Expression */, 4 ),
    new Array( 58/* Expression */, 3 ),
    new Array( 58/* Expression */, 1 ),
    new Array( 58/* Expression */, 2 ),
    new Array( 58/* Expression */, 3 ),
    new Array( 65/* FunctionInvoke */, 2 ),
    new Array( 65/* FunctionInvoke */, 2 ),
    new Array( 67/* MemberAccess */, 1 ),
    new Array( 67/* MemberAccess */, 1 ),
    new Array( 61/* AttributeAccess */, 1 ),
    new Array( 61/* AttributeAccess */, 1 ),
    new Array( 69/* FunctionAccess */, 3 ),
    new Array( 69/* FunctionAccess */, 4 ),
    new Array( 66/* ActualParameterList */, 3 ),
    new Array( 66/* ActualParameterList */, 1 ),
    new Array( 66/* ActualParameterList */, 0 ),
    new Array( 62/* ArrayIndices */, 4 ),
    new Array( 62/* ArrayIndices */, 3 ),
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
    /* State 0 */ new Array( 74/* "$" */,-2 , 44/* "ScriptBegin" */,-2 ),
    /* State 1 */ new Array( 44/* "ScriptBegin" */,3 , 74/* "$" */,0 ),
    /* State 2 */ new Array( 74/* "$" */,-1 , 44/* "ScriptBegin" */,-1 ),
    /* State 3 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 4 */ new Array( 45/* "ScriptEnd" */,36 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 5 */ new Array( 17/* ";" */,37 ),
    /* State 6 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,46 , 35/* "->" */,-43 ),
    /* State 7 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 8 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 9 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 10 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 11 */ new Array( 20/* "=" */,54 , 15/* "[" */,55 , 17/* ";" */,-84 , 30/* "-" */,-84 , 29/* "+" */,-84 , 32/* "*" */,-84 , 31/* "/" */,-84 , 35/* "->" */,-84 , 21/* "==" */,-84 , 28/* "<" */,-84 , 27/* ">" */,-84 , 25/* "<=" */,-84 , 26/* ">=" */,-84 , 22/* "!=" */,-84 , 19/* "." */,-84 , 33/* "(" */,-84 ),
    /* State 12 */ new Array( 35/* "->" */,56 ),
    /* State 13 */ new Array( 45/* "ScriptEnd" */,-29 , 2/* "IF" */,-29 , 4/* "WHILE" */,-29 , 5/* "DO" */,-29 , 6/* "ECHO" */,-29 , 38/* "Variable" */,-29 , 13/* "{" */,-29 , 46/* "InternalNonScript" */,-29 , 37/* "//" */,-29 , 7/* "RETURN" */,-29 , 8/* "NewToken" */,-29 , 33/* "(" */,-29 , 9/* "ClassToken" */,-29 , 39/* "FunctionName" */,-29 , 40/* "Identifier" */,-29 , 30/* "-" */,-29 , 41/* "String" */,-29 , 42/* "Integer" */,-29 , 43/* "Float" */,-29 , 14/* "}" */,-29 , 3/* "ELSE" */,-29 ),
    /* State 14 */ new Array( 45/* "ScriptEnd" */,-30 , 2/* "IF" */,-30 , 4/* "WHILE" */,-30 , 5/* "DO" */,-30 , 6/* "ECHO" */,-30 , 38/* "Variable" */,-30 , 13/* "{" */,-30 , 46/* "InternalNonScript" */,-30 , 37/* "//" */,-30 , 7/* "RETURN" */,-30 , 8/* "NewToken" */,-30 , 33/* "(" */,-30 , 9/* "ClassToken" */,-30 , 39/* "FunctionName" */,-30 , 40/* "Identifier" */,-30 , 30/* "-" */,-30 , 41/* "String" */,-30 , 42/* "Integer" */,-30 , 43/* "Float" */,-30 , 14/* "}" */,-30 , 3/* "ELSE" */,-30 ),
    /* State 15 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 16 */ new Array( 45/* "ScriptEnd" */,-33 , 2/* "IF" */,-33 , 4/* "WHILE" */,-33 , 5/* "DO" */,-33 , 6/* "ECHO" */,-33 , 38/* "Variable" */,-33 , 13/* "{" */,-33 , 46/* "InternalNonScript" */,-33 , 37/* "//" */,-33 , 7/* "RETURN" */,-33 , 8/* "NewToken" */,-33 , 33/* "(" */,-33 , 9/* "ClassToken" */,-33 , 39/* "FunctionName" */,-33 , 40/* "Identifier" */,-33 , 30/* "-" */,-33 , 41/* "String" */,-33 , 42/* "Integer" */,-33 , 43/* "Float" */,-33 , 14/* "}" */,-33 , 3/* "ELSE" */,-33 ),
    /* State 17 */ new Array( 40/* "Identifier" */,59 , 45/* "ScriptEnd" */,-37 , 2/* "IF" */,-37 , 4/* "WHILE" */,-37 , 5/* "DO" */,-37 , 6/* "ECHO" */,-37 , 38/* "Variable" */,-37 , 13/* "{" */,-37 , 46/* "InternalNonScript" */,-37 , 37/* "//" */,-37 , 7/* "RETURN" */,-37 , 8/* "NewToken" */,-37 , 33/* "(" */,-37 , 9/* "ClassToken" */,-37 , 39/* "FunctionName" */,-37 , 30/* "-" */,-37 , 41/* "String" */,-37 , 42/* "Integer" */,-37 , 43/* "Float" */,-37 , 14/* "}" */,-37 ),
    /* State 18 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 17/* ";" */,-42 ),
    /* State 19 */ new Array( 17/* ";" */,-49 , 35/* "->" */,-49 , 21/* "==" */,-49 , 28/* "<" */,-49 , 27/* ">" */,-49 , 25/* "<=" */,-49 , 26/* ">=" */,-49 , 22/* "!=" */,-49 , 19/* "." */,-49 , 33/* "(" */,-49 , 2/* "IF" */,-49 , 4/* "WHILE" */,-49 , 5/* "DO" */,-49 , 6/* "ECHO" */,-49 , 38/* "Variable" */,-49 , 13/* "{" */,-49 , 46/* "InternalNonScript" */,-49 , 37/* "//" */,-49 , 7/* "RETURN" */,-49 , 8/* "NewToken" */,-49 , 9/* "ClassToken" */,-49 , 39/* "FunctionName" */,-49 , 40/* "Identifier" */,-49 , 30/* "-" */,-49 , 41/* "String" */,-49 , 42/* "Integer" */,-49 , 43/* "Float" */,-49 , 34/* ")" */,-49 , 18/* "," */,-49 , 16/* "]" */,-49 , 20/* "=" */,-49 ),
    /* State 20 */ new Array( 40/* "Identifier" */,28 , 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 21 */ new Array( 17/* ";" */,-52 , 35/* "->" */,-52 , 21/* "==" */,-52 , 28/* "<" */,-52 , 27/* ">" */,-52 , 25/* "<=" */,-52 , 26/* ">=" */,-52 , 22/* "!=" */,-52 , 19/* "." */,-52 , 33/* "(" */,-52 , 2/* "IF" */,-52 , 4/* "WHILE" */,-52 , 5/* "DO" */,-52 , 6/* "ECHO" */,-52 , 38/* "Variable" */,-52 , 13/* "{" */,-52 , 46/* "InternalNonScript" */,-52 , 37/* "//" */,-52 , 7/* "RETURN" */,-52 , 8/* "NewToken" */,-52 , 9/* "ClassToken" */,-52 , 39/* "FunctionName" */,-52 , 40/* "Identifier" */,-52 , 30/* "-" */,-52 , 41/* "String" */,-52 , 42/* "Integer" */,-52 , 43/* "Float" */,-52 , 34/* ")" */,-52 , 18/* "," */,-52 , 16/* "]" */,-52 , 20/* "=" */,-52 ),
    /* State 22 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 23 */ new Array( 40/* "Identifier" */,64 ),
    /* State 24 */ new Array( 33/* "(" */,65 ),
    /* State 25 */ new Array( 29/* "+" */,66 , 30/* "-" */,67 , 17/* ";" */,-75 , 35/* "->" */,-75 , 21/* "==" */,-75 , 28/* "<" */,-75 , 27/* ">" */,-75 , 25/* "<=" */,-75 , 26/* ">=" */,-75 , 22/* "!=" */,-75 , 19/* "." */,-75 , 33/* "(" */,-75 , 2/* "IF" */,-75 , 4/* "WHILE" */,-75 , 5/* "DO" */,-75 , 6/* "ECHO" */,-75 , 38/* "Variable" */,-75 , 13/* "{" */,-75 , 46/* "InternalNonScript" */,-75 , 37/* "//" */,-75 , 7/* "RETURN" */,-75 , 8/* "NewToken" */,-75 , 9/* "ClassToken" */,-75 , 39/* "FunctionName" */,-75 , 40/* "Identifier" */,-75 , 41/* "String" */,-75 , 42/* "Integer" */,-75 , 43/* "Float" */,-75 , 34/* ")" */,-75 , 18/* "," */,-75 , 16/* "]" */,-75 , 20/* "=" */,-75 ),
    /* State 26 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 34/* ")" */,-65 , 18/* "," */,-65 ),
    /* State 27 */ new Array( 31/* "/" */,70 , 32/* "*" */,71 , 17/* ";" */,-78 , 30/* "-" */,-78 , 29/* "+" */,-78 , 35/* "->" */,-78 , 21/* "==" */,-78 , 28/* "<" */,-78 , 27/* ">" */,-78 , 25/* "<=" */,-78 , 26/* ">=" */,-78 , 22/* "!=" */,-78 , 19/* "." */,-78 , 33/* "(" */,-78 , 2/* "IF" */,-78 , 4/* "WHILE" */,-78 , 5/* "DO" */,-78 , 6/* "ECHO" */,-78 , 38/* "Variable" */,-78 , 13/* "{" */,-78 , 46/* "InternalNonScript" */,-78 , 37/* "//" */,-78 , 7/* "RETURN" */,-78 , 8/* "NewToken" */,-78 , 9/* "ClassToken" */,-78 , 39/* "FunctionName" */,-78 , 40/* "Identifier" */,-78 , 41/* "String" */,-78 , 42/* "Integer" */,-78 , 43/* "Float" */,-78 , 34/* ")" */,-78 , 18/* "," */,-78 , 16/* "]" */,-78 , 20/* "=" */,-78 ),
    /* State 28 */ new Array( 33/* "(" */,72 ),
    /* State 29 */ new Array( 17/* ";" */,-81 , 30/* "-" */,-81 , 29/* "+" */,-81 , 32/* "*" */,-81 , 31/* "/" */,-81 , 35/* "->" */,-81 , 21/* "==" */,-81 , 28/* "<" */,-81 , 27/* ">" */,-81 , 25/* "<=" */,-81 , 26/* ">=" */,-81 , 22/* "!=" */,-81 , 19/* "." */,-81 , 33/* "(" */,-81 , 2/* "IF" */,-81 , 4/* "WHILE" */,-81 , 5/* "DO" */,-81 , 6/* "ECHO" */,-81 , 38/* "Variable" */,-81 , 13/* "{" */,-81 , 46/* "InternalNonScript" */,-81 , 37/* "//" */,-81 , 7/* "RETURN" */,-81 , 8/* "NewToken" */,-81 , 9/* "ClassToken" */,-81 , 39/* "FunctionName" */,-81 , 40/* "Identifier" */,-81 , 41/* "String" */,-81 , 42/* "Integer" */,-81 , 43/* "Float" */,-81 , 34/* ")" */,-81 , 18/* "," */,-81 , 16/* "]" */,-81 , 20/* "=" */,-81 ),
    /* State 30 */ new Array( 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 31 */ new Array( 17/* ";" */,-83 , 30/* "-" */,-83 , 29/* "+" */,-83 , 32/* "*" */,-83 , 31/* "/" */,-83 , 35/* "->" */,-83 , 21/* "==" */,-83 , 28/* "<" */,-83 , 27/* ">" */,-83 , 25/* "<=" */,-83 , 26/* ">=" */,-83 , 22/* "!=" */,-83 , 19/* "." */,-83 , 33/* "(" */,-83 , 2/* "IF" */,-83 , 4/* "WHILE" */,-83 , 5/* "DO" */,-83 , 6/* "ECHO" */,-83 , 38/* "Variable" */,-83 , 13/* "{" */,-83 , 46/* "InternalNonScript" */,-83 , 37/* "//" */,-83 , 7/* "RETURN" */,-83 , 8/* "NewToken" */,-83 , 9/* "ClassToken" */,-83 , 39/* "FunctionName" */,-83 , 40/* "Identifier" */,-83 , 41/* "String" */,-83 , 42/* "Integer" */,-83 , 43/* "Float" */,-83 , 34/* ")" */,-83 , 18/* "," */,-83 , 16/* "]" */,-83 , 20/* "=" */,-83 ),
    /* State 32 */ new Array( 17/* ";" */,-86 , 30/* "-" */,-86 , 29/* "+" */,-86 , 32/* "*" */,-86 , 31/* "/" */,-86 , 35/* "->" */,-86 , 21/* "==" */,-86 , 28/* "<" */,-86 , 27/* ">" */,-86 , 25/* "<=" */,-86 , 26/* ">=" */,-86 , 22/* "!=" */,-86 , 19/* "." */,-86 , 33/* "(" */,-86 , 2/* "IF" */,-86 , 4/* "WHILE" */,-86 , 5/* "DO" */,-86 , 6/* "ECHO" */,-86 , 38/* "Variable" */,-86 , 13/* "{" */,-86 , 46/* "InternalNonScript" */,-86 , 37/* "//" */,-86 , 7/* "RETURN" */,-86 , 8/* "NewToken" */,-86 , 9/* "ClassToken" */,-86 , 39/* "FunctionName" */,-86 , 40/* "Identifier" */,-86 , 41/* "String" */,-86 , 42/* "Integer" */,-86 , 43/* "Float" */,-86 , 34/* ")" */,-86 , 18/* "," */,-86 , 16/* "]" */,-86 , 20/* "=" */,-86 ),
    /* State 33 */ new Array( 17/* ";" */,-87 , 30/* "-" */,-87 , 29/* "+" */,-87 , 32/* "*" */,-87 , 31/* "/" */,-87 , 35/* "->" */,-87 , 21/* "==" */,-87 , 28/* "<" */,-87 , 27/* ">" */,-87 , 25/* "<=" */,-87 , 26/* ">=" */,-87 , 22/* "!=" */,-87 , 19/* "." */,-87 , 33/* "(" */,-87 , 2/* "IF" */,-87 , 4/* "WHILE" */,-87 , 5/* "DO" */,-87 , 6/* "ECHO" */,-87 , 38/* "Variable" */,-87 , 13/* "{" */,-87 , 46/* "InternalNonScript" */,-87 , 37/* "//" */,-87 , 7/* "RETURN" */,-87 , 8/* "NewToken" */,-87 , 9/* "ClassToken" */,-87 , 39/* "FunctionName" */,-87 , 40/* "Identifier" */,-87 , 41/* "String" */,-87 , 42/* "Integer" */,-87 , 43/* "Float" */,-87 , 34/* ")" */,-87 , 18/* "," */,-87 , 16/* "]" */,-87 , 20/* "=" */,-87 ),
    /* State 34 */ new Array( 17/* ";" */,-88 , 30/* "-" */,-88 , 29/* "+" */,-88 , 32/* "*" */,-88 , 31/* "/" */,-88 , 35/* "->" */,-88 , 21/* "==" */,-88 , 28/* "<" */,-88 , 27/* ">" */,-88 , 25/* "<=" */,-88 , 26/* ">=" */,-88 , 22/* "!=" */,-88 , 19/* "." */,-88 , 33/* "(" */,-88 , 2/* "IF" */,-88 , 4/* "WHILE" */,-88 , 5/* "DO" */,-88 , 6/* "ECHO" */,-88 , 38/* "Variable" */,-88 , 13/* "{" */,-88 , 46/* "InternalNonScript" */,-88 , 37/* "//" */,-88 , 7/* "RETURN" */,-88 , 8/* "NewToken" */,-88 , 9/* "ClassToken" */,-88 , 39/* "FunctionName" */,-88 , 40/* "Identifier" */,-88 , 41/* "String" */,-88 , 42/* "Integer" */,-88 , 43/* "Float" */,-88 , 34/* ")" */,-88 , 18/* "," */,-88 , 16/* "]" */,-88 , 20/* "=" */,-88 ),
    /* State 35 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 45/* "ScriptEnd" */,-19 , 14/* "}" */,-19 , 3/* "ELSE" */,-19 ),
    /* State 36 */ new Array( 74/* "$" */,-3 , 44/* "ScriptBegin" */,-3 ),
    /* State 37 */ new Array( 45/* "ScriptEnd" */,-20 , 2/* "IF" */,-20 , 4/* "WHILE" */,-20 , 5/* "DO" */,-20 , 6/* "ECHO" */,-20 , 38/* "Variable" */,-20 , 13/* "{" */,-20 , 46/* "InternalNonScript" */,-20 , 37/* "//" */,-20 , 7/* "RETURN" */,-20 , 8/* "NewToken" */,-20 , 33/* "(" */,-20 , 9/* "ClassToken" */,-20 , 39/* "FunctionName" */,-20 , 40/* "Identifier" */,-20 , 30/* "-" */,-20 , 41/* "String" */,-20 , 42/* "Integer" */,-20 , 43/* "Float" */,-20 , 14/* "}" */,-20 , 3/* "ELSE" */,-20 ),
    /* State 38 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 18/* "," */,-56 , 34/* ")" */,-56 , 21/* "==" */,-56 , 28/* "<" */,-56 , 27/* ">" */,-56 , 25/* "<=" */,-56 , 26/* ">=" */,-56 , 22/* "!=" */,-56 , 19/* "." */,-56 , 35/* "->" */,-56 ),
    /* State 39 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 40 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 41 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 42 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 43 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 44 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 45 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 46 */ new Array( 45/* "ScriptEnd" */,-21 , 2/* "IF" */,-21 , 4/* "WHILE" */,-21 , 5/* "DO" */,-21 , 6/* "ECHO" */,-21 , 38/* "Variable" */,-21 , 13/* "{" */,-21 , 46/* "InternalNonScript" */,-21 , 37/* "//" */,-21 , 7/* "RETURN" */,-21 , 8/* "NewToken" */,-21 , 33/* "(" */,-21 , 9/* "ClassToken" */,-21 , 39/* "FunctionName" */,-21 , 40/* "Identifier" */,-21 , 30/* "-" */,-21 , 41/* "String" */,-21 , 42/* "Integer" */,-21 , 43/* "Float" */,-21 , 14/* "}" */,-21 , 3/* "ELSE" */,-21 ),
    /* State 47 */ new Array( 33/* "(" */,84 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 35/* "->" */,-43 ),
    /* State 48 */ new Array( 35/* "->" */,86 ),
    /* State 49 */ new Array( 15/* "[" */,55 , 2/* "IF" */,-84 , 4/* "WHILE" */,-84 , 5/* "DO" */,-84 , 6/* "ECHO" */,-84 , 38/* "Variable" */,-84 , 13/* "{" */,-84 , 46/* "InternalNonScript" */,-84 , 37/* "//" */,-84 , 7/* "RETURN" */,-84 , 8/* "NewToken" */,-84 , 33/* "(" */,-84 , 9/* "ClassToken" */,-84 , 39/* "FunctionName" */,-84 , 40/* "Identifier" */,-84 , 30/* "-" */,-84 , 41/* "String" */,-84 , 42/* "Integer" */,-84 , 43/* "Float" */,-84 , 29/* "+" */,-84 , 32/* "*" */,-84 , 31/* "/" */,-84 , 21/* "==" */,-84 , 28/* "<" */,-84 , 27/* ">" */,-84 , 25/* "<=" */,-84 , 26/* ">=" */,-84 , 22/* "!=" */,-84 , 19/* "." */,-84 , 35/* "->" */,-84 , 17/* ";" */,-84 , 34/* ")" */,-84 , 18/* "," */,-84 , 16/* "]" */,-84 , 20/* "=" */,-84 ),
    /* State 50 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 5/* "DO" */,88 , 35/* "->" */,-43 ),
    /* State 51 */ new Array( 4/* "WHILE" */,89 , 2/* "IF" */,7 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 52 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,90 , 35/* "->" */,-43 ),
    /* State 53 */ new Array( 15/* "[" */,91 , 20/* "=" */,92 , 17/* ";" */,-53 , 35/* "->" */,-53 , 21/* "==" */,-53 , 28/* "<" */,-53 , 27/* ">" */,-53 , 25/* "<=" */,-53 , 26/* ">=" */,-53 , 22/* "!=" */,-53 , 19/* "." */,-53 , 33/* "(" */,-53 ),
    /* State 54 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 55 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 56 */ new Array( 40/* "Identifier" */,98 , 8/* "NewToken" */,101 , 38/* "Variable" */,103 , 33/* "(" */,104 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 57 */ new Array( 14/* "}" */,105 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 58 */ new Array( 45/* "ScriptEnd" */,-34 , 2/* "IF" */,-34 , 4/* "WHILE" */,-34 , 5/* "DO" */,-34 , 6/* "ECHO" */,-34 , 38/* "Variable" */,-34 , 13/* "{" */,-34 , 46/* "InternalNonScript" */,-34 , 37/* "//" */,-34 , 7/* "RETURN" */,-34 , 8/* "NewToken" */,-34 , 33/* "(" */,-34 , 9/* "ClassToken" */,-34 , 39/* "FunctionName" */,-34 , 40/* "Identifier" */,-34 , 30/* "-" */,-34 , 41/* "String" */,-34 , 42/* "Integer" */,-34 , 43/* "Float" */,-34 , 14/* "}" */,-34 , 3/* "ELSE" */,-34 ),
    /* State 59 */ new Array( 41/* "String" */,106 , 45/* "ScriptEnd" */,-36 , 2/* "IF" */,-36 , 4/* "WHILE" */,-36 , 5/* "DO" */,-36 , 6/* "ECHO" */,-36 , 38/* "Variable" */,-36 , 13/* "{" */,-36 , 46/* "InternalNonScript" */,-36 , 37/* "//" */,-36 , 7/* "RETURN" */,-36 , 8/* "NewToken" */,-36 , 33/* "(" */,-36 , 9/* "ClassToken" */,-36 , 39/* "FunctionName" */,-36 , 40/* "Identifier" */,-36 , 30/* "-" */,-36 , 42/* "Integer" */,-36 , 43/* "Float" */,-36 , 14/* "}" */,-36 , 3/* "ELSE" */,-36 ),
    /* State 60 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,-41 , 35/* "->" */,-43 ),
    /* State 61 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 34/* ")" */,-65 , 18/* "," */,-65 ),
    /* State 62 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 35/* "->" */,-43 , 20/* "=" */,-43 , 17/* ";" */,-43 , 2/* "IF" */,-43 , 4/* "WHILE" */,-43 , 5/* "DO" */,-43 , 6/* "ECHO" */,-43 , 38/* "Variable" */,-43 , 13/* "{" */,-43 , 46/* "InternalNonScript" */,-43 , 37/* "//" */,-43 , 7/* "RETURN" */,-43 , 8/* "NewToken" */,-43 , 9/* "ClassToken" */,-43 , 39/* "FunctionName" */,-43 , 40/* "Identifier" */,-43 , 30/* "-" */,-43 , 41/* "String" */,-43 , 42/* "Integer" */,-43 , 43/* "Float" */,-43 , 34/* ")" */,-43 , 18/* "," */,-43 , 16/* "]" */,-43 ),
    /* State 63 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 34/* ")" */,108 , 35/* "->" */,-43 ),
    /* State 64 */ new Array( 13/* "{" */,109 ),
    /* State 65 */ new Array( 38/* "Variable" */,111 , 34/* ")" */,-40 , 18/* "," */,-40 ),
    /* State 66 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 67 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 68 */ new Array( 18/* "," */,114 , 34/* ")" */,115 ),
    /* State 69 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 34/* ")" */,-64 , 18/* "," */,-64 , 35/* "->" */,-43 ),
    /* State 70 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 71 */ new Array( 30/* "-" */,30 , 38/* "Variable" */,74 , 33/* "(" */,75 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 72 */ new Array( 8/* "NewToken" */,-55 , 38/* "Variable" */,-55 , 33/* "(" */,-55 , 18/* "," */,-55 , 40/* "Identifier" */,-55 , 30/* "-" */,-55 , 41/* "String" */,-55 , 42/* "Integer" */,-55 , 43/* "Float" */,-55 , 34/* ")" */,-55 ),
    /* State 73 */ new Array( 17/* ";" */,-82 , 30/* "-" */,-82 , 29/* "+" */,-82 , 32/* "*" */,-82 , 31/* "/" */,-82 , 35/* "->" */,-82 , 21/* "==" */,-82 , 28/* "<" */,-82 , 27/* ">" */,-82 , 25/* "<=" */,-82 , 26/* ">=" */,-82 , 22/* "!=" */,-82 , 19/* "." */,-82 , 33/* "(" */,-82 , 2/* "IF" */,-82 , 4/* "WHILE" */,-82 , 5/* "DO" */,-82 , 6/* "ECHO" */,-82 , 38/* "Variable" */,-82 , 13/* "{" */,-82 , 46/* "InternalNonScript" */,-82 , 37/* "//" */,-82 , 7/* "RETURN" */,-82 , 8/* "NewToken" */,-82 , 9/* "ClassToken" */,-82 , 39/* "FunctionName" */,-82 , 40/* "Identifier" */,-82 , 41/* "String" */,-82 , 42/* "Integer" */,-82 , 43/* "Float" */,-82 , 34/* ")" */,-82 , 18/* "," */,-82 , 16/* "]" */,-82 , 20/* "=" */,-82 ),
    /* State 74 */ new Array( 17/* ";" */,-84 , 30/* "-" */,-84 , 29/* "+" */,-84 , 32/* "*" */,-84 , 31/* "/" */,-84 , 35/* "->" */,-84 , 21/* "==" */,-84 , 28/* "<" */,-84 , 27/* ">" */,-84 , 25/* "<=" */,-84 , 26/* ">=" */,-84 , 22/* "!=" */,-84 , 19/* "." */,-84 , 33/* "(" */,-84 , 2/* "IF" */,-84 , 4/* "WHILE" */,-84 , 5/* "DO" */,-84 , 6/* "ECHO" */,-84 , 38/* "Variable" */,-84 , 13/* "{" */,-84 , 46/* "InternalNonScript" */,-84 , 37/* "//" */,-84 , 7/* "RETURN" */,-84 , 8/* "NewToken" */,-84 , 9/* "ClassToken" */,-84 , 39/* "FunctionName" */,-84 , 40/* "Identifier" */,-84 , 41/* "String" */,-84 , 42/* "Integer" */,-84 , 43/* "Float" */,-84 , 34/* ")" */,-84 , 18/* "," */,-84 , 16/* "]" */,-84 , 20/* "=" */,-84 ),
    /* State 75 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 76 */ new Array( 18/* "," */,114 , 34/* ")" */,119 ),
    /* State 77 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,-74 , 35/* "->" */,-43 , 2/* "IF" */,-74 , 4/* "WHILE" */,-74 , 5/* "DO" */,-74 , 6/* "ECHO" */,-74 , 38/* "Variable" */,-74 , 13/* "{" */,-74 , 46/* "InternalNonScript" */,-74 , 37/* "//" */,-74 , 7/* "RETURN" */,-74 , 8/* "NewToken" */,-74 , 9/* "ClassToken" */,-74 , 39/* "FunctionName" */,-74 , 40/* "Identifier" */,-74 , 30/* "-" */,-74 , 41/* "String" */,-74 , 42/* "Integer" */,-74 , 43/* "Float" */,-74 , 20/* "=" */,-74 , 34/* ")" */,-74 , 18/* "," */,-74 , 16/* "]" */,-74 ),
    /* State 78 */ new Array( 29/* "+" */,66 , 30/* "-" */,67 , 17/* ";" */,-73 , 35/* "->" */,-73 , 21/* "==" */,-73 , 28/* "<" */,-73 , 27/* ">" */,-73 , 25/* "<=" */,-73 , 26/* ">=" */,-73 , 22/* "!=" */,-73 , 19/* "." */,-73 , 33/* "(" */,-73 , 2/* "IF" */,-73 , 4/* "WHILE" */,-73 , 5/* "DO" */,-73 , 6/* "ECHO" */,-73 , 38/* "Variable" */,-73 , 13/* "{" */,-73 , 46/* "InternalNonScript" */,-73 , 37/* "//" */,-73 , 7/* "RETURN" */,-73 , 8/* "NewToken" */,-73 , 9/* "ClassToken" */,-73 , 39/* "FunctionName" */,-73 , 40/* "Identifier" */,-73 , 41/* "String" */,-73 , 42/* "Integer" */,-73 , 43/* "Float" */,-73 , 20/* "=" */,-73 , 34/* ")" */,-73 , 18/* "," */,-73 , 16/* "]" */,-73 ),
    /* State 79 */ new Array( 29/* "+" */,66 , 30/* "-" */,67 , 17/* ";" */,-72 , 35/* "->" */,-72 , 21/* "==" */,-72 , 28/* "<" */,-72 , 27/* ">" */,-72 , 25/* "<=" */,-72 , 26/* ">=" */,-72 , 22/* "!=" */,-72 , 19/* "." */,-72 , 33/* "(" */,-72 , 2/* "IF" */,-72 , 4/* "WHILE" */,-72 , 5/* "DO" */,-72 , 6/* "ECHO" */,-72 , 38/* "Variable" */,-72 , 13/* "{" */,-72 , 46/* "InternalNonScript" */,-72 , 37/* "//" */,-72 , 7/* "RETURN" */,-72 , 8/* "NewToken" */,-72 , 9/* "ClassToken" */,-72 , 39/* "FunctionName" */,-72 , 40/* "Identifier" */,-72 , 41/* "String" */,-72 , 42/* "Integer" */,-72 , 43/* "Float" */,-72 , 20/* "=" */,-72 , 34/* ")" */,-72 , 18/* "," */,-72 , 16/* "]" */,-72 ),
    /* State 80 */ new Array( 29/* "+" */,66 , 30/* "-" */,67 , 17/* ";" */,-71 , 35/* "->" */,-71 , 21/* "==" */,-71 , 28/* "<" */,-71 , 27/* ">" */,-71 , 25/* "<=" */,-71 , 26/* ">=" */,-71 , 22/* "!=" */,-71 , 19/* "." */,-71 , 33/* "(" */,-71 , 2/* "IF" */,-71 , 4/* "WHILE" */,-71 , 5/* "DO" */,-71 , 6/* "ECHO" */,-71 , 38/* "Variable" */,-71 , 13/* "{" */,-71 , 46/* "InternalNonScript" */,-71 , 37/* "//" */,-71 , 7/* "RETURN" */,-71 , 8/* "NewToken" */,-71 , 9/* "ClassToken" */,-71 , 39/* "FunctionName" */,-71 , 40/* "Identifier" */,-71 , 41/* "String" */,-71 , 42/* "Integer" */,-71 , 43/* "Float" */,-71 , 20/* "=" */,-71 , 34/* ")" */,-71 , 18/* "," */,-71 , 16/* "]" */,-71 ),
    /* State 81 */ new Array( 29/* "+" */,66 , 30/* "-" */,67 , 17/* ";" */,-70 , 35/* "->" */,-70 , 21/* "==" */,-70 , 28/* "<" */,-70 , 27/* ">" */,-70 , 25/* "<=" */,-70 , 26/* ">=" */,-70 , 22/* "!=" */,-70 , 19/* "." */,-70 , 33/* "(" */,-70 , 2/* "IF" */,-70 , 4/* "WHILE" */,-70 , 5/* "DO" */,-70 , 6/* "ECHO" */,-70 , 38/* "Variable" */,-70 , 13/* "{" */,-70 , 46/* "InternalNonScript" */,-70 , 37/* "//" */,-70 , 7/* "RETURN" */,-70 , 8/* "NewToken" */,-70 , 9/* "ClassToken" */,-70 , 39/* "FunctionName" */,-70 , 40/* "Identifier" */,-70 , 41/* "String" */,-70 , 42/* "Integer" */,-70 , 43/* "Float" */,-70 , 20/* "=" */,-70 , 34/* ")" */,-70 , 18/* "," */,-70 , 16/* "]" */,-70 ),
    /* State 82 */ new Array( 29/* "+" */,66 , 30/* "-" */,67 , 17/* ";" */,-69 , 35/* "->" */,-69 , 21/* "==" */,-69 , 28/* "<" */,-69 , 27/* ">" */,-69 , 25/* "<=" */,-69 , 26/* ">=" */,-69 , 22/* "!=" */,-69 , 19/* "." */,-69 , 33/* "(" */,-69 , 2/* "IF" */,-69 , 4/* "WHILE" */,-69 , 5/* "DO" */,-69 , 6/* "ECHO" */,-69 , 38/* "Variable" */,-69 , 13/* "{" */,-69 , 46/* "InternalNonScript" */,-69 , 37/* "//" */,-69 , 7/* "RETURN" */,-69 , 8/* "NewToken" */,-69 , 9/* "ClassToken" */,-69 , 39/* "FunctionName" */,-69 , 40/* "Identifier" */,-69 , 41/* "String" */,-69 , 42/* "Integer" */,-69 , 43/* "Float" */,-69 , 20/* "=" */,-69 , 34/* ")" */,-69 , 18/* "," */,-69 , 16/* "]" */,-69 ),
    /* State 83 */ new Array( 29/* "+" */,66 , 30/* "-" */,67 , 17/* ";" */,-68 , 35/* "->" */,-68 , 21/* "==" */,-68 , 28/* "<" */,-68 , 27/* ">" */,-68 , 25/* "<=" */,-68 , 26/* ">=" */,-68 , 22/* "!=" */,-68 , 19/* "." */,-68 , 33/* "(" */,-68 , 2/* "IF" */,-68 , 4/* "WHILE" */,-68 , 5/* "DO" */,-68 , 6/* "ECHO" */,-68 , 38/* "Variable" */,-68 , 13/* "{" */,-68 , 46/* "InternalNonScript" */,-68 , 37/* "//" */,-68 , 7/* "RETURN" */,-68 , 8/* "NewToken" */,-68 , 9/* "ClassToken" */,-68 , 39/* "FunctionName" */,-68 , 40/* "Identifier" */,-68 , 41/* "String" */,-68 , 42/* "Integer" */,-68 , 43/* "Float" */,-68 , 18/* "," */,-68 , 34/* ")" */,-68 , 20/* "=" */,-68 , 16/* "]" */,-68 ),
    /* State 84 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 18/* "," */,-56 , 34/* ")" */,-56 ),
    /* State 85 */ new Array( 3/* "ELSE" */,121 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 45/* "ScriptEnd" */,-22 , 14/* "}" */,-22 ),
    /* State 86 */ new Array( 40/* "Identifier" */,98 , 8/* "NewToken" */,101 , 38/* "Variable" */,103 , 33/* "(" */,104 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 87 */ new Array( 15/* "[" */,91 , 2/* "IF" */,-53 , 4/* "WHILE" */,-53 , 5/* "DO" */,-53 , 6/* "ECHO" */,-53 , 38/* "Variable" */,-53 , 13/* "{" */,-53 , 46/* "InternalNonScript" */,-53 , 37/* "//" */,-53 , 7/* "RETURN" */,-53 , 8/* "NewToken" */,-53 , 33/* "(" */,-53 , 9/* "ClassToken" */,-53 , 39/* "FunctionName" */,-53 , 40/* "Identifier" */,-53 , 30/* "-" */,-53 , 41/* "String" */,-53 , 42/* "Integer" */,-53 , 43/* "Float" */,-53 , 21/* "==" */,-53 , 28/* "<" */,-53 , 27/* ">" */,-53 , 25/* "<=" */,-53 , 26/* ">=" */,-53 , 22/* "!=" */,-53 , 19/* "." */,-53 , 35/* "->" */,-53 , 17/* ";" */,-53 , 34/* ")" */,-53 , 18/* "," */,-53 , 16/* "]" */,-53 , 20/* "=" */,-53 ),
    /* State 88 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 89 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 90 */ new Array( 45/* "ScriptEnd" */,-26 , 2/* "IF" */,-26 , 4/* "WHILE" */,-26 , 5/* "DO" */,-26 , 6/* "ECHO" */,-26 , 38/* "Variable" */,-26 , 13/* "{" */,-26 , 46/* "InternalNonScript" */,-26 , 37/* "//" */,-26 , 7/* "RETURN" */,-26 , 8/* "NewToken" */,-26 , 33/* "(" */,-26 , 9/* "ClassToken" */,-26 , 39/* "FunctionName" */,-26 , 40/* "Identifier" */,-26 , 30/* "-" */,-26 , 41/* "String" */,-26 , 42/* "Integer" */,-26 , 43/* "Float" */,-26 , 14/* "}" */,-26 , 3/* "ELSE" */,-26 ),
    /* State 91 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 92 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 93 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,127 , 35/* "->" */,-43 ),
    /* State 94 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 16/* "]" */,128 , 35/* "->" */,-43 ),
    /* State 95 */ new Array( 20/* "=" */,129 , 17/* ";" */,-58 , 35/* "->" */,-58 , 21/* "==" */,-58 , 28/* "<" */,-58 , 27/* ">" */,-58 , 25/* "<=" */,-58 , 26/* ">=" */,-58 , 22/* "!=" */,-58 , 19/* "." */,-58 , 33/* "(" */,-58 ),
    /* State 96 */ new Array( 17/* ";" */,-51 , 35/* "->" */,-51 , 21/* "==" */,-51 , 28/* "<" */,-51 , 27/* ">" */,-51 , 25/* "<=" */,-51 , 26/* ">=" */,-51 , 22/* "!=" */,-51 , 19/* "." */,-51 , 33/* "(" */,-51 , 2/* "IF" */,-51 , 4/* "WHILE" */,-51 , 5/* "DO" */,-51 , 6/* "ECHO" */,-51 , 38/* "Variable" */,-51 , 13/* "{" */,-51 , 46/* "InternalNonScript" */,-51 , 37/* "//" */,-51 , 7/* "RETURN" */,-51 , 8/* "NewToken" */,-51 , 9/* "ClassToken" */,-51 , 39/* "FunctionName" */,-51 , 40/* "Identifier" */,-51 , 30/* "-" */,-51 , 41/* "String" */,-51 , 42/* "Integer" */,-51 , 43/* "Float" */,-51 , 34/* ")" */,-51 , 18/* "," */,-51 , 16/* "]" */,-51 , 20/* "=" */,-51 ),
    /* State 97 */ new Array( 17/* ";" */,-57 , 35/* "->" */,-52 , 21/* "==" */,-52 , 28/* "<" */,-52 , 27/* ">" */,-52 , 25/* "<=" */,-52 , 26/* ">=" */,-52 , 22/* "!=" */,-52 , 19/* "." */,-52 , 33/* "(" */,-52 , 2/* "IF" */,-57 , 4/* "WHILE" */,-57 , 5/* "DO" */,-57 , 6/* "ECHO" */,-57 , 38/* "Variable" */,-57 , 13/* "{" */,-57 , 46/* "InternalNonScript" */,-57 , 37/* "//" */,-57 , 7/* "RETURN" */,-57 , 8/* "NewToken" */,-57 , 9/* "ClassToken" */,-57 , 39/* "FunctionName" */,-57 , 40/* "Identifier" */,-57 , 30/* "-" */,-57 , 41/* "String" */,-57 , 42/* "Integer" */,-57 , 43/* "Float" */,-57 , 34/* ")" */,-57 , 18/* "," */,-57 , 16/* "]" */,-57 , 20/* "=" */,-57 ),
    /* State 98 */ new Array( 33/* "(" */,72 , 20/* "=" */,-59 , 17/* ";" */,-59 , 35/* "->" */,-59 , 21/* "==" */,-59 , 28/* "<" */,-59 , 27/* ">" */,-59 , 25/* "<=" */,-59 , 26/* ">=" */,-59 , 22/* "!=" */,-59 , 19/* "." */,-59 , 2/* "IF" */,-59 , 4/* "WHILE" */,-59 , 5/* "DO" */,-59 , 6/* "ECHO" */,-59 , 38/* "Variable" */,-59 , 13/* "{" */,-59 , 46/* "InternalNonScript" */,-59 , 37/* "//" */,-59 , 7/* "RETURN" */,-59 , 8/* "NewToken" */,-59 , 9/* "ClassToken" */,-59 , 39/* "FunctionName" */,-59 , 40/* "Identifier" */,-59 , 30/* "-" */,-59 , 41/* "String" */,-59 , 42/* "Integer" */,-59 , 43/* "Float" */,-59 , 34/* ")" */,-59 , 18/* "," */,-59 , 16/* "]" */,-59 ),
    /* State 99 */ new Array( 20/* "=" */,-60 , 17/* ";" */,-60 , 35/* "->" */,-60 , 21/* "==" */,-60 , 28/* "<" */,-60 , 27/* ">" */,-60 , 25/* "<=" */,-60 , 26/* ">=" */,-60 , 22/* "!=" */,-60 , 19/* "." */,-60 , 33/* "(" */,-60 , 2/* "IF" */,-60 , 4/* "WHILE" */,-60 , 5/* "DO" */,-60 , 6/* "ECHO" */,-60 , 38/* "Variable" */,-60 , 13/* "{" */,-60 , 46/* "InternalNonScript" */,-60 , 37/* "//" */,-60 , 7/* "RETURN" */,-60 , 8/* "NewToken" */,-60 , 9/* "ClassToken" */,-60 , 39/* "FunctionName" */,-60 , 40/* "Identifier" */,-60 , 30/* "-" */,-60 , 41/* "String" */,-60 , 42/* "Integer" */,-60 , 43/* "Float" */,-60 , 34/* ")" */,-60 , 18/* "," */,-60 , 16/* "]" */,-60 ),
    /* State 100 */ new Array( 20/* "=" */,-44 , 17/* ";" */,-44 , 35/* "->" */,-44 , 21/* "==" */,-44 , 28/* "<" */,-44 , 27/* ">" */,-44 , 25/* "<=" */,-44 , 26/* ">=" */,-44 , 22/* "!=" */,-44 , 19/* "." */,-44 , 33/* "(" */,-44 , 2/* "IF" */,-49 , 4/* "WHILE" */,-49 , 5/* "DO" */,-49 , 6/* "ECHO" */,-49 , 38/* "Variable" */,-49 , 13/* "{" */,-49 , 46/* "InternalNonScript" */,-49 , 37/* "//" */,-49 , 7/* "RETURN" */,-49 , 8/* "NewToken" */,-49 , 9/* "ClassToken" */,-49 , 39/* "FunctionName" */,-49 , 40/* "Identifier" */,-49 , 30/* "-" */,-49 , 41/* "String" */,-49 , 42/* "Integer" */,-49 , 43/* "Float" */,-49 , 34/* ")" */,-49 , 18/* "," */,-49 , 16/* "]" */,-49 ),
    /* State 101 */ new Array( 40/* "Identifier" */,28 , 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 102 */ new Array( 35/* "->" */,131 ),
    /* State 103 */ new Array( 15/* "[" */,55 , 20/* "=" */,-84 , 17/* ";" */,-84 , 35/* "->" */,-84 , 21/* "==" */,-84 , 28/* "<" */,-84 , 27/* ">" */,-84 , 25/* "<=" */,-84 , 26/* ">=" */,-84 , 22/* "!=" */,-84 , 19/* "." */,-84 , 33/* "(" */,-84 , 30/* "-" */,-84 , 29/* "+" */,-84 , 32/* "*" */,-84 , 31/* "/" */,-84 , 2/* "IF" */,-84 , 4/* "WHILE" */,-84 , 5/* "DO" */,-84 , 6/* "ECHO" */,-84 , 38/* "Variable" */,-84 , 13/* "{" */,-84 , 46/* "InternalNonScript" */,-84 , 37/* "//" */,-84 , 7/* "RETURN" */,-84 , 8/* "NewToken" */,-84 , 9/* "ClassToken" */,-84 , 39/* "FunctionName" */,-84 , 40/* "Identifier" */,-84 , 41/* "String" */,-84 , 42/* "Integer" */,-84 , 43/* "Float" */,-84 , 34/* ")" */,-84 , 18/* "," */,-84 , 16/* "]" */,-84 ),
    /* State 104 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 105 */ new Array( 45/* "ScriptEnd" */,-32 , 2/* "IF" */,-32 , 4/* "WHILE" */,-32 , 5/* "DO" */,-32 , 6/* "ECHO" */,-32 , 38/* "Variable" */,-32 , 13/* "{" */,-32 , 46/* "InternalNonScript" */,-32 , 37/* "//" */,-32 , 7/* "RETURN" */,-32 , 8/* "NewToken" */,-32 , 33/* "(" */,-32 , 9/* "ClassToken" */,-32 , 39/* "FunctionName" */,-32 , 40/* "Identifier" */,-32 , 30/* "-" */,-32 , 41/* "String" */,-32 , 42/* "Integer" */,-32 , 43/* "Float" */,-32 , 14/* "}" */,-32 , 3/* "ELSE" */,-32 ),
    /* State 106 */ new Array( 45/* "ScriptEnd" */,-35 , 2/* "IF" */,-35 , 4/* "WHILE" */,-35 , 5/* "DO" */,-35 , 6/* "ECHO" */,-35 , 38/* "Variable" */,-35 , 13/* "{" */,-35 , 46/* "InternalNonScript" */,-35 , 37/* "//" */,-35 , 7/* "RETURN" */,-35 , 8/* "NewToken" */,-35 , 33/* "(" */,-35 , 9/* "ClassToken" */,-35 , 39/* "FunctionName" */,-35 , 40/* "Identifier" */,-35 , 30/* "-" */,-35 , 41/* "String" */,-35 , 42/* "Integer" */,-35 , 43/* "Float" */,-35 , 14/* "}" */,-35 , 3/* "ELSE" */,-35 ),
    /* State 107 */ new Array( 18/* "," */,114 , 34/* ")" */,134 ),
    /* State 108 */ new Array( 17/* ";" */,-54 , 35/* "->" */,-54 , 21/* "==" */,-54 , 28/* "<" */,-54 , 27/* ">" */,-54 , 25/* "<=" */,-54 , 26/* ">=" */,-54 , 22/* "!=" */,-54 , 19/* "." */,-54 , 33/* "(" */,-54 , 2/* "IF" */,-54 , 4/* "WHILE" */,-54 , 5/* "DO" */,-54 , 6/* "ECHO" */,-54 , 38/* "Variable" */,-54 , 13/* "{" */,-54 , 46/* "InternalNonScript" */,-54 , 37/* "//" */,-54 , 7/* "RETURN" */,-54 , 8/* "NewToken" */,-54 , 9/* "ClassToken" */,-54 , 39/* "FunctionName" */,-54 , 40/* "Identifier" */,-54 , 30/* "-" */,-54 , 41/* "String" */,-54 , 42/* "Integer" */,-54 , 43/* "Float" */,-54 , 34/* ")" */,-54 , 18/* "," */,-54 , 16/* "]" */,-54 , 20/* "=" */,-54 , 29/* "+" */,-85 , 32/* "*" */,-85 , 31/* "/" */,-85 ),
    /* State 109 */ new Array( 14/* "}" */,-7 , 10/* "PublicToken" */,-7 , 12/* "ProtectedToken" */,-7 , 11/* "PrivateToken" */,-7 , 39/* "FunctionName" */,-7 ),
    /* State 110 */ new Array( 18/* "," */,136 , 34/* ")" */,137 ),
    /* State 111 */ new Array( 34/* ")" */,-39 , 18/* "," */,-39 ),
    /* State 112 */ new Array( 31/* "/" */,70 , 32/* "*" */,71 , 17/* ";" */,-77 , 30/* "-" */,-77 , 29/* "+" */,-77 , 35/* "->" */,-77 , 21/* "==" */,-77 , 28/* "<" */,-77 , 27/* ">" */,-77 , 25/* "<=" */,-77 , 26/* ">=" */,-77 , 22/* "!=" */,-77 , 19/* "." */,-77 , 33/* "(" */,-77 , 2/* "IF" */,-77 , 4/* "WHILE" */,-77 , 5/* "DO" */,-77 , 6/* "ECHO" */,-77 , 38/* "Variable" */,-77 , 13/* "{" */,-77 , 46/* "InternalNonScript" */,-77 , 37/* "//" */,-77 , 7/* "RETURN" */,-77 , 8/* "NewToken" */,-77 , 9/* "ClassToken" */,-77 , 39/* "FunctionName" */,-77 , 40/* "Identifier" */,-77 , 41/* "String" */,-77 , 42/* "Integer" */,-77 , 43/* "Float" */,-77 , 34/* ")" */,-77 , 18/* "," */,-77 , 16/* "]" */,-77 , 20/* "=" */,-77 ),
    /* State 113 */ new Array( 31/* "/" */,70 , 32/* "*" */,71 , 17/* ";" */,-76 , 30/* "-" */,-76 , 29/* "+" */,-76 , 35/* "->" */,-76 , 21/* "==" */,-76 , 28/* "<" */,-76 , 27/* ">" */,-76 , 25/* "<=" */,-76 , 26/* ">=" */,-76 , 22/* "!=" */,-76 , 19/* "." */,-76 , 33/* "(" */,-76 , 2/* "IF" */,-76 , 4/* "WHILE" */,-76 , 5/* "DO" */,-76 , 6/* "ECHO" */,-76 , 38/* "Variable" */,-76 , 13/* "{" */,-76 , 46/* "InternalNonScript" */,-76 , 37/* "//" */,-76 , 7/* "RETURN" */,-76 , 8/* "NewToken" */,-76 , 9/* "ClassToken" */,-76 , 39/* "FunctionName" */,-76 , 40/* "Identifier" */,-76 , 41/* "String" */,-76 , 42/* "Integer" */,-76 , 43/* "Float" */,-76 , 34/* ")" */,-76 , 18/* "," */,-76 , 16/* "]" */,-76 , 20/* "=" */,-76 ),
    /* State 114 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 115 */ new Array( 17/* ";" */,-61 , 35/* "->" */,-61 , 21/* "==" */,-61 , 28/* "<" */,-61 , 27/* ">" */,-61 , 25/* "<=" */,-61 , 26/* ">=" */,-61 , 22/* "!=" */,-61 , 19/* "." */,-61 , 33/* "(" */,-61 , 2/* "IF" */,-61 , 4/* "WHILE" */,-61 , 5/* "DO" */,-61 , 6/* "ECHO" */,-61 , 38/* "Variable" */,-61 , 13/* "{" */,-61 , 46/* "InternalNonScript" */,-61 , 37/* "//" */,-61 , 7/* "RETURN" */,-61 , 8/* "NewToken" */,-61 , 9/* "ClassToken" */,-61 , 39/* "FunctionName" */,-61 , 40/* "Identifier" */,-61 , 30/* "-" */,-61 , 41/* "String" */,-61 , 42/* "Integer" */,-61 , 43/* "Float" */,-61 , 34/* ")" */,-61 , 18/* "," */,-61 , 16/* "]" */,-61 , 20/* "=" */,-61 ),
    /* State 116 */ new Array( 17/* ";" */,-80 , 30/* "-" */,-80 , 29/* "+" */,-80 , 32/* "*" */,-80 , 31/* "/" */,-80 , 35/* "->" */,-80 , 21/* "==" */,-80 , 28/* "<" */,-80 , 27/* ">" */,-80 , 25/* "<=" */,-80 , 26/* ">=" */,-80 , 22/* "!=" */,-80 , 19/* "." */,-80 , 33/* "(" */,-80 , 2/* "IF" */,-80 , 4/* "WHILE" */,-80 , 5/* "DO" */,-80 , 6/* "ECHO" */,-80 , 38/* "Variable" */,-80 , 13/* "{" */,-80 , 46/* "InternalNonScript" */,-80 , 37/* "//" */,-80 , 7/* "RETURN" */,-80 , 8/* "NewToken" */,-80 , 9/* "ClassToken" */,-80 , 39/* "FunctionName" */,-80 , 40/* "Identifier" */,-80 , 41/* "String" */,-80 , 42/* "Integer" */,-80 , 43/* "Float" */,-80 , 34/* ")" */,-80 , 18/* "," */,-80 , 16/* "]" */,-80 , 20/* "=" */,-80 ),
    /* State 117 */ new Array( 17/* ";" */,-79 , 30/* "-" */,-79 , 29/* "+" */,-79 , 32/* "*" */,-79 , 31/* "/" */,-79 , 35/* "->" */,-79 , 21/* "==" */,-79 , 28/* "<" */,-79 , 27/* ">" */,-79 , 25/* "<=" */,-79 , 26/* ">=" */,-79 , 22/* "!=" */,-79 , 19/* "." */,-79 , 33/* "(" */,-79 , 2/* "IF" */,-79 , 4/* "WHILE" */,-79 , 5/* "DO" */,-79 , 6/* "ECHO" */,-79 , 38/* "Variable" */,-79 , 13/* "{" */,-79 , 46/* "InternalNonScript" */,-79 , 37/* "//" */,-79 , 7/* "RETURN" */,-79 , 8/* "NewToken" */,-79 , 9/* "ClassToken" */,-79 , 39/* "FunctionName" */,-79 , 40/* "Identifier" */,-79 , 41/* "String" */,-79 , 42/* "Integer" */,-79 , 43/* "Float" */,-79 , 34/* ")" */,-79 , 18/* "," */,-79 , 16/* "]" */,-79 , 20/* "=" */,-79 ),
    /* State 118 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 34/* ")" */,139 , 35/* "->" */,-43 ),
    /* State 119 */ new Array( 17/* ";" */,-62 , 35/* "->" */,-62 , 21/* "==" */,-62 , 28/* "<" */,-62 , 27/* ">" */,-62 , 25/* "<=" */,-62 , 26/* ">=" */,-62 , 22/* "!=" */,-62 , 19/* "." */,-62 , 33/* "(" */,-62 , 5/* "DO" */,-62 , 8/* "NewToken" */,-62 , 38/* "Variable" */,-62 , 18/* "," */,-62 , 40/* "Identifier" */,-62 , 30/* "-" */,-62 , 41/* "String" */,-62 , 42/* "Integer" */,-62 , 43/* "Float" */,-62 , 34/* ")" */,-62 , 2/* "IF" */,-62 , 4/* "WHILE" */,-62 , 6/* "ECHO" */,-62 , 13/* "{" */,-62 , 46/* "InternalNonScript" */,-62 , 37/* "//" */,-62 , 7/* "RETURN" */,-62 , 9/* "ClassToken" */,-62 , 39/* "FunctionName" */,-62 , 20/* "=" */,-62 , 16/* "]" */,-62 ),
    /* State 120 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 34/* ")" */,108 , 18/* "," */,-64 , 35/* "->" */,-43 ),
    /* State 121 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 122 */ new Array( 2/* "IF" */,-58 , 4/* "WHILE" */,-58 , 5/* "DO" */,-58 , 6/* "ECHO" */,-58 , 38/* "Variable" */,-58 , 13/* "{" */,-58 , 46/* "InternalNonScript" */,-58 , 37/* "//" */,-58 , 7/* "RETURN" */,-58 , 8/* "NewToken" */,-58 , 33/* "(" */,-58 , 9/* "ClassToken" */,-58 , 39/* "FunctionName" */,-58 , 40/* "Identifier" */,-58 , 30/* "-" */,-58 , 41/* "String" */,-58 , 42/* "Integer" */,-58 , 43/* "Float" */,-58 , 21/* "==" */,-58 , 28/* "<" */,-58 , 27/* ">" */,-58 , 25/* "<=" */,-58 , 26/* ">=" */,-58 , 22/* "!=" */,-58 , 19/* "." */,-58 , 35/* "->" */,-58 , 17/* ";" */,-58 , 34/* ")" */,-58 , 18/* "," */,-58 , 16/* "]" */,-58 , 20/* "=" */,-58 ),
    /* State 123 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 45/* "ScriptEnd" */,-24 , 14/* "}" */,-24 , 3/* "ELSE" */,-24 ),
    /* State 124 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,141 , 5/* "DO" */,88 , 35/* "->" */,-43 ),
    /* State 125 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 16/* "]" */,142 , 35/* "->" */,-43 ),
    /* State 126 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,143 , 35/* "->" */,-43 ),
    /* State 127 */ new Array( 45/* "ScriptEnd" */,-27 , 2/* "IF" */,-27 , 4/* "WHILE" */,-27 , 5/* "DO" */,-27 , 6/* "ECHO" */,-27 , 38/* "Variable" */,-27 , 13/* "{" */,-27 , 46/* "InternalNonScript" */,-27 , 37/* "//" */,-27 , 7/* "RETURN" */,-27 , 8/* "NewToken" */,-27 , 33/* "(" */,-27 , 9/* "ClassToken" */,-27 , 39/* "FunctionName" */,-27 , 40/* "Identifier" */,-27 , 30/* "-" */,-27 , 41/* "String" */,-27 , 42/* "Integer" */,-27 , 43/* "Float" */,-27 , 14/* "}" */,-27 , 3/* "ELSE" */,-27 ),
    /* State 128 */ new Array( 20/* "=" */,-67 , 17/* ";" */,-67 , 35/* "->" */,-67 , 21/* "==" */,-67 , 28/* "<" */,-67 , 27/* ">" */,-67 , 25/* "<=" */,-67 , 26/* ">=" */,-67 , 22/* "!=" */,-67 , 19/* "." */,-67 , 33/* "(" */,-67 , 15/* "[" */,-67 , 2/* "IF" */,-67 , 4/* "WHILE" */,-67 , 5/* "DO" */,-67 , 6/* "ECHO" */,-67 , 38/* "Variable" */,-67 , 13/* "{" */,-67 , 46/* "InternalNonScript" */,-67 , 37/* "//" */,-67 , 7/* "RETURN" */,-67 , 8/* "NewToken" */,-67 , 9/* "ClassToken" */,-67 , 39/* "FunctionName" */,-67 , 40/* "Identifier" */,-67 , 30/* "-" */,-67 , 41/* "String" */,-67 , 42/* "Integer" */,-67 , 43/* "Float" */,-67 , 34/* ")" */,-67 , 18/* "," */,-67 , 16/* "]" */,-67 ),
    /* State 129 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 130 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 34/* ")" */,-65 , 18/* "," */,-65 ),
    /* State 131 */ new Array( 40/* "Identifier" */,98 , 8/* "NewToken" */,101 , 38/* "Variable" */,103 , 33/* "(" */,104 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 132 */ new Array( 15/* "[" */,91 , 33/* "(" */,-47 , 21/* "==" */,-47 , 28/* "<" */,-47 , 27/* ">" */,-47 , 25/* "<=" */,-47 , 26/* ">=" */,-47 , 22/* "!=" */,-47 , 19/* "." */,-47 , 35/* "->" */,-47 , 2/* "IF" */,-53 , 4/* "WHILE" */,-53 , 5/* "DO" */,-53 , 6/* "ECHO" */,-53 , 38/* "Variable" */,-53 , 13/* "{" */,-53 , 46/* "InternalNonScript" */,-53 , 37/* "//" */,-53 , 7/* "RETURN" */,-53 , 8/* "NewToken" */,-53 , 9/* "ClassToken" */,-53 , 39/* "FunctionName" */,-53 , 40/* "Identifier" */,-53 , 30/* "-" */,-53 , 41/* "String" */,-53 , 42/* "Integer" */,-53 , 43/* "Float" */,-53 , 17/* ";" */,-47 , 34/* ")" */,-53 , 18/* "," */,-53 , 16/* "]" */,-53 , 20/* "=" */,-47 ),
    /* State 133 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 34/* ")" */,147 , 35/* "->" */,-43 ),
    /* State 134 */ new Array( 17/* ";" */,-50 , 35/* "->" */,-50 , 21/* "==" */,-50 , 28/* "<" */,-50 , 27/* ">" */,-50 , 25/* "<=" */,-50 , 26/* ">=" */,-50 , 22/* "!=" */,-50 , 19/* "." */,-50 , 33/* "(" */,-50 , 2/* "IF" */,-50 , 4/* "WHILE" */,-50 , 5/* "DO" */,-50 , 6/* "ECHO" */,-50 , 38/* "Variable" */,-50 , 13/* "{" */,-50 , 46/* "InternalNonScript" */,-50 , 37/* "//" */,-50 , 7/* "RETURN" */,-50 , 8/* "NewToken" */,-50 , 9/* "ClassToken" */,-50 , 39/* "FunctionName" */,-50 , 40/* "Identifier" */,-50 , 30/* "-" */,-50 , 41/* "String" */,-50 , 42/* "Integer" */,-50 , 43/* "Float" */,-50 , 34/* ")" */,-50 , 18/* "," */,-50 , 16/* "]" */,-50 , 20/* "=" */,-50 ),
    /* State 135 */ new Array( 14/* "}" */,150 , 10/* "PublicToken" */,153 , 12/* "ProtectedToken" */,154 , 11/* "PrivateToken" */,155 , 39/* "FunctionName" */,-12 ),
    /* State 136 */ new Array( 38/* "Variable" */,156 ),
    /* State 137 */ new Array( 13/* "{" */,157 ),
    /* State 138 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 34/* ")" */,-63 , 18/* "," */,-63 , 35/* "->" */,-43 ),
    /* State 139 */ new Array( 17/* ";" */,-85 , 30/* "-" */,-85 , 29/* "+" */,-85 , 32/* "*" */,-85 , 31/* "/" */,-85 , 35/* "->" */,-85 , 21/* "==" */,-85 , 28/* "<" */,-85 , 27/* ">" */,-85 , 25/* "<=" */,-85 , 26/* ">=" */,-85 , 22/* "!=" */,-85 , 19/* "." */,-85 , 33/* "(" */,-85 , 2/* "IF" */,-85 , 4/* "WHILE" */,-85 , 5/* "DO" */,-85 , 6/* "ECHO" */,-85 , 38/* "Variable" */,-85 , 13/* "{" */,-85 , 46/* "InternalNonScript" */,-85 , 37/* "//" */,-85 , 7/* "RETURN" */,-85 , 8/* "NewToken" */,-85 , 9/* "ClassToken" */,-85 , 39/* "FunctionName" */,-85 , 40/* "Identifier" */,-85 , 41/* "String" */,-85 , 42/* "Integer" */,-85 , 43/* "Float" */,-85 , 34/* ")" */,-85 , 18/* "," */,-85 , 16/* "]" */,-85 , 20/* "=" */,-85 ),
    /* State 140 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 , 45/* "ScriptEnd" */,-23 , 14/* "}" */,-23 , 3/* "ELSE" */,-23 ),
    /* State 141 */ new Array( 45/* "ScriptEnd" */,-25 , 2/* "IF" */,-25 , 4/* "WHILE" */,-25 , 5/* "DO" */,-25 , 6/* "ECHO" */,-25 , 38/* "Variable" */,-25 , 13/* "{" */,-25 , 46/* "InternalNonScript" */,-25 , 37/* "//" */,-25 , 7/* "RETURN" */,-25 , 8/* "NewToken" */,-25 , 33/* "(" */,-25 , 9/* "ClassToken" */,-25 , 39/* "FunctionName" */,-25 , 40/* "Identifier" */,-25 , 30/* "-" */,-25 , 41/* "String" */,-25 , 42/* "Integer" */,-25 , 43/* "Float" */,-25 , 14/* "}" */,-25 , 3/* "ELSE" */,-25 ),
    /* State 142 */ new Array( 20/* "=" */,-66 , 17/* ";" */,-66 , 35/* "->" */,-66 , 21/* "==" */,-66 , 28/* "<" */,-66 , 27/* ">" */,-66 , 25/* "<=" */,-66 , 26/* ">=" */,-66 , 22/* "!=" */,-66 , 19/* "." */,-66 , 33/* "(" */,-66 , 15/* "[" */,-66 , 2/* "IF" */,-66 , 4/* "WHILE" */,-66 , 5/* "DO" */,-66 , 6/* "ECHO" */,-66 , 38/* "Variable" */,-66 , 13/* "{" */,-66 , 46/* "InternalNonScript" */,-66 , 37/* "//" */,-66 , 7/* "RETURN" */,-66 , 8/* "NewToken" */,-66 , 9/* "ClassToken" */,-66 , 39/* "FunctionName" */,-66 , 40/* "Identifier" */,-66 , 30/* "-" */,-66 , 41/* "String" */,-66 , 42/* "Integer" */,-66 , 43/* "Float" */,-66 , 34/* ")" */,-66 , 18/* "," */,-66 , 16/* "]" */,-66 ),
    /* State 143 */ new Array( 45/* "ScriptEnd" */,-31 , 2/* "IF" */,-31 , 4/* "WHILE" */,-31 , 5/* "DO" */,-31 , 6/* "ECHO" */,-31 , 38/* "Variable" */,-31 , 13/* "{" */,-31 , 46/* "InternalNonScript" */,-31 , 37/* "//" */,-31 , 7/* "RETURN" */,-31 , 8/* "NewToken" */,-31 , 33/* "(" */,-31 , 9/* "ClassToken" */,-31 , 39/* "FunctionName" */,-31 , 40/* "Identifier" */,-31 , 30/* "-" */,-31 , 41/* "String" */,-31 , 42/* "Integer" */,-31 , 43/* "Float" */,-31 , 14/* "}" */,-31 , 3/* "ELSE" */,-31 ),
    /* State 144 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,158 , 35/* "->" */,-43 ),
    /* State 145 */ new Array( 18/* "," */,114 , 34/* ")" */,159 ),
    /* State 146 */ new Array( 20/* "=" */,-46 , 17/* ";" */,-46 , 35/* "->" */,-46 , 21/* "==" */,-46 , 28/* "<" */,-46 , 27/* ">" */,-46 , 25/* "<=" */,-46 , 26/* ">=" */,-46 , 22/* "!=" */,-46 , 19/* "." */,-46 , 33/* "(" */,-46 , 2/* "IF" */,-51 , 4/* "WHILE" */,-51 , 5/* "DO" */,-51 , 6/* "ECHO" */,-51 , 38/* "Variable" */,-51 , 13/* "{" */,-51 , 46/* "InternalNonScript" */,-51 , 37/* "//" */,-51 , 7/* "RETURN" */,-51 , 8/* "NewToken" */,-51 , 9/* "ClassToken" */,-51 , 39/* "FunctionName" */,-51 , 40/* "Identifier" */,-51 , 30/* "-" */,-51 , 41/* "String" */,-51 , 42/* "Integer" */,-51 , 43/* "Float" */,-51 , 34/* ")" */,-51 , 18/* "," */,-51 , 16/* "]" */,-51 ),
    /* State 147 */ new Array( 20/* "=" */,-48 , 17/* ";" */,-48 , 35/* "->" */,-48 , 21/* "==" */,-48 , 28/* "<" */,-48 , 27/* ">" */,-48 , 25/* "<=" */,-48 , 26/* ">=" */,-48 , 22/* "!=" */,-48 , 19/* "." */,-48 , 33/* "(" */,-48 , 2/* "IF" */,-54 , 4/* "WHILE" */,-54 , 5/* "DO" */,-54 , 6/* "ECHO" */,-54 , 38/* "Variable" */,-54 , 13/* "{" */,-54 , 46/* "InternalNonScript" */,-54 , 37/* "//" */,-54 , 7/* "RETURN" */,-54 , 8/* "NewToken" */,-54 , 9/* "ClassToken" */,-54 , 39/* "FunctionName" */,-54 , 40/* "Identifier" */,-54 , 30/* "-" */,-54 , 41/* "String" */,-54 , 42/* "Integer" */,-54 , 43/* "Float" */,-54 , 34/* ")" */,-54 , 18/* "," */,-54 , 16/* "]" */,-54 , 29/* "+" */,-85 , 32/* "*" */,-85 , 31/* "/" */,-85 ),
    /* State 148 */ new Array( 14/* "}" */,-6 , 10/* "PublicToken" */,-6 , 12/* "ProtectedToken" */,-6 , 11/* "PrivateToken" */,-6 , 39/* "FunctionName" */,-6 ),
    /* State 149 */ new Array( 14/* "}" */,-5 , 10/* "PublicToken" */,-5 , 12/* "ProtectedToken" */,-5 , 11/* "PrivateToken" */,-5 , 39/* "FunctionName" */,-5 ),
    /* State 150 */ new Array( 45/* "ScriptEnd" */,-4 , 2/* "IF" */,-4 , 4/* "WHILE" */,-4 , 5/* "DO" */,-4 , 6/* "ECHO" */,-4 , 38/* "Variable" */,-4 , 13/* "{" */,-4 , 46/* "InternalNonScript" */,-4 , 37/* "//" */,-4 , 7/* "RETURN" */,-4 , 8/* "NewToken" */,-4 , 33/* "(" */,-4 , 9/* "ClassToken" */,-4 , 39/* "FunctionName" */,-4 , 40/* "Identifier" */,-4 , 30/* "-" */,-4 , 41/* "String" */,-4 , 42/* "Integer" */,-4 , 43/* "Float" */,-4 , 14/* "}" */,-4 , 3/* "ELSE" */,-4 ),
    /* State 151 */ new Array( 38/* "Variable" */,160 ),
    /* State 152 */ new Array( 39/* "FunctionName" */,161 ),
    /* State 153 */ new Array( 38/* "Variable" */,-8 , 39/* "FunctionName" */,-11 ),
    /* State 154 */ new Array( 38/* "Variable" */,-9 , 39/* "FunctionName" */,-13 ),
    /* State 155 */ new Array( 38/* "Variable" */,-10 , 39/* "FunctionName" */,-14 ),
    /* State 156 */ new Array( 34/* ")" */,-38 , 18/* "," */,-38 ),
    /* State 157 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 158 */ new Array( 45/* "ScriptEnd" */,-28 , 2/* "IF" */,-28 , 4/* "WHILE" */,-28 , 5/* "DO" */,-28 , 6/* "ECHO" */,-28 , 38/* "Variable" */,-28 , 13/* "{" */,-28 , 46/* "InternalNonScript" */,-28 , 37/* "//" */,-28 , 7/* "RETURN" */,-28 , 8/* "NewToken" */,-28 , 33/* "(" */,-28 , 9/* "ClassToken" */,-28 , 39/* "FunctionName" */,-28 , 40/* "Identifier" */,-28 , 30/* "-" */,-28 , 41/* "String" */,-28 , 42/* "Integer" */,-28 , 43/* "Float" */,-28 , 14/* "}" */,-28 , 3/* "ELSE" */,-28 ),
    /* State 159 */ new Array( 33/* "(" */,-45 , 21/* "==" */,-45 , 28/* "<" */,-45 , 27/* ">" */,-45 , 25/* "<=" */,-45 , 26/* ">=" */,-45 , 22/* "!=" */,-45 , 19/* "." */,-45 , 35/* "->" */,-45 , 2/* "IF" */,-50 , 4/* "WHILE" */,-50 , 5/* "DO" */,-50 , 6/* "ECHO" */,-50 , 38/* "Variable" */,-50 , 13/* "{" */,-50 , 46/* "InternalNonScript" */,-50 , 37/* "//" */,-50 , 7/* "RETURN" */,-50 , 8/* "NewToken" */,-50 , 9/* "ClassToken" */,-50 , 39/* "FunctionName" */,-50 , 40/* "Identifier" */,-50 , 30/* "-" */,-50 , 41/* "String" */,-50 , 42/* "Integer" */,-50 , 43/* "Float" */,-50 , 17/* ";" */,-45 , 34/* ")" */,-50 , 18/* "," */,-50 , 16/* "]" */,-50 , 20/* "=" */,-45 ),
    /* State 160 */ new Array( 17/* ";" */,163 , 20/* "=" */,164 ),
    /* State 161 */ new Array( 33/* "(" */,165 ),
    /* State 162 */ new Array( 14/* "}" */,166 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 163 */ new Array( 14/* "}" */,-17 , 10/* "PublicToken" */,-17 , 12/* "ProtectedToken" */,-17 , 11/* "PrivateToken" */,-17 , 39/* "FunctionName" */,-17 ),
    /* State 164 */ new Array( 8/* "NewToken" */,20 , 38/* "Variable" */,49 , 33/* "(" */,22 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 165 */ new Array( 38/* "Variable" */,111 , 34/* ")" */,-40 , 18/* "," */,-40 ),
    /* State 166 */ new Array( 45/* "ScriptEnd" */,-15 , 2/* "IF" */,-15 , 4/* "WHILE" */,-15 , 5/* "DO" */,-15 , 6/* "ECHO" */,-15 , 38/* "Variable" */,-15 , 13/* "{" */,-15 , 46/* "InternalNonScript" */,-15 , 37/* "//" */,-15 , 7/* "RETURN" */,-15 , 8/* "NewToken" */,-15 , 33/* "(" */,-15 , 9/* "ClassToken" */,-15 , 39/* "FunctionName" */,-15 , 40/* "Identifier" */,-15 , 30/* "-" */,-15 , 41/* "String" */,-15 , 42/* "Integer" */,-15 , 43/* "Float" */,-15 , 14/* "}" */,-15 , 3/* "ELSE" */,-15 ),
    /* State 167 */ new Array( 33/* "(" */,38 , 19/* "." */,39 , 22/* "!=" */,40 , 26/* ">=" */,41 , 25/* "<=" */,42 , 27/* ">" */,43 , 28/* "<" */,44 , 21/* "==" */,45 , 17/* ";" */,169 , 35/* "->" */,-43 ),
    /* State 168 */ new Array( 18/* "," */,136 , 34/* ")" */,170 ),
    /* State 169 */ new Array( 14/* "}" */,-18 , 10/* "PublicToken" */,-18 , 12/* "ProtectedToken" */,-18 , 11/* "PrivateToken" */,-18 , 39/* "FunctionName" */,-18 ),
    /* State 170 */ new Array( 13/* "{" */,171 ),
    /* State 171 */ new Array( 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 172 */ new Array( 14/* "}" */,173 , 2/* "IF" */,7 , 4/* "WHILE" */,8 , 5/* "DO" */,9 , 6/* "ECHO" */,10 , 38/* "Variable" */,11 , 13/* "{" */,15 , 46/* "InternalNonScript" */,16 , 37/* "//" */,17 , 7/* "RETURN" */,18 , 8/* "NewToken" */,20 , 33/* "(" */,22 , 9/* "ClassToken" */,23 , 39/* "FunctionName" */,24 , 40/* "Identifier" */,28 , 30/* "-" */,30 , 41/* "String" */,32 , 42/* "Integer" */,33 , 43/* "Float" */,34 ),
    /* State 173 */ new Array( 14/* "}" */,-16 , 10/* "PublicToken" */,-16 , 12/* "ProtectedToken" */,-16 , 11/* "PrivateToken" */,-16 , 39/* "FunctionName" */,-16 )
);

/* Goto-Table */
var goto_tab = new Array(
    /* State 0 */ new Array( 47/* PHPScript */,1 ),
    /* State 1 */ new Array( 48/* Script */,2 ),
    /* State 2 */ new Array( ),
    /* State 3 */ new Array( 49/* Stmt */,4 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 4 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 5 */ new Array( ),
    /* State 6 */ new Array( ),
    /* State 7 */ new Array( 58/* Expression */,47 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 8 */ new Array( 58/* Expression */,50 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 9 */ new Array( 49/* Stmt */,51 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 10 */ new Array( 58/* Expression */,52 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 11 */ new Array( 62/* ArrayIndices */,53 ),
    /* State 12 */ new Array( ),
    /* State 13 */ new Array( ),
    /* State 14 */ new Array( ),
    /* State 15 */ new Array( 49/* Stmt */,57 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 16 */ new Array( ),
    /* State 17 */ new Array( 63/* AssertStmt */,58 ),
    /* State 18 */ new Array( 58/* Expression */,60 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 19 */ new Array( ),
    /* State 20 */ new Array( 65/* FunctionInvoke */,61 , 58/* Expression */,62 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 21 */ new Array( ),
    /* State 22 */ new Array( 58/* Expression */,63 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 23 */ new Array( ),
    /* State 24 */ new Array( ),
    /* State 25 */ new Array( ),
    /* State 26 */ new Array( 66/* ActualParameterList */,68 , 58/* Expression */,69 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 27 */ new Array( ),
    /* State 28 */ new Array( ),
    /* State 29 */ new Array( ),
    /* State 30 */ new Array( 73/* Value */,73 ),
    /* State 31 */ new Array( ),
    /* State 32 */ new Array( ),
    /* State 33 */ new Array( ),
    /* State 34 */ new Array( ),
    /* State 35 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 36 */ new Array( ),
    /* State 37 */ new Array( ),
    /* State 38 */ new Array( 66/* ActualParameterList */,76 , 58/* Expression */,69 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 39 */ new Array( 58/* Expression */,77 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 40 */ new Array( 70/* AddSubExp */,78 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 41 */ new Array( 70/* AddSubExp */,79 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 42 */ new Array( 70/* AddSubExp */,80 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 43 */ new Array( 70/* AddSubExp */,81 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 44 */ new Array( 70/* AddSubExp */,82 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 45 */ new Array( 70/* AddSubExp */,83 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 46 */ new Array( ),
    /* State 47 */ new Array( 49/* Stmt */,85 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 48 */ new Array( ),
    /* State 49 */ new Array( 62/* ArrayIndices */,87 ),
    /* State 50 */ new Array( ),
    /* State 51 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 52 */ new Array( ),
    /* State 53 */ new Array( ),
    /* State 54 */ new Array( 58/* Expression */,93 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 55 */ new Array( 58/* Expression */,94 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 56 */ new Array( 61/* AttributeAccess */,95 , 67/* MemberAccess */,96 , 69/* FunctionAccess */,97 , 68/* ExpressionNotFunAccess */,99 , 65/* FunctionInvoke */,26 , 58/* Expression */,62 , 64/* BinaryOp */,100 , 60/* Target */,102 , 70/* AddSubExp */,25 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 57 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 58 */ new Array( ),
    /* State 59 */ new Array( ),
    /* State 60 */ new Array( ),
    /* State 61 */ new Array( 66/* ActualParameterList */,107 , 58/* Expression */,69 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 62 */ new Array( ),
    /* State 63 */ new Array( ),
    /* State 64 */ new Array( ),
    /* State 65 */ new Array( 56/* FormalParameterList */,110 ),
    /* State 66 */ new Array( 71/* MulDivExp */,112 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 67 */ new Array( 71/* MulDivExp */,113 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 68 */ new Array( ),
    /* State 69 */ new Array( ),
    /* State 70 */ new Array( 72/* UnaryOp */,116 , 73/* Value */,31 ),
    /* State 71 */ new Array( 72/* UnaryOp */,117 , 73/* Value */,31 ),
    /* State 72 */ new Array( ),
    /* State 73 */ new Array( ),
    /* State 74 */ new Array( ),
    /* State 75 */ new Array( 58/* Expression */,118 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 76 */ new Array( ),
    /* State 77 */ new Array( ),
    /* State 78 */ new Array( ),
    /* State 79 */ new Array( ),
    /* State 80 */ new Array( ),
    /* State 81 */ new Array( ),
    /* State 82 */ new Array( ),
    /* State 83 */ new Array( ),
    /* State 84 */ new Array( 58/* Expression */,120 , 66/* ActualParameterList */,76 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 85 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 86 */ new Array( 67/* MemberAccess */,96 , 69/* FunctionAccess */,97 , 61/* AttributeAccess */,122 , 65/* FunctionInvoke */,26 , 58/* Expression */,62 , 68/* ExpressionNotFunAccess */,99 , 64/* BinaryOp */,100 , 60/* Target */,102 , 70/* AddSubExp */,25 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 87 */ new Array( ),
    /* State 88 */ new Array( 49/* Stmt */,123 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 89 */ new Array( 58/* Expression */,124 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 90 */ new Array( ),
    /* State 91 */ new Array( 58/* Expression */,125 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 92 */ new Array( 58/* Expression */,126 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 93 */ new Array( ),
    /* State 94 */ new Array( ),
    /* State 95 */ new Array( ),
    /* State 96 */ new Array( ),
    /* State 97 */ new Array( ),
    /* State 98 */ new Array( ),
    /* State 99 */ new Array( ),
    /* State 100 */ new Array( ),
    /* State 101 */ new Array( 65/* FunctionInvoke */,130 , 58/* Expression */,62 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 102 */ new Array( ),
    /* State 103 */ new Array( 62/* ArrayIndices */,132 ),
    /* State 104 */ new Array( 58/* Expression */,133 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 105 */ new Array( ),
    /* State 106 */ new Array( ),
    /* State 107 */ new Array( ),
    /* State 108 */ new Array( ),
    /* State 109 */ new Array( 50/* Member */,135 ),
    /* State 110 */ new Array( ),
    /* State 111 */ new Array( ),
    /* State 112 */ new Array( ),
    /* State 113 */ new Array( ),
    /* State 114 */ new Array( 58/* Expression */,138 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 115 */ new Array( ),
    /* State 116 */ new Array( ),
    /* State 117 */ new Array( ),
    /* State 118 */ new Array( ),
    /* State 119 */ new Array( ),
    /* State 120 */ new Array( ),
    /* State 121 */ new Array( 49/* Stmt */,140 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 122 */ new Array( ),
    /* State 123 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 124 */ new Array( ),
    /* State 125 */ new Array( ),
    /* State 126 */ new Array( ),
    /* State 127 */ new Array( ),
    /* State 128 */ new Array( ),
    /* State 129 */ new Array( 58/* Expression */,144 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 130 */ new Array( 66/* ActualParameterList */,145 , 58/* Expression */,69 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 131 */ new Array( 67/* MemberAccess */,146 , 69/* FunctionAccess */,97 , 61/* AttributeAccess */,122 , 65/* FunctionInvoke */,26 , 58/* Expression */,62 , 68/* ExpressionNotFunAccess */,99 , 64/* BinaryOp */,100 , 60/* Target */,102 , 70/* AddSubExp */,25 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 132 */ new Array( ),
    /* State 133 */ new Array( ),
    /* State 134 */ new Array( ),
    /* State 135 */ new Array( 53/* ClassFunctionDefinition */,148 , 52/* AttributeDefinition */,149 , 54/* AttributeMod */,151 , 55/* FunctionMod */,152 ),
    /* State 136 */ new Array( ),
    /* State 137 */ new Array( ),
    /* State 138 */ new Array( ),
    /* State 139 */ new Array( ),
    /* State 140 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 141 */ new Array( ),
    /* State 142 */ new Array( ),
    /* State 143 */ new Array( ),
    /* State 144 */ new Array( ),
    /* State 145 */ new Array( ),
    /* State 146 */ new Array( ),
    /* State 147 */ new Array( ),
    /* State 148 */ new Array( ),
    /* State 149 */ new Array( ),
    /* State 150 */ new Array( ),
    /* State 151 */ new Array( ),
    /* State 152 */ new Array( ),
    /* State 153 */ new Array( ),
    /* State 154 */ new Array( ),
    /* State 155 */ new Array( ),
    /* State 156 */ new Array( ),
    /* State 157 */ new Array( 49/* Stmt */,162 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 158 */ new Array( ),
    /* State 159 */ new Array( ),
    /* State 160 */ new Array( ),
    /* State 161 */ new Array( ),
    /* State 162 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 163 */ new Array( ),
    /* State 164 */ new Array( 58/* Expression */,167 , 64/* BinaryOp */,19 , 60/* Target */,48 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 165 */ new Array( 56/* FormalParameterList */,168 ),
    /* State 166 */ new Array( ),
    /* State 167 */ new Array( ),
    /* State 168 */ new Array( ),
    /* State 169 */ new Array( ),
    /* State 170 */ new Array( ),
    /* State 171 */ new Array( 49/* Stmt */,172 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 172 */ new Array( 49/* Stmt */,35 , 59/* Return */,5 , 58/* Expression */,6 , 60/* Target */,12 , 51/* ClassDefinition */,13 , 57/* FunctionDefinition */,14 , 64/* BinaryOp */,19 , 69/* FunctionAccess */,21 , 70/* AddSubExp */,25 , 65/* FunctionInvoke */,26 , 71/* MulDivExp */,27 , 72/* UnaryOp */,29 , 73/* Value */,31 ),
    /* State 173 */ new Array( )
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
    "Identifier" /* Terminal symbol */,
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
    "Expression" /* Non-terminal symbol */,
    "Return" /* Non-terminal symbol */,
    "Target" /* Non-terminal symbol */,
    "AttributeAccess" /* Non-terminal symbol */,
    "ArrayIndices" /* Non-terminal symbol */,
    "AssertStmt" /* Non-terminal symbol */,
    "BinaryOp" /* Non-terminal symbol */,
    "FunctionInvoke" /* Non-terminal symbol */,
    "ActualParameterList" /* Non-terminal symbol */,
    "MemberAccess" /* Non-terminal symbol */,
    "ExpressionNotFunAccess" /* Non-terminal symbol */,
    "FunctionAccess" /* Non-terminal symbol */,
    "AddSubExp" /* Non-terminal symbol */,
    "MulDivExp" /* Non-terminal symbol */,
    "UnaryOp" /* Non-terminal symbol */,
    "Value" /* Non-terminal symbol */,
    "$" /* Terminal symbol */
);


info.offset = 0; info.src = src; info.att = new String(); if( !err_off )
err_off = new Array(); if( !err_la )
err_la = new Array(); sstack.push( 0 ); vstack.push( 0 ); la = __lex( info ); while( true )
{ act = 175; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
if( _dbg_withtrace && sstack.length > 0 )
{ __dbg_print( "\nState " + sstack[sstack.length-1] + "\n" + "\tLookahead: " + labels[la] + " (\"" + info.att + "\")\n" + "\tAction: " + act + "\n" + "\tSource: \"" + info.src.substr( info.offset, 30 ) + ( ( info.offset + 30 < info.src.length ) ?
"..." : "" ) + "\"\n" + "\tStack: " + sstack.join() + "\n" + "\tValue stack: " + vstack.join() + "\n" );}
if( act == 175 )
{ if( _dbg_withtrace )
__dbg_print( "Error detected: There is no reduce or shift on the symbol " + labels[la] ); err_cnt++; err_off.push( info.offset - info.att.length ); err_la.push( new Array() ); for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
err_la[err_la.length-1].push( labels[act_tab[sstack[sstack.length-1]][i]] ); var rsstack = new Array(); var rvstack = new Array(); for( var i = 0; i < sstack.length; i++ )
{ rsstack[i] = sstack[i]; rvstack[i] = vstack[i];}
while( act == 175 && la != 74 )
{ if( _dbg_withtrace )
__dbg_print( "\tError recovery\n" + "Current lookahead: " + labels[la] + " (" + info.att + ")\n" + "Action: " + act + "\n\n" ); if( la == -1 )
info.offset++; while( act == 175 && sstack.length > 0 )
{ sstack.pop(); vstack.pop(); if( sstack.length == 0 )
break; act = 175; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
}
if( act != 175 )
break; for( var i = 0; i < rsstack.length; i++ )
{ sstack.push( rsstack[i] ); vstack.push( rvstack[i] );}
la = __lex( info );}
if( act == 175 )
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
         rval = MOD_PROTECTED;
    }
    break;
    case 10:
    {
         rval = MOD_PRIVATE;
    }
    break;
    case 11:
    {
         rval = MOD_PUBLIC;
    }
    break;
    case 12:
    {
         rval = MOD_PUBLIC;
    }
    break;
    case 13:
    {
         rval = MOD_PROTECTED;
    }
    break;
    case 14:
    {
         rval = MOD_PRIVATE;
    }
    break;
    case 15:
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
    case 16:
    {
             
                                            // Check that the function is not defined twice within
                                            // the same object
                                            if (pstate.curClass && pstate.curFuns[pstate.curClass+vstack[ vstack.length - 7 ]]) {
                                                throw funRedeclare(pstate.curClass+vstack[ vstack.length - 7 ]);
                                            }
                                            var fun = createFunction( vstack[ vstack.length - 7 ], pstate.curParams, vstack[ vstack.length - 2 ] );
                                            pstate.curFuns[vstack[ vstack.length - 7 ]] = createMember( vstack[ vstack.length - 8 ], fun );
                                            // Make sure to clean up param list
                                            // for next function declaration
                                            pstate.curParams = [];
                                        
    }
    break;
    case 17:
    {
        
                                            pstate.curAttrs[vstack[ vstack.length - 2 ]] = createMember( vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
                                        
    }
    break;
    case 18:
    {
        
                                            pstate.curAttrs[vstack[ vstack.length - 4 ]] = createMember( vstack[ vstack.length - 5 ], vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
                                        
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
         rval = createNode( NODE_OP, OP_ATTR_ASSIGN, vstack[ vstack.length - 6 ], vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 29:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 30:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 31:
    {
         rval = createNode( NODE_OP, OP_ASSIGN_ARR, vstack[ vstack.length - 5 ], vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 32:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 33:
    {
        
                                            if (vstack[ vstack.length - 1 ].length > 4) {
                                                var strNode = createNode( NODE_CONST, vstack[ vstack.length - 1 ].substring(2,vstack[ vstack.length - 1 ].length-2) );
                                                rval = createNode( NODE_OP, OP_ECHO, strNode );
                                            }
                                        
    }
    break;
    case 34:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 35:
    {
            
                                            if (phypeTestSuite && vstack[ vstack.length - 2 ] == "assertEcho") {
                                                pstate.assertion = createAssertion( ASS_ECHO, vstack[ vstack.length - 1 ] );
                                            }
                                        
    }
    break;
    case 36:
    {
        
                                            if (phypeTestSuite && vstack[ vstack.length - 1 ] == "assertFail") {
                                                pstate.assertion = createAssertion( ASS_FAIL, 0 );
                                            }
                                        
    }
    break;
    case 37:
    {
        rval = vstack[ vstack.length - 0 ];
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
        
                                            pstate.curParams[pstate.curParams.length] =
                                                createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
                                        
    }
    break;
    case 40:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 41:
    {
         rval = createNode( NODE_OP, OP_RETURN, vstack[ vstack.length - 1 ] );
    }
    break;
    case 42:
    {
         rval = createNode( NODE_OP, OP_RETURN );
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
         vstack[ vstack.length - 1 ].children[0] = vstack[ vstack.length - 3 ]; rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 47:
    {
         rval = createNode( NODE_OP, OP_FETCH_ARR, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 48:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 49:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 50:
    {
         rval = createNode( NODE_OP, OP_OBJ_NEW, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 51:
    {
         vstack[ vstack.length - 1 ].children[0] = vstack[ vstack.length - 3 ]; rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 52:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 53:
    {
         rval = createNode( NODE_OP, OP_FETCH_ARR, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 54:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 55:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 56:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 57:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 58:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 59:
    {
         rval = createNode( NODE_OP, OP_OBJ_FETCH, null, vstack[ vstack.length - 1 ] );
    }
    break;
    case 60:
    {
         rval = createNode( NODE_OP, OP_OBJ_FETCH, null, vstack[ vstack.length - 1 ] );
    }
    break;
    case 61:
    {
         rval = createNode( NODE_OP, OP_OBJ_FCALL, null, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 62:
    {
         rval = createNode( NODE_OP, OP_OBJ_FCALL, null, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 63:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 64:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 1 ] );
    }
    break;
    case 65:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 66:
    {
         rval = createNode( NODE_OP, OP_ARR_KEYS_R, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 67:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 68:
    {
         rval = createNode( NODE_OP, OP_EQU, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 69:
    {
         rval = createNode( NODE_OP, OP_LOT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 70:
    {
         rval = createNode( NODE_OP, OP_GRT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 71:
    {
         rval = createNode( NODE_OP, OP_LOE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 72:
    {
         rval = createNode( NODE_OP, OP_GRE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 73:
    {
         rval = createNode( NODE_OP, OP_NEQ, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 74:
    {
         rval = createNode( NODE_OP, OP_CONCAT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 75:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 76:
    {
         rval = createNode( NODE_OP, OP_SUB, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 77:
    {
         rval = createNode( NODE_OP, OP_ADD, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 78:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 79:
    {
         rval = createNode( NODE_OP, OP_MUL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 80:
    {
         rval = createNode( NODE_OP, OP_DIV, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 81:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 82:
    {
         rval = createNode( NODE_OP, OP_NEG, vstack[ vstack.length - 1 ] );
    }
    break;
    case 83:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 84:
    {
         rval = createNode( NODE_VAR, vstack[ vstack.length - 1 ] );
    }
    break;
    case 85:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 86:
    {
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 87:
    {
         rval = createNode( NODE_INT, vstack[ vstack.length - 1 ] );
    }
    break;
    case 88:
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
            "<?" +
            "$arr['foo'] = 'hello';" +
            "$arr[1] = 'world';" +
            "echo $arr['foo'].' '.$arr[1];" +
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
        resetState();
        
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
    }
    if (phypeDoc && phypeDoc.open) {
        phypeDoc.write('Testing done!');
        phypeDoc.close();
    }
}

/*
log('SymTables');
var_log(pstate.symTables);
log('ObjList');
var_log(pstate.objList);
log('ObjMapping');
var_log(pstate.objMapping);
log('Values');
var_log(pstate.valTable);
*/

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
