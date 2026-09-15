#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../apps/readest-app" && pwd)"
ANDROID_DIR="$APP_DIR/src-tauri/gen/android"

KEYSTORE="$ANDROID_DIR/readest.keystore"
PROPERTIES="$ANDROID_DIR/keystore.properties"

ALIAS="readest"
PASSWORD="readest123456"

echo "Android app directory:"
echo "$APP_DIR"

# 检查 Android 项目是否存在
if [ ! -d "$ANDROID_DIR" ]; then
    echo "Android project not found, running tauri android init..."
    cd "$APP_DIR"
    pnpm tauri android init
fi

mkdir -p "$ANDROID_DIR"

# 创建 keystore
if [ ! -f "$KEYSTORE" ]; then
    echo "Generating Android keystore..."

    keytool \
      -genkeypair \
      -v \
      -keystore "$KEYSTORE" \
      -alias "$ALIAS" \
      -keyalg RSA \
      -keysize 2048 \
      -validity 10000 \
      -storepass "$PASSWORD" \
      -keypass "$PASSWORD" \
      -dname "CN=Readest,O=Readest,C=US"

    echo "Keystore created:"
    echo "$KEYSTORE"
else
    echo "Keystore already exists:"
    echo "$KEYSTORE"
fi


# 写入 Tauri Android signing 配置
cat > "$PROPERTIES" <<EOF
keyAlias=$ALIAS
password=$PASSWORD
storeFile=$KEYSTORE
EOF

echo ""
echo "Generated:"
echo "$PROPERTIES"

cat "$PROPERTIES"
