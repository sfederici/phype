
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
    },
    
    getNumberFromNode : function(node) {
        var num = null;
        switch (node.type) {
            // TODO: Check for PHP-standard.
            case T_INT:
            case T_CONST:
                num = parseInt(node.value);
                break;
            case T_FLOAT:
                num = parseFloat(node.value);
                break;
        }

        return num;
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
var OP_BOOL_NEG        = 62;

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
        if( node.children[0] )
            execute( node.children[0] );
        if( node.children[1] )
            execute( node.children[1] );
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
        var condChild = execute(node.children[0]);
        if(condChild.value)
            return execute( node.children[1] );
        else
            return execute( node.children[2] );
    },
    
    // OP_WHILE_DO
    '3' : function(node) {
        var tmp = execute( node.children[0] );
        while( tmp.value ) {
            execute( node.children[1] );
            tmp = execute( node.children[0] );
        }
    },

    // OP_DO_WHILE
    '4' : function(node) {
        do {
            execute( node.children[0] );
        } while( execute( node.children[1] ) );
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
            resultNode = createValue(T_INT, 1);
        else
            resultNode = createValue(T_INT, 0);
        return resultNode;
    },
    
    // OP_NEQ
    '51' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (leftChild.value != rightChild.value)
            resultNode = createValue(T_INT, 1);
        else
            resultNode = createValue(T_INT, 0);
        return resultNode;
    },
    
    // OP_GRT
    '52' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (parseInt(leftChild.value) > parseInt(rightChild.value))
            resultNode = createValue(T_INT, 1);
        else
            resultNode = createValue(T_INT, 0);
        return resultNode;
        },
    
    // OP_LOT
    '53' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (linker.getNumberFromNode(leftChild) < linker.getNumberFromNode(rightChild))
            resultNode = createValue(T_INT, 1);
        else
            resultNode = createValue(T_INT, 0);

        return resultNode;
    },
    
    // OP_GRE
    '54' : function(node) {
                var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (linker.getNumberFromNode(leftChild) >= linker.getNumberFromNode(rightChild))
            resultNode = createValue(T_INT, 1);
        else
            resultNode = createValue(T_INT, 0);
        return resultNode;
    },
    
    // OP_LOE
    '55' : function(node) {
        var leftChild = execute(node.children[0]);
        var rightChild = execute(node.children[1]);
        var resultNode;
        if (linker.getNumberFromNode(leftChild) <= linker.getNumberFromNode(rightChild))
            resultNode = createValue(T_INT, 1);
        else
            resultNode = createValue(T_INT, 0);
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
    },
    
    // OP_BOOL_NEG
    '62' : function(node) {
        var val = execute( node.children[0] );
        if (val.value) return createNode( NODE_INT, 0 );
        else return createNode( NODE_INT, 1 );
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
return 78; do
{ switch( state )
{
    case 0:
        if( ( info.src.charCodeAt( pos ) >= 9 && info.src.charCodeAt( pos ) <= 10 ) || info.src.charCodeAt( pos ) == 13 || info.src.charCodeAt( pos ) == 32 ) state = 1;
        else if( info.src.charCodeAt( pos ) == 33 ) state = 2;
        else if( info.src.charCodeAt( pos ) == 40 ) state = 3;
        else if( info.src.charCodeAt( pos ) == 41 ) state = 4;
        else if( info.src.charCodeAt( pos ) == 42 ) state = 5;
        else if( info.src.charCodeAt( pos ) == 43 ) state = 6;
        else if( info.src.charCodeAt( pos ) == 44 ) state = 7;
        else if( info.src.charCodeAt( pos ) == 45 ) state = 8;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 9;
        else if( info.src.charCodeAt( pos ) == 47 ) state = 10;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 54 ) || ( info.src.charCodeAt( pos ) >= 56 && info.src.charCodeAt( pos ) <= 57 ) ) state = 11;
        else if( info.src.charCodeAt( pos ) == 59 ) state = 12;
        else if( info.src.charCodeAt( pos ) == 60 ) state = 13;
        else if( info.src.charCodeAt( pos ) == 61 ) state = 14;
        else if( info.src.charCodeAt( pos ) == 62 ) state = 15;
        else if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 77 ) || info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 81 || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 109 ) || info.src.charCodeAt( pos ) == 111 || info.src.charCodeAt( pos ) == 113 || info.src.charCodeAt( pos ) == 115 || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 91 ) state = 17;
        else if( info.src.charCodeAt( pos ) == 93 ) state = 18;
        else if( info.src.charCodeAt( pos ) == 123 ) state = 19;
        else if( info.src.charCodeAt( pos ) == 125 ) state = 20;
        else if( info.src.charCodeAt( pos ) == 34 ) state = 49;
        else if( info.src.charCodeAt( pos ) == 55 ) state = 50;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 51;
        else if( info.src.charCodeAt( pos ) == 36 ) state = 52;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 53;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 54;
        else if( info.src.charCodeAt( pos ) == 58 ) state = 56;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 58;
        else if( info.src.charCodeAt( pos ) == 92 ) state = 60;
        else if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 88;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 101;
        else if( info.src.charCodeAt( pos ) == 116 ) state = 102;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 111;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 112;
        else if( info.src.charCodeAt( pos ) == 102 ) state = 113;
        else if( info.src.charCodeAt( pos ) == 80 || info.src.charCodeAt( pos ) == 112 ) state = 119;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 120;
        else state = -1;
        break;

    case 1:
        state = -1;
        match = 1;
        match_pos = pos;
        break;

    case 2:
        if( info.src.charCodeAt( pos ) == 61 ) state = 21;
        else if( info.src.charCodeAt( pos ) == 62 ) state = 22;
        else state = -1;
        match = 21;
        match_pos = pos;
        break;

    case 3:
        state = -1;
        match = 34;
        match_pos = pos;
        break;

    case 4:
        state = -1;
        match = 35;
        match_pos = pos;
        break;

    case 5:
        state = -1;
        match = 33;
        match_pos = pos;
        break;

    case 6:
        state = -1;
        match = 30;
        match_pos = pos;
        break;

    case 7:
        state = -1;
        match = 18;
        match_pos = pos;
        break;

    case 8:
        if( info.src.charCodeAt( pos ) == 62 ) state = 25;
        else state = -1;
        match = 31;
        match_pos = pos;
        break;

    case 9:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 26;
        else state = -1;
        match = 19;
        match_pos = pos;
        break;

    case 10:
        if( info.src.charCodeAt( pos ) == 47 ) state = 27;
        else state = -1;
        match = 32;
        match_pos = pos;
        break;

    case 11:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 11;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 26;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 12:
        state = -1;
        match = 17;
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
        match = 20;
        match_pos = pos;
        break;

    case 15:
        if( info.src.charCodeAt( pos ) == 61 ) state = 33;
        else state = -1;
        match = 28;
        match_pos = pos;
        break;

    case 16:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 17:
        state = -1;
        match = 15;
        match_pos = pos;
        break;

    case 18:
        state = -1;
        match = 16;
        match_pos = pos;
        break;

    case 19:
        state = -1;
        match = 13;
        match_pos = pos;
        break;

    case 20:
        state = -1;
        match = 14;
        match_pos = pos;
        break;

    case 21:
        state = -1;
        match = 23;
        match_pos = pos;
        break;

    case 22:
        state = -1;
        match = 25;
        match_pos = pos;
        break;

    case 23:
        state = -1;
        match = 41;
        match_pos = pos;
        break;

    case 24:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 24;
        else state = -1;
        match = 39;
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
        match = 44;
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
        else if( info.src.charCodeAt( pos ) == 60 ) state = 64;
        else state = -1;
        match = 47;
        match_pos = pos;
        break;

    case 35:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 5;
        match_pos = pos;
        break;

    case 36:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 2;
        match_pos = pos;
        break;

    case 37:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 8;
        match_pos = pos;
        break;

    case 38:
        state = -1;
        match = 48;
        match_pos = pos;
        break;

    case 39:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 6;
        match_pos = pos;
        break;

    case 40:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 3;
        match_pos = pos;
        break;

    case 41:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 43;
        match_pos = pos;
        break;

    case 42:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 9;
        match_pos = pos;
        break;

    case 43:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 4;
        match_pos = pos;
        break;

    case 44:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 10;
        match_pos = pos;
        break;

    case 45:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 7;
        match_pos = pos;
        break;

    case 46:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 11;
        match_pos = pos;
        break;

    case 47:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else state = -1;
        match = 12;
        match_pos = pos;
        break;

    case 48:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        match = 40;
        match_pos = pos;
        break;

    case 49:
        if( info.src.charCodeAt( pos ) == 34 ) state = 23;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 33 ) || ( info.src.charCodeAt( pos ) >= 35 && info.src.charCodeAt( pos ) <= 254 ) ) state = 49;
        else state = -1;
        break;

    case 50:
        if( ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 46 ) state = 26;
        else if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) ) state = 50;
        else state = -1;
        match = 42;
        match_pos = pos;
        break;

    case 51:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 35;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 52:
        if( info.src.charCodeAt( pos ) == 36 || info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 24;
        else state = -1;
        break;

    case 53:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 69 ) || ( info.src.charCodeAt( pos ) >= 71 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 101 ) || ( info.src.charCodeAt( pos ) >= 103 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 70 || info.src.charCodeAt( pos ) == 102 ) state = 36;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 54:
        if( info.src.charCodeAt( pos ) == 39 ) state = 23;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 54;
        else state = -1;
        break;

    case 55:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 86 ) || ( info.src.charCodeAt( pos ) >= 88 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 118 ) || ( info.src.charCodeAt( pos ) >= 120 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 87 || info.src.charCodeAt( pos ) == 119 ) state = 37;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 56:
        if( info.src.charCodeAt( pos ) == 58 ) state = 28;
        else state = -1;
        break;

    case 57:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 39;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 58:
        if( info.src.charCodeAt( pos ) == 62 ) state = 34;
        else state = -1;
        break;

    case 59:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 40;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 60:
        if( info.src.charCodeAt( pos ) == 32 ) state = 62;
        else state = -1;
        break;

    case 61:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 101 ) state = 41;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 62:
        if( info.src.charCodeAt( pos ) == 97 ) state = 66;
        else state = -1;
        break;

    case 63:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 42;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 64:
        if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 62 ) || ( info.src.charCodeAt( pos ) >= 64 && info.src.charCodeAt( pos ) <= 254 ) ) state = 34;
        else if( info.src.charCodeAt( pos ) == 63 ) state = 38;
        else state = -1;
        break;

    case 65:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 43;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 66:
        if( info.src.charCodeAt( pos ) == 115 ) state = 89;
        else state = -1;
        break;

    case 67:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 44;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 68:
        if( info.src.charCodeAt( pos ) == 101 ) state = 70;
        else state = -1;
        break;

    case 69:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 77 ) || ( info.src.charCodeAt( pos ) >= 79 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 78 || info.src.charCodeAt( pos ) == 110 ) state = 45;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 70:
        if( info.src.charCodeAt( pos ) == 114 ) state = 72;
        else state = -1;
        break;

    case 71:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 46;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 72:
        if( info.src.charCodeAt( pos ) == 116 ) state = 74;
        else state = -1;
        break;

    case 73:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 67 ) || ( info.src.charCodeAt( pos ) >= 69 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 99 ) || ( info.src.charCodeAt( pos ) >= 101 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 68 || info.src.charCodeAt( pos ) == 100 ) state = 47;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 74:
        if( info.src.charCodeAt( pos ) == 69 ) state = 76;
        else if( info.src.charCodeAt( pos ) == 70 ) state = 77;
        else state = -1;
        break;

    case 75:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 32 ) state = 78;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 76:
        if( info.src.charCodeAt( pos ) == 99 ) state = 79;
        else state = -1;
        break;

    case 77:
        if( info.src.charCodeAt( pos ) == 97 ) state = 80;
        else state = -1;
        break;

    case 78:
        if( info.src.charCodeAt( pos ) == 55 || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 122 ) ) state = 48;
        else state = -1;
        break;

    case 79:
        if( info.src.charCodeAt( pos ) == 104 ) state = 81;
        else state = -1;
        break;

    case 80:
        if( info.src.charCodeAt( pos ) == 105 ) state = 82;
        else state = -1;
        break;

    case 81:
        if( info.src.charCodeAt( pos ) == 111 ) state = 83;
        else state = -1;
        break;

    case 82:
        if( info.src.charCodeAt( pos ) == 108 ) state = 84;
        else state = -1;
        break;

    case 83:
        if( info.src.charCodeAt( pos ) == 32 ) state = 85;
        else state = -1;
        break;

    case 84:
        if( info.src.charCodeAt( pos ) == 36 ) state = 1;
        else if( info.src.charCodeAt( pos ) == 115 ) state = 84;
        else state = -1;
        break;

    case 85:
        if( info.src.charCodeAt( pos ) == 34 ) state = 86;
        else if( info.src.charCodeAt( pos ) == 39 ) state = 87;
        else state = -1;
        break;

    case 86:
        if( info.src.charCodeAt( pos ) == 34 ) state = 84;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 33 ) || ( info.src.charCodeAt( pos ) >= 35 && info.src.charCodeAt( pos ) <= 254 ) ) state = 86;
        else state = -1;
        break;

    case 87:
        if( info.src.charCodeAt( pos ) == 39 ) state = 84;
        else if( ( info.src.charCodeAt( pos ) >= 0 && info.src.charCodeAt( pos ) <= 38 ) || ( info.src.charCodeAt( pos ) >= 40 && info.src.charCodeAt( pos ) <= 254 ) ) state = 87;
        else state = -1;
        break;

    case 88:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 55;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 89:
        if( info.src.charCodeAt( pos ) == 115 ) state = 68;
        else state = -1;
        break;

    case 90:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 57;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 91:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 59;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 92:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 117 ) state = 61;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 93:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 82 ) || ( info.src.charCodeAt( pos ) >= 84 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 83 || info.src.charCodeAt( pos ) == 115 ) state = 63;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 94:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 65;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 95:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 114 ) || ( info.src.charCodeAt( pos ) >= 116 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 115 ) state = 61;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 96:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 67;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 97:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 69;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 98:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 71;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 99:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 73;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 100:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 75;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 101:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 90;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 91;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 102:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 114 ) state = 92;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 103:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 66 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 65 || info.src.charCodeAt( pos ) == 97 ) state = 93;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 104:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 94;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 105:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 108 ) state = 95;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 106:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 96;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 107:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 97;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 108:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 66 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 65 || info.src.charCodeAt( pos ) == 97 ) state = 98;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 109:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 99;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 110:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 111 ) state = 100;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 111:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 75 ) || ( info.src.charCodeAt( pos ) >= 77 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 107 ) || ( info.src.charCodeAt( pos ) >= 109 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 76 || info.src.charCodeAt( pos ) == 108 ) state = 103;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 112:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 71 ) || ( info.src.charCodeAt( pos ) >= 73 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 103 ) || ( info.src.charCodeAt( pos ) >= 105 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 72 || info.src.charCodeAt( pos ) == 104 ) state = 104;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 113:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 98 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 97 ) state = 105;
        else if( info.src.charCodeAt( pos ) == 117 ) state = 126;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 114:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || info.src.charCodeAt( pos ) == 65 || ( info.src.charCodeAt( pos ) >= 67 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || info.src.charCodeAt( pos ) == 97 || ( info.src.charCodeAt( pos ) >= 99 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 66 || info.src.charCodeAt( pos ) == 98 ) state = 106;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 115:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 107;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 116:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 85 ) || ( info.src.charCodeAt( pos ) >= 87 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 117 ) || ( info.src.charCodeAt( pos ) >= 119 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 86 || info.src.charCodeAt( pos ) == 118 ) state = 108;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 117:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 66 ) || ( info.src.charCodeAt( pos ) >= 68 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 67 || info.src.charCodeAt( pos ) == 99 ) state = 109;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 118:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 105 ) state = 110;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 119:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 81 ) || ( info.src.charCodeAt( pos ) >= 83 && info.src.charCodeAt( pos ) <= 84 ) || ( info.src.charCodeAt( pos ) >= 86 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 113 ) || ( info.src.charCodeAt( pos ) >= 115 && info.src.charCodeAt( pos ) <= 116 ) || ( info.src.charCodeAt( pos ) >= 118 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 85 || info.src.charCodeAt( pos ) == 117 ) state = 114;
        else if( info.src.charCodeAt( pos ) == 82 || info.src.charCodeAt( pos ) == 114 ) state = 121;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 120:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 115;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 121:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 72 ) || ( info.src.charCodeAt( pos ) >= 74 && info.src.charCodeAt( pos ) <= 78 ) || ( info.src.charCodeAt( pos ) >= 80 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 104 ) || ( info.src.charCodeAt( pos ) >= 106 && info.src.charCodeAt( pos ) <= 110 ) || ( info.src.charCodeAt( pos ) >= 112 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 73 || info.src.charCodeAt( pos ) == 105 ) state = 116;
        else if( info.src.charCodeAt( pos ) == 79 || info.src.charCodeAt( pos ) == 111 ) state = 124;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 122:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 68 ) || ( info.src.charCodeAt( pos ) >= 70 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 100 ) || ( info.src.charCodeAt( pos ) >= 102 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 69 || info.src.charCodeAt( pos ) == 101 ) state = 117;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 123:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 116 ) state = 118;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 124:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 83 ) || ( info.src.charCodeAt( pos ) >= 85 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 115 ) || ( info.src.charCodeAt( pos ) >= 117 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 84 || info.src.charCodeAt( pos ) == 116 ) state = 122;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 125:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 98 ) || ( info.src.charCodeAt( pos ) >= 100 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 99 ) state = 123;
        else state = -1;
        match = 45;
        match_pos = pos;
        break;

    case 126:
        if( ( info.src.charCodeAt( pos ) >= 48 && info.src.charCodeAt( pos ) <= 57 ) || ( info.src.charCodeAt( pos ) >= 65 && info.src.charCodeAt( pos ) <= 90 ) || info.src.charCodeAt( pos ) == 95 || ( info.src.charCodeAt( pos ) >= 97 && info.src.charCodeAt( pos ) <= 109 ) || ( info.src.charCodeAt( pos ) >= 111 && info.src.charCodeAt( pos ) <= 122 ) ) state = 16;
        else if( info.src.charCodeAt( pos ) == 110 ) state = 125;
        else state = -1;
        match = 45;
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
        
                                            info.att = info.att.substr(1,info.att.length-2);
                                            info.att = info.att.replace( /\\'/g, "'" );
                                        
        }
        break;

    case 43:
        {
        
                                            if (info.att == 'true')
                                                info.att = 1;
                                            else
                                                info.att = 0;
                                        
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
    new Array( 57/* FunctionMod */, 1 ),
    new Array( 57/* FunctionMod */, 0 ),
    new Array( 57/* FunctionMod */, 1 ),
    new Array( 57/* FunctionMod */, 1 ),
    new Array( 59/* FunctionDefinition */, 7 ),
    new Array( 55/* ClassFunctionDefinition */, 8 ),
    new Array( 54/* AttributeDefinition */, 3 ),
    new Array( 54/* AttributeDefinition */, 5 ),
    new Array( 62/* SingleStmt */, 2 ),
    new Array( 62/* SingleStmt */, 2 ),
    new Array( 62/* SingleStmt */, 3 ),
    new Array( 62/* SingleStmt */, 5 ),
    new Array( 62/* SingleStmt */, 3 ),
    new Array( 62/* SingleStmt */, 5 ),
    new Array( 62/* SingleStmt */, 3 ),
    new Array( 62/* SingleStmt */, 2 ),
    new Array( 62/* SingleStmt */, 5 ),
    new Array( 62/* SingleStmt */, 3 ),
    new Array( 51/* Stmt */, 2 ),
    new Array( 51/* Stmt */, 1 ),
    new Array( 51/* Stmt */, 1 ),
    new Array( 51/* Stmt */, 1 ),
    new Array( 51/* Stmt */, 1 ),
    new Array( 51/* Stmt */, 2 ),
    new Array( 63/* AssignmentStmt */, 3 ),
    new Array( 63/* AssignmentStmt */, 5 ),
    new Array( 65/* AssertStmt */, 2 ),
    new Array( 65/* AssertStmt */, 1 ),
    new Array( 65/* AssertStmt */, 0 ),
    new Array( 58/* FormalParameterList */, 3 ),
    new Array( 58/* FormalParameterList */, 1 ),
    new Array( 58/* FormalParameterList */, 0 ),
    new Array( 61/* Return */, 2 ),
    new Array( 61/* Return */, 1 ),
    new Array( 66/* Target */, 1 ),
    new Array( 72/* ExpressionNotFunAccess */, 1 ),
    new Array( 72/* ExpressionNotFunAccess */, 1 ),
    new Array( 72/* ExpressionNotFunAccess */, 4 ),
    new Array( 72/* ExpressionNotFunAccess */, 3 ),
    new Array( 72/* ExpressionNotFunAccess */, 2 ),
    new Array( 72/* ExpressionNotFunAccess */, 3 ),
    new Array( 60/* Expression */, 1 ),
    new Array( 60/* Expression */, 1 ),
    new Array( 69/* FunctionInvoke */, 2 ),
    new Array( 69/* FunctionInvoke */, 2 ),
    new Array( 71/* MemberAccess */, 1 ),
    new Array( 71/* MemberAccess */, 1 ),
    new Array( 67/* AttributeAccess */, 1 ),
    new Array( 67/* AttributeAccess */, 1 ),
    new Array( 73/* FunctionAccess */, 3 ),
    new Array( 73/* FunctionAccess */, 4 ),
    new Array( 70/* ActualParameterList */, 3 ),
    new Array( 70/* ActualParameterList */, 1 ),
    new Array( 70/* ActualParameterList */, 0 ),
    new Array( 64/* ArrayIndices */, 4 ),
    new Array( 64/* ArrayIndices */, 3 ),
    new Array( 68/* BinaryOp */, 3 ),
    new Array( 68/* BinaryOp */, 3 ),
    new Array( 68/* BinaryOp */, 3 ),
    new Array( 68/* BinaryOp */, 3 ),
    new Array( 68/* BinaryOp */, 3 ),
    new Array( 68/* BinaryOp */, 3 ),
    new Array( 68/* BinaryOp */, 3 ),
    new Array( 68/* BinaryOp */, 1 ),
    new Array( 74/* AddSubExp */, 3 ),
    new Array( 74/* AddSubExp */, 3 ),
    new Array( 74/* AddSubExp */, 1 ),
    new Array( 75/* MulDivExp */, 3 ),
    new Array( 75/* MulDivExp */, 3 ),
    new Array( 75/* MulDivExp */, 1 ),
    new Array( 76/* UnaryOp */, 2 ),
    new Array( 76/* UnaryOp */, 2 ),
    new Array( 76/* UnaryOp */, 1 ),
    new Array( 77/* Value */, 1 ),
    new Array( 77/* Value */, 1 ),
    new Array( 77/* Value */, 1 ),
    new Array( 77/* Value */, 1 ),
    new Array( 77/* Value */, 1 ),
    new Array( 77/* Value */, 3 )
);

