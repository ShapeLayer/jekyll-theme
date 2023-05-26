theme=chirpy
deploy_dir="$theme"_deploy

[ -d $deploy_dir ] && rm -rf $deploy_dir

git clone https://github.com/cotes2020/jekyll-theme-chirpy.git $deploy_dir

rm -rf $deploy_dir/.git
rm -rf $deploy_dir/_posts
cd $deploy_dir
bundle lock --add-platform x86_64-linux
cd ../
[ -d "$theme"_override ] && cp -rf "$theme"_override/* $deploy_dir
