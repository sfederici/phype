#!/bin/bash
rm phpOut.txt
touch scripts.js
touch phypeOut.txt
touch phpOut.txt

cat ../../../src/phypeParser.js > scripts.js
php -f generateStatScript.php >> scripts.js
../shell scripts.js > phypeOut.txt

php -f phpStat.php