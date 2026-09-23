#!/usr/bin/env bash
# ==============================================================================
# Readest / InkSpire Android 一键构建与安装脚本
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/readest-app"
ANDROID_GEN_DIR="$APP_DIR/src-tauri/gen/android"

# 默认参数
TARGET_ARCH="aarch64"
BUILD_MODE="release"
DO_INSTALL=false
DO_LAUNCH=false
DEVICE_SERIAL=""

# 解析命令行参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--target)
      TARGET_ARCH="$2"
      shift 2
      ;;
    -i|--install)
      DO_INSTALL=true
      shift
      ;;
    -l|--launch)
      DO_INSTALL=true
      DO_LAUNCH=true
      shift
      ;;
    -d|--debug)
      BUILD_MODE="debug"
      shift
      ;;
    -s|--device)
      DEVICE_SERIAL="$2"
      DO_INSTALL=true
      shift 2
      ;;
    -h|--help)
      echo "用法: $0 [选项]"
      echo ""
      echo "选项:"
      echo "  -t, --target <arch>    目标架构 (默认: aarch64, 可选: aarch64, armv7, x86_64, i686)"
      echo "  -d, --debug            构建 Debug 版本 (默认构建 Release 版本)"
      echo "  -i, --install          构建完成后自动通过 adb 安装到已连接设备"
      echo "  -l, --launch           安装完成后自动在设备上启动应用"
      echo "  -s, --device <serial>  指定目标 adb 设备序列号 (如 HA2MGBSJ)"
      echo "  -h, --help             显示此帮助信息"
      echo ""
      echo "示例:"
      echo "  $0                     # 仅编译 Release APK (aarch64)"
      echo "  $0 -i                  # 编译并安装到已连接设备"
      echo "  $0 -l                  # 编译、安装并自动启动 App"
      echo "  $0 -s HA2MGBSJ -l      # 指定设备编译、安装并启动"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      echo "使用 $0 --help 查看帮助"
      exit 1
      ;;
  esac
done

echo "=========================================="
echo " InkSpire / Readest Android 构建工具"
echo " 目标架构: $TARGET_ARCH"
echo " 构建模式: $BUILD_MODE"
echo " 安装到设备: $DO_INSTALL"
echo "=========================================="

# 1. 检查并配置 Java 环境 (需要 JDK 17/21，JDK 25+ 与当前 Gradle 8.14 不兼容)
if [ -z "${JAVA_HOME:-}" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -qE '"(17|21)\.'; then
  if [ -d "/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home" ]; then
    export JAVA_HOME="/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home"
  elif command -v /usr/libexec/java_home >/dev/null 2>&1; then
    JAVA_CANDIDATE="$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home -v 21 2>/dev/null || true)"
    if [ -n "$JAVA_CANDIDATE" ]; then
      export JAVA_HOME="$JAVA_CANDIDATE"
    fi
  fi
fi

if [ -z "${JAVA_HOME:-}" ] || [ ! -d "$JAVA_HOME" ]; then
  echo "错误: 未找到兼容的 JDK 17/21 环境，请先安装 JDK 17 或配置 JAVA_HOME。"
  exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"
echo "✓ 使用 JDK: $JAVA_HOME"

# 2. 检查并配置 Android SDK & NDK
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -d "$ANDROID_HOME" ]; then
  echo "错误: 未找到 ANDROID_HOME 目录: $ANDROID_HOME"
  exit 1
fi

if [ -z "${ANDROID_NDK_HOME:-}" ] || [ ! -d "${ANDROID_NDK_HOME:-}" ]; then
  # 自动寻找最新版本 NDK
  LATEST_NDK="$(find "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -n "$LATEST_NDK" ] && [ -d "$LATEST_NDK" ]; then
    export ANDROID_NDK_HOME="$LATEST_NDK"
  fi
fi

if [ -z "${ANDROID_NDK_HOME:-}" ] || [ ! -d "$ANDROID_NDK_HOME" ]; then
  echo "错误: 未找到 NDK 目录，请在 Android SDK 中安装 NDK"
  exit 1
fi
export NDK_HOME="$ANDROID_NDK_HOME"
echo "✓ 使用 Android SDK: $ANDROID_HOME"
echo "✓ 使用 Android NDK: $ANDROID_NDK_HOME"

# 3. 补充 PATH 路径 (优先使用有效的 pnpm 工具路径)
PNPM_SHIM_DIR="$(find "$HOME/.proto/tools/pnpm" -name "shims" -type d 2>/dev/null | sort -V | tail -n 1 || true)"
if [ -n "$PNPM_SHIM_DIR" ] && [ -d "$PNPM_SHIM_DIR" ]; then
  export PATH="$PNPM_SHIM_DIR:$PATH"
fi
export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$PATH"

