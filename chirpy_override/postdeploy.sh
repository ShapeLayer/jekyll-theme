cat ./_personalizations/metadata-hook.html >> ./_includes/metadata-hook.html
npm install
npm run prebuild
npm run build
sed '/assets\/js\/dist/d' .gitignore > .gitignore_cache
cat .gitignore_cache > .gitignore
rm .gitignore_cache
