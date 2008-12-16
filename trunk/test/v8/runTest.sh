#!/bin/bash
touch scripts.js
cat ../../src/phypeParser.js > scripts.js
php -f generateTestScript.php >> scripts.js
echo '::::::::::::::::::::::::'
echo ':: JAVASCRIPT RESULTS ::'
echo '::::::::::::::::::::::::'
time ./shell scripts.js
echo ''
echo ''
echo ''
echo '::::::::::::::::::::::::'
echo '::     PHP RESULTS    ::'
echo '::::::::::::::::::::::::'
time php -f phpTest.php
