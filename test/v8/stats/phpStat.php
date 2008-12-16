<?
$before = 
chdir('../../benchmarks/');
$filenames = glob('*.phype');
foreach ($filenames as $filename) {
	$before = microtime();
	include($filename);
	echo '
';
	$after = microtime();
	$res .= $filename;
	$res .= ' '.number_format($after-$before, 3).'
';
}
chdir('../v8/stats/');
$fp = fopen('phpOut.txt', 'w');
fwrite($fp, $res);
fclose($fp);


?>