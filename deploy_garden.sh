theme=garden
deploy_dir="$theme"_deploy

[ -d $deploy_dir ] && rm -rf $deploy_dir

git clone https://github.com/Jekyll-Garden/jekyll-garden.github.io.git $deploy_dir

rm -rf $deploy_dir/.git
rm -rf $deploy_dir/_posts
[ -d "$theme"_override ] && cp -rf "$theme"_override/* $deploy_dir
