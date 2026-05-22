theme=chirpy
deploy_dir="$theme"_deploy
chirpy_tag=v7.5.0

[ -d $deploy_dir ] && rm -rf $deploy_dir

git clone --branch $chirpy_tag --depth 1 https://github.com/cotes2020/jekyll-theme-chirpy.git $deploy_dir

rm -rf $deploy_dir/.git
rm -rf $deploy_dir/_posts
[ -d "$theme"_override ] && cp -rf "$theme"_override/* $deploy_dir
cd "$theme"_deploy
sh ./postdeploy.sh
cd ../
