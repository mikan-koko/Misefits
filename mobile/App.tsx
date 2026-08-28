import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

// Metro に「実行するJS」ではなく「同梱アセット」として扱わせるため .bin 拡張子で保存している
// （mobile/scripts/build-webapp-bundle.js が生成）。展開先ではWebViewが解釈できる本来の
// ファイル名（*.js）に戻す。
const WEBAPP_FILES: { module: number; relPath: string }[] = [
  { module: require('./assets/webapp/index.html'), relPath: 'index.html' },
  { module: require('./assets/webapp/vendor/fabric.min.bin'), relPath: 'vendor/fabric.min.js' },
  { module: require('./assets/webapp/vendor/pdf.min.bin'), relPath: 'vendor/pdf.min.js' },
  { module: require('./assets/webapp/vendor/pdf.worker.min.bin'), relPath: 'vendor/pdf.worker.min.js' },
  { module: require('./assets/webapp/vendor/jspdf.umd.min.bin'), relPath: 'vendor/jspdf.umd.min.js' },
];

// index.html 側の `window.MiseFitsNative` / `handleNativeMessage()` と対になる型。
type EntitlementMessage = { type: 'entitlement'; pro: boolean; uid?: string | null };
type WebToNativeMessage =
  | { type: 'requestPurchase' }
  | { type: 'saveProjectToCloud'; payload: unknown }
  | { type: 'loadProjectFromCloud' };

/** アプリ起動時に同梱アセットをWebViewが読める実ファイルとして書き出す。 */
async function prepareWebAppDirectory(): Promise<string> {
  const webappDir = new Directory(Paths.cache, 'webapp');
  webappDir.create({ intermediates: true, idempotent: true });
  new Directory(webappDir, 'vendor').create({ intermediates: true, idempotent: true });

  for (const f of WEBAPP_FILES) {
    const asset = Asset.fromModule(f.module);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error(`failed to resolve bundled asset: ${f.relPath}`);
    const destination = new File(webappDir, f.relPath);
    await new File(asset.localUri).copy(destination, { overwrite: true });
  }

  return new File(webappDir, 'index.html').uri;
}

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [entryUri, setEntryUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    prepareWebAppDirectory()
      .then(setEntryUri)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Phase 1時点ではpro判定は未配線（常にfalse）。RevenueCat連携はPhase 2で追加する。
  const sendEntitlement = useCallback((pro: boolean, uid: string | null = null) => {
    const msg: EntitlementMessage = { type: 'entitlement', pro, uid };
    webviewRef.current?.injectJavaScript(
      `window.handleNativeMessage(${JSON.stringify({ data: JSON.stringify(msg) })}); true;`
    );
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let data: WebToNativeMessage | null = null;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!data) return;
    switch (data.type) {
      case 'requestPurchase':
        // Phase 2 (RevenueCat) で購入導線に接続する。
        console.log('[MiseFits] requestPurchase received (not yet wired to RevenueCat)');
        break;
      case 'saveProjectToCloud':
      case 'loadProjectFromCloud':
        // Phase 3 (Firebase) で実装する。
        console.log('[MiseFits] cloud sync message received (not yet wired to Firebase):', data.type);
        break;
    }
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!entryUri) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        ref={webviewRef}
        source={{ uri: entryUri }}
        originWhitelist={['*']}
        allowingReadAccessToURL={Paths.cache.uri}
        allowFileAccess
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        onLoadEnd={() => sendEntitlement(false)}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef1f5' },
  webview: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef1f5' },
});
