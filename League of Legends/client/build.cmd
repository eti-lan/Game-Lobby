pushd %~dp0
start /wait /separate npm run build
cd dist
del *.exe
cd ..
copy *.json dist\win-unpacked\
move /y "dist\win-unpacked" ..\client-pack
rmdir /s /q dist
