<?
$before = 
chdir('../benchmarks/');
$filenames = glob('*.phype');
$res = 'TESTCASE                  | TIME       | STATUS         
';
$res .= '==========================|============|================
';
foreach ($filenames as $filename) {
	$before = microtime();
	include($filename);
	echo '
';
	$after = microtime();
	$res .= truncate($filename, 25);
	$res .= ' | ';
	$res .= truncate(number_format($after-$before, 3).' sec',10);
	$res .= ' | ';
	$res .= 'OK
';
}
echo $res;

function truncate($str, $amount) {
	if (strlen($str) < $amount) {
		while (strlen($str) < $amount) {
			$str .= ' ';
		}
	} else if (strlen($str) > $amount) {
		$str = substr($str, 0, $amount);
	}
	
	return $str;
}
?>