# 4. 检查 tauri 子模块
if [ ! -f "$REPO_ROOT/packages/tauri/crates/tauri/Cargo.toml" ] || ! grep -q "cef" "$REPO_ROOT/packages/tauri/crates/tauri/Cargo.toml"; then
  echo "正在同步 packages/tauri 子模块..."
  git -C "$REPO_ROOT" submodule update --init --recursive packages/tauri
fi

# 5. 检查 Keystore 签名配置
if [ ! -f "$ANDROID_GEN_DIR/keystore.properties" ]; then
  echo "未发现签名配置，正在生成 Keystore..."
  bash "$REPO_ROOT/scripts/android-keystore.sh"
fi

# 5.1 确保 Proguard 混淆配置保留 Tauri 插件与反射类
PROGUARD_RULES="$ANDROID_GEN_DIR/app/proguard-rules.pro"
if [ -f "$PROGUARD_RULES" ] && ! grep -q "app.tauri" "$PROGUARD_RULES"; then
  cat >> "$PROGUARD_RULES" <<'EOF'

# Keep all Tauri plugins and core classes
-keep class app.tauri.** { *; }
-keep interface app.tauri.** { *; }
-keep class * extends app.tauri.plugin.Plugin { *; }
-keep @app.tauri.annotation.** class * { *; }
-keepclassmembers class * {
    @app.tauri.annotation.** *;
}
-keepclasseswithmembernames class * {
    native <methods>;
}
-keep class com.bilingify.readest.** { *; }
EOF
fi

# 6. 执行打包
echo "开始构建 APK..."
cd "$APP_DIR"
export KEEP_SOURCEMAPS=1
export NEXT_PUBLIC_APP_PLATFORM=tauri

BUILD_CMD=(node scripts/tauri.mjs android build -t "$TARGET_ARCH" --apk)
if [ "$BUILD_MODE" = "debug" ]; then
  BUILD_CMD+=(-d)
fi

"${BUILD_CMD[@]}"

echo "=========================================="
echo "✓ Android APK 构建成功!"
echo "=========================================="

# 查找生成的 APK 文件
APK_CANDIDATE=""
POSSIBLE_PATHS=(
  "$ANDROID_GEN_DIR/app/build/outputs/apk/universal/$BUILD_MODE/app-universal-$BUILD_MODE.apk"
  "$ANDROID_GEN_DIR/app/build/outputs/apk/arm64-v8a/$BUILD_MODE/app-arm64-v8a-$BUILD_MODE.apk"
  "$ANDROID_GEN_DIR/app/build/outputs/apk/$BUILD_MODE/app-$BUILD_MODE.apk"
)

for p in "${POSSIBLE_PATHS[@]}"; do
  if [ -f "$p" ]; then
    APK_CANDIDATE="$p"
    break
  fi
done

if [ -z "$APK_CANDIDATE" ]; then
  APK_CANDIDATE="$(find "$ANDROID_GEN_DIR/app/build/outputs/apk" -name "*.apk" -type f 2>/dev/null | head -n 1 || true)"
fi

if [ -n "$APK_CANDIDATE" ]; then
  echo "APK 文件路径:"
  echo "  $APK_CANDIDATE"
  echo "文件大小: $(du -h "$APK_CANDIDATE" | cut -f1)"
else
  echo "提示: 未在预设路径下自动定位到 apk，请检查 $ANDROID_GEN_DIR/app/build/outputs/apk/"
fi

# 7. 安装到设备 (如果指定 -i / -l)
if [ "$DO_INSTALL" = true ]; then
  echo ""
  echo "=========================================="
  echo "正在安装 APK 到 Android 设备..."
  echo "=========================================="
  
  ADB_CMD=(adb)
  if [ -n "$DEVICE_SERIAL" ]; then
    ADB_CMD+=(-s "$DEVICE_SERIAL")
  fi

  # 检查连接设备
  CONNECTED_DEVICES="$("${ADB_CMD[@]}" devices | grep -v "List of devices" | grep "device$" || true)"
  if [ -z "$CONNECTED_DEVICES" ]; then
    echo "警告: 未检测到任何已连接并授权的 adb 设备，跳过安装。"
    exit 0
  fi

  if [ -z "$APK_CANDIDATE" ] || [ ! -f "$APK_CANDIDATE" ]; then
    echo "错误: 未找到可安装的 APK 文件。"
    exit 1
  fi

  "${ADB_CMD[@]}" install -r "$APK_CANDIDATE"
  echo "✓ APK 安装成功!"

  if [ "$DO_LAUNCH" = true ]; then
    echo "正在启动 App (com.bilingify.readest)..."
    "${ADB_CMD[@]}" shell monkey -p com.bilingify.readest -c android.intent.category.LAUNCHER 1
    echo "✓ App 已成功启动!"
  fi
fi