/* Action-Table */
var act_tab = new Array(
    /* State 0 */ new Array( 78/* "$" */,-2 , 46/* "ScriptBegin" */,-2 ),
    /* State 1 */ new Array( 46/* "ScriptBegin" */,3 , 78/* "$" */,0 ),
    /* State 2 */ new Array( 78/* "$" */,-1 , 46/* "ScriptBegin" */,-1 ),
    /* State 3 */ new Array( 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 4 */ new Array( 47/* "ScriptEnd" */,41 , 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 5 */ new Array( 47/* "ScriptEnd" */,-30 , 48/* "InternalNonScript" */,-30 , 38/* "//" */,-30 , 7/* "RETURN" */,-30 , 2/* "IF" */,-30 , 4/* "WHILE" */,-30 , 5/* "DO" */,-30 , 6/* "ECHO" */,-30 , 39/* "Variable" */,-30 , 13/* "{" */,-30 , 9/* "ClassToken" */,-30 , 40/* "FunctionName" */,-30 , 8/* "NewToken" */,-30 , 34/* "(" */,-30 , 45/* "Identifier" */,-30 , 31/* "-" */,-30 , 21/* "!" */,-30 , 41/* "String" */,-30 , 42/* "Integer" */,-30 , 43/* "Boolean" */,-30 , 44/* "Float" */,-30 , 14/* "}" */,-30 ),
    /* State 6 */ new Array( 47/* "ScriptEnd" */,-31 , 48/* "InternalNonScript" */,-31 , 38/* "//" */,-31 , 7/* "RETURN" */,-31 , 2/* "IF" */,-31 , 4/* "WHILE" */,-31 , 5/* "DO" */,-31 , 6/* "ECHO" */,-31 , 39/* "Variable" */,-31 , 13/* "{" */,-31 , 9/* "ClassToken" */,-31 , 40/* "FunctionName" */,-31 , 8/* "NewToken" */,-31 , 34/* "(" */,-31 , 45/* "Identifier" */,-31 , 31/* "-" */,-31 , 21/* "!" */,-31 , 41/* "String" */,-31 , 42/* "Integer" */,-31 , 43/* "Boolean" */,-31 , 44/* "Float" */,-31 , 14/* "}" */,-31 ),
    /* State 7 */ new Array( 47/* "ScriptEnd" */,-32 , 48/* "InternalNonScript" */,-32 , 38/* "//" */,-32 , 7/* "RETURN" */,-32 , 2/* "IF" */,-32 , 4/* "WHILE" */,-32 , 5/* "DO" */,-32 , 6/* "ECHO" */,-32 , 39/* "Variable" */,-32 , 13/* "{" */,-32 , 9/* "ClassToken" */,-32 , 40/* "FunctionName" */,-32 , 8/* "NewToken" */,-32 , 34/* "(" */,-32 , 45/* "Identifier" */,-32 , 31/* "-" */,-32 , 21/* "!" */,-32 , 41/* "String" */,-32 , 42/* "Integer" */,-32 , 43/* "Boolean" */,-32 , 44/* "Float" */,-32 , 14/* "}" */,-32 ),
    /* State 8 */ new Array( 47/* "ScriptEnd" */,-33 , 48/* "InternalNonScript" */,-33 , 38/* "//" */,-33 , 7/* "RETURN" */,-33 , 2/* "IF" */,-33 , 4/* "WHILE" */,-33 , 5/* "DO" */,-33 , 6/* "ECHO" */,-33 , 39/* "Variable" */,-33 , 13/* "{" */,-33 , 9/* "ClassToken" */,-33 , 40/* "FunctionName" */,-33 , 8/* "NewToken" */,-33 , 34/* "(" */,-33 , 45/* "Identifier" */,-33 , 31/* "-" */,-33 , 21/* "!" */,-33 , 41/* "String" */,-33 , 42/* "Integer" */,-33 , 43/* "Boolean" */,-33 , 44/* "Float" */,-33 , 14/* "}" */,-33 ),
    /* State 9 */ new Array( 45/* "Identifier" */,43 , 47/* "ScriptEnd" */,-39 , 48/* "InternalNonScript" */,-39 , 38/* "//" */,-39 , 7/* "RETURN" */,-39 , 2/* "IF" */,-39 , 4/* "WHILE" */,-39 , 5/* "DO" */,-39 , 6/* "ECHO" */,-39 , 39/* "Variable" */,-39 , 13/* "{" */,-39 , 9/* "ClassToken" */,-39 , 40/* "FunctionName" */,-39 , 8/* "NewToken" */,-39 , 34/* "(" */,-39 , 31/* "-" */,-39 , 21/* "!" */,-39 , 41/* "String" */,-39 , 42/* "Integer" */,-39 , 43/* "Boolean" */,-39 , 44/* "Float" */,-39 ),
    /* State 10 */ new Array( 17/* ";" */,44 ),
    /* State 11 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,53 , 36/* "->" */,-45 ),
    /* State 12 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 13 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 14 */ new Array( 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 15 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 16 */ new Array( 17/* ";" */,60 , 34/* "(" */,-46 , 36/* "->" */,-46 , 22/* "==" */,-46 , 29/* "<" */,-46 , 28/* ">" */,-46 , 26/* "<=" */,-46 , 27/* ">=" */,-46 , 23/* "!=" */,-46 , 19/* "." */,-46 ),
    /* State 17 */ new Array( 20/* "=" */,62 , 15/* "[" */,63 , 17/* ";" */,-84 , 31/* "-" */,-84 , 30/* "+" */,-84 , 33/* "*" */,-84 , 32/* "/" */,-84 , 34/* "(" */,-84 , 36/* "->" */,-84 , 22/* "==" */,-84 , 29/* "<" */,-84 , 28/* ">" */,-84 , 26/* "<=" */,-84 , 27/* ">=" */,-84 , 23/* "!=" */,-84 , 19/* "." */,-84 ),
    /* State 18 */ new Array( 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 19 */ new Array( 45/* "Identifier" */,65 ),
    /* State 20 */ new Array( 34/* "(" */,66 ),
    /* State 21 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 17/* ";" */,-44 ),
    /* State 22 */ new Array( 17/* ";" */,-52 , 34/* "(" */,-52 , 36/* "->" */,-52 , 22/* "==" */,-52 , 29/* "<" */,-52 , 28/* ">" */,-52 , 26/* "<=" */,-52 , 27/* ">=" */,-52 , 23/* "!=" */,-52 , 19/* "." */,-52 , 7/* "RETURN" */,-52 , 2/* "IF" */,-52 , 4/* "WHILE" */,-52 , 5/* "DO" */,-52 , 6/* "ECHO" */,-52 , 39/* "Variable" */,-52 , 13/* "{" */,-52 , 8/* "NewToken" */,-52 , 45/* "Identifier" */,-52 , 31/* "-" */,-52 , 21/* "!" */,-52 , 41/* "String" */,-52 , 42/* "Integer" */,-52 , 43/* "Boolean" */,-52 , 44/* "Float" */,-52 , 35/* ")" */,-52 , 18/* "," */,-52 , 30/* "+" */,-52 , 33/* "*" */,-52 , 32/* "/" */,-52 , 16/* "]" */,-52 , 20/* "=" */,-52 ),
    /* State 23 */ new Array( 17/* ";" */,-53 , 34/* "(" */,-53 , 36/* "->" */,-53 , 22/* "==" */,-53 , 29/* "<" */,-53 , 28/* ">" */,-53 , 26/* "<=" */,-53 , 27/* ">=" */,-53 , 23/* "!=" */,-53 , 19/* "." */,-53 , 7/* "RETURN" */,-53 , 2/* "IF" */,-53 , 4/* "WHILE" */,-53 , 5/* "DO" */,-53 , 6/* "ECHO" */,-53 , 39/* "Variable" */,-53 , 13/* "{" */,-53 , 8/* "NewToken" */,-53 , 45/* "Identifier" */,-53 , 31/* "-" */,-53 , 21/* "!" */,-53 , 41/* "String" */,-53 , 42/* "Integer" */,-53 , 43/* "Boolean" */,-53 , 44/* "Float" */,-53 , 35/* ")" */,-53 , 18/* "," */,-53 , 30/* "+" */,-53 , 33/* "*" */,-53 , 32/* "/" */,-53 , 16/* "]" */,-53 , 20/* "=" */,-53 ),
    /* State 24 */ new Array( 36/* "->" */,68 ),
    /* State 25 */ new Array( 17/* ";" */,-47 , 34/* "(" */,-47 , 36/* "->" */,-47 , 22/* "==" */,-47 , 29/* "<" */,-47 , 28/* ">" */,-47 , 26/* "<=" */,-47 , 27/* ">=" */,-47 , 23/* "!=" */,-47 , 19/* "." */,-47 , 7/* "RETURN" */,-47 , 2/* "IF" */,-47 , 4/* "WHILE" */,-47 , 5/* "DO" */,-47 , 6/* "ECHO" */,-47 , 39/* "Variable" */,-47 , 13/* "{" */,-47 , 8/* "NewToken" */,-47 , 45/* "Identifier" */,-47 , 31/* "-" */,-47 , 21/* "!" */,-47 , 41/* "String" */,-47 , 42/* "Integer" */,-47 , 43/* "Boolean" */,-47 , 44/* "Float" */,-47 , 35/* ")" */,-47 , 18/* "," */,-47 , 30/* "+" */,-47 , 33/* "*" */,-47 , 32/* "/" */,-47 , 16/* "]" */,-47 , 20/* "=" */,-47 ),
    /* State 26 */ new Array( 45/* "Identifier" */,30 , 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 27 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 28 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 35/* ")" */,-64 , 18/* "," */,-64 ),
    /* State 29 */ new Array( 30/* "+" */,74 , 31/* "-" */,75 , 17/* ";" */,-74 , 34/* "(" */,-74 , 36/* "->" */,-74 , 22/* "==" */,-74 , 29/* "<" */,-74 , 28/* ">" */,-74 , 26/* "<=" */,-74 , 27/* ">=" */,-74 , 23/* "!=" */,-74 , 19/* "." */,-74 , 7/* "RETURN" */,-74 , 2/* "IF" */,-74 , 4/* "WHILE" */,-74 , 5/* "DO" */,-74 , 6/* "ECHO" */,-74 , 39/* "Variable" */,-74 , 13/* "{" */,-74 , 8/* "NewToken" */,-74 , 45/* "Identifier" */,-74 , 21/* "!" */,-74 , 41/* "String" */,-74 , 42/* "Integer" */,-74 , 43/* "Boolean" */,-74 , 44/* "Float" */,-74 , 35/* ")" */,-74 , 18/* "," */,-74 , 33/* "*" */,-74 , 32/* "/" */,-74 , 16/* "]" */,-74 , 20/* "=" */,-74 ),
    /* State 30 */ new Array( 34/* "(" */,76 ),
    /* State 31 */ new Array( 32/* "/" */,77 , 33/* "*" */,78 , 17/* ";" */,-77 , 31/* "-" */,-77 , 30/* "+" */,-77 , 34/* "(" */,-77 , 36/* "->" */,-77 , 22/* "==" */,-77 , 29/* "<" */,-77 , 28/* ">" */,-77 , 26/* "<=" */,-77 , 27/* ">=" */,-77 , 23/* "!=" */,-77 , 19/* "." */,-77 , 7/* "RETURN" */,-77 , 2/* "IF" */,-77 , 4/* "WHILE" */,-77 , 5/* "DO" */,-77 , 6/* "ECHO" */,-77 , 39/* "Variable" */,-77 , 13/* "{" */,-77 , 8/* "NewToken" */,-77 , 45/* "Identifier" */,-77 , 21/* "!" */,-77 , 41/* "String" */,-77 , 42/* "Integer" */,-77 , 43/* "Boolean" */,-77 , 44/* "Float" */,-77 , 35/* ")" */,-77 , 18/* "," */,-77 , 16/* "]" */,-77 , 20/* "=" */,-77 ),
    /* State 32 */ new Array( 17/* ";" */,-80 , 31/* "-" */,-80 , 30/* "+" */,-80 , 33/* "*" */,-80 , 32/* "/" */,-80 , 34/* "(" */,-80 , 36/* "->" */,-80 , 22/* "==" */,-80 , 29/* "<" */,-80 , 28/* ">" */,-80 , 26/* "<=" */,-80 , 27/* ">=" */,-80 , 23/* "!=" */,-80 , 19/* "." */,-80 , 7/* "RETURN" */,-80 , 2/* "IF" */,-80 , 4/* "WHILE" */,-80 , 5/* "DO" */,-80 , 6/* "ECHO" */,-80 , 39/* "Variable" */,-80 , 13/* "{" */,-80 , 8/* "NewToken" */,-80 , 45/* "Identifier" */,-80 , 21/* "!" */,-80 , 41/* "String" */,-80 , 42/* "Integer" */,-80 , 43/* "Boolean" */,-80 , 44/* "Float" */,-80 , 35/* ")" */,-80 , 18/* "," */,-80 , 16/* "]" */,-80 , 20/* "=" */,-80 ),
    /* State 33 */ new Array( 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 34 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 35 */ new Array( 17/* ";" */,-83 , 31/* "-" */,-83 , 30/* "+" */,-83 , 33/* "*" */,-83 , 32/* "/" */,-83 , 34/* "(" */,-83 , 36/* "->" */,-83 , 22/* "==" */,-83 , 29/* "<" */,-83 , 28/* ">" */,-83 , 26/* "<=" */,-83 , 27/* ">=" */,-83 , 23/* "!=" */,-83 , 19/* "." */,-83 , 7/* "RETURN" */,-83 , 2/* "IF" */,-83 , 4/* "WHILE" */,-83 , 5/* "DO" */,-83 , 6/* "ECHO" */,-83 , 39/* "Variable" */,-83 , 13/* "{" */,-83 , 8/* "NewToken" */,-83 , 45/* "Identifier" */,-83 , 21/* "!" */,-83 , 41/* "String" */,-83 , 42/* "Integer" */,-83 , 43/* "Boolean" */,-83 , 44/* "Float" */,-83 , 35/* ")" */,-83 , 18/* "," */,-83 , 16/* "]" */,-83 , 20/* "=" */,-83 ),
    /* State 36 */ new Array( 17/* ";" */,-85 , 31/* "-" */,-85 , 30/* "+" */,-85 , 33/* "*" */,-85 , 32/* "/" */,-85 , 34/* "(" */,-85 , 36/* "->" */,-85 , 22/* "==" */,-85 , 29/* "<" */,-85 , 28/* ">" */,-85 , 26/* "<=" */,-85 , 27/* ">=" */,-85 , 23/* "!=" */,-85 , 19/* "." */,-85 , 7/* "RETURN" */,-85 , 2/* "IF" */,-85 , 4/* "WHILE" */,-85 , 5/* "DO" */,-85 , 6/* "ECHO" */,-85 , 39/* "Variable" */,-85 , 13/* "{" */,-85 , 8/* "NewToken" */,-85 , 45/* "Identifier" */,-85 , 21/* "!" */,-85 , 41/* "String" */,-85 , 42/* "Integer" */,-85 , 43/* "Boolean" */,-85 , 44/* "Float" */,-85 , 35/* ")" */,-85 , 18/* "," */,-85 , 16/* "]" */,-85 , 20/* "=" */,-85 ),
    /* State 37 */ new Array( 17/* ";" */,-86 , 31/* "-" */,-86 , 30/* "+" */,-86 , 33/* "*" */,-86 , 32/* "/" */,-86 , 34/* "(" */,-86 , 36/* "->" */,-86 , 22/* "==" */,-86 , 29/* "<" */,-86 , 28/* ">" */,-86 , 26/* "<=" */,-86 , 27/* ">=" */,-86 , 23/* "!=" */,-86 , 19/* "." */,-86 , 7/* "RETURN" */,-86 , 2/* "IF" */,-86 , 4/* "WHILE" */,-86 , 5/* "DO" */,-86 , 6/* "ECHO" */,-86 , 39/* "Variable" */,-86 , 13/* "{" */,-86 , 8/* "NewToken" */,-86 , 45/* "Identifier" */,-86 , 21/* "!" */,-86 , 41/* "String" */,-86 , 42/* "Integer" */,-86 , 43/* "Boolean" */,-86 , 44/* "Float" */,-86 , 35/* ")" */,-86 , 18/* "," */,-86 , 16/* "]" */,-86 , 20/* "=" */,-86 ),
    /* State 38 */ new Array( 17/* ";" */,-87 , 31/* "-" */,-87 , 30/* "+" */,-87 , 33/* "*" */,-87 , 32/* "/" */,-87 , 34/* "(" */,-87 , 36/* "->" */,-87 , 22/* "==" */,-87 , 29/* "<" */,-87 , 28/* ">" */,-87 , 26/* "<=" */,-87 , 27/* ">=" */,-87 , 23/* "!=" */,-87 , 19/* "." */,-87 , 7/* "RETURN" */,-87 , 2/* "IF" */,-87 , 4/* "WHILE" */,-87 , 5/* "DO" */,-87 , 6/* "ECHO" */,-87 , 39/* "Variable" */,-87 , 13/* "{" */,-87 , 8/* "NewToken" */,-87 , 45/* "Identifier" */,-87 , 21/* "!" */,-87 , 41/* "String" */,-87 , 42/* "Integer" */,-87 , 43/* "Boolean" */,-87 , 44/* "Float" */,-87 , 35/* ")" */,-87 , 18/* "," */,-87 , 16/* "]" */,-87 , 20/* "=" */,-87 ),
    /* State 39 */ new Array( 17/* ";" */,-88 , 31/* "-" */,-88 , 30/* "+" */,-88 , 33/* "*" */,-88 , 32/* "/" */,-88 , 34/* "(" */,-88 , 36/* "->" */,-88 , 22/* "==" */,-88 , 29/* "<" */,-88 , 28/* ">" */,-88 , 26/* "<=" */,-88 , 27/* ">=" */,-88 , 23/* "!=" */,-88 , 19/* "." */,-88 , 7/* "RETURN" */,-88 , 2/* "IF" */,-88 , 4/* "WHILE" */,-88 , 5/* "DO" */,-88 , 6/* "ECHO" */,-88 , 39/* "Variable" */,-88 , 13/* "{" */,-88 , 8/* "NewToken" */,-88 , 45/* "Identifier" */,-88 , 21/* "!" */,-88 , 41/* "String" */,-88 , 42/* "Integer" */,-88 , 43/* "Boolean" */,-88 , 44/* "Float" */,-88 , 35/* ")" */,-88 , 18/* "," */,-88 , 16/* "]" */,-88 , 20/* "=" */,-88 ),
    /* State 40 */ new Array( 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 47/* "ScriptEnd" */,-29 , 14/* "}" */,-29 ),
    /* State 41 */ new Array( 78/* "$" */,-3 , 46/* "ScriptBegin" */,-3 ),
    /* State 42 */ new Array( 47/* "ScriptEnd" */,-34 , 48/* "InternalNonScript" */,-34 , 38/* "//" */,-34 , 7/* "RETURN" */,-34 , 2/* "IF" */,-34 , 4/* "WHILE" */,-34 , 5/* "DO" */,-34 , 6/* "ECHO" */,-34 , 39/* "Variable" */,-34 , 13/* "{" */,-34 , 9/* "ClassToken" */,-34 , 40/* "FunctionName" */,-34 , 8/* "NewToken" */,-34 , 34/* "(" */,-34 , 45/* "Identifier" */,-34 , 31/* "-" */,-34 , 21/* "!" */,-34 , 41/* "String" */,-34 , 42/* "Integer" */,-34 , 43/* "Boolean" */,-34 , 44/* "Float" */,-34 , 14/* "}" */,-34 ),
    /* State 43 */ new Array( 41/* "String" */,83 , 47/* "ScriptEnd" */,-38 , 48/* "InternalNonScript" */,-38 , 38/* "//" */,-38 , 7/* "RETURN" */,-38 , 2/* "IF" */,-38 , 4/* "WHILE" */,-38 , 5/* "DO" */,-38 , 6/* "ECHO" */,-38 , 39/* "Variable" */,-38 , 13/* "{" */,-38 , 9/* "ClassToken" */,-38 , 40/* "FunctionName" */,-38 , 8/* "NewToken" */,-38 , 34/* "(" */,-38 , 45/* "Identifier" */,-38 , 31/* "-" */,-38 , 21/* "!" */,-38 , 42/* "Integer" */,-38 , 43/* "Boolean" */,-38 , 44/* "Float" */,-38 , 14/* "}" */,-38 ),
    /* State 44 */ new Array( 47/* "ScriptEnd" */,-19 , 48/* "InternalNonScript" */,-19 , 38/* "//" */,-19 , 7/* "RETURN" */,-19 , 2/* "IF" */,-19 , 4/* "WHILE" */,-19 , 5/* "DO" */,-19 , 6/* "ECHO" */,-19 , 39/* "Variable" */,-19 , 13/* "{" */,-19 , 9/* "ClassToken" */,-19 , 40/* "FunctionName" */,-19 , 8/* "NewToken" */,-19 , 34/* "(" */,-19 , 45/* "Identifier" */,-19 , 31/* "-" */,-19 , 21/* "!" */,-19 , 41/* "String" */,-19 , 42/* "Integer" */,-19 , 43/* "Boolean" */,-19 , 44/* "Float" */,-19 , 14/* "}" */,-19 , 3/* "ELSE" */,-19 ),
    /* State 45 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 18/* "," */,-55 , 35/* ")" */,-55 , 22/* "==" */,-55 , 29/* "<" */,-55 , 28/* ">" */,-55 , 26/* "<=" */,-55 , 27/* ">=" */,-55 , 23/* "!=" */,-55 , 19/* "." */,-55 , 36/* "->" */,-55 ),
    /* State 46 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 47 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 48 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 49 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 50 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 51 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 52 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 53 */ new Array( 47/* "ScriptEnd" */,-20 , 48/* "InternalNonScript" */,-20 , 38/* "//" */,-20 , 7/* "RETURN" */,-20 , 2/* "IF" */,-20 , 4/* "WHILE" */,-20 , 5/* "DO" */,-20 , 6/* "ECHO" */,-20 , 39/* "Variable" */,-20 , 13/* "{" */,-20 , 9/* "ClassToken" */,-20 , 40/* "FunctionName" */,-20 , 8/* "NewToken" */,-20 , 34/* "(" */,-20 , 45/* "Identifier" */,-20 , 31/* "-" */,-20 , 21/* "!" */,-20 , 41/* "String" */,-20 , 42/* "Integer" */,-20 , 43/* "Boolean" */,-20 , 44/* "Float" */,-20 , 14/* "}" */,-20 , 3/* "ELSE" */,-20 ),
    /* State 54 */ new Array( 34/* "(" */,92 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 36/* "->" */,-45 ),
    /* State 55 */ new Array( 7/* "RETURN" */,-46 , 2/* "IF" */,-46 , 4/* "WHILE" */,-46 , 5/* "DO" */,-46 , 6/* "ECHO" */,-46 , 39/* "Variable" */,-46 , 13/* "{" */,-46 , 8/* "NewToken" */,-46 , 34/* "(" */,-46 , 45/* "Identifier" */,-46 , 31/* "-" */,-46 , 21/* "!" */,-46 , 41/* "String" */,-46 , 42/* "Integer" */,-46 , 43/* "Boolean" */,-46 , 44/* "Float" */,-46 , 22/* "==" */,-46 , 29/* "<" */,-46 , 28/* ">" */,-46 , 26/* "<=" */,-46 , 27/* ">=" */,-46 , 23/* "!=" */,-46 , 19/* "." */,-46 , 36/* "->" */,-46 , 17/* ";" */,-46 , 35/* ")" */,-46 , 18/* "," */,-46 , 30/* "+" */,-46 , 33/* "*" */,-46 , 32/* "/" */,-46 , 16/* "]" */,-46 , 20/* "=" */,-46 ),
    /* State 56 */ new Array( 20/* "=" */,62 , 15/* "[" */,63 , 7/* "RETURN" */,-84 , 2/* "IF" */,-84 , 4/* "WHILE" */,-84 , 5/* "DO" */,-84 , 6/* "ECHO" */,-84 , 39/* "Variable" */,-84 , 13/* "{" */,-84 , 8/* "NewToken" */,-84 , 34/* "(" */,-84 , 45/* "Identifier" */,-84 , 31/* "-" */,-84 , 21/* "!" */,-84 , 41/* "String" */,-84 , 42/* "Integer" */,-84 , 43/* "Boolean" */,-84 , 44/* "Float" */,-84 , 30/* "+" */,-84 , 33/* "*" */,-84 , 32/* "/" */,-84 , 22/* "==" */,-84 , 29/* "<" */,-84 , 28/* ">" */,-84 , 26/* "<=" */,-84 , 27/* ">=" */,-84 , 23/* "!=" */,-84 , 19/* "." */,-84 , 36/* "->" */,-84 , 17/* ";" */,-84 , 35/* ")" */,-84 , 18/* "," */,-84 , 16/* "]" */,-84 ),
    /* State 57 */ new Array( 34/* "(" */,92 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 36/* "->" */,-45 ),
    /* State 58 */ new Array( 4/* "WHILE" */,96 ),
    /* State 59 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,97 , 36/* "->" */,-45 ),
    /* State 60 */ new Array( 47/* "ScriptEnd" */,-26 , 48/* "InternalNonScript" */,-26 , 38/* "//" */,-26 , 7/* "RETURN" */,-26 , 2/* "IF" */,-26 , 4/* "WHILE" */,-26 , 5/* "DO" */,-26 , 6/* "ECHO" */,-26 , 39/* "Variable" */,-26 , 13/* "{" */,-26 , 9/* "ClassToken" */,-26 , 40/* "FunctionName" */,-26 , 8/* "NewToken" */,-26 , 34/* "(" */,-26 , 45/* "Identifier" */,-26 , 31/* "-" */,-26 , 21/* "!" */,-26 , 41/* "String" */,-26 , 42/* "Integer" */,-26 , 43/* "Boolean" */,-26 , 44/* "Float" */,-26 , 14/* "}" */,-26 , 3/* "ELSE" */,-26 ),
    /* State 61 */ new Array( 15/* "[" */,98 , 20/* "=" */,99 , 17/* ";" */,-50 , 34/* "(" */,-50 , 36/* "->" */,-50 , 22/* "==" */,-50 , 29/* "<" */,-50 , 28/* ">" */,-50 , 26/* "<=" */,-50 , 27/* ">=" */,-50 , 23/* "!=" */,-50 , 19/* "." */,-50 ),
    /* State 62 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 63 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 64 */ new Array( 14/* "}" */,102 , 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 65 */ new Array( 13/* "{" */,103 ),
    /* State 66 */ new Array( 39/* "Variable" */,105 , 35/* ")" */,-42 , 18/* "," */,-42 ),
    /* State 67 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,-43 , 36/* "->" */,-45 ),
    /* State 68 */ new Array( 45/* "Identifier" */,109 , 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 69 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 35/* ")" */,-64 , 18/* "," */,-64 ),
    /* State 70 */ new Array( 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 34/* "(" */,45 , 36/* "->" */,-45 ),
    /* State 71 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 35/* ")" */,112 , 36/* "->" */,-45 ),
    /* State 72 */ new Array( 18/* "," */,113 , 35/* ")" */,114 ),
    /* State 73 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 35/* ")" */,-63 , 18/* "," */,-63 , 36/* "->" */,-45 ),
    /* State 74 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 75 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 76 */ new Array( 18/* "," */,-54 , 39/* "Variable" */,-54 , 8/* "NewToken" */,-54 , 34/* "(" */,-54 , 45/* "Identifier" */,-54 , 31/* "-" */,-54 , 21/* "!" */,-54 , 41/* "String" */,-54 , 42/* "Integer" */,-54 , 43/* "Boolean" */,-54 , 44/* "Float" */,-54 , 35/* ")" */,-54 ),
    /* State 77 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 78 */ new Array( 31/* "-" */,33 , 21/* "!" */,34 , 39/* "Variable" */,80 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 34/* "(" */,81 ),
    /* State 79 */ new Array( 17/* ";" */,-81 , 31/* "-" */,-81 , 30/* "+" */,-81 , 33/* "*" */,-81 , 32/* "/" */,-81 , 34/* "(" */,-81 , 36/* "->" */,-81 , 22/* "==" */,-81 , 29/* "<" */,-81 , 28/* ">" */,-81 , 26/* "<=" */,-81 , 27/* ">=" */,-81 , 23/* "!=" */,-81 , 19/* "." */,-81 , 7/* "RETURN" */,-81 , 2/* "IF" */,-81 , 4/* "WHILE" */,-81 , 5/* "DO" */,-81 , 6/* "ECHO" */,-81 , 39/* "Variable" */,-81 , 13/* "{" */,-81 , 8/* "NewToken" */,-81 , 45/* "Identifier" */,-81 , 21/* "!" */,-81 , 41/* "String" */,-81 , 42/* "Integer" */,-81 , 43/* "Boolean" */,-81 , 44/* "Float" */,-81 , 35/* ")" */,-81 , 18/* "," */,-81 , 16/* "]" */,-81 , 20/* "=" */,-81 ),
    /* State 80 */ new Array( 17/* ";" */,-84 , 31/* "-" */,-84 , 30/* "+" */,-84 , 33/* "*" */,-84 , 32/* "/" */,-84 , 34/* "(" */,-84 , 36/* "->" */,-84 , 22/* "==" */,-84 , 29/* "<" */,-84 , 28/* ">" */,-84 , 26/* "<=" */,-84 , 27/* ">=" */,-84 , 23/* "!=" */,-84 , 19/* "." */,-84 , 7/* "RETURN" */,-84 , 2/* "IF" */,-84 , 4/* "WHILE" */,-84 , 5/* "DO" */,-84 , 6/* "ECHO" */,-84 , 39/* "Variable" */,-84 , 13/* "{" */,-84 , 8/* "NewToken" */,-84 , 45/* "Identifier" */,-84 , 21/* "!" */,-84 , 41/* "String" */,-84 , 42/* "Integer" */,-84 , 43/* "Boolean" */,-84 , 44/* "Float" */,-84 , 35/* ")" */,-84 , 18/* "," */,-84 , 16/* "]" */,-84 , 20/* "=" */,-84 ),
    /* State 81 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 82 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,-82 , 31/* "-" */,-82 , 30/* "+" */,-82 , 33/* "*" */,-82 , 32/* "/" */,-82 , 36/* "->" */,-45 , 7/* "RETURN" */,-82 , 2/* "IF" */,-82 , 4/* "WHILE" */,-82 , 5/* "DO" */,-82 , 6/* "ECHO" */,-82 , 39/* "Variable" */,-82 , 13/* "{" */,-82 , 8/* "NewToken" */,-82 , 45/* "Identifier" */,-82 , 21/* "!" */,-82 , 41/* "String" */,-82 , 42/* "Integer" */,-82 , 43/* "Boolean" */,-82 , 44/* "Float" */,-82 , 35/* ")" */,-82 , 18/* "," */,-82 , 16/* "]" */,-82 , 20/* "=" */,-82 ),
    /* State 83 */ new Array( 47/* "ScriptEnd" */,-37 , 48/* "InternalNonScript" */,-37 , 38/* "//" */,-37 , 7/* "RETURN" */,-37 , 2/* "IF" */,-37 , 4/* "WHILE" */,-37 , 5/* "DO" */,-37 , 6/* "ECHO" */,-37 , 39/* "Variable" */,-37 , 13/* "{" */,-37 , 9/* "ClassToken" */,-37 , 40/* "FunctionName" */,-37 , 8/* "NewToken" */,-37 , 34/* "(" */,-37 , 45/* "Identifier" */,-37 , 31/* "-" */,-37 , 21/* "!" */,-37 , 41/* "String" */,-37 , 42/* "Integer" */,-37 , 43/* "Boolean" */,-37 , 44/* "Float" */,-37 , 14/* "}" */,-37 ),
    /* State 84 */ new Array( 18/* "," */,113 , 35/* ")" */,120 ),
    /* State 85 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,-73 , 36/* "->" */,-45 , 7/* "RETURN" */,-73 , 2/* "IF" */,-73 , 4/* "WHILE" */,-73 , 5/* "DO" */,-73 , 6/* "ECHO" */,-73 , 39/* "Variable" */,-73 , 13/* "{" */,-73 , 8/* "NewToken" */,-73 , 45/* "Identifier" */,-73 , 31/* "-" */,-73 , 21/* "!" */,-73 , 41/* "String" */,-73 , 42/* "Integer" */,-73 , 43/* "Boolean" */,-73 , 44/* "Float" */,-73 , 20/* "=" */,-73 , 35/* ")" */,-73 , 18/* "," */,-73 , 30/* "+" */,-73 , 33/* "*" */,-73 , 32/* "/" */,-73 , 16/* "]" */,-73 ),
    /* State 86 */ new Array( 30/* "+" */,74 , 31/* "-" */,75 , 17/* ";" */,-72 , 34/* "(" */,-72 , 36/* "->" */,-72 , 22/* "==" */,-72 , 29/* "<" */,-72 , 28/* ">" */,-72 , 26/* "<=" */,-72 , 27/* ">=" */,-72 , 23/* "!=" */,-72 , 19/* "." */,-72 , 7/* "RETURN" */,-72 , 2/* "IF" */,-72 , 4/* "WHILE" */,-72 , 5/* "DO" */,-72 , 6/* "ECHO" */,-72 , 39/* "Variable" */,-72 , 13/* "{" */,-72 , 8/* "NewToken" */,-72 , 45/* "Identifier" */,-72 , 21/* "!" */,-72 , 41/* "String" */,-72 , 42/* "Integer" */,-72 , 43/* "Boolean" */,-72 , 44/* "Float" */,-72 , 20/* "=" */,-72 , 35/* ")" */,-72 , 18/* "," */,-72 , 33/* "*" */,-72 , 32/* "/" */,-72 , 16/* "]" */,-72 ),
    /* State 87 */ new Array( 30/* "+" */,74 , 31/* "-" */,75 , 17/* ";" */,-71 , 34/* "(" */,-71 , 36/* "->" */,-71 , 22/* "==" */,-71 , 29/* "<" */,-71 , 28/* ">" */,-71 , 26/* "<=" */,-71 , 27/* ">=" */,-71 , 23/* "!=" */,-71 , 19/* "." */,-71 , 7/* "RETURN" */,-71 , 2/* "IF" */,-71 , 4/* "WHILE" */,-71 , 5/* "DO" */,-71 , 6/* "ECHO" */,-71 , 39/* "Variable" */,-71 , 13/* "{" */,-71 , 8/* "NewToken" */,-71 , 45/* "Identifier" */,-71 , 21/* "!" */,-71 , 41/* "String" */,-71 , 42/* "Integer" */,-71 , 43/* "Boolean" */,-71 , 44/* "Float" */,-71 , 20/* "=" */,-71 , 35/* ")" */,-71 , 18/* "," */,-71 , 33/* "*" */,-71 , 32/* "/" */,-71 , 16/* "]" */,-71 ),
    /* State 88 */ new Array( 30/* "+" */,74 , 31/* "-" */,75 , 17/* ";" */,-70 , 34/* "(" */,-70 , 36/* "->" */,-70 , 22/* "==" */,-70 , 29/* "<" */,-70 , 28/* ">" */,-70 , 26/* "<=" */,-70 , 27/* ">=" */,-70 , 23/* "!=" */,-70 , 19/* "." */,-70 , 7/* "RETURN" */,-70 , 2/* "IF" */,-70 , 4/* "WHILE" */,-70 , 5/* "DO" */,-70 , 6/* "ECHO" */,-70 , 39/* "Variable" */,-70 , 13/* "{" */,-70 , 8/* "NewToken" */,-70 , 45/* "Identifier" */,-70 , 21/* "!" */,-70 , 41/* "String" */,-70 , 42/* "Integer" */,-70 , 43/* "Boolean" */,-70 , 44/* "Float" */,-70 , 20/* "=" */,-70 , 35/* ")" */,-70 , 18/* "," */,-70 , 33/* "*" */,-70 , 32/* "/" */,-70 , 16/* "]" */,-70 ),
    /* State 89 */ new Array( 30/* "+" */,74 , 31/* "-" */,75 , 17/* ";" */,-69 , 34/* "(" */,-69 , 36/* "->" */,-69 , 22/* "==" */,-69 , 29/* "<" */,-69 , 28/* ">" */,-69 , 26/* "<=" */,-69 , 27/* ">=" */,-69 , 23/* "!=" */,-69 , 19/* "." */,-69 , 7/* "RETURN" */,-69 , 2/* "IF" */,-69 , 4/* "WHILE" */,-69 , 5/* "DO" */,-69 , 6/* "ECHO" */,-69 , 39/* "Variable" */,-69 , 13/* "{" */,-69 , 8/* "NewToken" */,-69 , 45/* "Identifier" */,-69 , 21/* "!" */,-69 , 41/* "String" */,-69 , 42/* "Integer" */,-69 , 43/* "Boolean" */,-69 , 44/* "Float" */,-69 , 20/* "=" */,-69 , 35/* ")" */,-69 , 18/* "," */,-69 , 33/* "*" */,-69 , 32/* "/" */,-69 , 16/* "]" */,-69 ),
    /* State 90 */ new Array( 30/* "+" */,74 , 31/* "-" */,75 , 17/* ";" */,-68 , 34/* "(" */,-68 , 36/* "->" */,-68 , 22/* "==" */,-68 , 29/* "<" */,-68 , 28/* ">" */,-68 , 26/* "<=" */,-68 , 27/* ">=" */,-68 , 23/* "!=" */,-68 , 19/* "." */,-68 , 7/* "RETURN" */,-68 , 2/* "IF" */,-68 , 4/* "WHILE" */,-68 , 5/* "DO" */,-68 , 6/* "ECHO" */,-68 , 39/* "Variable" */,-68 , 13/* "{" */,-68 , 8/* "NewToken" */,-68 , 45/* "Identifier" */,-68 , 21/* "!" */,-68 , 41/* "String" */,-68 , 42/* "Integer" */,-68 , 43/* "Boolean" */,-68 , 44/* "Float" */,-68 , 20/* "=" */,-68 , 35/* ")" */,-68 , 18/* "," */,-68 , 33/* "*" */,-68 , 32/* "/" */,-68 , 16/* "]" */,-68 ),
    /* State 91 */ new Array( 30/* "+" */,74 , 31/* "-" */,75 , 17/* ";" */,-67 , 34/* "(" */,-67 , 36/* "->" */,-67 , 22/* "==" */,-67 , 29/* "<" */,-67 , 28/* ">" */,-67 , 26/* "<=" */,-67 , 27/* ">=" */,-67 , 23/* "!=" */,-67 , 19/* "." */,-67 , 7/* "RETURN" */,-67 , 2/* "IF" */,-67 , 4/* "WHILE" */,-67 , 5/* "DO" */,-67 , 6/* "ECHO" */,-67 , 39/* "Variable" */,-67 , 13/* "{" */,-67 , 8/* "NewToken" */,-67 , 45/* "Identifier" */,-67 , 21/* "!" */,-67 , 41/* "String" */,-67 , 42/* "Integer" */,-67 , 43/* "Boolean" */,-67 , 44/* "Float" */,-67 , 20/* "=" */,-67 , 35/* ")" */,-67 , 18/* "," */,-67 , 33/* "*" */,-67 , 32/* "/" */,-67 , 16/* "]" */,-67 ),
    /* State 92 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 , 18/* "," */,-55 , 35/* ")" */,-55 ),
    /* State 93 */ new Array( 3/* "ELSE" */,122 , 47/* "ScriptEnd" */,-21 , 48/* "InternalNonScript" */,-21 , 38/* "//" */,-21 , 7/* "RETURN" */,-21 , 2/* "IF" */,-21 , 4/* "WHILE" */,-21 , 5/* "DO" */,-21 , 6/* "ECHO" */,-21 , 39/* "Variable" */,-21 , 13/* "{" */,-21 , 9/* "ClassToken" */,-21 , 40/* "FunctionName" */,-21 , 8/* "NewToken" */,-21 , 34/* "(" */,-21 , 45/* "Identifier" */,-21 , 31/* "-" */,-21 , 21/* "!" */,-21 , 41/* "String" */,-21 , 42/* "Integer" */,-21 , 43/* "Boolean" */,-21 , 44/* "Float" */,-21 , 14/* "}" */,-21 ),
    /* State 94 */ new Array( 15/* "[" */,98 , 7/* "RETURN" */,-50 , 2/* "IF" */,-50 , 4/* "WHILE" */,-50 , 5/* "DO" */,-50 , 6/* "ECHO" */,-50 , 39/* "Variable" */,-50 , 13/* "{" */,-50 , 8/* "NewToken" */,-50 , 34/* "(" */,-50 , 45/* "Identifier" */,-50 , 31/* "-" */,-50 , 21/* "!" */,-50 , 41/* "String" */,-50 , 42/* "Integer" */,-50 , 43/* "Boolean" */,-50 , 44/* "Float" */,-50 , 22/* "==" */,-50 , 29/* "<" */,-50 , 28/* ">" */,-50 , 26/* "<=" */,-50 , 27/* ">=" */,-50 , 23/* "!=" */,-50 , 19/* "." */,-50 , 36/* "->" */,-50 , 17/* ";" */,-50 , 35/* ")" */,-50 , 18/* "," */,-50 , 30/* "+" */,-50 , 33/* "*" */,-50 , 32/* "/" */,-50 , 16/* "]" */,-50 , 20/* "=" */,-50 ),
    /* State 95 */ new Array( 47/* "ScriptEnd" */,-23 , 48/* "InternalNonScript" */,-23 , 38/* "//" */,-23 , 7/* "RETURN" */,-23 , 2/* "IF" */,-23 , 4/* "WHILE" */,-23 , 5/* "DO" */,-23 , 6/* "ECHO" */,-23 , 39/* "Variable" */,-23 , 13/* "{" */,-23 , 9/* "ClassToken" */,-23 , 40/* "FunctionName" */,-23 , 8/* "NewToken" */,-23 , 34/* "(" */,-23 , 45/* "Identifier" */,-23 , 31/* "-" */,-23 , 21/* "!" */,-23 , 41/* "String" */,-23 , 42/* "Integer" */,-23 , 43/* "Boolean" */,-23 , 44/* "Float" */,-23 , 14/* "}" */,-23 , 3/* "ELSE" */,-23 ),
    /* State 96 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 97 */ new Array( 47/* "ScriptEnd" */,-25 , 48/* "InternalNonScript" */,-25 , 38/* "//" */,-25 , 7/* "RETURN" */,-25 , 2/* "IF" */,-25 , 4/* "WHILE" */,-25 , 5/* "DO" */,-25 , 6/* "ECHO" */,-25 , 39/* "Variable" */,-25 , 13/* "{" */,-25 , 9/* "ClassToken" */,-25 , 40/* "FunctionName" */,-25 , 8/* "NewToken" */,-25 , 34/* "(" */,-25 , 45/* "Identifier" */,-25 , 31/* "-" */,-25 , 21/* "!" */,-25 , 41/* "String" */,-25 , 42/* "Integer" */,-25 , 43/* "Boolean" */,-25 , 44/* "Float" */,-25 , 14/* "}" */,-25 , 3/* "ELSE" */,-25 ),
    /* State 98 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 99 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 100 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,-35 , 36/* "->" */,-35 , 7/* "RETURN" */,-35 , 2/* "IF" */,-35 , 4/* "WHILE" */,-35 , 5/* "DO" */,-35 , 6/* "ECHO" */,-35 , 39/* "Variable" */,-35 , 13/* "{" */,-35 , 8/* "NewToken" */,-35 , 45/* "Identifier" */,-35 , 31/* "-" */,-35 , 21/* "!" */,-35 , 41/* "String" */,-35 , 42/* "Integer" */,-35 , 43/* "Boolean" */,-35 , 44/* "Float" */,-35 , 35/* ")" */,-35 , 18/* "," */,-35 , 30/* "+" */,-35 , 33/* "*" */,-35 , 32/* "/" */,-35 , 16/* "]" */,-35 , 20/* "=" */,-35 ),
    /* State 101 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 16/* "]" */,126 , 36/* "->" */,-45 ),
    /* State 102 */ new Array( 47/* "ScriptEnd" */,-28 , 48/* "InternalNonScript" */,-28 , 38/* "//" */,-28 , 7/* "RETURN" */,-28 , 2/* "IF" */,-28 , 4/* "WHILE" */,-28 , 5/* "DO" */,-28 , 6/* "ECHO" */,-28 , 39/* "Variable" */,-28 , 13/* "{" */,-28 , 9/* "ClassToken" */,-28 , 40/* "FunctionName" */,-28 , 8/* "NewToken" */,-28 , 34/* "(" */,-28 , 45/* "Identifier" */,-28 , 31/* "-" */,-28 , 21/* "!" */,-28 , 41/* "String" */,-28 , 42/* "Integer" */,-28 , 43/* "Boolean" */,-28 , 44/* "Float" */,-28 , 14/* "}" */,-28 , 3/* "ELSE" */,-28 ),
    /* State 103 */ new Array( 14/* "}" */,-7 , 10/* "PublicToken" */,-7 , 12/* "ProtectedToken" */,-7 , 11/* "PrivateToken" */,-7 , 40/* "FunctionName" */,-7 ),
    /* State 104 */ new Array( 18/* "," */,128 , 35/* ")" */,129 ),
    /* State 105 */ new Array( 35/* ")" */,-41 , 18/* "," */,-41 ),
    /* State 106 */ new Array( 20/* "=" */,130 , 17/* ";" */,-57 , 34/* "(" */,-57 , 36/* "->" */,-57 , 22/* "==" */,-57 , 29/* "<" */,-57 , 28/* ">" */,-57 , 26/* "<=" */,-57 , 27/* ">=" */,-57 , 23/* "!=" */,-57 , 19/* "." */,-57 , 7/* "RETURN" */,-57 , 2/* "IF" */,-57 , 4/* "WHILE" */,-57 , 5/* "DO" */,-57 , 6/* "ECHO" */,-57 , 39/* "Variable" */,-57 , 13/* "{" */,-57 , 8/* "NewToken" */,-57 , 45/* "Identifier" */,-57 , 31/* "-" */,-57 , 21/* "!" */,-57 , 41/* "String" */,-57 , 42/* "Integer" */,-57 , 43/* "Boolean" */,-57 , 44/* "Float" */,-57 , 35/* ")" */,-57 , 18/* "," */,-57 , 30/* "+" */,-57 , 33/* "*" */,-57 , 32/* "/" */,-57 , 16/* "]" */,-57 ),
    /* State 107 */ new Array( 17/* ";" */,-49 , 34/* "(" */,-49 , 36/* "->" */,-49 , 22/* "==" */,-49 , 29/* "<" */,-49 , 28/* ">" */,-49 , 26/* "<=" */,-49 , 27/* ">=" */,-49 , 23/* "!=" */,-49 , 19/* "." */,-49 , 7/* "RETURN" */,-49 , 2/* "IF" */,-49 , 4/* "WHILE" */,-49 , 5/* "DO" */,-49 , 6/* "ECHO" */,-49 , 39/* "Variable" */,-49 , 13/* "{" */,-49 , 8/* "NewToken" */,-49 , 45/* "Identifier" */,-49 , 31/* "-" */,-49 , 21/* "!" */,-49 , 41/* "String" */,-49 , 42/* "Integer" */,-49 , 43/* "Boolean" */,-49 , 44/* "Float" */,-49 , 35/* ")" */,-49 , 18/* "," */,-49 , 30/* "+" */,-49 , 33/* "*" */,-49 , 32/* "/" */,-49 , 16/* "]" */,-49 , 20/* "=" */,-49 ),
    /* State 108 */ new Array( 17/* ";" */,-56 , 34/* "(" */,-53 , 36/* "->" */,-53 , 22/* "==" */,-53 , 29/* "<" */,-53 , 28/* ">" */,-53 , 26/* "<=" */,-53 , 27/* ">=" */,-53 , 23/* "!=" */,-53 , 19/* "." */,-53 , 7/* "RETURN" */,-56 , 2/* "IF" */,-56 , 4/* "WHILE" */,-56 , 5/* "DO" */,-56 , 6/* "ECHO" */,-56 , 39/* "Variable" */,-56 , 13/* "{" */,-56 , 8/* "NewToken" */,-56 , 45/* "Identifier" */,-56 , 31/* "-" */,-56 , 21/* "!" */,-56 , 41/* "String" */,-56 , 42/* "Integer" */,-56 , 43/* "Boolean" */,-56 , 44/* "Float" */,-56 , 35/* ")" */,-56 , 18/* "," */,-56 , 30/* "+" */,-56 , 33/* "*" */,-56 , 32/* "/" */,-56 , 16/* "]" */,-56 , 20/* "=" */,-56 ),
    /* State 109 */ new Array( 34/* "(" */,76 , 20/* "=" */,-58 , 17/* ";" */,-58 , 36/* "->" */,-58 , 22/* "==" */,-58 , 29/* "<" */,-58 , 28/* ">" */,-58 , 26/* "<=" */,-58 , 27/* ">=" */,-58 , 23/* "!=" */,-58 , 19/* "." */,-58 , 7/* "RETURN" */,-58 , 2/* "IF" */,-58 , 4/* "WHILE" */,-58 , 5/* "DO" */,-58 , 6/* "ECHO" */,-58 , 39/* "Variable" */,-58 , 13/* "{" */,-58 , 8/* "NewToken" */,-58 , 45/* "Identifier" */,-58 , 31/* "-" */,-58 , 21/* "!" */,-58 , 41/* "String" */,-58 , 42/* "Integer" */,-58 , 43/* "Boolean" */,-58 , 44/* "Float" */,-58 , 35/* ")" */,-58 , 18/* "," */,-58 , 30/* "+" */,-58 , 33/* "*" */,-58 , 32/* "/" */,-58 , 16/* "]" */,-58 ),
    /* State 110 */ new Array( 20/* "=" */,-59 , 17/* ";" */,-59 , 34/* "(" */,-52 , 36/* "->" */,-52 , 22/* "==" */,-52 , 29/* "<" */,-52 , 28/* ">" */,-52 , 26/* "<=" */,-52 , 27/* ">=" */,-52 , 23/* "!=" */,-52 , 19/* "." */,-52 , 7/* "RETURN" */,-59 , 2/* "IF" */,-59 , 4/* "WHILE" */,-59 , 5/* "DO" */,-59 , 6/* "ECHO" */,-59 , 39/* "Variable" */,-59 , 13/* "{" */,-59 , 8/* "NewToken" */,-59 , 45/* "Identifier" */,-59 , 31/* "-" */,-59 , 21/* "!" */,-59 , 41/* "String" */,-59 , 42/* "Integer" */,-59 , 43/* "Boolean" */,-59 , 44/* "Float" */,-59 , 35/* ")" */,-59 , 18/* "," */,-59 , 30/* "+" */,-59 , 33/* "*" */,-59 , 32/* "/" */,-59 , 16/* "]" */,-59 ),
    /* State 111 */ new Array( 18/* "," */,113 , 35/* ")" */,131 ),
    /* State 112 */ new Array( 17/* ";" */,-51 , 34/* "(" */,-51 , 36/* "->" */,-51 , 22/* "==" */,-51 , 29/* "<" */,-51 , 28/* ">" */,-51 , 26/* "<=" */,-51 , 27/* ">=" */,-51 , 23/* "!=" */,-51 , 19/* "." */,-51 , 7/* "RETURN" */,-51 , 2/* "IF" */,-51 , 4/* "WHILE" */,-51 , 5/* "DO" */,-51 , 6/* "ECHO" */,-51 , 39/* "Variable" */,-51 , 13/* "{" */,-51 , 8/* "NewToken" */,-51 , 45/* "Identifier" */,-51 , 31/* "-" */,-51 , 21/* "!" */,-51 , 41/* "String" */,-51 , 42/* "Integer" */,-51 , 43/* "Boolean" */,-51 , 44/* "Float" */,-51 , 35/* ")" */,-51 , 18/* "," */,-51 , 30/* "+" */,-51 , 33/* "*" */,-51 , 32/* "/" */,-51 , 16/* "]" */,-51 , 20/* "=" */,-51 ),
    /* State 113 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 114 */ new Array( 17/* ";" */,-60 , 34/* "(" */,-60 , 36/* "->" */,-60 , 22/* "==" */,-60 , 29/* "<" */,-60 , 28/* ">" */,-60 , 26/* "<=" */,-60 , 27/* ">=" */,-60 , 23/* "!=" */,-60 , 19/* "." */,-60 , 7/* "RETURN" */,-60 , 2/* "IF" */,-60 , 4/* "WHILE" */,-60 , 5/* "DO" */,-60 , 6/* "ECHO" */,-60 , 39/* "Variable" */,-60 , 13/* "{" */,-60 , 8/* "NewToken" */,-60 , 45/* "Identifier" */,-60 , 31/* "-" */,-60 , 21/* "!" */,-60 , 41/* "String" */,-60 , 42/* "Integer" */,-60 , 43/* "Boolean" */,-60 , 44/* "Float" */,-60 , 35/* ")" */,-60 , 18/* "," */,-60 , 30/* "+" */,-60 , 33/* "*" */,-60 , 32/* "/" */,-60 , 16/* "]" */,-60 , 20/* "=" */,-60 ),
    /* State 115 */ new Array( 32/* "/" */,77 , 33/* "*" */,78 , 17/* ";" */,-76 , 31/* "-" */,-76 , 30/* "+" */,-76 , 34/* "(" */,-76 , 36/* "->" */,-76 , 22/* "==" */,-76 , 29/* "<" */,-76 , 28/* ">" */,-76 , 26/* "<=" */,-76 , 27/* ">=" */,-76 , 23/* "!=" */,-76 , 19/* "." */,-76 , 7/* "RETURN" */,-76 , 2/* "IF" */,-76 , 4/* "WHILE" */,-76 , 5/* "DO" */,-76 , 6/* "ECHO" */,-76 , 39/* "Variable" */,-76 , 13/* "{" */,-76 , 8/* "NewToken" */,-76 , 45/* "Identifier" */,-76 , 21/* "!" */,-76 , 41/* "String" */,-76 , 42/* "Integer" */,-76 , 43/* "Boolean" */,-76 , 44/* "Float" */,-76 , 35/* ")" */,-76 , 18/* "," */,-76 , 16/* "]" */,-76 , 20/* "=" */,-76 ),
    /* State 116 */ new Array( 32/* "/" */,77 , 33/* "*" */,78 , 17/* ";" */,-75 , 31/* "-" */,-75 , 30/* "+" */,-75 , 34/* "(" */,-75 , 36/* "->" */,-75 , 22/* "==" */,-75 , 29/* "<" */,-75 , 28/* ">" */,-75 , 26/* "<=" */,-75 , 27/* ">=" */,-75 , 23/* "!=" */,-75 , 19/* "." */,-75 , 7/* "RETURN" */,-75 , 2/* "IF" */,-75 , 4/* "WHILE" */,-75 , 5/* "DO" */,-75 , 6/* "ECHO" */,-75 , 39/* "Variable" */,-75 , 13/* "{" */,-75 , 8/* "NewToken" */,-75 , 45/* "Identifier" */,-75 , 21/* "!" */,-75 , 41/* "String" */,-75 , 42/* "Integer" */,-75 , 43/* "Boolean" */,-75 , 44/* "Float" */,-75 , 35/* ")" */,-75 , 18/* "," */,-75 , 16/* "]" */,-75 , 20/* "=" */,-75 ),
    /* State 117 */ new Array( 17/* ";" */,-79 , 31/* "-" */,-79 , 30/* "+" */,-79 , 33/* "*" */,-79 , 32/* "/" */,-79 , 34/* "(" */,-79 , 36/* "->" */,-79 , 22/* "==" */,-79 , 29/* "<" */,-79 , 28/* ">" */,-79 , 26/* "<=" */,-79 , 27/* ">=" */,-79 , 23/* "!=" */,-79 , 19/* "." */,-79 , 7/* "RETURN" */,-79 , 2/* "IF" */,-79 , 4/* "WHILE" */,-79 , 5/* "DO" */,-79 , 6/* "ECHO" */,-79 , 39/* "Variable" */,-79 , 13/* "{" */,-79 , 8/* "NewToken" */,-79 , 45/* "Identifier" */,-79 , 21/* "!" */,-79 , 41/* "String" */,-79 , 42/* "Integer" */,-79 , 43/* "Boolean" */,-79 , 44/* "Float" */,-79 , 35/* ")" */,-79 , 18/* "," */,-79 , 16/* "]" */,-79 , 20/* "=" */,-79 ),
    /* State 118 */ new Array( 17/* ";" */,-78 , 31/* "-" */,-78 , 30/* "+" */,-78 , 33/* "*" */,-78 , 32/* "/" */,-78 , 34/* "(" */,-78 , 36/* "->" */,-78 , 22/* "==" */,-78 , 29/* "<" */,-78 , 28/* ">" */,-78 , 26/* "<=" */,-78 , 27/* ">=" */,-78 , 23/* "!=" */,-78 , 19/* "." */,-78 , 7/* "RETURN" */,-78 , 2/* "IF" */,-78 , 4/* "WHILE" */,-78 , 5/* "DO" */,-78 , 6/* "ECHO" */,-78 , 39/* "Variable" */,-78 , 13/* "{" */,-78 , 8/* "NewToken" */,-78 , 45/* "Identifier" */,-78 , 21/* "!" */,-78 , 41/* "String" */,-78 , 42/* "Integer" */,-78 , 43/* "Boolean" */,-78 , 44/* "Float" */,-78 , 35/* ")" */,-78 , 18/* "," */,-78 , 16/* "]" */,-78 , 20/* "=" */,-78 ),
    /* State 119 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 35/* ")" */,133 , 36/* "->" */,-45 ),
    /* State 120 */ new Array( 17/* ";" */,-61 , 34/* "(" */,-61 , 36/* "->" */,-61 , 22/* "==" */,-61 , 29/* "<" */,-61 , 28/* ">" */,-61 , 26/* "<=" */,-61 , 27/* ">=" */,-61 , 23/* "!=" */,-61 , 19/* "." */,-61 , 18/* "," */,-61 , 39/* "Variable" */,-61 , 8/* "NewToken" */,-61 , 45/* "Identifier" */,-61 , 31/* "-" */,-61 , 21/* "!" */,-61 , 41/* "String" */,-61 , 42/* "Integer" */,-61 , 43/* "Boolean" */,-61 , 44/* "Float" */,-61 , 35/* ")" */,-61 , 7/* "RETURN" */,-61 , 2/* "IF" */,-61 , 4/* "WHILE" */,-61 , 5/* "DO" */,-61 , 6/* "ECHO" */,-61 , 13/* "{" */,-61 , 30/* "+" */,-61 , 33/* "*" */,-61 , 32/* "/" */,-61 , 16/* "]" */,-61 , 20/* "=" */,-61 ),
    /* State 121 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 35/* ")" */,112 , 18/* "," */,-63 , 36/* "->" */,-45 ),
    /* State 122 */ new Array( 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 123 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,135 , 36/* "->" */,-45 ),
    /* State 124 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 16/* "]" */,136 , 36/* "->" */,-45 ),
    /* State 125 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,137 , 36/* "->" */,-45 ),
    /* State 126 */ new Array( 20/* "=" */,-66 , 17/* ";" */,-66 , 34/* "(" */,-66 , 36/* "->" */,-66 , 22/* "==" */,-66 , 29/* "<" */,-66 , 28/* ">" */,-66 , 26/* "<=" */,-66 , 27/* ">=" */,-66 , 23/* "!=" */,-66 , 19/* "." */,-66 , 15/* "[" */,-66 , 7/* "RETURN" */,-66 , 2/* "IF" */,-66 , 4/* "WHILE" */,-66 , 5/* "DO" */,-66 , 6/* "ECHO" */,-66 , 39/* "Variable" */,-66 , 13/* "{" */,-66 , 8/* "NewToken" */,-66 , 45/* "Identifier" */,-66 , 31/* "-" */,-66 , 21/* "!" */,-66 , 41/* "String" */,-66 , 42/* "Integer" */,-66 , 43/* "Boolean" */,-66 , 44/* "Float" */,-66 , 35/* ")" */,-66 , 18/* "," */,-66 , 30/* "+" */,-66 , 33/* "*" */,-66 , 32/* "/" */,-66 , 16/* "]" */,-66 ),
    /* State 127 */ new Array( 14/* "}" */,140 , 10/* "PublicToken" */,143 , 12/* "ProtectedToken" */,144 , 11/* "PrivateToken" */,145 , 40/* "FunctionName" */,-12 ),
    /* State 128 */ new Array( 39/* "Variable" */,146 ),
    /* State 129 */ new Array( 13/* "{" */,147 ),
    /* State 130 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 131 */ new Array( 17/* ";" */,-48 , 34/* "(" */,-48 , 36/* "->" */,-48 , 22/* "==" */,-48 , 29/* "<" */,-48 , 28/* ">" */,-48 , 26/* "<=" */,-48 , 27/* ">=" */,-48 , 23/* "!=" */,-48 , 19/* "." */,-48 , 7/* "RETURN" */,-48 , 2/* "IF" */,-48 , 4/* "WHILE" */,-48 , 5/* "DO" */,-48 , 6/* "ECHO" */,-48 , 39/* "Variable" */,-48 , 13/* "{" */,-48 , 8/* "NewToken" */,-48 , 45/* "Identifier" */,-48 , 31/* "-" */,-48 , 21/* "!" */,-48 , 41/* "String" */,-48 , 42/* "Integer" */,-48 , 43/* "Boolean" */,-48 , 44/* "Float" */,-48 , 35/* ")" */,-48 , 18/* "," */,-48 , 30/* "+" */,-48 , 33/* "*" */,-48 , 32/* "/" */,-48 , 16/* "]" */,-48 , 20/* "=" */,-48 ),
    /* State 132 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 35/* ")" */,-62 , 18/* "," */,-62 , 36/* "->" */,-45 ),
    /* State 133 */ new Array( 17/* ";" */,-89 , 31/* "-" */,-89 , 30/* "+" */,-89 , 33/* "*" */,-89 , 32/* "/" */,-89 , 34/* "(" */,-89 , 36/* "->" */,-89 , 22/* "==" */,-89 , 29/* "<" */,-89 , 28/* ">" */,-89 , 26/* "<=" */,-89 , 27/* ">=" */,-89 , 23/* "!=" */,-89 , 19/* "." */,-89 , 7/* "RETURN" */,-89 , 2/* "IF" */,-89 , 4/* "WHILE" */,-89 , 5/* "DO" */,-89 , 6/* "ECHO" */,-89 , 39/* "Variable" */,-89 , 13/* "{" */,-89 , 8/* "NewToken" */,-89 , 45/* "Identifier" */,-89 , 21/* "!" */,-89 , 41/* "String" */,-89 , 42/* "Integer" */,-89 , 43/* "Boolean" */,-89 , 44/* "Float" */,-89 , 35/* ")" */,-89 , 18/* "," */,-89 , 16/* "]" */,-89 , 20/* "=" */,-89 ),
    /* State 134 */ new Array( 47/* "ScriptEnd" */,-22 , 48/* "InternalNonScript" */,-22 , 38/* "//" */,-22 , 7/* "RETURN" */,-22 , 2/* "IF" */,-22 , 4/* "WHILE" */,-22 , 5/* "DO" */,-22 , 6/* "ECHO" */,-22 , 39/* "Variable" */,-22 , 13/* "{" */,-22 , 9/* "ClassToken" */,-22 , 40/* "FunctionName" */,-22 , 8/* "NewToken" */,-22 , 34/* "(" */,-22 , 45/* "Identifier" */,-22 , 31/* "-" */,-22 , 21/* "!" */,-22 , 41/* "String" */,-22 , 42/* "Integer" */,-22 , 43/* "Boolean" */,-22 , 44/* "Float" */,-22 , 14/* "}" */,-22 , 3/* "ELSE" */,-22 ),
    /* State 135 */ new Array( 47/* "ScriptEnd" */,-24 , 48/* "InternalNonScript" */,-24 , 38/* "//" */,-24 , 7/* "RETURN" */,-24 , 2/* "IF" */,-24 , 4/* "WHILE" */,-24 , 5/* "DO" */,-24 , 6/* "ECHO" */,-24 , 39/* "Variable" */,-24 , 13/* "{" */,-24 , 9/* "ClassToken" */,-24 , 40/* "FunctionName" */,-24 , 8/* "NewToken" */,-24 , 34/* "(" */,-24 , 45/* "Identifier" */,-24 , 31/* "-" */,-24 , 21/* "!" */,-24 , 41/* "String" */,-24 , 42/* "Integer" */,-24 , 43/* "Boolean" */,-24 , 44/* "Float" */,-24 , 14/* "}" */,-24 , 3/* "ELSE" */,-24 ),
    /* State 136 */ new Array( 20/* "=" */,-65 , 17/* ";" */,-65 , 34/* "(" */,-65 , 36/* "->" */,-65 , 22/* "==" */,-65 , 29/* "<" */,-65 , 28/* ">" */,-65 , 26/* "<=" */,-65 , 27/* ">=" */,-65 , 23/* "!=" */,-65 , 19/* "." */,-65 , 15/* "[" */,-65 , 7/* "RETURN" */,-65 , 2/* "IF" */,-65 , 4/* "WHILE" */,-65 , 5/* "DO" */,-65 , 6/* "ECHO" */,-65 , 39/* "Variable" */,-65 , 13/* "{" */,-65 , 8/* "NewToken" */,-65 , 45/* "Identifier" */,-65 , 31/* "-" */,-65 , 21/* "!" */,-65 , 41/* "String" */,-65 , 42/* "Integer" */,-65 , 43/* "Boolean" */,-65 , 44/* "Float" */,-65 , 35/* ")" */,-65 , 18/* "," */,-65 , 30/* "+" */,-65 , 33/* "*" */,-65 , 32/* "/" */,-65 , 16/* "]" */,-65 ),
    /* State 137 */ new Array( 47/* "ScriptEnd" */,-27 , 48/* "InternalNonScript" */,-27 , 38/* "//" */,-27 , 7/* "RETURN" */,-27 , 2/* "IF" */,-27 , 4/* "WHILE" */,-27 , 5/* "DO" */,-27 , 6/* "ECHO" */,-27 , 39/* "Variable" */,-27 , 13/* "{" */,-27 , 9/* "ClassToken" */,-27 , 40/* "FunctionName" */,-27 , 8/* "NewToken" */,-27 , 34/* "(" */,-27 , 45/* "Identifier" */,-27 , 31/* "-" */,-27 , 21/* "!" */,-27 , 41/* "String" */,-27 , 42/* "Integer" */,-27 , 43/* "Boolean" */,-27 , 44/* "Float" */,-27 , 14/* "}" */,-27 , 3/* "ELSE" */,-27 ),
    /* State 138 */ new Array( 14/* "}" */,-6 , 10/* "PublicToken" */,-6 , 12/* "ProtectedToken" */,-6 , 11/* "PrivateToken" */,-6 , 40/* "FunctionName" */,-6 ),
    /* State 139 */ new Array( 14/* "}" */,-5 , 10/* "PublicToken" */,-5 , 12/* "ProtectedToken" */,-5 , 11/* "PrivateToken" */,-5 , 40/* "FunctionName" */,-5 ),
    /* State 140 */ new Array( 47/* "ScriptEnd" */,-4 , 48/* "InternalNonScript" */,-4 , 38/* "//" */,-4 , 7/* "RETURN" */,-4 , 2/* "IF" */,-4 , 4/* "WHILE" */,-4 , 5/* "DO" */,-4 , 6/* "ECHO" */,-4 , 39/* "Variable" */,-4 , 13/* "{" */,-4 , 9/* "ClassToken" */,-4 , 40/* "FunctionName" */,-4 , 8/* "NewToken" */,-4 , 34/* "(" */,-4 , 45/* "Identifier" */,-4 , 31/* "-" */,-4 , 21/* "!" */,-4 , 41/* "String" */,-4 , 42/* "Integer" */,-4 , 43/* "Boolean" */,-4 , 44/* "Float" */,-4 , 14/* "}" */,-4 ),
    /* State 141 */ new Array( 39/* "Variable" */,149 ),
    /* State 142 */ new Array( 40/* "FunctionName" */,150 ),
    /* State 143 */ new Array( 39/* "Variable" */,-8 , 40/* "FunctionName" */,-11 ),
    /* State 144 */ new Array( 39/* "Variable" */,-9 , 40/* "FunctionName" */,-13 ),
    /* State 145 */ new Array( 39/* "Variable" */,-10 , 40/* "FunctionName" */,-14 ),
    /* State 146 */ new Array( 35/* ")" */,-40 , 18/* "," */,-40 ),
    /* State 147 */ new Array( 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 148 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,-36 , 36/* "->" */,-36 , 7/* "RETURN" */,-36 , 2/* "IF" */,-36 , 4/* "WHILE" */,-36 , 5/* "DO" */,-36 , 6/* "ECHO" */,-36 , 39/* "Variable" */,-36 , 13/* "{" */,-36 , 8/* "NewToken" */,-36 , 45/* "Identifier" */,-36 , 31/* "-" */,-36 , 21/* "!" */,-36 , 41/* "String" */,-36 , 42/* "Integer" */,-36 , 43/* "Boolean" */,-36 , 44/* "Float" */,-36 , 35/* ")" */,-36 , 18/* "," */,-36 , 30/* "+" */,-36 , 33/* "*" */,-36 , 32/* "/" */,-36 , 16/* "]" */,-36 , 20/* "=" */,-36 ),
    /* State 149 */ new Array( 17/* ";" */,152 , 20/* "=" */,153 ),
    /* State 150 */ new Array( 34/* "(" */,154 ),
    /* State 151 */ new Array( 14/* "}" */,155 , 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 152 */ new Array( 14/* "}" */,-17 , 10/* "PublicToken" */,-17 , 12/* "ProtectedToken" */,-17 , 11/* "PrivateToken" */,-17 , 40/* "FunctionName" */,-17 ),
    /* State 153 */ new Array( 8/* "NewToken" */,26 , 39/* "Variable" */,56 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 154 */ new Array( 39/* "Variable" */,105 , 35/* ")" */,-42 , 18/* "," */,-42 ),
    /* State 155 */ new Array( 47/* "ScriptEnd" */,-15 , 48/* "InternalNonScript" */,-15 , 38/* "//" */,-15 , 7/* "RETURN" */,-15 , 2/* "IF" */,-15 , 4/* "WHILE" */,-15 , 5/* "DO" */,-15 , 6/* "ECHO" */,-15 , 39/* "Variable" */,-15 , 13/* "{" */,-15 , 9/* "ClassToken" */,-15 , 40/* "FunctionName" */,-15 , 8/* "NewToken" */,-15 , 34/* "(" */,-15 , 45/* "Identifier" */,-15 , 31/* "-" */,-15 , 21/* "!" */,-15 , 41/* "String" */,-15 , 42/* "Integer" */,-15 , 43/* "Boolean" */,-15 , 44/* "Float" */,-15 , 14/* "}" */,-15 ),
    /* State 156 */ new Array( 34/* "(" */,45 , 19/* "." */,46 , 23/* "!=" */,47 , 27/* ">=" */,48 , 26/* "<=" */,49 , 28/* ">" */,50 , 29/* "<" */,51 , 22/* "==" */,52 , 17/* ";" */,158 , 36/* "->" */,-45 ),
    /* State 157 */ new Array( 18/* "," */,128 , 35/* ")" */,159 ),
    /* State 158 */ new Array( 14/* "}" */,-18 , 10/* "PublicToken" */,-18 , 12/* "ProtectedToken" */,-18 , 11/* "PrivateToken" */,-18 , 40/* "FunctionName" */,-18 ),
    /* State 159 */ new Array( 13/* "{" */,160 ),
    /* State 160 */ new Array( 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 161 */ new Array( 14/* "}" */,162 , 48/* "InternalNonScript" */,8 , 38/* "//" */,9 , 2/* "IF" */,12 , 4/* "WHILE" */,13 , 5/* "DO" */,14 , 6/* "ECHO" */,15 , 39/* "Variable" */,17 , 13/* "{" */,18 , 9/* "ClassToken" */,19 , 40/* "FunctionName" */,20 , 7/* "RETURN" */,21 , 8/* "NewToken" */,26 , 34/* "(" */,27 , 45/* "Identifier" */,30 , 31/* "-" */,33 , 21/* "!" */,34 , 41/* "String" */,36 , 42/* "Integer" */,37 , 43/* "Boolean" */,38 , 44/* "Float" */,39 ),
    /* State 162 */ new Array( 14/* "}" */,-16 , 10/* "PublicToken" */,-16 , 12/* "ProtectedToken" */,-16 , 11/* "PrivateToken" */,-16 , 40/* "FunctionName" */,-16 )
);

/* Goto-Table */
var goto_tab = new Array(
    /* State 0 */ new Array( 49/* PHPScript */,1 ),
    /* State 1 */ new Array( 50/* Script */,2 ),
    /* State 2 */ new Array( ),
    /* State 3 */ new Array( 51/* Stmt */,4 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 4 */ new Array( 51/* Stmt */,40 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 5 */ new Array( ),
    /* State 6 */ new Array( ),
    /* State 7 */ new Array( ),
    /* State 8 */ new Array( ),
    /* State 9 */ new Array( 65/* AssertStmt */,42 ),
    /* State 10 */ new Array( ),
    /* State 11 */ new Array( ),
    /* State 12 */ new Array( 60/* Expression */,54 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 13 */ new Array( 60/* Expression */,57 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 14 */ new Array( 62/* SingleStmt */,58 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 15 */ new Array( 60/* Expression */,59 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 16 */ new Array( ),
    /* State 17 */ new Array( 64/* ArrayIndices */,61 ),
    /* State 18 */ new Array( 51/* Stmt */,64 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 19 */ new Array( ),
    /* State 20 */ new Array( ),
    /* State 21 */ new Array( 60/* Expression */,67 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 22 */ new Array( ),
    /* State 23 */ new Array( ),
    /* State 24 */ new Array( ),
    /* State 25 */ new Array( ),
    /* State 26 */ new Array( 69/* FunctionInvoke */,69 , 60/* Expression */,70 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 27 */ new Array( 60/* Expression */,71 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 28 */ new Array( 70/* ActualParameterList */,72 , 60/* Expression */,73 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 29 */ new Array( ),
    /* State 30 */ new Array( ),
    /* State 31 */ new Array( ),
    /* State 32 */ new Array( ),
    /* State 33 */ new Array( 77/* Value */,79 ),
    /* State 34 */ new Array( 60/* Expression */,82 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 35 */ new Array( ),
    /* State 36 */ new Array( ),
    /* State 37 */ new Array( ),
    /* State 38 */ new Array( ),
    /* State 39 */ new Array( ),
    /* State 40 */ new Array( 51/* Stmt */,40 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 41 */ new Array( ),
    /* State 42 */ new Array( ),
    /* State 43 */ new Array( ),
    /* State 44 */ new Array( ),
    /* State 45 */ new Array( 70/* ActualParameterList */,84 , 60/* Expression */,73 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 46 */ new Array( 60/* Expression */,85 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 47 */ new Array( 74/* AddSubExp */,86 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 48 */ new Array( 74/* AddSubExp */,87 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 49 */ new Array( 74/* AddSubExp */,88 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 50 */ new Array( 74/* AddSubExp */,89 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 51 */ new Array( 74/* AddSubExp */,90 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 52 */ new Array( 74/* AddSubExp */,91 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 53 */ new Array( ),
    /* State 54 */ new Array( 62/* SingleStmt */,93 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 55 */ new Array( ),
    /* State 56 */ new Array( 64/* ArrayIndices */,94 ),
    /* State 57 */ new Array( 62/* SingleStmt */,95 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 58 */ new Array( ),
    /* State 59 */ new Array( ),
    /* State 60 */ new Array( ),
    /* State 61 */ new Array( ),
    /* State 62 */ new Array( 60/* Expression */,100 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 63 */ new Array( 60/* Expression */,101 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 64 */ new Array( 51/* Stmt */,40 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 65 */ new Array( ),
    /* State 66 */ new Array( 58/* FormalParameterList */,104 ),
    /* State 67 */ new Array( ),
    /* State 68 */ new Array( 67/* AttributeAccess */,106 , 71/* MemberAccess */,107 , 73/* FunctionAccess */,108 , 72/* ExpressionNotFunAccess */,110 , 69/* FunctionInvoke */,28 , 60/* Expression */,70 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 69 */ new Array( 70/* ActualParameterList */,111 , 60/* Expression */,73 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 70 */ new Array( ),
    /* State 71 */ new Array( ),
    /* State 72 */ new Array( ),
    /* State 73 */ new Array( ),
    /* State 74 */ new Array( 75/* MulDivExp */,115 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 75 */ new Array( 75/* MulDivExp */,116 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 76 */ new Array( ),
    /* State 77 */ new Array( 76/* UnaryOp */,117 , 77/* Value */,35 ),
    /* State 78 */ new Array( 76/* UnaryOp */,118 , 77/* Value */,35 ),
    /* State 79 */ new Array( ),
    /* State 80 */ new Array( ),
    /* State 81 */ new Array( 60/* Expression */,119 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 82 */ new Array( ),
    /* State 83 */ new Array( ),
    /* State 84 */ new Array( ),
    /* State 85 */ new Array( ),
    /* State 86 */ new Array( ),
    /* State 87 */ new Array( ),
    /* State 88 */ new Array( ),
    /* State 89 */ new Array( ),
    /* State 90 */ new Array( ),
    /* State 91 */ new Array( ),
    /* State 92 */ new Array( 60/* Expression */,121 , 70/* ActualParameterList */,84 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 93 */ new Array( ),
    /* State 94 */ new Array( ),
    /* State 95 */ new Array( ),
    /* State 96 */ new Array( 60/* Expression */,123 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 97 */ new Array( ),
    /* State 98 */ new Array( 60/* Expression */,124 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 99 */ new Array( 60/* Expression */,125 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 100 */ new Array( ),
    /* State 101 */ new Array( ),
    /* State 102 */ new Array( ),
    /* State 103 */ new Array( 52/* Member */,127 ),
    /* State 104 */ new Array( ),
    /* State 105 */ new Array( ),
    /* State 106 */ new Array( ),
    /* State 107 */ new Array( ),
    /* State 108 */ new Array( ),
    /* State 109 */ new Array( ),
    /* State 110 */ new Array( ),
    /* State 111 */ new Array( ),
    /* State 112 */ new Array( ),
    /* State 113 */ new Array( 60/* Expression */,132 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 114 */ new Array( ),
    /* State 115 */ new Array( ),
    /* State 116 */ new Array( ),
    /* State 117 */ new Array( ),
    /* State 118 */ new Array( ),
    /* State 119 */ new Array( ),
    /* State 120 */ new Array( ),
    /* State 121 */ new Array( ),
    /* State 122 */ new Array( 62/* SingleStmt */,134 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 123 */ new Array( ),
    /* State 124 */ new Array( ),
    /* State 125 */ new Array( ),
    /* State 126 */ new Array( ),
    /* State 127 */ new Array( 55/* ClassFunctionDefinition */,138 , 54/* AttributeDefinition */,139 , 56/* AttributeMod */,141 , 57/* FunctionMod */,142 ),
    /* State 128 */ new Array( ),
    /* State 129 */ new Array( ),
    /* State 130 */ new Array( 60/* Expression */,148 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 131 */ new Array( ),
    /* State 132 */ new Array( ),
    /* State 133 */ new Array( ),
    /* State 134 */ new Array( ),
    /* State 135 */ new Array( ),
    /* State 136 */ new Array( ),
    /* State 137 */ new Array( ),
    /* State 138 */ new Array( ),
    /* State 139 */ new Array( ),
    /* State 140 */ new Array( ),
    /* State 141 */ new Array( ),
    /* State 142 */ new Array( ),
    /* State 143 */ new Array( ),
    /* State 144 */ new Array( ),
    /* State 145 */ new Array( ),
    /* State 146 */ new Array( ),
    /* State 147 */ new Array( 51/* Stmt */,151 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 148 */ new Array( ),
    /* State 149 */ new Array( ),
    /* State 150 */ new Array( ),
    /* State 151 */ new Array( 51/* Stmt */,40 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 152 */ new Array( ),
    /* State 153 */ new Array( 60/* Expression */,156 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 63/* AssignmentStmt */,55 , 68/* BinaryOp */,25 , 66/* Target */,24 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 154 */ new Array( 58/* FormalParameterList */,157 ),
    /* State 155 */ new Array( ),
    /* State 156 */ new Array( ),
    /* State 157 */ new Array( ),
    /* State 158 */ new Array( ),
    /* State 159 */ new Array( ),
    /* State 160 */ new Array( 51/* Stmt */,161 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 161 */ new Array( 51/* Stmt */,40 , 62/* SingleStmt */,5 , 53/* ClassDefinition */,6 , 59/* FunctionDefinition */,7 , 61/* Return */,10 , 60/* Expression */,11 , 63/* AssignmentStmt */,16 , 72/* ExpressionNotFunAccess */,22 , 73/* FunctionAccess */,23 , 66/* Target */,24 , 68/* BinaryOp */,25 , 69/* FunctionInvoke */,28 , 74/* AddSubExp */,29 , 75/* MulDivExp */,31 , 76/* UnaryOp */,32 , 77/* Value */,35 ),
    /* State 162 */ new Array( )
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
    "!" /* Terminal symbol */,
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
    "String" /* Terminal symbol */,
    "Integer" /* Terminal symbol */,
    "Boolean" /* Terminal symbol */,
    "Float" /* Terminal symbol */,
    "Identifier" /* Terminal symbol */,
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
    "SingleStmt" /* Non-terminal symbol */,
    "AssignmentStmt" /* Non-terminal symbol */,
    "ArrayIndices" /* Non-terminal symbol */,
    "AssertStmt" /* Non-terminal symbol */,
    "Target" /* Non-terminal symbol */,
    "AttributeAccess" /* Non-terminal symbol */,
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
{ act = 164; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
if( _dbg_withtrace && sstack.length > 0 )
{ __dbg_print( "\nState " + sstack[sstack.length-1] + "\n" + "\tLookahead: " + labels[la] + " (\"" + info.att + "\")\n" + "\tAction: " + act + "\n" + "\tSource: \"" + info.src.substr( info.offset, 30 ) + ( ( info.offset + 30 < info.src.length ) ?
"..." : "" ) + "\"\n" + "\tStack: " + sstack.join() + "\n" + "\tValue stack: " + vstack.join() + "\n" );}
if( act == 164 )
{ if( _dbg_withtrace )
__dbg_print( "Error detected: There is no reduce or shift on the symbol " + labels[la] ); err_cnt++; err_off.push( info.offset - info.att.length ); err_la.push( new Array() ); for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
err_la[err_la.length-1].push( labels[act_tab[sstack[sstack.length-1]][i]] ); var rsstack = new Array(); var rvstack = new Array(); for( var i = 0; i < sstack.length; i++ )
{ rsstack[i] = sstack[i]; rvstack[i] = vstack[i];}
while( act == 164 && la != 78 )
{ if( _dbg_withtrace )
__dbg_print( "\tError recovery\n" + "Current lookahead: " + labels[la] + " (" + info.att + ")\n" + "Action: " + act + "\n\n" ); if( la == -1 )
info.offset++; while( act == 164 && sstack.length > 0 )
{ sstack.pop(); vstack.pop(); if( sstack.length == 0 )
break; act = 164; for( var i = 0; i < act_tab[sstack[sstack.length-1]].length; i+=2 )
{ if( act_tab[sstack[sstack.length-1]][i] == la )
{ act = act_tab[sstack[sstack.length-1]][i+1]; break;}
}
}
if( act != 164 )
break; for( var i = 0; i < rsstack.length; i++ )
{ sstack.push( rsstack[i] ); vstack.push( rvstack[i] );}
la = __lex( info );}
if( act == 164 )
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
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 20:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 21:
    {
         rval = createNode( NODE_OP, OP_IF, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 22:
    {
         rval = createNode( NODE_OP, OP_IF_ELSE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 23:
    {
         rval = createNode( NODE_OP, OP_WHILE_DO, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 24:
    {
         rval = createNode( NODE_OP, OP_DO_WHILE, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 25:
    {
         rval = createNode( NODE_OP, OP_ECHO, vstack[ vstack.length - 2 ] );
    }
    break;
    case 26:
    {
        rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 27:
    {
         rval = createNode( NODE_OP, OP_ASSIGN_ARR, vstack[ vstack.length - 5 ], vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 28:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 29:
    {
         rval = createNode ( NODE_OP, OP_NONE, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 30:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 31:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 32:
    {
        rval = vstack[ vstack.length - 1 ];
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
         rval = createNode( NODE_OP, OP_ASSIGN, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 36:
    {
         rval = createNode( NODE_OP, OP_ATTR_ASSIGN, vstack[ vstack.length - 5 ], vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 37:
    {
            
                                            if (phypeTestSuite && vstack[ vstack.length - 2 ] == "assertEcho") {
                                                pstate.assertion = createAssertion( ASS_ECHO, vstack[ vstack.length - 1 ] );
                                            }
                                        
    }
    break;
    case 38:
    {
        
                                            if (phypeTestSuite && vstack[ vstack.length - 1 ] == "assertFail") {
                                                pstate.assertion = createAssertion( ASS_FAIL, 0 );
                                            }
                                        
    }
    break;
    case 39:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 40:
    {
        
                                            pstate.curParams[pstate.curParams.length] =
                                                createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
                                        
    }
    break;
    case 41:
    {
        
                                            pstate.curParams[pstate.curParams.length] =
                                                createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
                                        
    }
    break;
    case 42:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 43:
    {
         rval = createNode( NODE_OP, OP_RETURN, vstack[ vstack.length - 1 ] );
    }
    break;
    case 44:
    {
         rval = createNode( NODE_OP, OP_RETURN );
    }
    break;
    case 45:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 46:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 47:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 48:
    {
         rval = createNode( NODE_OP, OP_OBJ_NEW, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 49:
    {
         vstack[ vstack.length - 1 ].children[0] = vstack[ vstack.length - 3 ]; rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 50:
    {
         rval = createNode( NODE_OP, OP_FETCH_ARR, vstack[ vstack.length - 2 ], vstack[ vstack.length - 1 ] );
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
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 57:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 58:
    {
         rval = createNode( NODE_OP, OP_OBJ_FETCH, null, vstack[ vstack.length - 1 ] );
    }
    break;
    case 59:
    {
         rval = createNode( NODE_OP, OP_OBJ_FETCH, null, vstack[ vstack.length - 1 ] );
    }
    break;
    case 60:
    {
         rval = createNode( NODE_OP, OP_OBJ_FCALL, null, vstack[ vstack.length - 3 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 61:
    {
         rval = createNode( NODE_OP, OP_OBJ_FCALL, null, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 62:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 63:
    {
         rval = createNode( NODE_OP, OP_PASS_PARAM, vstack[ vstack.length - 1 ] );
    }
    break;
    case 64:
    {
        rval = vstack[ vstack.length - 0 ];
    }
    break;
    case 65:
    {
         rval = createNode( NODE_OP, OP_ARR_KEYS_R, vstack[ vstack.length - 4 ], vstack[ vstack.length - 2 ] );
    }
    break;
    case 66:
    {
         rval = vstack[ vstack.length - 2 ];
    }
    break;
    case 67:
    {
         rval = createNode( NODE_OP, OP_EQU, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 68:
    {
         rval = createNode( NODE_OP, OP_LOT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 69:
    {
         rval = createNode( NODE_OP, OP_GRT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 70:
    {
         rval = createNode( NODE_OP, OP_LOE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 71:
    {
         rval = createNode( NODE_OP, OP_GRE, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 72:
    {
         rval = createNode( NODE_OP, OP_NEQ, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 73:
    {
         rval = createNode( NODE_OP, OP_CONCAT, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 74:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 75:
    {
         rval = createNode( NODE_OP, OP_SUB, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 76:
    {
         rval = createNode( NODE_OP, OP_ADD, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 77:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 78:
    {
         rval = createNode( NODE_OP, OP_MUL, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 79:
    {
         rval = createNode( NODE_OP, OP_DIV, vstack[ vstack.length - 3 ], vstack[ vstack.length - 1 ] );
    }
    break;
    case 80:
    {
        rval = vstack[ vstack.length - 1 ];
    }
    break;
    case 81:
    {
         rval = createNode( NODE_OP, OP_NEG, vstack[ vstack.length - 1 ] );
    }
    break;
    case 82:
    {
         rval = createNode( NODE_OP, OP_BOOL_NEG, vstack[ vstack.length - 1 ] );
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
         rval = createNode( NODE_CONST, vstack[ vstack.length - 1 ] );
    }
    break;
    case 86:
    {
         rval = createNode( NODE_INT, vstack[ vstack.length - 1 ] );
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
    case 89:
    {
         rval = vstack[ vstack.length - 2 ];
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
        // Running from V8 or another shell JS-app
        if (typeof(alert) == 'undefined') {
            return '';
        }
        // Running from browser
        else
            return prompt( "Please enter a PHP-script to be executed:",
            //    "<? $a[1] = 'foo'; $foo = 'bar'; echo $a[1].$foo; ?>"
                //"<? $a=1; $b=2; $c=3; echo 'starting'; if ($a+$b == 3){ $r = $r + 1; if ($c-$b > 0) { $r = $r + 1; if ($c*$b < 7) {    $r = $r + 1; if ($c*$a+$c == 6) { $r = $r + 1; if ($c*$c/$b <= 5) echo $r; }}}} echo 'Done'; echo $r;?>"
                //"<? $a[0]['d'] = 'hej'; $a[0][1] = '!'; $b = $a; $c = $a; $b[0] = 'verden'; echo $a[0]['d']; echo $b[0]; echo $c[0][1]; echo $c[0]; echo $c; if ($c) { ?>C er sat<? } ?>"
                "<?" +
                "$i = 0;" +
                " echo ($i < 10);"+
                "while ($i < 10) {" +
                "    echo $i;" +
                "    $i = $i+1;" +
                "}" +
                "?>"
            );
    };
}

// Set phypeOut if it is not set.
if (!phypeOut || phypeOut == 'undefined') {
    // Running from V8 or another shell JS-app
    if (typeof(alert) == 'undefined')
        var phypeOut = print;
    else // Running from browser
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

function interpret(str) {
    var error_cnt     = 0;
    var error_off    = new Array();
    var error_la    = new Array();
    
    if( ( error_cnt = __parse( preParse(str), error_off, error_la ) ) > 0 ) {
        for(var i=0; i<error_cnt; i++)
            phypeOut( "Parse error near >"
                + str.substr( error_off[i], 30 ) + "<, expecting \"" + error_la[i].join() + "\"<br/>\n" );
    }
}

/////////////
// PARSING //
/////////////

// If we are not in our test suite, load all the scripts all at once.
if (!phypeTestSuite) {
    var str = phypeIn();

    interpret(str);
    
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
        
        if (pstate.assertion) {
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
