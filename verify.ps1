# Runs this repo's checks and tests.
node tools/vendor.js --check
if ($LASTEXITCODE) { exit $LASTEXITCODE }
node --test "scripts/**/*.test.js" "tools/*.test.mjs"
exit $LASTEXITCODE
