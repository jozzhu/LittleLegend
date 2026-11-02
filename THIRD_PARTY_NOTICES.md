# 第三方组件

- Windows 发行包包含 Node.js，其上游 MIT 及依赖许可见随包 `runtime/NODE-LICENSE.txt`。源码工程不含此二进制。
- Android 使用 nodejs-mobile v18.20.4 的 Android arm64 运行时，应保留源代码与第三方许可；发行目录附匹配版本许可。
- Android APK 包含 NDK `libc++_shared.so`。发行目录附 NDK libc++ 许可 NOTICE。Android API、Gradle、AGP、SDK / NDK 遵循各自许可，构建工具不随源码分发。
- 服务端使用 `ws` 8.22.1（MIT），用于同端口 WebSocket；许可证见 `host/licenses/WS-8.22.1-LICENSE.txt`，Windows 包内亦保留 `app/node_modules/ws/LICENSE`，Android 内置同一依赖及其许可。不启用可选原生扩展。
- 网页使用原生 JavaScript / CSS 与浏览器 Web Animations API；WinForms / .NET 使用系统框架。

替换运行时应同时替换对应许可。勿上传下载缓存、SDK、Gradle 缓存、个人调试签名文件。
