theme=chirpy
deploy_dir="$theme"_deploy

[ -d $deploy_dir ] && rm -rf $deploy_dir

git clone https://github.com/cotes2020/jekyll-theme-chirpy.git $deploy_dir

rm -rf $deploy_dir/.git
rm -rf $deploy_dir/_posts
[ -d "$theme"_override ] && cp -rf "$theme"_override/* $deploy_dir
cd "$theme"_deploy
sh ./postdeploy.sh
cd ../
