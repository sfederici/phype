<?php
$return = 'var phpScripts = [];
';
chdir('../../benchmarks/');
$filenames = glob('*.phype');
foreach ($filenames as $filename) {
	$code = preg_replace('/$/m','\\',file_get_contents($filename));
	$code = substr($code, 0, strlen($code)-1);
	$return .= 'phpScripts[phpScripts.length] = new SCRIPT("'.
					$filename.'", "'.$code.'");
';
}
chdir('../v8/stats/');
$return .= file_get_contents('phypeV8StatLoader.js');

echo $return;
?>