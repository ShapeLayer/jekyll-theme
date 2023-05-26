deploy_branch=deploy

git branch -D $deploy_branch
git push origin --delete $deploy_branch
git checkout -b $deploy_branch

sh deploy_basically-basic.sh
sh deploy_garden.sh
sh deploy_gitbook.sh

git add .
git commit -m "Deploy" -m "`date`"
git push -f origin $deploy_branch

git switch main
