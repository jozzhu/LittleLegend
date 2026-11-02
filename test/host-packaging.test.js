// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Android selects the shared C++ runtime required by embedded Node and validates the final APK',()=>{
 assert.match(read('host/android/app/build.gradle'),/arguments\s+'-DANDROID_STL=c\+\+_shared'/);
 assert.match(read('host/android/build.ps1'),/verify-apk\.ps1/);
 const verifier=read('host/android/verify-apk.ps1');
 for(const library of ['libnode.so','liblegendhost.so','libc++_shared.so'])assert(verifier.includes(library));
});

test('both launcher builds generate icons from the supplied artwork and expose them to the OS',()=>{
 for(const platform of ['windows','android'])assert(read(`host/${platform}/build.ps1`).includes('host/build-icons.ps1'));
 assert(read('host/build-icons.ps1').includes('assets/app_icon.png'));
 assert(read('host/windows/build.ps1').includes('/win32icon:'));
 assert(read('host/windows/Launcher.cs').includes('Icon.ExtractAssociatedIcon'));
 assert(read('host/android/app/src/main/AndroidManifest.xml').includes('android:icon="@mipmap/ic_launcher"'));
 assert(read('host/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml').includes('@drawable/ic_launcher_foreground'));
});
test('spectator rename reaches both launchers and Android staging removes obsolete web files',()=>{
 for(const file of ['host/windows/Launcher.cs','host/windows/Preview.cs','host/android/app/src/main/java/asia/littlelegend/host/MainActivity.java']){
  assert(read(file).includes('/gz.html'));assert(!read(file).includes('/gm.html'));
 }
 assert(read('host/android/app/build.gradle').includes("tasks.register('stageGame', Sync)"));
 assert(read('public/gz.html').includes('src="/gz.js"'));
 assert(!fs.existsSync(path.join(__dirname,'../public/gm.html')));
});
