<?php

$opcodeCompiler = 'http://cgi-www.daimi.au.dk/~casperbp/phype/src/phpToJSON.php';

// Get file-name argument
$file = ($_GET['file'])? $_GET['file'] : '';

// Get script argument
$script = ($_GET['script'])? $_GET['script'] : '';
rawurlencode($script);

if (!empty($file))
	echo file_get_contents($opcodeCompiler.'?file='.$file);
else if (!empty($script)) 
	echo file_get_contents($opcodeCompiler.'?script='.rawurlencode(stripslashes($script)));
	

?>
