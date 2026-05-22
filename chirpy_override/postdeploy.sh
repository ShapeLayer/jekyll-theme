cat ./_personalizations/metadata-hook.html >> ./_includes/metadata-hook.html
npm install
npm run build
bundle update
sed '/assets\/js\/dist/d' .gitignore > .gitignore_cache
cat .gitignore_cache > .gitignore
sed '/_sass\/vendors/d' .gitignore > .gitignore_cache
cat .gitignore_cache > .gitignore
rm .gitignore_cache
