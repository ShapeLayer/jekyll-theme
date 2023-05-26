branch=deploy

git branch -D branch
git push origin --delete branch
git checkout -b branch

sh deploy_basically-basic.sh
sh deploy_garden.sh
sh deploy_gitbook.sh

git add .
git commit -m "Deploy" -m "`date`"
git push -f origin deploy

git switch main
