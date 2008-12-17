<?
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
$head = "------------\n";
$head .= "PHP\n";
$head .= "------------\n";
$res = $head.$res;
chdir('../v8/stats/');
$fp = fopen('stats.txt', 'w');
fwrite($fp, $res);
fclose($fp);


?>