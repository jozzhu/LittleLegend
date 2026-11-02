# 从源码构建发行包

以下命令在项目根目录的 PowerShell 7 中运行。源码包不含 SDK、运行时二进制、账户、签名密钥或构建缓存。

当前源码为 5.0.0。构建应放入独立版本目录，保留旧成品及数据。

## 1. 运行和测试

安装 Node.js 24，使 `node.exe` 和 `npm` 可从终端调用：

```powershell
node --version
npm ci --omit=optional --ignore-scripts
node host/prepare-audio.js
node host/prepare-languages.js
npm test
npm start
```

必须先安装锁文件中的 `ws` 依赖；无需原生编译和安装脚本。测试使用临时存储，不读取个人 `data/`。运行时默认数据在项目 `data/`，可设置 `XCS_DATA_DIR`。启动分配空闲端口，按输出地址访问，Ctrl+C 停止。

## 2. Windows 发行文件夹

需要 Windows、PowerShell 7 和系统 .NET Framework 4 C# 编译器。图标构建使用 System.Drawing。脚本是 UTF-8，旧版 Windows PowerShell 5.1 的默认编码可能误读中文脚本，请使用 `pwsh`。

```powershell
./host/windows/build.ps1 -DestinationDirectory "$PWD/release-5.0.0/windows"
```

脚本从 `assets/app_icon.png` 生成 ICO，编译 WinForms 启动器，复制当前 PATH 的 `node.exe`，以及明确列出的服务端文件、`node_modules/ws` 与 `public/`。目标目录应是新目录，避免旧资源残留；不同版本不要覆盖正在运行的 EXE。

生成结构：

```text
windows/
  LittleLegendHost.exe
  runtime/node.exe
  app/                   服务端与网页
```

**完整分发 windows 文件夹**。安装者不必安装 Node。自行构建须为所复制 Node 版本附完整 LICENSE：保存为 `windows/runtime/NODE-LICENSE.txt`。项目附带的发行包已整理许可；换版本必须换对应文本。

## 3. Android 工具链

当前构建目标：Android 8+ / arm64-v8a，SDK 35，AGP 8.7.3，Gradle 8.9，JDK 17，NDK 27.2.12479018，CMake 3.22.1，build-tools 35.0.0。

安装 Android Studio / SDK Manager 并接受工具许可。脚本默认目录：

```text
.tools/android/
  sdk/
    platforms/android-35/
    build-tools/35.0.0/
    ndk/27.2.12479018/
    cmake/3.22.1/
  gradle-8.9/bin/gradle.bat
  gradle-cache/              首次构建会创建
```

可将已安装 SDK 复制到这里，或将此处 `sdk` 建为指向已有 SDK 的 Windows 目录联接；Gradle 8.9 解压到指定目录。设置 `JAVA_HOME` 为 JDK 17。第一次构建需要联网下载 Maven 依赖，源码没有 Gradle wrapper 二进制。

## 4. Android 嵌入 Node 运行时

桌面 `node.exe` 不能在 APK 内使用。准备 nodejs-mobile **v18.20.4 Android** 的同版本头文件和 arm64 库，来自该项目上游发布页。名称为 `nodejs-mobile-v18.20.4-android.zip`。

本项目使用归档的本地 SHA256 记录为：

```text
bd7321eaa1a7602fbe0bb87302df2d79d87835cf4363fbdd17c350dbb485c2af
```

这是本地校验记录，并非上游签名；下载时自行核实来源。将解压出的匹配文件放到：

```text
host/android/app/src/main/nodejs-mobile/include/node/node.h
host/android/app/src/main/nodejs-mobile/include/node/…全部匹配头文件
host/android/app/src/main/jniLibs/arm64-v8a/libnode.so
```

保留上游许可证并随二进制分发。该旧移动运行时尚未完成公网加固或 16 KB 页设备验证；更换运行时需要重新检查 Node API、ABI 和设备兼容性。

## 5. 生成、检查 APK

