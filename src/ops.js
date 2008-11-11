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

function ZEND_ASSIGN(arg1,arg2,arg3) {
	linker.assign(arg1.value,arg3.value);

	return '';
}

function ZEND_ECHO(arg1,arg2,arg3) {
	switch (arg2.type) {
		case ARGT_STRING:
			return arg2.value;
		case ARGT_VAR:
			//alert('read: '+arg2.value+' - '+linker.getValue(arg2.value));
			return linker.getValue(arg2.value);
		default:
			return 'ECHO: Unknown operand type: "'+arg2.type+'".<br/>';
	}
}

function ZEND_HANDLE_EXCEPTION(arg1,arg2,arg3) {
	return '';
}

function ZEND_NOP(arg1,arg2,arg3) {
	return '';
}

function ZEND_RETURN(arg1,arg2,arg3) {
	return '';
}
