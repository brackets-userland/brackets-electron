#!/bin/sh
echo "./pre-rebuild.sh"

file="./node_modules/nslog/build/Release/nslog.node"
if [ -f $file ]; then
    echo "rm $file"
    rm $file
else
    echo "skip rm, not found $file"
fi
