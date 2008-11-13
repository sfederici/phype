///////////////////////////
// OPCODE ARGUMENT TYPES //
///////////////////////////
var ARGT_UNKNOWN = -1;
var ARGT_UNUSED = 0;
var ARGT_STRING = 1;
var ARGT_VAR = 2;
var ARGT_NULL = 3;
var ARGT_NUM = 4;
var ARGT_HEX = 5;
var ARGT_OPADDR = 6;

/////////////
// OPCODES //
/////////////
function ZEND_ASSIGN(arg1,arg2,arg3) {
	linker.assign(arg1.value,arg3.value);
	
	interpreter.curOp++;

	return '';
}

function ZEND_DO_FCALL(arg1,arg2,arg3) {
	// Insert sentinel opcode to allow branch back to where we came from on return.
	var nextOp = interpreter.curOp+1;
	funTable[arg2.value][-1] = "PHYPE_BRANCH "+parser.fakeString(interpreter.curScript)+" "+parser.fakeString(interpreter.curFun)+" #"+nextOp;
	
	// Save returned value in arg1
	symTables[interpreter.curScript][arg1.value] = '.return';

	// Initialize new interpreter state
	interpreter.curFun = arg2.value;
	interpreter.curOp = 0;
	
	interpreter.interpret(funTable[arg2.value]);
	
	return '';
}

function ZEND_ECHO(arg1,arg2,arg3) {
	interpreter.curOp++;
	
	switch (arg2.type) {
		case ARGT_STRING:
			return arg2.value;
		case ARGT_VAR:
			return linker.getValue(arg2.value);
		default:
			return 'ECHO: Unknown operand type: "'+arg2.type+'".<br/>';
	}
}

function ZEND_FETCH_R(arg1,arg2,arg3) {
	var varName = linker.getValue(arg2.value);
	linker.linkGlobal(arg1.value, varName);
	
	interpreter.curOp++;
	
	return '';
}

function ZEND_HANDLE_EXCEPTION(arg1,arg2,arg3) {
	interpreter.curOp++;
	return '';
}

function ZEND_NOP(arg1,arg2,arg3) {
	interpreter.curOp++;
	return '';
}

function ZEND_RETURN(arg1,arg2,arg3) {
	// Go to PHYPE_BRANCH opcode
	interpreter.curOp = -1;

	var result = '';
	switch (arg2.type) {
		case ARGT_NUM:
		case ARGT_STRING:
			result = arg2.value;
			break;
		case ARGT_VAR:
			result = linker.getValue(arg2.value);
			break;
		default:
			return 'RETURN: Unknown operand type: "'+arg2.type+'".<br/>';
	}
	globals['.return'] = result;
	
	return '';
}


///////////////
// SENTINELS //
///////////////
function PHYPE_BRANCH(arg1,arg2,arg3) {
	// Remove sentinel
	delete funTable[interpreter.curFun][-1];
	
	// Branch
	interpreter.curScript = arg1.value;
	interpreter.curFun = arg2.value;
	interpreter.curOp = arg3.value;
	
	interpreter.terminate();

	return '';
}

function PHYPE_TERMINATE(arg1,arg2,arg3) {
	// Remove sentinel
	delete funTable[interpreter.curFun][-1];
	
	// Terminate
	interpreter.terminate();
	
	return '';
}