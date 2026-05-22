cat ./_personalizations/metadata-hook.html >> ./_includes/metadata-hook.html
# Work around sass-embedded install failures on Actions by ensuring modern JSON gem.
if ! grep -q 'gem "json"' Gemfile; then
  printf '\ngem "json", ">= 2.10"\n' >> Gemfile
fi
npm install
npm run build
sed '/assets\/js\/dist/d' .gitignore > .gitignore_cache
cat .gitignore_cache > .gitignore
sed '/_sass\/vendors/d' .gitignore > .gitignore_cache
cat .gitignore_cache > .gitignore
rm .gitignore_cache
