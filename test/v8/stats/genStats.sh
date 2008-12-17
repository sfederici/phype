#!/bin/bash
rm scripts.js
rm stats.txt
touch scripts.js
touch stats.txt

cat ../../../src/phypeParser.js > scripts.js
php -f generateStatScript.php >> scripts.js

php -f phpStat.php
echo '------------' >> stats.txt
echo 'PHYPE ON V8' >> stats.txt
echo '------------' >> stats.txt
../shell scripts.js >> stats.txt
echo '------------' >> stats.txt
echo 'PHYPE ON SM' >> stats.txt
echo '------------' >> stats.txt
smjs scripts.js >> stats.txt