```powershell
./host/android/build.ps1
./host/android/verify-apk.ps1 -Apk ./release/android/LittleLegendHost-debug.apk
./.tools/android/sdk/build-tools/35.0.0/apksigner.bat verify --verbose ./release/android/LittleLegendHost-debug.apk
./.tools/android/sdk/build-tools/35.0.0/aapt.exe dump badging ./release/android/LittleLegendHost-debug.apk
```

脚本将源码复制到 `%TEMP%/LittleLegendAndroid/project` 的 ASCII 构建目录，经目录联接使用工具，避免中文项目路径下 NDK 链接失败。`stageGame` 只允许指定服务文件、`ws` 依赖和网页进入 APK。NDK 提供匹配 `libc++_shared.so`，验证器检查三项原生库及图标。

默认输出是 **调试签名 APK**，并非生产签名。自行构建的调试签名通常与别人电脑不同：不能保证覆盖安装官方测试包，卸载会清数据。对外长期发布应自行配置稳定签名，安全保存密钥；不要上传 keystore。`-Release` 只运行 release 构建，不替你设置签名；自行配置 `signingConfigs` 后再按生成路径取包，默认未签名产物通常叫 `app-release-unsigned.apk`。

## 6. 整理版本目录和干净源码

```powershell
./host/package-release.ps1 -Version 5.0.0
```

整理脚本收录 Windows、最新 Android APK、说明文档与验证报告，创建 `release-5.0.0.zip`。导出脚本创建 `工程5.0.0/` 与 `工程5.0.0.zip`，采用明确文件白名单，绝不复制数据目录、备份、密钥、工具缓存、旧发行包和嵌入二进制。两个 ZIP 的 SHA256 写入 `SHA256SUMS-5.0.0.txt`，发行目录内另有逐文件校验清单。导出后的目录可直接作为 GitHub 仓库根目录，先 `npm ci --omit=optional --ignore-scripts` 再 `npm test` 验证。源码不包含 `node_modules`，构建 Windows / APK 前必须完成安装步骤。

源码保留网页图片、系统图标，以及验证素材一致性所需的对应原图；Word 文档和其他未使用制作稿不打包。公开美术前检查 `ASSETS.md` 的授权范围。

发行文件夹附 README、CHANGELOG、资源声明与第三方许可后：

```powershell
Get-FileHash ./release-5.0.0.zip -Algorithm SHA256
Get-FileHash ./工程5.0.0.zip -Algorithm SHA256
```

从干净源码重新构建可得到相同功能；工具版本、调试签名、ZIP 时间戳可能造成二进制哈希不同，不承诺逐字节可复现。

## 音频素材

`assets/audio/` 保留原始 5 首 BGM、24 个音效及说明；`public/assets/audio/` 是浏览器使用的发布副本。`node host/prepare-audio.js` 复制 MP3，并只修正 WAV 的 RIFF / data 长度，不转码声音。Windows / Android 构建脚本会先自动执行。新增或替换声音后应重新执行、测试并更新 `public/audio.js` 的资源版本参数。音频原素材与发布副本都进入干净源码包。

浏览器首次点击或键盘操作后才能开始播放，这是自动播放策略；登录页与主界面右上角均可关闭声音。0–100 音量和启用开关按浏览器记忆。隐藏页面停止所有声音，回放仅用回放 BGM，不追播历史操作音效。

## 7. 发版前检查

语言词典源文件是 `public/languages.js`，规则译文是 `public/guide-translations.js`。修改词典后执行 `node host/prepare-languages.js`，生成供 Windows / Android 原生面板共用的 `public/host-languages.json`；两个构建脚本均自动执行。网页用客户端视图翻译，服务端规则数据、牌实例标识和存档原文不翻译。原卡面图片没有重新制作，查看卡牌详情可读译文。音频 URL 的素材版本与软件版本独立，未改声音无需更换 URL。

运行完整测试；使用临时存档启动 Windows，检查地址、统计、`gz.html` 和正常停服。Android 检查签名、版本和原生库，安装真机确认启动与 LAN 联机。实际浏览器检查浮窗拖动 / 缩放 / 置顶、字号 12 / 22、多人牌桌及手机横屏。发布前停服备份原数据，测试目录不要替换真实数据。
